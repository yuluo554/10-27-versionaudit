/**
 * lockfileVersion 3 解析器：**只有 `packages`**，没有 `dependencies` 兼容视图。
 *
 * 与 v2 的差别只有"没有兼容视图"这一件事——所以本解析器**不复制** v2 的交叉核对逻辑，
 * 只做 packages 的搬运。两者共用 `buildPackageEntry`（`plan/03` K7）。
 */

import { buildPackageEntry, sortPackages, ROOT_MARKER } from "./lock-common.mjs";

export function parseLockV3(raw, { file = "package-lock.json" } = {}) {
  const packagesRaw = raw.packages;
  if (!packagesRaw || typeof packagesRaw !== "object" || Array.isArray(packagesRaw)) {
    throw new Error("lockfileVersion 3 的 packages 必须是对象");
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

  const root = packages.find((p) => p.path === ROOT_MARKER);
  return {
    format: "v3",
    file,
    sourceName: typeof raw.name === "string" ? raw.name : null,
    sourceVersion: typeof raw.version === "string" ? raw.version : null,
    rootManifestDeps: root ? root.deps : {},
    rootDevDeps: root ? root.devDeps : {},
    rootPeerDeps: root ? root.peerDeps : {},
    rootOptionalDeps: root ? root.optionalDeps : {},
    packages: sortPackages(packages),
  };
}
