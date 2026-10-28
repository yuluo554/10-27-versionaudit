/**
 * `tools/run-tests.mjs` 的守门测试（M6 首推缺陷的回归）。
 *
 * 背景（CI 首推实测，`test (20)` 红 / `test (22)`、`test (24)` 绿、本机 node 24 绿）：
 *   - `node --test "<glob>"` 的 glob 支持是 **Node 21** 才加的 → Node 20 直接
 *     `Could not find '…tests/**\/*.test.mjs'` 退出 1；
 *   - `node --test <目录>` 在 Node 22+ 已失效（目录被当成测试文件，`✖ … 'test failed'`）。
 * 两种形态各在一个主版本上崩，所以判据不能依赖任何一种 —— 必须自己枚举文件。
 *
 * 本测试钉住两条**不许退化**的性质：
 *   ① **空匹配必须非 0**。否则"跑零个测试"看起来像"全绿"，
 *      而变异门会把"预期红"的组平凡判成通过（假绿）。变异组 `H27` 钉住这条。
 *   ② **正常 glob 必须真跑起来**（不是"永远 0"）：断言输出里有 `pass` 汇总行。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUNNER = join(ROOT, "tools", "run-tests.mjs");

/** 跑一次 runner，返回 { code, stdout, stderr }。
 * 用 `spawnSync` 而不是 `execFileSync`：runner 的机读串写在 **stderr**，
 * 而 `execFileSync` 成功时只回 stdout（踩过：断言 stderr 恒空 → 假红）。
 */
function runRunner(args) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: "utf8",
    cwd: ROOT,
  });
  return { code: status ?? 1, stdout: stdout ?? "", stderr: stderr ?? "" };
}

test("空匹配必须退出 2，不许静默全绿", () => {
  const { code, stderr } = runRunner(["tests/does-not-exist/*.test.mjs"]);
  assert.equal(code, 2, `空匹配应退出 2，实际 ${code}（stderr: ${stderr}）`);
  assert.match(stderr, /run-tests: files=0 exit=2/, "机读串必须报 files=0 exit=2");
});

test("未知选项退出 2（别把 --help 当 glob）", () => {
  const { code, stderr } = runRunner(["--bogus"]);
  assert.equal(code, 2, `未知选项应退出 2，实际 ${code}`);
  assert.match(stderr, /unknown option/, "必须说清是选项不认识");
});

test("目录不是测试文件：纯目录模式匹配不到任何东西 → 报空跑（不假装通过）", () => {
  const { code, stderr } = runRunner(["tools"]);
  assert.equal(code, 2, "`tools` 这种无元字符的目录不应被当成测试文件");
  assert.match(stderr, /files=0/, "必须自己数到 0");
});

test("正常 glob 真跑起来（阳性对照）：树外临时测试文件被执行到并留下哨兵", () => {
  // 不能用 stdout 证明"真跑了"：runner 对子进程用 stdio=inherit，父进程捕获不到。
  // 正解 = 让被测测试**写一个哨兵文件**，再检查它在。
  const dir = mkdtempSync(join(tmpdir(), "va-runner-"));
  const sentinel = join(dir, "ran.txt");
  const testFile = join(dir, "sentinel.test.mjs");
  writeFileSync(
    testFile,
    `import { test } from "node:test";\nimport { writeFileSync } from "node:fs";\n` +
      `test("哨兵", () => { writeFileSync(${JSON.stringify(sentinel)}, "ok"); });\n`,
    "utf8",
  );
  try {
    const { code, stderr } = runRunner([testFile]);
    assert.equal(code, 0, `字面路径必须能跑，实际 exit=${code}（stderr: ${stderr}）`);
    assert.ok(existsSync(sentinel), "被测测试文件必须真的被执行过（哨兵文件缺失 = 空转）");
    assert.match(stderr, /run-tests: files=1 exit=0/, "机读串必须报 files=1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
