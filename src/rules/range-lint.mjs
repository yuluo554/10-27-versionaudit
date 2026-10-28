/**
 * M1 `range-lint` —— 范围语义规则 R1–R8（`plan/03` M1）。
 *
 * 本文件在 M0 已就位**规则骨架与 R1/R2/R5/R7 的完整实现**（这四条是纯声明侧判定，
 * 不依赖锁），R3/R4/R6/R8 的判定表先按 `plan/03` 落好结构、由 M2 补齐对话与向量。
 *
 * 纪律：
 *   - `expandedRange` **一律**来自 `adapter.validRange` 实调，不手写近似；
 *   - 每条 finding 带 `evidence`（可复算的字符串）；
 *   - R8 默认关闭（无法从文件推断作者意图）。
 */

import { validRange, subset, satisfies, compare } from "../semver/adapter.mjs";
import { normalizeRange, rangeIsEmpty, intersectRanges, INFINITY as INF } from "../semver/interval.mjs";
import { flattenDeclarations } from "../model/manifest.mjs";

const RULE_META = Object.freeze({
  R1: "无上界",
  R2: "宽范围/非范围",
  R3: "0.x 语义收窄",
  R4: "预发布可达性",
  R5: "空交集",
  R6: "分支冗余",
  R7: "build metadata",
  R8: "裸版本跨生态误用",
});

/** R1：展开结果里有 `>=`/`>` 且没有任何 `<` 上界。 */
function checkR1(rawRange, expanded) {
  if (expanded === null) return null;
  const branches = expanded.split("||").map((b) => b.trim());
  const offending = branches.filter((b) => /(^|\s)(>=|>)/.test(b) && !/(<)/.test(b));
  if (offending.length === 0) return null;
  return {
    evidence: `validRange(${JSON.stringify(rawRange)}) = ${JSON.stringify(expanded)}；分支 ${offending.join(" | ")} 无上界`,
  };
}

/** R2：`*` / 空串 / `x` / `latest`。`latest` 必须判"非范围"，不是"宽范围"。 */
function checkR2(rawRange, expanded) {
  if (rawRange === "latest") {
    return {
      evidence: "validRange('latest') = null → 它是 npm dist-tag，不是 semver 范围",
      notARange: true,
    };
  }
  if (rawRange.trim() === "" || /^[xX*]$/.test(rawRange.trim()) || expanded === "*") {
    return { evidence: `validRange(${JSON.stringify(rawRange)}) = "*"（无任何约束）` };
  }
  return null;
}

/** R3：`^0.x.y` / `^0.0.y` / `~0.x.y` 的语义收窄（以展开结果证明，不看字面）。
 *
 * 判据 = raw 以 `^`/`~` 起头、主版本为 0，且展开后的**上界被收窄到 0.x 内的小步进**：
 *   `hi == [0, m, 0]`（m ≥ 1，minor 步进）或 `hi == [0, 0, p]`（patch 步进）。
 *
 * 覆盖全族：`^0.2.3`→`<0.3.0-0`、`^0.0.3`→`<0.0.4-0`、`~0.2.3`→`<0.3.0-0`、
 * `~0.0.3`→`<0.1.0-0`，以及 **`^0.0` / `~0.0` / `^0.0.x` 一族**——它们的展开
 * **没有下界**（如 `^0.0` = `<0.1.0-0`，台账 A20）。
 *
 * **M2 修**：旧实现直接 `const [maj, min] = b.lo.v` 拆下界，遇到这族"无下界"展开会
 * 拆一个 `NEG_INF` Symbol → `TypeError: symbol is not iterable`，**整个审计退出码 3**。
 * 正解 = 只看上界（下界缺省不影响"上界被收窄"这一事实）。
 * 不收窄的反例：`^1.2.3` / `~1.2.3`（非零主版本）、`^0` / `~0` / `^0.x` / `~0.x`
 * （上界 `<1.0.0-0`，整个 0.x 都可取，与"0 主版本兼容"的直觉一致）。
 */
function checkR3(rawRange, expanded) {
  if (expanded === null) return null;
  const head = /^([\^~])\s*v?(\d+)/.exec(rawRange.trim());
  if (!head || Number(head[2]) !== 0) return null;
  const norm = normalizeRange(rawRange);
  if (!norm) return null;
  const shrink = norm.branches.filter((b) => {
    if (b.hi.v === INF || b.hi.v[0] !== 0) return false; // 无上界 / 上界跨出 0.x → 不是收窄
    const [, min, pat] = b.hi.v;
    return (min >= 1 && pat === 0) || (min === 0 && pat >= 1);
  });
  if (shrink.length === 0) return null;
  return {
    evidence: `validRange(${JSON.stringify(rawRange)}) = ${JSON.stringify(expanded)}（上界被收窄到 0.x 的小步进内）`,
  };
}

/** R4：预发布可达性。要求给出目标版本才能判"不可达"。 */
function checkR4(rawRange, targets) {
  const expanded = validRange(rawRange);
  if (expanded === null || targets.length === 0) return null;
  const results = [];
  for (const target of targets) {
    if (!target.isPrerelease) continue;
    if (satisfies(target.version, rawRange)) continue;
    // 区分"目标三元组相同但预发布不可达" vs "目标根本不在候选集"
    const base = `${target.major}.${target.minor}.${target.patch}`;
    const baseOk = satisfies(base, rawRange);
    results.push({
      target: target.version,
      reason: baseOk ? "prerelease-unreachable" : "target-not-in-candidate",
    });
  }
  if (results.length === 0) return null;
  return {
    evidence: results
      .map((r) => `satisfies(${JSON.stringify(r.target)}, ${JSON.stringify(rawRange)}) = false（${r.reason}）`)
      .join("；"),
    details: results,
  };
}

