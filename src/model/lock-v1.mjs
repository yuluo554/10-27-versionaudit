/**
 * lockfileVersion 1 解析器：只有嵌套 `dependencies`，**没有 `packages`**。
 *
 * v1 的形状（npm 6）：
 *   { "lockfileVersion": 1, "dependencies": { "send": { "version": "0.18.0",
 *       "dependencies": { "ms": { "version": "2.1.3" } } } } }
 * → 每个嵌套层就是一条"路径"，路径串用 `node_modules/…` 拼回来，与 v2/v3 同形。
 *
 * 已声明的语义差异（`plan/01` §9）：v1 不记录 `dev`/`optional` 的完整信息，
 * 也不记录 `peerDependencies` 的安装结果。因此本解析器**只填已知字段**，
 * 缺失一律 `null`/`false`，**不推断**（不把"没写"猜成"不是 dev"）。
 */

import { buildPackageEntry, sortPackages, ROOT_MARKER } from "./lock-common.mjs";

/** `requires` 是 v1 的"声明范围"；嵌套 `dependencies` 是"实际装在哪"。两者分工不能混。 */
function walk(dependencies, prefix, out) {
  if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) return;
  for (const name of Object.keys(dependencies).sort()) {
    const entry = dependencies[name];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const path = prefix ? `${prefix}/node_modules/${name}` : `node_modules/${name}`;
    out.push(
      buildPackageEntry({
        path,
        name,
        version: entry.version,
        dependencies: entry.requires,
        resolved: entry.resolved,
        dev: entry.dev,
        optional: entry.optional,
      }),
    );
    if (entry.dependencies) walk(entry.dependencies, path, out);
  }
}

export function parseLockV1(raw, { file = "package-lock.json" } = {}) {
  const packages = [];
  const rootName = typeof raw.name === "string" ? raw.name : null;
  const rootVersion = typeof raw.version === "string" ? raw.version : null;

  // 根条目：v1 的根声明在 raw.dependencies 的**顶层**（没有 packages[""]）。
  // 根自己声明了什么范围无法与"装了哪个版本"分开，因此根声明由 manifest 提供（M2 做交叉）。
  const rootEntry = buildPackageEntry({
    path: ROOT_MARKER,
    name: rootName,
    version: rootVersion,
    dependencies: undefined,
    resolved: null,
  });
  packages.push(rootEntry);

  walk(raw.dependencies, "", packages);

  return {
    format: "v1",
    file,
    sourceName: rootName,
    sourceVersion: rootVersion,
    rootManifestDeps: {}, // v1 无 packages[""]；M2 会退回用 manifest 声明做对照基线
    packages: sortPackages(packages),
  };
}
