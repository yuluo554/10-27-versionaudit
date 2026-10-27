/**
 * M4 `conflict-explain` —— 冲突的最小请求者集合（`plan/03` M4）。
 *
 * 复用 M3 的 MUS 内核（K4），不另写一套。
 *
 * 两种 kind：
 *   - `peer-conflict`    ：peer 声明与实际提供者不匹配
 *   - `version-conflict` ：同一被依赖包的多条声明互相冲突且无已锁定解
 *
 * 可机械校验的属性（plan/01 §3.4 验收）：`minimalSet` 去掉任一元素后冲突消失。
 * 该属性由 `tests/proof/m4-minimality.test.mjs` 对随机树的 3+ 请求者场景穷举验证。
 */

import { intersects, satisfies } from "../semver/adapter.mjs";
import { intersectRanges } from "../semver/interval.mjs";
import { groupByName, pathToChain } from "../model/graph.mjs";
import { findMinimalConflictSet } from "../mus/minimal-set.mjs";

const SEVERITY_FALLBACK = Object.freeze({
  "peer-conflict": "error",
  "version-conflict": "error",
});

/**
 * @param {object} graph GraphIR
 * @param {{severityTable: object, maxRequesters?: number, ignorePeer?: boolean}} ctx
 */
export function runConflictExplain(graph, ctx = {}) {
  const table = ctx.severityTable ?? SEVERITY_FALLBACK;
  const conflicts = [];

  // ── peer 冲突 ─────────────────────────────────────────────────────────────
  for (const pkg of graph.nodes.values()) {
    if (!pkg.name || Object.keys(pkg.peerDeps).length === 0) continue;
    const chain = pathToChain(graph.nodes, pkg.path);
    for (const name of Object.keys(pkg.peerDeps).sort()) {
      const peerRange = pkg.peerDeps[name];
      // 从上层的视角看谁提供了这个包
      const providerEdge = graph.edges.find(
        (e) => e.dependency === name && e.declaringPath !== pkg.path && e.lockedPath !== null,
      );
      if (!providerEdge) {
        conflicts.push({
          kind: "peer-conflict",
          package: name,
          severity: ctx.ignorePeer ? "info" : table["peer-conflict"] ?? "error",
          lockedVersion: null,
          minimalSet: [
            {
              requester: `${pkg.name}@${pkg.version ?? "?"}`,
              range: peerRange,
              path: chain,
            },
          ],
          conflictProof: {
            ranges: [peerRange],
            intersects: false,
            computedBy: "absence",
            crossChecked: null,
          },
          explanation: `UNMET peer：${pkg.name}@${pkg.version ?? "?"} 需要 ${name}@${peerRange}，树中无提供者`,
          ...(ctx.ignorePeer ? { downgradedBy: "--ignore-peer" } : {}),
        });
        continue;
      }
      if (satisfies(providerEdge.lockedVersion, peerRange)) continue;

      const providerChain = pathToChain(graph.nodes, providerEdge.declaringPath);
      const minimalSet = dedupeById([
        { requester: `${pkg.name}@${pkg.version ?? "?"}`, range: peerRange, path: chain },
        {
          requester: `${providerEdge.declaringPackage ?? "<root>"}@${graph.nodes.get(providerEdge.declaringPath)?.version ?? "?"}`,
          range: providerEdge.range,
          path: providerChain,
        },
      ]);
      const proof = pairwiseProof(minimalSet.map((m) => m.range));
      conflicts.push({
        kind: "peer-conflict",
        package: name,
        severity: ctx.ignorePeer ? "info" : table["peer-conflict"] ?? "error",
        lockedVersion: providerEdge.lockedVersion,
        minimalSet,
        conflictProof: proof,
        explanation: `${pkg.name}@${pkg.version ?? "?"} 需要 ${name}@${peerRange}，实际提供 ${providerEdge.lockedVersion}`,
        ...(ctx.ignorePeer ? { downgradedBy: "--ignore-peer" } : {}),
      });
    }
  }

  // ── version 冲突（同名多声明无共同已锁定解）────────────────────────────────
  const groups = groupByName(graph.edges, graph.nodes);
  for (const name of [...groups.keys()].sort()) {
    const versionMap = groups.get(name);
    if (versionMap.size < 2) continue;
    const candidates = [...versionMap.keys()];
    const requesters = [];
    for (const version of [...versionMap.keys()].sort()) {
      for (const req of versionMap.get(version)) {
        requesters.push({
          id: `${req.requester}|${req.range}`,
          requester: req.requester,
          range: req.range,
          path: req.requesterPath,
        });
      }
    }
    const unique = dedupeById([...requesters].sort((a, b) => (a.id < b.id ? -1 : 1)));
    if (unique.length < 2) continue;
    const anyCommon = candidates.some((v) => unique.every((r) => satisfies(v, r.range)));
    if (anyCommon) continue;

    // 复用 M3 的 MUS 内核（K4）：minimalSet 必须是**最小**冲突集，不是全量请求者
    const mus = findMinimalConflictSet(
      unique.map((r) => ({ id: r.id, range: r.range })),
      candidates,
      satisfies,
      { maxRequesters: ctx.maxRequesters ?? 12 },
    );
    const minimalRequesters = mus.minimal.map((m) => {
      const original = unique.find((r) => r.id === m.id);
      return { requester: original.requester, range: original.range, path: original.path };
    });

    const intersection = intersectRanges(minimalRequesters.map((r) => r.range));
    conflicts.push({
      kind: "version-conflict",
      package: name,
      severity: table["version-conflict"] ?? "error",
      lockedVersion: null,
      minimalSet: minimalRequesters,
      requesters: unique.length,
      conflictProof: {
        ranges: minimalRequesters.map((r) => r.range),
        intersects: pairwiseProof(minimalRequesters.map((r) => r.range)).intersects,
        computedBy: "interval",
        crossChecked: "semver.intersects",
        reason: intersection.empty === true ? "empty-intersection" : "no-locked-candidate",
      },
      explanation: `${name} 有 ${unique.length} 条互相冲突的声明；最小冲突集为其中 ${minimalRequesters.length} 条，且无任何已锁定版本可同时满足`,
      degraded: mus.degraded,
      ...(mus.degraded ? { degradeReason: mus.reason } : {}),
    });
  }

  return sortConflicts(conflicts);
}

function dedupeById(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = `${item.requester}|${item.range}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** 两两相交证明（取前两条；多于两条时用全量区间求交作补充）。 */
function pairwiseProof(ranges) {
  if (ranges.length < 2) {
    return { ranges, intersects: false, computedBy: "interval", crossChecked: null };
  }
  let allIntersect = true;
  let crossChecked = true;
  for (let i = 0; i < ranges.length && allIntersect; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      let a = false;
      let b = false;
      try {
        a = intersects(ranges[i], ranges[j]);
      } catch {
        a = false;
      }
      try {
        b = intersectRanges([ranges[i], ranges[j]]).empty !== true;
      } catch {
        b = false;
      }
      if (a !== b) crossChecked = false;
      if (!a) {
        allIntersect = false;
        break;
      }
    }
  }
  return { ranges: ranges.slice(0, 2), intersects: allIntersect, computedBy: "interval", crossChecked };
}

export function sortConflicts(conflicts) {
  return [...conflicts].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    if (a.package !== b.package) return a.package < b.package ? -1 : 1;
    const ra = a.minimalSet.map((m) => m.requester).join("/");
    const rb = b.minimalSet.map((m) => m.requester).join("/");
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
}