/** R5：范围内部空交集。 */
function checkR5(rawRange) {
  const empty = rangeIsEmpty(rawRange);
  if (empty === true) {
    return { evidence: `validRange(${JSON.stringify(rawRange)}) 展开后无任何可满足版本（区间为空）` };
  }
  return null;
}

/** R6：`||` 分支冗余 / 被包含。
 *
 * **必须按原始字符串切分支**，不能按 `validRange` 展开结果切：`* || ^1.0.0` 会被库折叠成
 * 单分支 `*`（`data/README.md` 的 R6 正例要求它被判"后者被包含"）。展开结果只用于 `subset` 判定。
 */
function checkR6(rawRange) {
  if (!rawRange.includes("||")) return null;
  const rawBranches = rawRange
    .split("||")
    .map((b) => b.trim())
    .filter(Boolean);
  if (rawBranches.length < 2) return null;

  const branches = rawBranches.map((b) => ({ raw: b, expanded: validRange(b) ?? "*" }));
  const redundant = [];
  for (let i = 0; i < branches.length; i += 1) {
    for (let j = 0; j < branches.length; j += 1) {
      if (i === j) continue;
      let covered = false;
      try {
        covered = subset(branches[i].expanded, branches[j].expanded);
      } catch {
        covered = false;
      }
      if (covered) redundant.push({ branch: branches[i].raw, coveredBy: branches[j].raw });
    }
  }
  if (redundant.length === 0) return null;
  return {
    evidence: redundant
      .map((r) => `subset(validRange(${JSON.stringify(r.branch)}), validRange(${JSON.stringify(r.coveredBy)})) = true`)
      .join("；"),
    details: redundant,
  };
}

/** R7：build metadata（`+…`）不提供任何额外约束。 */
function checkR7(rawRange) {
  if (!rawRange.includes("+")) return null;
  const stripped = rawRange.replace(/\+[0-9A-Za-z.-]+/g, "");
  const a = validRange(rawRange);
  const b = validRange(stripped);
  if (a === null || b === null || a !== b) return null;
  return {
    evidence: `validRange(${JSON.stringify(rawRange)}) = validRange(${JSON.stringify(stripped)}) = ${JSON.stringify(a)}：build metadata 不参与比较`,
  };
}

/** R8：裸版本跨生态误用（默认关闭）。 */
function checkR8(rawRange) {
  const bare = /^\d+\.\d+\.\d+$/.test(rawRange.trim());
  if (!bare) return null;
  const expanded = validRange(rawRange);
  return {
    evidence: `npm 中 ${JSON.stringify(rawRange)} 是精确锁定（validRange = ${JSON.stringify(expanded)}）；Cargo 中同样的字符是 caret 语义`,
  };
}

const SEVERITY_FALLBACK = Object.freeze({
  R1: "warning",
  R2: "warning",
  R3: "info",
  R4: "warning",
  R5: "error",
  R6: "warning",
  R7: "info",
  R8: "info",
});

/**
 * @param {object} manifest ManifestIR
 * @param {{severityTable: object, enableR8?: boolean, prereleaseTargets?: Map<string, object[]>}} ctx
 */
export function runRangeLint(manifest, ctx = {}) {
  const table = ctx.severityTable ?? SEVERITY_FALLBACK;
  const enableR8 = ctx.enableR8 === true;
  const findings = [];
  const declarations = flattenDeclarations(manifest);

  for (const decl of declarations) {
    const expanded = validRange(decl.rawRange);
    const base = {
      package: decl.name,
      declaration: decl.kind,
      rawRange: decl.rawRange,
      expandedRange: expanded,
    };

    const push = (rule, hit) => {
      findings.push({
        rule,
        ...base,
        severity: table[rule] ?? SEVERITY_FALLBACK[rule] ?? "info",
        evidence: hit.evidence,
        ...(hit.details ? { details: hit.details } : {}),
        ...(hit.notARange ? { notARange: true } : {}),
      });
    };

    const r2 = checkR2(decl.rawRange, expanded);
    if (r2) push("R2", r2);

    // R2 判为"非范围"时，其余基于展开的规则不再适用（避免噪声）
    if (!r2?.notARange) {
      const r1 = checkR1(decl.rawRange, expanded);
      if (r1) push("R1", r1);
      const r3 = checkR3(decl.rawRange, expanded);
      if (r3) push("R3", r3);
      const r5 = checkR5(decl.rawRange);
      if (r5) push("R5", r5);
      const r6 = checkR6(decl.rawRange);
      if (r6) push("R6", r6);
      const r7 = checkR7(decl.rawRange);
      if (r7) push("R7", r7);
      if (enableR8) {
        const r8 = checkR8(decl.rawRange);
        if (r8) push("R8", r8);
      }
      // R4 需要目标版本（来自锁），由调用方按名字传入
      const targets = ctx.prereleaseTargets?.get(decl.name) ?? [];
      const r4 = checkR4(decl.rawRange, targets);
      if (r4) push("R4", r4);
    }
  }

  return sortFindings(findings);
}

export function sortFindings(findings) {
  return [...findings].sort((a, b) => {
    if (a.rule !== b.rule) return a.rule < b.rule ? -1 : 1;
    if (a.package !== b.package) return a.package < b.package ? -1 : 1;
    if (a.declaration !== b.declaration) return a.declaration < b.declaration ? -1 : 1;
    return a.rawRange < b.rawRange ? -1 : a.rawRange > b.rawRange ? 1 : 0;
  });
}

export { RULE_META };
