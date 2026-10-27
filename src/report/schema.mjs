/**
 * 报告 schema：**字段顺序的单一真相源**（`plan/03` K10）。
 *
 * 为什么键序要手写而不是靠对象字面量顺序：`JSON.stringify` 用的是插入顺序，
 * 只要有人在某处 `{...obj, extra}` 就会漂。这里把顺序表拿出来，序列化侧按表重排。
 */

export const SCHEMA_VERSION = 1;

export const FINDING_FIELDS = Object.freeze([
  "rule",
  "package",
  "declaration",
  "rawRange",
  "expandedRange",
  "severity",
  "evidence",
]);

export const M2_FIELDS = Object.freeze([
  "kind",
  "declaringPackage",
  "declaringPath",
  "dependency",
  "declaredRange",
  "lockedVersion",
  "requesterPath",
  "explanation",
  "severity",
]);

export const REPORT_FIELDS = Object.freeze([
  "schemaVersion",
  "tool",
  "implementation",
  "policy",
  "input",
  "summary",
  "findings",
  "dedupe",
  "conflicts",
  "degraded",
  "internalInconsistency",
]);

export const RULE_DESCRIPTIONS = Object.freeze({
  R1: "声明范围无上界",
  R2: "宽范围 / 非 semver 范围（latest 是 dist-tag）",
  R3: "caret/tilde 在 0.x 上的语义收窄",
  R4: "预发布可达性",
  R5: "空交集（永不满足）",
  R6: "|| 分支冗余 / 被包含",
  R7: "build metadata 造成假精度",
  R8: "裸版本跨生态语义误用（默认关闭）",
  "manifest-not-satisfied": "锁中版本不满足声明范围",
  "missing-from-lock": "声明了但锁中缺失",
  "manifest-changed-unsynced": "锁中根声明与 manifest 不一致",
  "lock-extra-undeclared": "锁中包无声明请求者",
  "lock-outdated": "锁中版本低于声明下界（--strict）",
});

const SARIF_LEVEL = Object.freeze({ error: "error", warning: "warning", info: "note" });

export function toSarifLevel(severity) {
  return SARIF_LEVEL[severity] ?? "note";
}
