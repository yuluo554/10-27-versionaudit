/**
 * 人类可读报告。
 *
 * 设计约束（`plan/01` §3.5）：
 *   - 每条都带"声明项 · 期望范围 · 锁中版本 · 请求者路径"四件套（`npm ci` 缺的那几样）；
 *   - 头部必须回显 `policy`（灰区默认档是策略，不回显就无法审计）；
 *   - 不输出时间戳/主机名/绝对路径。
 */

const SEVERITY_LABEL = { error: "ERROR", warning: "WARN ", info: "INFO " };

export function renderText(report) {
  const lines = [];
  const { summary, policy, input } = report;

  lines.push(`versionaudit · 离线版本约束审计（schema ${report.schemaVersion}）`);
  lines.push(`实现：${report.implementation.library} ${report.implementation.version}`);
  lines.push(`输入：${input.manifest} + ${input.lockfile}（lockfileVersion ${input.lockfileVersion}）`);
  lines.push(
    `扫描：${input.declarations} 条声明 / ${input.packages} 个锁条目 / 可达 ${input.reachable}`,
  );
  lines.push(
    `档位：policy=${policy.name}${policy.overrides && Object.keys(policy.overrides).length ? `（覆盖 ${Object.keys(policy.overrides).length} 项）` : "（内置默认）"}`,
  );
  lines.push("");

  if (summary.error === 0 && summary.warning === 0 && summary.info === 0) {
    lines.push("无发现。");
  }

  const groups = [
    ["范围语义（M1）", report.findings.filter((f) => f.rule !== undefined)],
    ["锁与声明（M2）", report.findings.filter((f) => f.rule === undefined && f.kind !== undefined)],
  ];

  for (const [title, items] of groups) {
    if (items.length === 0) continue;
    lines.push(`${title}`);
    for (const item of items) {
      const label = item.rule ?? item.kind ?? "?";
      lines.push(`  ${SEVERITY_LABEL[item.severity] ?? "INFO "} [${label}] ${item.package ?? item.dependency ?? "?"}`);
      if (item.declaredRange !== undefined) {
        lines.push(`         声明范围 ${item.declaredRange} · 锁中 ${item.lockedVersion ?? "(缺失)"}`);
        lines.push(`         声明项 ${item.declaringPackage ?? "?"} · 请求者路径 ${(item.requesterPath ?? []).join(" › ")}`);
      } else {
        lines.push(`         声明 ${item.rawRange} → 展开 ${item.expandedRange ?? "(非范围)"}`);
      }
      if (item.explanation) lines.push(`         ${item.explanation}`);
      if (item.evidence) lines.push(`         证据 ${item.evidence}`);
    }
    lines.push("");
  }

  if (report.dedupe && report.dedupe.length) {
    lines.push("重复版本收敛可行性（M3）");
    for (const item of report.dedupe) {
      lines.push(`  ${item.package}: ${item.status}（锁定 ${item.lockedVersions.join(" / ")}）`);
      if (item.targets?.length) {
        lines.push(`         可收敛目标：${item.targets.map((t) => t.version).join(" / ")}`);
      }
      if (item.minimalConflictSet) {
        lines.push(`         最小冲突集：${item.minimalConflictSet.map((m) => `${m.requester}(${m.range})`).join(" ⊗ ")}`);
      }
      // 降级原因必须打 `degradeReason`（`requesters > max`，§7.2 的固定口径串）。
      // 旧实现打的是 `item.reason`——那是**两态 reason**（`empty-intersection` / `no-locked-candidate`），
      // 于是"降级了"后面跟着一个跟降级无关的词（M5 走查实测）。
      if (item.degraded) lines.push(`         ⚠ 已降级：${item.degradeReason ?? "degraded"}`);
    }
    lines.push("");
  }

  if (report.conflicts && report.conflicts.length) {
    lines.push("冲突最小解释（M4）");
    for (const item of report.conflicts) {
      lines.push(`  ${item.package}：${item.kind}（锁中 ${item.lockedVersion ?? "(无)"}）`);
      lines.push(`         最小请求者集：${item.minimalSet.map((m) => `${m.requester}(${m.range})`).join(" ⊗ ")}`);
      if (item.conflictProof) lines.push(`         证明：${item.conflictProof.ranges.join(" ∩ ")} = ∅`);
    }
    lines.push("");
  }

  if (report.degraded && report.degraded.length) {
    lines.push(`⚠ 本次运行存在降级：${report.degraded.join("；")}`);
    lines.push("");
  }

  lines.push(`合计：error ${summary.error} / warning ${summary.warning} / info ${summary.info}`);
  return lines;
}
