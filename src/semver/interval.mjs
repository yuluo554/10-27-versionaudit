/**
 * 自研区间代数（`plan/02` §四 / `plan/03` M3）。
 *
 * 库只给"两两相交"，不给"多路求交后落点在哪"。本文件补的就是这一层：
 *   rawRange ──semver.validRange──▶ expandedRange ──拆分──▶ 半开区间集合 [lo, hi)
 * 多个范围的交集 = 逐分支求交（笛卡尔积），非空 ⇔ 存在候选版本。
 *
 * **硬纪律（`data/README.md` §7.1）**：区间非空只是"可能有解"的必要条件；
 * `CONVERGIBLE` 的最终判据必须用 `satisfies` 对**实际锁定版本**实算——
 * 预发布可达性（A8/A9）不是纯区间性质。
 *
 * 本文件不 import('semver')，全部经 adapter（K5）。
 */

import { validRange, compare, parse } from "../semver/adapter.mjs";

const INF = Symbol("inf");
const NEG_INF = Symbol("-inf");

export const INFINITY = INF;
export const NEG_INFINITY = NEG_INF;

/** 半开区间的端点表示：{ v: SemVer-ish tuple | INF | NEG_INF, pre: string|null } */
function boundFrom(versionString) {
  if (versionString === undefined || versionString === null || versionString === "") return { v: INF, pre: null };
  const parsed = parse(versionString);
  if (!parsed) return { v: INF, pre: null };
  return {
    v: [parsed.major, parsed.minor, parsed.patch],
    pre: parsed.prerelease.length ? parsed.prerelease.join(".") : null,
  };
}

function cmpIdentifier(a, b) {
  // SemVer §11：数字标识符按数值比较，且**数字恒小于字母数字**；纯数字不以 0 开头。
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) {
    const na = Number(a);
    const nb = Number(b);
    return na === nb ? 0 : na < nb ? -1 : 1;
  }
  if (aNum) return -1;
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function cmpPre(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // 无预发布 > 有预发布
  if (b === null) return -1;
  const as = a.split(".");
  const bs = b.split(".");
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i += 1) {
    const c = cmpIdentifier(as[i], bs[i]);
    if (c !== 0) return c;
  }
  if (as.length === bs.length) return 0;
  return as.length < bs.length ? -1 : 1;
}

function cmpBound(a, b) {
  if (a.v === NEG_INF && b.v === NEG_INF) return 0;
  if (a.v === INF && b.v === INF) return 0;
  if (a.v === NEG_INF) return -1;
  if (b.v === NEG_INF) return 1;
  if (a.v === INF) return 1;
  if (b.v === INF) return -1;
  for (let i = 0; i < 3; i += 1) {
    if (a.v[i] !== b.v[i]) return a.v[i] < b.v[i] ? -1 : 1;
  }
  return cmpPre(a.pre, b.pre);
}

/**
 * 把一个比较器（`>=1.2.3` / `<2.0.0-0` / `1.2.3` / `*`）转成 {lo, hi}。
 * 只覆盖 validRange 会产出的比较器形态；出现未知形态时**显式抛错**而不是猜。
 */
function comparatorToBounds(comp) {
  if (comp === "*" || comp === "") return { lo: { v: NEG_INF, pre: null }, hi: { v: INF, pre: null } };
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(comp);
  if (!m) throw new Error(`区间代数：无法识别的比较器 "${comp}"`);
  const op = m[1] ?? "=";
  const target = m[2];
  const parsed = parse(target);
  if (!parsed) throw new Error(`区间代数：比较器 "${comp}" 的版本部分不可解析`);
  const base = boundFrom(target);
  const nextMajor = { v: [parsed.major + 1, 0, 0], pre: "0" };
  const nextMinor = { v: [parsed.major, parsed.minor + 1, 0], pre: "0" };
  const nextPatch = { v: [parsed.major, parsed.minor, parsed.patch + 1], pre: "0" };

  switch (op) {
    case ">=":
      return { lo: base, hi: { v: INF, pre: null } };
    case ">": {
      // >1.2.3 的语义是"严格大于"，在半开区间上等价于 lo = 1.2.3 的紧邻后继。
      // 这里不制造假的后继版本（那会编造语义）——记为开区间，用 exclusiveLo 标记。
      return { lo: base, hi: { v: INF, pre: null }, exclusiveLo: true };
    }
    case "<":
      return { lo: { v: NEG_INF, pre: null }, hi: base, exclusiveHi: true };
    case "<=":
      return { lo: { v: NEG_INF, pre: null }, hi: base, exclusiveHi: false };
    case "=":
      // 精确版本：`1.2.3` 在 npm 里就是锁定（A15），区间退化为单点闭区间
      return { lo: base, hi: base, exact: true };
    case "^":
      if (parsed.major > 0) return { lo: base, hi: nextMajor };
      if (parsed.minor > 0) return { lo: base, hi: nextMinor };
      return { lo: base, hi: nextPatch };
    case "~":
      return { lo: base, hi: nextMinor };
    default:
      throw new Error(`区间代数：未实现的比较器运算符 "${op}"`);
  }
}

