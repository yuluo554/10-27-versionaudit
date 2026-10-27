/**
 * 默认档位表（**策略，不是事实**）。
 *
 * `data/README.md` §7.3 规定了默认 error 集合：
 *   R5 空交集 / M2 `manifest-not-satisfied` / M3 `NOT_CONVERGIBLE` / M4 冲突。
 * 其余按 `plan/03` 的规则表取 warning/info。
 *
 * `--severity-map` 可以整表覆盖；报告通过 `policy` 字段回显**实际生效**的那份。
 */

export const DEFAULT_SEVERITY = Object.freeze({
  // M1 规则
  R1: "warning",
  R2: "warning",
  R3: "info",
  R4: "warning",
  R5: "error",
  R6: "warning",
  R7: "info",
  R8: "info",
  // M2 kind
  "manifest-not-satisfied": "error",
  "missing-from-lock": "error",
  "manifest-changed-unsynced": "error",
  "lock-extra-undeclared": "warning",
  "lock-outdated": "warning", // 仅 --strict 下产生
  // M3
  CONVERGIBLE: "info",
  NOT_CONVERGIBLE: "error",
  REQUIRES_OVERRIDE: "warning",
  // M4
  "peer-conflict": "error",
  "version-conflict": "error",
});

export const SEVERITIES = Object.freeze(["error", "warning", "info"]);

/**
 * 合并用户档位表。**未知键不静默接受**：拼错的规则名会让"我以为降级了"变成假象。
 * 返回 `{ table, overrides, rejected }` —— rejected 非空即用法错误。
 */
export function buildSeverityTable(overrides = {}) {
  const table = { ...DEFAULT_SEVERITY };
  const rejected = [];
  const applied = {};
  for (const key of Object.keys(overrides).sort()) {
    const value = overrides[key];
    if (!(key in DEFAULT_SEVERITY)) {
      rejected.push(`${key}: 未知规则/状态键`);
      continue;
    }
    if (!SEVERITIES.includes(value)) {
      rejected.push(`${key}: 级别必须是 ${SEVERITIES.join("/")}，实际 ${JSON.stringify(value)}`);
      continue;
    }
    table[key] = value;
    applied[key] = value;
  }
  return { table, overrides: applied, rejected };
}

/** 级别比较：用于"最高级别是什么"（决定退出码）。 */
export function maxSeverity(severities) {
  if (severities.includes("error")) return "error";
  if (severities.includes("warning")) return "warning";
  if (severities.includes("info")) return "info";
  return null;
}
