/**
 * SARIF 2.1.0 输出。
 *
 * 合规面由 `schema/sarif-2.1.0.json`（OASIS 官方 schema 的离线副本，sha256 见 `data/README.md` §1.1）
 * 校验，**不是**靠手写断言自说自话：`tools/check-report-schema.mjs` 真跑校验器。
 *
 * 纪律：
 *   - **每条产物都要进 SARIF**：M1/M2 的 findings + M3 的 dedupe + M4 的 conflicts。
 *     只输出 findings 会让三格式内容不一致（M5 走查实测：真实树 JSON 报 2 条 error，
 *     SARIF 报 0 条 —— `--format=sarif` 的用户会以为没问题）。
 *   - **`ruleId` 必须是真规则键**：M2 finding 没有 `rule` 字段（只有 `kind`），
 *     旧实现 `String(f.rule)` 产出字面量 `"undefined"`（M5 走查实测，样例里就有）。
 *   - `uri` 一律**仓库相对路径**（无绝对路径）；输入目录本身用 `<input>` 占位；
 *   - `rules` 只收出现过的规则（不留空壳），且按 ruleId 排序（确定性）；
 *   - 不写 `invocations` 里的时间戳（SARIF 允许省略）。
 */

import { RULE_DESCRIPTIONS, toSarifLevel } from "./schema.mjs";

export const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

export function renderSarif(report) {
  const entries = collectEntries(report);

  const ruleIds = [...new Set(entries.map((e) => e.ruleId))].sort();
  const rules = ruleIds.map((id) => ({
    id,
    name: id,
    shortDescription: { text: RULE_DESCRIPTIONS[id] ?? id },
    defaultConfiguration: { level: toSarifLevel(levelOf(entries, id)) },
  }));

  const results = entries.map(({ ruleId, severity, subject, message, properties }) => ({
    ruleId,
    level: toSarifLevel(severity),
    message: { text: message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: "<input>/package.json" },
        },
      },
    ],
    // `subject` 是"这条结果说的是哪个包/依赖"的**机器可读**形态。
    // 不从 `message.text` 里切字符串反推：报文措辞一改，三格式一致性判据就会假绿/假红。
    properties: { severity, subject, ...properties },
  }));

  return {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "versionaudit",
            version: report.tool.version,
            informationUri: report.tool.informationUri,
            rules,
          },
        },
        results,
        properties: {
          policy: report.policy.name,
          schemaVersion: report.schemaVersion,
        },
      },
    ],
  };
}

/**
 * 把三类产物摊平成同一种条目（**唯一**的"报告里有什么"的枚举处）。
 * `tests/report/consistency.test.mjs` 用它对齐 text / json / sarif 三格式。
 */
export function collectEntries(report) {
  const entries = [];

  for (const f of report.findings) {
    const ruleId = f.rule ?? f.kind;
    if (!ruleId) throw new Error('SARIF：finding 既无 rule 也无 kind（ruleId 会退化成 "undefined"）');
    entries.push({
      ruleId: String(ruleId),
      severity: f.severity,
      subject: f.package ?? f.dependency ?? "?",
      message: messageForFinding(f),
      properties: findingProperties(f),
    });
  }

  for (const item of report.dedupe ?? []) {
    entries.push({
      ruleId: item.status,
      severity: item.severity,
      subject: item.package,
      message: messageForDedupe(item),
      properties: {
        package: item.package,
        lockedVersions: item.lockedVersions,
        ...(item.targets?.length ? { targets: item.targets.map((t) => t.version) } : {}),
        ...(item.minimalConflictSet
          ? { minimalConflictSet: item.minimalConflictSet.map((m) => `${m.requester}(${m.range})`) }
          : {}),
        degraded: item.degraded === true,
        ...(item.degraded ? { degradeReason: item.degradeReason ?? null } : {}),
      },
    });
  }

  for (const item of report.conflicts ?? []) {
    entries.push({
      ruleId: item.kind,
      severity: item.severity,
      subject: item.package,
      message: messageForConflict(item),
      properties: {
        package: item.package,
        ...(item.lockedVersion ? { lockedVersion: item.lockedVersion } : {}),
        minimalSet: (item.minimalSet ?? []).map((m) => `${m.requester}(${m.range})`),
        degraded: item.degraded === true,
        ...(item.degraded ? { degradeReason: item.degradeReason ?? null } : {}),
      },
    });
  }

  return entries;
}

function levelOf(entries, ruleId) {
  const severities = entries.filter((e) => e.ruleId === ruleId).map((e) => e.severity);
  if (severities.includes("error")) return "error";
  if (severities.includes("warning")) return "warning";
  return "info";
}

function messageForFinding(f) {
  if (f.declaredRange !== undefined) {
    const chain = (f.requesterPath ?? []).join(" › ");
    return `${f.declaringPackage ?? "?"} 声明 ${f.dependency}@${f.declaredRange}，锁中为 ${f.lockedVersion ?? "(缺失)"}；请求者路径 ${chain}`;
  }
  return `${f.package}: 范围 ${f.rawRange} → ${f.expandedRange ?? "(非 semver 范围)"}`;
}

function findingProperties(f) {
  const props = {};
  if (f.requesterPath) props.requesterPath = f.requesterPath;
  if (f.declaredRange !== undefined) props.declaredRange = f.declaredRange;
  if (f.lockedVersion !== undefined) props.lockedVersion = f.lockedVersion;
  if (f.expandedRange !== undefined) props.expandedRange = f.expandedRange;
  return props;
}

function messageForDedupe(item) {
  const locked = item.lockedVersions.join(" / ");
  if (item.status === "CONVERGIBLE") {
    return `${item.package}: 可收敛（锁定 ${locked}）→ 目标 ${item.targets.map((t) => t.version).join(" / ")}`;
  }
  const mus = (item.minimalConflictSet ?? []).map((m) => `${m.requester}(${m.range})`).join(" ⊗ ");
  const suffix = item.degraded ? `［降级：${item.degradeReason ?? "degraded"}］` : "";
  return `${item.package}: ${item.status}（锁定 ${locked}）；最小冲突集 ${mus}${suffix}`;
}

function messageForConflict(item) {
  const set = (item.minimalSet ?? []).map((m) => `${m.requester}(${m.range})`).join(" ⊗ ");
  return `${item.package}: ${item.kind}；最小请求者集 ${set}`;
}
