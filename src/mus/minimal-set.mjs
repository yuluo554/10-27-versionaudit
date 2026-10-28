/**
 * MUS（极小不可满足子集）—— **M3/M4 共用的唯一实现**（`plan/03` K4）。
 *
 * 定义（`data/README.md` §7.2）：
 *   M ⊆ R 是最小冲突集 ⇔ ① M 无解（任何候选版本都不满足 M 的全部范围）；
 *                        ② ∀ M' ⊊ M，M' 有解（等价于：移除 M 的任一元素后有解；
 *                           "有解"对子集单调，所以单元素移除已足够）。
 *
 * 两条求法（`data/README.md` §7.2）：
 *   1. **未超限**：按基数 k = 1,2,3,… 升序遍历子集，首个无解层即**基数最小**，同层平局全返回。
 *   2. **超限**（`--max-requesters`，默认 12）：改用**删除法**（deletion-based）——
 *      从全量 R（已知无解）出发，逐个尝试移除请求者，只有移除后仍无解才真的移除。
 *      O(n) 次可满足性检查，结果**仍是无解集且满足"移除任一元素后有解"**（真 MUS），
 *      只是**不保证基数最小**、也**不列全部平局集**；因此必须显式 `degraded: true`。
 *
 * **降级不能把"不是冲突"报成冲突**（M4 实测缺陷）：旧实现对超限直接取"候选最少的 2 条"，
 * 那 2 条可能**可满足**——报告里却叫它 `minimalConflictSet`。删除法保证返回集合确实无解。
 *
 * 两个实现细节（都来自变异验证教训）：
 *   - **单元素无解也要能返回**：如果某个范围本身是空交集（R5），MUS 就是它单元素。
 *     从 k=2 开始会漏掉这类，且会让"移除任一元素冲突消失"的属性测试失效。
 *   - **平局全返回**：同基数多个 MUS 按请求者路径字典序排序，全部返回，不随机取一个。
 */

/**
 * @param {Array<{id: string, range: string}>} requesters 请求者（id 用于稳定排序）
 * @param {string[]} candidates 已锁定版本（判定"有解"的唯一依据）
 * @param {(version: string, range: string) => boolean} satisfiesFn
 * @param {{maxRequesters?: number}} [opts]
 */
export function findMinimalConflictSet(requesters, candidates, satisfiesFn, opts = {}) {
  const maxRequesters = opts.maxRequesters ?? 12;
  const total = requesters.length;

  // 单元素：某个请求者的范围自己就无解（R5 形态）
  const singles = requesters.filter((r) => !candidates.some((v) => satisfiesFn(v, r.range)));
  if (singles.length > 0) {
    const minimalSets = singles.map((r) => [r]);
    return {
      minimalSets,
      minimal: minimalSets[0],
      degraded: false,
      reason: null,
      searched: 1,
    };
  }

  if (total > maxRequesters) {
    // 显式降级（`data/README.md` §7.2）：删除法求**一个**极小冲突集。
    // 前提：调用方只在"全量 R 无解"时进来（dedupe：没有候选满足全部请求者；conflict：无共同版本）。
    // 不变量：每轮只移除"移除后仍无解"的元素 → 结束时集合无解，且移除任一元素后有解
    // （后到的移除只会让集合更小，而"有解"对子集单调，因此早先测过的满足性仍然成立）。
    const keep = [];
    for (const r of requesters) if (!keep.includes(r)) keep.push(r);
    let core = keep;
    for (const r of keep) {
      const smaller = core.filter((x) => x !== r);
      if (smaller.length > 0 && !isSatisfiable(smaller, candidates, satisfiesFn)) {
        core = smaller;
      }
    }
    const minimal = [...core].sort(compareRequester);
    return {
      minimalSets: [minimal],
      minimal,
      degraded: true,
      // 口径固定串（`data/README.md` §7.2 / `plan/03` M3）：超限必须写这一句。
      reason: "requesters > max",
      searched: 0,
    };
  }

  // 按基数升序枚举（组合数在 20 以内可控；12 取 6 = 924）
  for (let k = 2; k <= total; k += 1) {
    const found = [];
    for (const subset of combinations(requesters, k)) {
      if (!isSatisfiable(subset, candidates, satisfiesFn)) {
        // 极小性：所有 k-1 子集都有解（已由外层循环保证，但显式复核一次，防组合枚举写错）
        const minimal = subset.every((_, idx) => {
          const smaller = subset.filter((__, j) => j !== idx);
          return isSatisfiable(smaller, candidates, satisfiesFn);
        });
        if (minimal) found.push(subset);
      }
    }
    if (found.length > 0) {
      const sorted = found
        .map((s) => [...s].sort(compareRequester))
        .sort((a, b) => compareRequesterLists(a, b));
      return { minimalSets: sorted, minimal: sorted[0], degraded: false, reason: null, searched: k };
    }
  }

  // 全集都无解却找不到更小的 → 理论上不该发生（单元素检查已覆盖）；保守返回全集并标注
  return {
    minimalSets: [requesters],
    minimal: requesters,
    degraded: false,
    reason: "fallback: full set",
    searched: total,
  };
}

export function isSatisfiable(requesters, candidates, satisfiesFn) {
  return candidates.some((v) => requesters.every((r) => satisfiesFn(v, r.range)));
}

function compareRequester(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareRequesterLists(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const c = compareRequester(a[i], b[i]);
    if (c !== 0) return c;
  }
  return a.length - b.length;
}

/** 稳定序的组合枚举（按原数组顺序，保证同一输入得到同一组子集）。 */
export function* combinations(items, k) {
  const n = items.length;
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield idx.map((i) => items[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i -= 1;
    if (i < 0) return;
    idx[i] += 1;
    for (let j = i + 1; j < k; j += 1) idx[j] = idx[j - 1] + 1;
  }
}
