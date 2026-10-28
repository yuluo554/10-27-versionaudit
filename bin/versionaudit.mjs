#!/usr/bin/env node
/**
 * 唯一可执行入口：**不做逻辑**，只转发到 `src/cli/main.mjs`。
 *
 * 这样 `node --test` 可以 import 同一套实现而不用 spawn 子进程，
 * 且发布包里的 `bin/` 只有这一层壳（`plan/02` §二）。
 *
 * 唯一的例外是**运行时下限检查**：它必须在 `parseArgs` 与任何业务模块加载**之前**跑，
 * 否则旧 Node 上先炸的是 `ERR_UNKNOWN_FILE_EXTENSION` / `ERR_MODULE_NOT_FOUND` 之类的
 * 间接错误，用户看不到"需要 Node >= 20"。故 `src/policy/node-floor.mjs` 不 import
 * 任何模块（连 `semver` 都不 import）。
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkNodeFloor, MIN_NODE_MAJOR } from "../src/policy/node-floor.mjs";
import { parseArgs } from "../src/cli/args.mjs";
import { run } from "../src/cli/main.mjs";
import { EXIT } from "../src/cli/exit.mjs";
import { UsageError } from "../src/errors.mjs";

/** 下限不满足时的**唯一**停出口：一行 stderr + 环境档退出码（`EXIT.ENVIRONMENT`）。 */
function enforceNodeFloor(currentVersion) {
  const floor = checkNodeFloor(currentVersion, MIN_NODE_MAJOR);
  if (floor.ok) return null;
  process.stderr.write(`versionaudit: requires Node >= ${MIN_NODE_MAJOR} (running ${currentVersion})\n`);
  process.stderr.write(`  ${floor.reason}\n`);
  return EXIT.ENVIRONMENT;
}

async function main(argv) {
  const environmentCode = enforceNodeFloor(process.versions.node);
  if (environmentCode !== null) {
    process.exitCode = environmentCode;
    return;
  }
  try {
    const parsed = await parseArgs(argv);
    const code = await run(parsed, {
      stdout: (s) => process.stdout.write(s),
      stderr: (s) => process.stderr.write(s),
    });
    process.exitCode = code;
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`用法错误：${error.message}\n`);
      process.stderr.write("用 --help 查看可用选项。\n");
      process.exitCode = EXIT.WARNINGS_ONLY;
      return;
    }
    // 输入错误（3）与内部不一致（4）走各自的码；其余按内部错误处理
    const code = typeof error.exitCode === "number" ? error.exitCode : EXIT.INPUT;
    process.stderr.write(`${error.name ?? "Error"}: ${error.message}\n`);
    // `detail` 是**可行动的那一半**（支持面 / 结构混用的处置建议 / JSON 解析器原文）。
    // 只打 message 会让"不支持的 lockfileVersion 9" 这种报文停在"说了是什么、没说怎么办"。
    if (typeof error.detail === "string" && error.detail.length > 0) {
      process.stderr.write(`  ${error.detail}\n`);
    }
    if (process.env.VERSIONAUDIT_DEBUG === "1" && error.stack) {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exitCode = code;
  }
}

const isDirect = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return true;
  }
})();

if (isDirect) {
  main(process.argv.slice(2));
}

export { main };
