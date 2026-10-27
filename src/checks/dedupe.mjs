/**
 * M3 `dedupe-feasibility` —— 收敛可行性三态（`plan/03` M3 / `data/README.md` §7.1）。
 *
 * 判定顺序**固定**（K3）：CONVERGIBLE → 求 MUS → REQUIRES_OVERRIDE / NOT_CONVERGIBLE。
 *
 * 两条诚实性约束：
 *   - `CONVERGIBLE` 的判据是**实际候选版本 satisfies 全部请求者**，不是"区间非空"
 *     （预发布可达性不是纯区间性质，A8/A9）；
 *   - 无候选但区间非空 → `reason: "no-locked-candidate"`；区间本身为空 → `"empty-intersection"`。
 *     两者**不许合并陈述**。
 */

import { satisfies } from "../semver/adapter.mjs";
import { sortVersions, intersectRanges } from "../semver/interval.mjs";
import { groupByName } from "../model/graph.mjs";
import { findMinimalConflictSet } from "../mus/minimal-set.mjs";

const SEVERITY_FALLBACK = Object.freeze({
  CONVERGIBLE: "info",
  NOT_CONVERGIBLE: "error",
  REQUIRES_OVERRIDE: "warning",
});

/**
 * @param {object} graph GraphIR
 * @param {{severityTable: object, maxRequesters?: number, prefer?: string|null}} ctx
 */
export function runDedupeFeasibility(graph, ctx = {}) {
  const table = ctx.severityTable ?? SEVERITY_FALLBACK;
  const groups = groupByName(graph.edges, graph.nodes);
  const results = [];

  for (const name of [...groups.keys()].sort()) {
    const versionMap = groups.get(name);
    if (versionMap.size < 2) continue; // 单版本无"去重"问题

    const lockedVersions = sortVersions([...versionMap.keys()]);
    const requesters = [];
    for (const version of [...versionMap.keys()].sort()) {
      for (const req of versionMap.get(version)) {
        requesters.push({
          id: `${req.requester}|${req.range}|${req.lockedPath}`,
          requester: req.requester,
          requesterPath: req.requesterPath,
          range: req.range,
          kind: req.kind,
          lockedPath: req.lockedPath,
          lockedVersion: version,
        });
      }
    }
    const sortedRequesters = [...requesters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // 1. CONVERGIBLE：对每个已锁定版本实算
    const targets = [];
    for (const version of lockedVersions) {
      if (sortedRequesters.every((r) => satisfies(version, r.range))) {
        targets.push({
          version,
          proof: sortedRequesters.map((r) => ({
            requester: r.requester,
            range: r.range,
            satisfies: satisfies(version, r.range),
          })),
        });
      }
    }

    if (targets.length > 0) {
      results.push({
        package: name,
        status: "CONVERGIBLE",
        severity: table.CONVERGIBLE ?? SEVERITY_FALLBACK.CONVERGIBLE,
        lockedVersions,
        targets: orderTargets(targets, ctx.prefer),
        requesters: sortedRequesters.length,
        minimalConflictSet: null,
        degraded: false,
        reason: null,
      });
      continue;
    }

    // 2. 求 MUS（复用唯一实现 K4）
    const candidates = lockedVersions;
    const mus = findMinimalConflictSet(
      sortedRequesters.map((r) => ({ id: r.id, range: r.range })),
      candidates,
      satisfies,
      { maxRequesters: ctx.maxRequesters ?? 12 },
    );

    const intersection = intersectRanges(sortedRequesters.map((r) => r.range));
    const status = mus.minimal.length < sortedRequesters.length ? "REQUIRES_OVERRIDE" : "NOT_CONVERGIBLE";

    results.push({
      package: name,
      status,
      severity: table[status] ?? SEVERITY_FALLBACK[status],
      lockedVersions,
      targets: [],
      requesters: sortedRequesters.length,
      minimalConflictSet: mus.minimal.map((m) => {
        const original = sortedRequesters.find((r) => r.id === m.id);
        return {
          requester: original.requester,
          range: original.range,
          requesterPath: original.requesterPath,
        };
      }),
      minimalConflictSets: mus.minimalSets.length > 1
        ? mus.minimalSets.map((set) =>
            set.map((m) => {
              const o = sortedRequesters.find((r) => r.id === m.id);
              return { requester: o.requester, range: o.range, requesterPath: o.requesterPath };
            }),
          )
        : undefined,
      // 缺方案 vs 区间空：两态必须分开（plan/03 M3）
      reason: intersection.empty === true ? "empty-intersection" : "no-locked-candidate",
      suggestion:
        status === "REQUIRES_OVERRIDE"
          ? {
              nature: "suggestion",
              note: "放宽 minimalConflictSet 中的声明即可收敛；本工具不替用户决定改哪一条",
            }
          : undefined,
      degraded: mus.degraded,
      ...(mus.degraded ? { degradeReason: mus.reason } : {}),
    });
  }

  return results;
}

/** `--prefer` 只改排序与标注，不改可行性（`data/README.md` §7.4）。 */
function orderTargets(targets, prefer) {
  if (prefer === "latest") {
    const sorted = [...targets].reverse();
    return sorted.map((t, i) => ({ ...t, preferred: i === 0 }));
  }
  if (prefer === "min-change") {
    // "最小变更"= 目标版本与现存版本的差异最小。用现状版本向目标的"距离"近似：
    // 目标越接近现存已锁定的最小版本，变更越小。这里给出标注而不改变集合。
    return targets.map((t, i) => ({ ...t, preferred: i === 0 }));
  }
  return targets;
}
