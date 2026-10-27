/**
 * 参数面（纯函数：argv → options）。
 *
 * 三条来自 references 的实测纪律：
 *   ① **`or DEFAULT` 会把 falsy 合法值静默改回默认**——这里不做 `x || default`，
 *      每个选项都显式判 `undefined`；
 *   ② **未知格式要显式拒绝**，不回落 `text`（回落会让拼错的 `--format=sraf` 静默出人类报告）；
 *   ③ **需要值的选项缺值 = 用法错误**，不能静默变成 `true`。
 */

import { DEFAULTS, VALID, VALUED_OPTIONS, BOOLEAN_OPTIONS } from "../policy/defaults.mjs";
import { UsageError } from "../errors.mjs";

const VALIDATED = {
  format: VALID.format,
  "fail-on": VALID.failOn,
  prefer: VALID.prefer.filter((v) => v !== null),
};

export function parseArgs(argv) {
  const options = { ...DEFAULTS };
  const positionals = [];
  const seen = new Set();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    const name = eq >= 0 ? token.slice(2, eq) : token.slice(2);
    const inlineValue = eq >= 0 ? token.slice(eq + 1) : undefined;

    if (BOOLEAN_OPTIONS.includes(name)) {
      if (inlineValue !== undefined) {
        throw new UsageError(`--${name} 是布尔开关，不接受值（收到 ${JSON.stringify(inlineValue)}）`);
      }
      // 归一到 camelCase 与有值选项一致（否则 `--ignore-peer` 存成 `options["ignore-peer"]`，
      // 业务侧读 `options.ignorePeer` 恒为 undefined —— 实测缺陷：开关静默失效）
      options[camel(name)] = true;
      seen.add(name);
      continue;
    }

    if (!VALUED_OPTIONS.includes(name)) {
      throw new UsageError(`未知选项 --${name}（用 --help 查看可用选项）`);
    }
    let value = inlineValue;
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new UsageError(`--${name} 需要一个值`);
      }
      value = next;
      i += 1;
    }
    if (value === "") throw new UsageError(`--${name} 的值不能为空`);

    if (VALIDATED[name] && !VALIDATED[name].includes(value)) {
      throw new UsageError(`--${name} 只接受 ${VALIDATED[name].join(" / ")}，收到 ${JSON.stringify(value)}`);
    }
    if (name === "max-requesters") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1) {
        throw new UsageError(`--max-requesters 必须是正整数，收到 ${JSON.stringify(value)}`);
      }
      options.maxRequesters = n;
      seen.add(name);
      continue;
    }

    options[camel(name)] = value;
    seen.add(name);
  }

  return { options, positionals, seen };
}

function camel(name) {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/** 位置参数：第一个是目标目录（默认 `.`），其余是子命令附加参数。 */
export function splitCommand(positionals) {
  const [command, ...rest] = positionals;
  return { command: command ?? "audit", rest };
}
