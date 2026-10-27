/**
 * 内部一致性自检（退出码 4 的来源，`plan/01` §3.5 / `plan/06` D6）。
 *
 * 对每条语义判定用 `semver` 库**独立复算一次**，不一致即 `InternalInconsistency`。
 * 这不是装饰：没有它，"工具与库不一致"只会表现为一个看起来正常的错结论。
 *
 * 覆盖面刻意限定在"可直接复算"的东西：
 *   - `expandedRange` 是否能由 `validRange` 复现；
 *   - `manifest-not-satisfied` 的 `satisfies` 判定；
 *   - 三态判定里"目标版本满足全部请求者"的事实。
 * 不试图复算 MUS（那会变成"用被测实现验自己"）。
 */

import { validRange, satisfies } from "../semver/adapter.mjs";

export function selfCheck({ findings, dedupe, conflicts }) {
  const problems = [];

  for (const f of findings) {
    // M1 的 finding 有 rawRange（可复算展开）；M2 的 finding 有 kind + declaredRange。
    // **不能因为"没有 rawRange"就 continue**——那样 M2 的 satisfies 断言从未被自检过
    // （实测缺陷：注入一个假的"不满足"却抓不到）。
    if (f.rawRange !== undefined) {
      const recomputed = validRange(f.rawRange);
      if (recomputed !== f.expandedRange) {
        problems.push({
          scope: "range-expansion",
          subject: `${f.package ?? "?"} ${JSON.stringify(f.rawRange)}`,
          expected: recomputed,
          actual: f.expandedRange,
        });
      }
    }
    if (f.kind === "manifest-not-satisfied" && f.lockedVersion) {
      const ok = satisfies(f.lockedVersion, f.declaredRange);
      if (ok !== false) {
        problems.push({
          scope: "lock-manifest",
          subject: `${f.dependency}@${f.lockedVersion} vs ${f.declaredRange}`,
          expected: false,
          actual: ok,
        });
      }
    }
  }

  for (const item of dedupe ?? []) {
    if (item.status !== "CONVERGIBLE") continue;
    for (const target of item.targets) {
      for (const proof of target.proof) {
        const recomputed = satisfies(target.version, proof.range);
        if (recomputed !== proof.satisfies) {
          problems.push({
            scope: "dedupe-proof",
            subject: `${item.package}@${target.version} vs ${proof.range}`,
            expected: recomputed,
            actual: proof.satisfies,
          });
        }
      }
    }
  }

  for (const item of conflicts ?? []) {
    if (!item.conflictProof?.crossChecked && item.conflictProof?.crossChecked !== null) {
      // crossChecked === false 表示自研求交与库的 intersects 判定不一致
      problems.push({
        scope: "conflict-proof",
        subject: `${item.package}（${item.kind}）`,
        expected: "interval 与 semver.intersects 一致",
        actual: "不一致",
      });
    }
  }

  return problems;
}
