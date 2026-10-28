/**
 * 退出码聚合 —— **唯一实现处**（`plan/03` K2 / `data/README.md` §7.3）。
 *
 * 优先级 `5 > 3 > 4 > 1 > 2 > 0`（严重者覆盖轻者；同一进程只返回一个码）。
 *
 * `--fail-on` 只影响 1/2 的取舍：
 *   - `error`（默认）：有 error → 1；只有 warning → 0
 *   - `warning`：有 error → 1；只有 warning → 2
 *   - `never`：永远 0（但 3/4 不受影响 —— 那不是"发现"，是"没跑成"）
 *
 * 5 是**运行环境**档（D1 修复新增）：Node 主版本低于 `MIN_NODE_MAJOR` 时由
 * `bin/versionaudit.mjs` 在解析参数**之前**直接返回。此时审计还没开始，所以它
 * 不进 `computeExitCode`，也不受 `--fail-on` 影响；语义上它不是"发现"，也不是
 * "输入坏"（同一份输入在新的 Node 上能正常审）。
 */

export const EXIT = Object.freeze({
  OK: 0,
  FINDINGS: 1,
  WARNINGS_ONLY: 2,
  INPUT: 3,
  INCONSISTENCY: 4,
  ENVIRONMENT: 5,
});

/** 从"发现集合 + 输入/内部状态"算出唯一退出码。 */
export function computeExitCode({ summary, failOn = "error", inputError = false, inconsistency = false }) {
  if (inputError) return EXIT.INPUT;
  if (inconsistency) return EXIT.INCONSISTENCY;
  const hasError = summary.error > 0;
  const hasWarning = summary.warning > 0;
  if (failOn === "never") return EXIT.OK;
  if (hasError) return EXIT.FINDINGS;
  if (hasWarning && failOn === "warning") return EXIT.WARNINGS_ONLY;
  return EXIT.OK;
}

export const EXIT_DESCRIPTIONS = Object.freeze({
  0: "无问题",
  1: "存在 error 级问题",
  2: "仅存在 warning 级问题且 --fail-on=warning",
  3: "输入不可解析",
  4: "内部不一致（工具结论与 semver 库差分不一致）",
  5: "运行环境不满足（Node 主版本低于下限）",
});
