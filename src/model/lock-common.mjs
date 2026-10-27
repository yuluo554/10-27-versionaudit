/**
 * 三份 lock 解析器共享的**记录构造**与**排序键**（`plan/03` K7：产出同形 IR）。
 *
 * 这里只做"字段搬运 + 类型校验"，不做语义判定。
 * 特别注意：`resolved` 只作字符串留档——**不解析主机、不校验 URL**（`data/README.md` §5）。
 */

/** 根条目的路径标记（与 v2/v3 的 `packages[""]` 对应）。 */
export const ROOT_MARKER = "<root>";

/** 稳定路径排序：段数少的在前，同段数按字典序（保证 `node_modules/a` < `node_modules/a/node_modules/b`）。 */
export function comparePaths(a, b) {
  const as = a.split("/node_modules/");
  const bs = b.split("/node_modules/");
  if (as.length !== bs.length) return as.length - bs.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortPackages(packages) {
  return [...packages].sort((a, b) => comparePaths(a.path, b.path));
}

/** `node_modules/send/node_modules/ms` → 请求者路径 `["node_modules/send"]`；顶层 → `[]`。 */
export function requesterPathOf(path) {
  const marker = "/node_modules/";
  const idx = path.lastIndexOf(marker);
  if (idx < 0) return [];
  return path.slice(0, idx).split("/node_modules/");
}

/** 从 `node_modules/...` 路径里取包名（含 scope：`node_modules/@scope/name`）。
 *
 * 三条路径形态都要正确处理（实测踩过最后一个）：
 *   `node_modules/stray`                        → `stray`（**无前导 `/`**）
 *   `node_modules/a/node_modules/b`             → `b`
 *   `node_modules/@scope/name`                  → `@scope/name`
 */
export function nameFromPath(path) {
  if (!path) return null;
  const stripped = path.startsWith("node_modules/") ? path.slice("node_modules/".length) : path.replace(/^.*\/node_modules\//, "");
  const parts = stripped.split("/node_modules/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) return null;
  const segs = last.split("/").filter(Boolean);
  if (segs.length === 0) return null;
  if (segs[0].startsWith("@")) return segs.slice(0, 2).join("/");
  return segs[0];
}

function assertStringMap(value, label, ctx) {
  const map = {};
  if (value === undefined || value === null) return map;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${ctx}: ${label} 必须是对象`);
  }
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (typeof entry !== "string") {
      throw new Error(`${ctx}: ${label}.${key} 必须是字符串（实际 ${typeof entry}）`);
    }
    map[key] = entry;
  }
  return map;
}

/**
 * 构造一条包记录。`deps` 只收 dependencies（peer/optional 分开存，因为它们的语义不同：
 * peer 是"由上层提供"，optional 是"缺了不算错"——混在一起会让 M4 判错）。
 */
export function buildPackageEntry({
  path,
  name,
  version,
  dependencies,
  peerDependencies,
  optionalDependencies,
  dev,
  optional,
  resolved,
  link,
  error,
}) {
  const ctx = `lock 条目 ${path}`;
  return {
    path,
    name: name ?? nameFromPath(path),
    version: typeof version === "string" ? version : null,
    deps: assertStringMap(dependencies, "dependencies", ctx),
    peerDeps: assertStringMap(peerDependencies, "peerDependencies", ctx),
    optionalDeps: assertStringMap(optionalDependencies, "optionalDependencies", ctx),
    dev: dev === true,
    optional: optional === true,
    resolved: typeof resolved === "string" ? resolved : null,
    link: link === true,
    error: typeof error === "string" ? error : null,
  };
}
