/**
 * 声明图：`manifest 声明` + `锁中实际条目` → 请求者/被请求者的完整边集。
 *
 * 这是 M2/M3/M4 的共同输入。三个关键口径：
 *   1. **解析规则不是"就近取"**：npm 的 node_modules 查找是从请求者目录向上逐级找。
 *      本文件实现同一语义（`resolveDependency`），否则"谁真正满足了我"会判错。
 *   2. **extraneous 的判据是声明图可达性**，不是 `node_modules` 是否存在
 *      （`plan/01` §3.2 明确要与 npm 的 extraneous 概念区分）。
 *   3. 每条边都带 `requesterPath`（M2 的命脉）。
 */

import { ROOT_MARKER } from "./lock-common.mjs";

/** 从某个包的路径向上找 `name`（npm 的解析算法；最近者胜）。 */
export function resolveDependency(packagesByPath, fromPath, name) {
  let scope = fromPath === ROOT_MARKER ? "" : fromPath;
  for (;;) {
    const candidate = scope ? `${scope}/node_modules/${name}` : `node_modules/${name}`;
    if (packagesByPath.has(candidate)) return candidate;
    if (!scope) return null;
    const marker = "/node_modules/";
    const idx = scope.lastIndexOf(marker);
    if (idx < 0) scope = "";
    else scope = scope.slice(0, idx);
  }
}

/**
 * 构造图。返回：
 *   nodes: Map<path, packageEntry>
 *   edges: [{ declaringPath, declaringPackage, kind, dependency, range, lockedPath, lockedVersion }]
 *   reachable: Set<path>（从根声明可达的包路径）
 */
export function buildGraph(manifest, lock) {
  const packagesByPath = new Map(lock.packages.map((p) => [p.path, p]));
  const edges = [];

  const pushEdge = (declaringPath, kind, dependency, range, lockEntry) => {
    const requester = packagesByPath.get(declaringPath);
    const lockedPath = lockEntry ? lockEntry.path : null;
    edges.push({
      declaringPath,
      declaringPackage: requester?.name ?? null,
      kind,
      dependency,
      range,
      lockedPath,
      lockedVersion: lockEntry?.version ?? null,
      optional: kind === "optionalDependencies",
      peer: kind === "peerDependencies",
    });
  };

  // 根声明（manifest 是根的真相源；lock 的 packages[""] 只作交叉对照）
  for (const kind of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const name of Object.keys(manifest.deps[kind])) {
      const lockedPath = resolveDependency(packagesByPath, ROOT_MARKER, name);
      pushEdge(ROOT_MARKER, kind, name, manifest.deps[kind][name], lockedPath ? packagesByPath.get(lockedPath) : null);
    }
  }

  // 锁中每个条目的声明（传递依赖）
  for (const pkg of lock.packages) {
    if (pkg.path === ROOT_MARKER) continue;
    for (const name of Object.keys(pkg.deps)) {
      const lockedPath = resolveDependency(packagesByPath, pkg.path, name);
      pushEdge(pkg.path, "dependencies", name, pkg.deps[name], lockedPath ? packagesByPath.get(lockedPath) : null);
    }
    for (const name of Object.keys(pkg.optionalDeps)) {
      const lockedPath = resolveDependency(packagesByPath, pkg.path, name);
      pushEdge(pkg.path, "optionalDependencies", name, pkg.optionalDeps[name], lockedPath ? packagesByPath.get(lockedPath) : null);
    }
    for (const name of Object.keys(pkg.peerDeps)) {
      const lockedPath = resolveDependency(packagesByPath, pkg.path, name);
      pushEdge(pkg.path, "peerDependencies", name, pkg.peerDeps[name], lockedPath ? packagesByPath.get(lockedPath) : null);
    }
  }

  const reachable = computeReachable(packagesByPath, edges);
  return { nodes: packagesByPath, edges, reachable, manifest };
}

/**
 * 可达性：从根的声明出发，沿边一路走。**这是 extraneous 判据的唯一来源。**
 * 缺失边（声明了但锁里没有）不产生节点，因此不扩展可达集。
 */
function computeReachable(packagesByPath, edges) {
  const byRequester = new Map();
  for (const edge of edges) {
    if (!edge.lockedPath) continue;
    if (!byRequester.has(edge.declaringPath)) byRequester.set(edge.declaringPath, []);
    byRequester.get(edge.declaringPath).push(edge.lockedPath);
  }
  const seen = new Set();
  const stack = [...(byRequester.get(ROOT_MARKER) ?? [])];
  while (stack.length) {
    const path = stack.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    for (const next of byRequester.get(path) ?? []) stack.push(next);
  }
  return seen;
}

/** 把路径转成"人类可读的请求者链"（`["<root>","send@0.18.0"]` 形态）。
 *
 * 链里**不带 `node_modules/` 前缀**（那是实现细节，不是请求者身份）。
 */
export function pathToChain(packagesByPath, declaringPath) {
  if (declaringPath === ROOT_MARKER) return [ROOT_MARKER];
  const chain = [];
  let scope = declaringPath;
  for (;;) {
    const marker = "/node_modules/";
    const idx = scope.lastIndexOf(marker);
    const rawLast = idx < 0 ? scope : scope.slice(idx + marker.length);
    const last = rawLast.replace(/^node_modules\//, "");
    const entry = packagesByPath.get(scope);
    const version = entry?.version ? `@${entry.version}` : "";
    chain.unshift(`${last}${version}`);
    if (idx < 0) break;
    scope = scope.slice(0, idx);
  }
  return [ROOT_MARKER, ...chain];
}

/** 同一包名的所有锁定版本与请求者（M3 的输入）。 */
export function groupByName(edges, packagesByPath) {
  const groups = new Map();
  for (const edge of edges) {
    const entry = edge.lockedPath ? packagesByPath.get(edge.lockedPath) : null;
    if (!entry) continue;
    const name = entry.name;
    if (!groups.has(name)) groups.set(name, new Map());
    const versions = groups.get(name);
    if (!versions.has(entry.version)) versions.set(entry.version, []);
    versions.get(entry.version).push({
      requester: pathToChain(packagesByPath, edge.declaringPath).join(" › "),
      requesterPath: pathToChain(packagesByPath, edge.declaringPath),
      range: edge.range,
      kind: edge.kind,
      lockedPath: entry.path,
    });
  }
  return groups;
}
