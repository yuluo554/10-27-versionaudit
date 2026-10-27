#!/usr/bin/env node
/**
 * 唯一可执行入口：**不做逻辑**，只转发到 `src/cli/main.mjs`。
 *
 * 这样 `node --test` 可以 import 同一套实现而不用 spawn 子进程，
 * 且发布包里的 `bin/` 只有这一层壳（`plan/02` §二）。
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/cli/args.mjs";
import { run } from "../src/cli/main.mjs";
import { EXIT } from "../src/cli/exit.mjs";
import { UsageError } from "../src/errors.mjs";

async function main(argv) {
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
