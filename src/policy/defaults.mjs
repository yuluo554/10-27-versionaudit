/**
 * 灰区默认值（`plan/01` §3.6 / `data/README.md` §7.4）。
 *
 * **这里是默认档的唯一副本**，且默认档是**策略**不是事实——报告必须回显实际使用的档位表
 * （`data/README.md` §7.4 要求）。改这里等于改产品行为，必须同步 `docs/limitations.md`。
 */

export const DEFAULTS = Object.freeze({
  format: "text",
  out: null,
  failOn: "error",
  severityMapPath: null,
  strict: false,
  prefer: null, // null = 全列（不替用户选）
  ignorePeer: false,
  maxRequesters: 12,
  verbosePaths: false,
});

export const VALID = Object.freeze({
  format: ["text", "json", "sarif"],
  failOn: ["error", "warning", "never"],
  prefer: [null, "latest", "min-change"],
});

/** 需要值的选项集合（用于参数面校验：缺值不能静默变成 true）。 */
export const VALUED_OPTIONS = Object.freeze([
  "format",
  "out",
  "fail-on",
  "severity-map",
  "prefer",
  "max-requesters",
]);

/** 布尔开关（出现即 true，不接受 `--flag=false` 这种半布尔）。 */
export const BOOLEAN_OPTIONS = Object.freeze([
  "strict",
  "ignore-peer",
  "verbose-paths",
  "enable-r8",
  "help",
  "version",
  "json-drift",
]);
