/**
 * MUS（极小不可满足子集）—— **M3/M4 共用的唯一实现**（`plan/03` K4）。
 *
 * 定义（`data/README.md` §7.2）：
 *   M ⊆ R 是最小冲突集 ⇔ ① M 无解（任何候选版本都不满足 M 的全部范围）；
 *                        ② ∀ M' ⊊ M，M' 有解。
 *
 * 求法：按基数 k = 2,3,… 升序遍历子集，首个无解即最小。请求者数通常 < 20。
 * 超限（`--max-requesters`）时**必须显式降级**，不许静默给出非最小结果。
 *
 * 两个实现细节（都来自 references 的变异验证教训）：
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
    // 显式降级：贪心近似（移除"最不可能被满足"的请求者），并标明不是最小
    const greedy = [...requesters].sort((a, b) => {
      const ca = candidates.filter((v) => satisfiesFn(v, a.range)).length;
      const cb = candidates.filter((v) => satisfiesFn(v, b.range)).length;
      if (ca !== cb) return ca - cb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const seed = greedy.slice(0, 2);
    return {
      minimalSets: [seed],
      minimal: seed,
      degraded: true,
      reason: `requesters > max-requesters (${maxRequesters})：返回贪心近似，非最小集`,
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
