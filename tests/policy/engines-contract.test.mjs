/**
 * `engines.node` 与运行时检查的**契约测试**（D1 的"声明 = 实现"证据）。
 *
 * 为什么单列一条：本仓 v1.0.0 的缺陷形态正是"声明了但没人读"——`engines.node: ">=20"`
 * 在 `src/` + `bin/` 里 grep 0 命中。只加 `src/policy/node-floor.mjs` 而不钉住
 * "package.json 的下限 == MIN_NODE_MAJOR"、"入口真的会拒"，下次改一处忘另一处就又是装饰。
 *
 * 一条测试里三段断言（K9「实现版本随结论输出」的同款手法）：
 *   ① `package.json#engines.node` 与 `MIN_NODE_MAJOR` 数值一致；
 *   ② 退出码表里有环境档，且描述与语义一致；
 *   ③ **端到端**：把 `process.versions.node` 篡改成 18.20.0 后加载真实入口，
 *      必须 `exitCode = EXIT.ENVIRONMENT` 且 stderr 打出下限要求（不是间接错误）。
 *
 * ③ 必须真跑入口而不是测函数：函数绿而入口没接上，正是 D1 的原始形态。
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { MIN_NODE_MAJOR } from "../../src/policy/node-floor.mjs";
import { EXIT, EXIT_DESCRIPTIONS } from "../../src/cli/exit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIN = join(ROOT, "bin", "versionaudit.mjs");

test("engines.node 与运行时下限是同一件事（声明 == 实现）", () => {
  // ① 声明面：package.json 的 engines.node 必须正好是 >=MIN_NODE_MAJOR
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.equal(
    pkg.engines?.node,
    `>=${MIN_NODE_MAJOR}`,
    "package.json 的 engines.node 与 MIN_NODE_MAJOR 漂移了（改一处必须改另一处）",
  );

  // ② 退出码面：环境档必须存在且有描述（码值不许挤占既有 0–4）
  assert.equal(EXIT.ENVIRONMENT, 5, "环境档必须是 5（0–4 已被既有语义占用）");
  assert.match(EXIT_DESCRIPTIONS[EXIT.ENVIRONMENT] ?? "", /环境/, "退出码表必须登记环境档的语义");

  // ③ 执行面：篡改 process.versions.node 后加载真实入口
  const dir = mkdtempSync(join(tmpdir(), "va-floor-"));
  try {
    const wrapper = join(dir, "wrapper.mjs");
    writeFileSync(
      wrapper,
      [
        `Object.defineProperty(process.versions, "node", { value: "18.20.0", configurable: true });`,
        `const { main } = await import(${JSON.stringify(pathToFileURL(BIN).href)});`,
        `await main(["--version"]);`,
        ``,
      ].join("\n"),
      "utf8",
    );
    const result = spawnSync(process.execPath, [wrapper], { encoding: "utf8", cwd: ROOT });
    // `main` 直接设 `process.exitCode`，所以断言的是**子进程真实退出码**（不是包装脚本的 0）
    assert.equal(
      result.status,
      EXIT.ENVIRONMENT,
      `入口在 Node 18 下必须以 ${EXIT.ENVIRONMENT} 退出（实际 ${result.status}；stderr: ${result.stderr}）`,
    );
    assert.match(
      result.stderr,
      new RegExp(`requires Node >= ${MIN_NODE_MAJOR}`),
      `stderr 必须打出下限要求而不是间接错误：${result.stderr}`,
    );
    assert.doesNotMatch(result.stdout, /versionaudit 1\.0\.0/, "未过下限时不许输出正常版本行");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});