/**
 * 一个 rawRange → 若干分支，每个分支 = 若干半开区间（取交集后合并成一个区间）。
 * 返回 null 表示不是 semver 范围（`latest`）。
 */
export function normalizeRange(rawRange) {
  const expanded = validRange(rawRange);
  if (expanded === null) return null;
  const branches = expanded
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    rawRange,
    expandedRange: expanded,
    branches: branches.map((branch) => {
      const comps = branch.split(/\s+/).filter(Boolean);
      let lo = { v: NEG_INF, pre: null };
      let hi = { v: INF, pre: null };
      let exact = null;
      let exclusiveLo = false;
      let exclusiveHi = false;
      for (const comp of comps) {
        const b = comparatorToBounds(comp);
        if (b.exact) {
          exact = b.lo;
          lo = b.lo;
          hi = b.hi;
          continue;
        }
        if (b.lo.v !== NEG_INF && cmpBound(b.lo, lo) > 0) {
          lo = b.lo;
          exclusiveLo = Boolean(b.exclusiveLo);
        }
        if (b.hi.v !== INF && cmpBound(b.hi, hi) < 0) {
          hi = b.hi;
          exclusiveHi = Boolean(b.exclusiveHi);
        }
      }
      return { lo, hi, exact, exclusiveLo, exclusiveHi, comps };
    }),
  };
}

/** 分支是否为空（lo > hi，或 lo == hi 但至少一侧是开区间且非精确点）。 */
export function branchIsEmpty(branch) {
  const c = cmpBound(branch.lo, branch.hi);
  if (c > 0) return true;
  if (c === 0 && !branch.exact) {
    // 单点但不是"精确版本"语义 → 空（如 `>=1.0.0 <1.0.0`，A11 实测永不满足）
    return true;
  }
  return false;
}

/** 整个范围是否为空（所有分支都空）。`latest` 返回 null。 */
export function rangeIsEmpty(rawRange) {
  const norm = normalizeRange(rawRange);
  if (!norm) return null;
  return norm.branches.every((b) => branchIsEmpty(b));
}

/** 两个分支的交集（无交集返回 null）。 */
export function intersectBranches(a, b) {
  const lo = cmpBound(a.lo, b.lo) >= 0 ? a.lo : b.lo;
  const loExclusive = cmpBound(a.lo, b.lo) === 0 ? a.exclusiveLo || b.exclusiveLo : cmpBound(a.lo, b.lo) > 0 ? a.exclusiveLo : b.exclusiveLo;
  const hi = cmpBound(a.hi, b.hi) <= 0 ? a.hi : b.hi;
  const hiExclusive = cmpBound(a.hi, b.hi) === 0 ? a.exclusiveHi || b.exclusiveHi : cmpBound(a.hi, b.hi) < 0 ? a.exclusiveHi : b.exclusiveHi;
  const exact = a.exact && b.exact ? a.exact : null;
  const merged = { lo, hi, exact, exclusiveLo: loExclusive, exclusiveHi: hiExclusive };
  return branchIsEmpty(merged) ? null : merged;
}

/**
 * 多个 rawRange 的交集：分支笛卡尔积，保留非空者。
 * 返回 `{ empty, branches, culpritPair? }`。
 */
export function intersectRanges(ranges) {
  const norms = ranges.map((r) => normalizeRange(r));
  const invalid = norms.findIndex((n) => n === null);
  if (invalid >= 0) {
    return { empty: null, branches: [], invalidIndex: invalid, invalidRange: ranges[invalid] };
  }
  let acc = [{ lo: { v: NEG_INF, pre: null }, hi: { v: INF, pre: null }, exact: null, exclusiveLo: false, exclusiveHi: false }];
  for (let i = 0; i < norms.length; i += 1) {
    const next = [];
    for (const cur of acc) {
      for (const branch of norms[i].branches) {
        const merged = intersectBranches(cur, branch);
        if (merged) next.push(merged);
      }
    }
    acc = next;
    if (acc.length === 0) {
      return { empty: true, branches: [], failedAtIndex: i };
    }
  }
  return { empty: acc.length === 0, branches: acc };
}

/**
 * 给定候选版本列表，返回每个候选对**全部**范围的满足性实算结果。
 * 这是 `CONVERGIBLE` 的最终判据（不是区间非空）。
 */
export function evaluateCandidates(candidates, ranges, satisfiesFn) {
  return candidates.map((version) => ({
    version,
    satisfied: ranges.every((r) => satisfiesFn(version, r)),
  }));
}

/** 稳定版本序（semver 升序）；非法版本排最后并按字典序兜底，保证确定性。 */
export function sortVersions(versions) {
  return [...versions].sort((a, b) => {
    const va = validVersionForCompare(a);
    const vb = validVersionForCompare(b);
    if (va && vb) {
      const c = compare(a, b);
      if (c !== 0) return c;
    } else if (va) {
      return -1;
    } else if (vb) {
      return 1;
    }
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

function validVersionForCompare(v) {
  try {
    return parse(v) !== null;
  } catch {
    return false;
  }
}
