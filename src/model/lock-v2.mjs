/**
 * lockfileVersion 2 解析器：**同时**有 `packages`（路径键）与 `dependencies`（v1 兼容视图）。
 *
 * 两个视图**必须互相自洽**：这是 v2 的定义性约束，不是可选项。
 * 但"自洽"的判据要谨慎——`dependencies` 视图允许省略嵌套（npm 会压缩），
 * 所以本解析器采用的口径是：
 *   - `packages` 是**唯一真相源**（路径 + 版本 + 依赖声明）；
 *   - `dependencies` 视图只做**交叉核对**：出现在两个视图里的同一包，版本必须相同；
 *     只在 `packages` 里出现的不算错（v2 允许 dependencies 视图裁剪）。
 *   - 反之（只在 dependencies 里出现、packages 里没有）→ `InputError`，这是真的结构损坏。
 */

import { buildPackageEntry, sortPackages, ROOT_MARKER } from "./lock-common.mjs";

/** v1 视图里的扁平条目 → (path, version) 映射（只用于交叉核对，不参与 IR 主体）。 */
function flattenCompatView(dependencies, prefix, out) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) return;
  for (const name of Object.keys(dependencies)) {
    const entry = dependencies[name];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const path = prefix ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
    out.set(path, typeof entry.version === "string" ? entry.version : null);
    if (entry.dependencies) flattenCompatView(entry.dependencies, path, out);
  }
}

export function parseLockV2(raw, { file = "package-lock.json" } = {}) {
  const packagesRaw = raw.packages;
  if (!packagesRaw || typeof packagesRaw !== "object" || Array.isArray(packagesRaw)) {
    throw new Error("lockfileVersion 2 的 packages 必须是对象");
  }

  const packages = [];
  for (const path of Object.keys(packagesRaw).sort()) {
    const entry = packagesRaw[path] ?? {};
    if (path === "") {
      packages.push(
        buildPackageEntry({
          path: ROOT_MARKER,
          name: entry.name ?? (typeof raw.name === "string" ? raw.name : null),
          version: entry.version ?? (typeof raw.version === "string" ? raw.version : null),
          dependencies: entry.dependencies,
          devDependencies: entry.devDependencies,
          peerDependencies: entry.peerDependencies,
          optionalDependencies: entry.optionalDependencies,
          dev: entry.dev,
          optional: entry.optional,
          resolved: entry.resolved,
        }),
      );
      continue;
    }
    // 指向工作区本地的 link 条目没有 version，只有 resolved；保留但标记
    packages.push(
      buildPackageEntry({
        path,
        name: entry.name ?? undefined,
        version: entry.version,
        dependencies: entry.dependencies,
        peerDependencies: entry.peerDependencies,
        optionalDependencies: entry.optionalDependencies,
        dev: entry.dev,
        optional: entry.optional,
        resolved: entry.resolved,
        link: entry.link,
      }),
    );
  }

  // 交叉核对：compat 视图里出现的包，在 packages 里必须存在且版本相同
  const compat = new Map();
  flattenCompatView(raw.dependencies, "", compat);
  const byPath = new Map(packages.map((p) => [p.path, p]));
  for (const [path, version] of compat) {
    const hit = byPath.get(path);
    if (!hit) {
      throw new Error(`lockfileVersion 2 结构不一致：dependencies 视图有 ${path}，packages 里没有`);
    }
    if (version !== null && hit.version !== null && version !== hit.version) {
      throw new Error(
        `lockfileVersion 2 结构不一致：${path} 在 dependencies 视图是 ${version}，在 packages 是 ${hit.version}`,
      );
    }
  }

  const root = packages.find((p) => p.path === ROOT_MARKER);
  return {
    format: "v2",
    file,
    sourceName: typeof raw.name === "string" ? raw.name : null,
    sourceVersion: typeof raw.version === "string" ? raw.version : null,
    rootManifestDeps: root ? root.deps : {},
    // v2 的 root 条目还带 dev/peer/optional 的声明，M2/M4 需要（四类键各写各的，台账 A22）
    rootDevDeps: root ? root.devDeps : {},
    rootPeerDeps: root ? root.peerDeps : {},
    rootOptionalDeps: root ? root.optionalDeps : {},
    packages: sortPackages(packages),
  };
}
