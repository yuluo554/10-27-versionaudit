/**
 * SARIF 2.1.0 输出。
 *
 * 最小合规面（离线环境无官方校验器，见 `docs/limitations.md`）：
 *   version / $schema / runs[0].tool.driver.{name,version,informationUri,rules}
 *   results[].{ruleId,level,message.text,locations[].physicalLocation.artifactLocation.uri}
 *
 * 纪律：
 *   - `uri` 一律**仓库相对路径**（无绝对路径）；输入目录本身用 `<input>` 占位；
 *   - `rules` 只收出现过的规则（不留空壳），且按 ruleId 排序（确定性）；
 *   - 不写 `invocations` 里的时间戳（SARIF 允许省略）。
 */

import { RULE_DESCRIPTIONS, toSarifLevel } from "./schema.mjs";

export const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

export function renderSarif(report) {
  const used = new Set();
  for (const f of report.findings) used.add(String(f.rule));
  const ruleIds = [...used].sort();

  const rules = ruleIds.map((id) => ({
    id,
    name: id,
    shortDescription: { text: RULE_DESCRIPTIONS[id] ?? id },
    defaultConfiguration: { level: toSarifLevel(levelOf(report, id)) },
  }));

  const results = report.findings.map((f) => ({
    ruleId: String(f.rule),
    level: toSarifLevel(f.severity),
    message: { text: messageFor(f) },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: artifactUri(f) },
        },
      },
    ],
    properties: propertiesFor(f),
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

function levelOf(report, ruleId) {
  const hit = report.findings.find((f) => String(f.rule) === ruleId);
  return hit ? hit.severity : "info";
}

function messageFor(f) {
  if (f.declaredRange !== undefined) {
    const chain = (f.requesterPath ?? []).join(" › ");
    return `${f.declaringPackage ?? "?"} 声明 ${f.dependency}@${f.declaredRange}，锁中为 ${f.lockedVersion ?? "(缺失)"}；请求者路径 ${chain}`;
  }
  return `${f.package}: 范围 ${f.rawRange} → ${f.expandedRange ?? "(非 semver 范围)"}`;
}

function artifactUri(f) {
  // 输入目录不写进 SARIF（默认输出相对路径，且目录名可能是本机绝对路径）
  return "<input>/package.json";
}

function propertiesFor(f) {
  const props = { severity: f.severity };
  if (f.requesterPath) props.requesterPath = f.requesterPath;
  if (f.declaredRange !== undefined) props.declaredRange = f.declaredRange;
  if (f.lockedVersion !== undefined) props.lockedVersion = f.lockedVersion;
  if (f.expandedRange !== undefined) props.expandedRange = f.expandedRange;
  return props;
}
