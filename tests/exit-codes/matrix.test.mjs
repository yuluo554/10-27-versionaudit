/**
 * 退出码矩阵全覆盖（`plan/01` §3.5 / `data/README.md` §7.3）。
 *
 * 每个码至少一条端到端用例。优先级 `3 > 4 > 1 > 2 > 0` 逐位断言。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { makeFixture, lockV3, runCli, cleanupFixtures, writeFile } from "../helpers/fixtures.mjs";
import { computeExitCode, EXIT } from "../../src/cli/exit.mjs";

after(cleanupFixtures);

const CLEAN_MANIFEST = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
const CLEAN_LOCK = lockV3({ a: "^1.0.0" }, { "node_modules/a": { version: "1.0.0" } });

test("退出码 0：无问题", async () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  const { code } = await runCli(["audit", dir]);
  assert.equal(code, EXIT.OK);
});

test("退出码 1：存在 error（manifest-not-satisfied）", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^2.0.0" } };
  const lock = lockV3({ a: "^2.0.0" }, { "node_modules/a": { version: "1.0.0" } });
  const dir = makeFixture(manifest, lock);
  const { code } = await runCli(["audit", dir]);
  assert.equal(code, EXIT.FINDINGS);
});

test("退出码 2：仅 warning 且 --fail-on=warning", async () => {
  // 只制造 warning：>=1.0.0 无上界（R1 = warning）
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: ">=1.0.0" } };
  const lock = lockV3({ a: ">=1.0.0" }, { "node_modules/a": { version: "1.2.0" } });
  const dir = makeFixture(manifest, lock);

  const plain = await runCli(["range-lint", dir]);
  assert.equal(plain.code, EXIT.OK, "默认 --fail-on=error 时 warning 不改变退出码");

  const strict = await runCli(["range-lint", dir, "--fail-on=warning"]);
  assert.equal(strict.code, EXIT.WARNINGS_ONLY);
});

test("退出码 2 的反面：--fail-on=never 时 error 也返回 0", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^2.0.0" } };
  const lock = lockV3({ a: "^2.0.0" }, { "node_modules/a": { version: "1.0.0" } });
  const dir = makeFixture(manifest, lock);
  const { code } = await runCli(["audit", dir, "--fail-on=never"]);
  assert.equal(code, EXIT.OK);
});

test("退出码 3：JSON 语法错误", async () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  writeFile(dir, "package-lock.json", "{ broken json");
  await assert.rejects(
    () => runCli(["audit", dir]),
    (error) => {
      assert.equal(error.exitCode, EXIT.INPUT);
      return true;
    },
  );
});

test("退出码 3：缺少 package-lock.json", async () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  const { rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  rmSync(join(dir, "package-lock.json"));
  await assert.rejects(
    () => runCli(["audit", dir]),
    (error) => {
      assert.equal(error.exitCode, EXIT.INPUT);
      return true;
    },
  );
});

test("退出码 4：内部不一致（构造差分失败）", async () => {
  // 直接测聚合函数的 4 分支：工具跑出来的报告若与 semver 库不一致，必须返回 4
  const code = computeExitCode({
    summary: { error: 0, warning: 0, info: 0 },
    failOn: "error",
    inputError: false,
    inconsistency: true,
  });
  assert.equal(code, EXIT.INCONSISTENCY);
});

test("优先级：3 > 4 > 1 > 2 > 0", () => {
  const base = { summary: { error: 5, warning: 5, info: 0 }, failOn: "warning" };
  assert.equal(computeExitCode({ ...base, inputError: true, inconsistency: true }), EXIT.INPUT);
  assert.equal(computeExitCode({ ...base, inconsistency: true }), EXIT.INCONSISTENCY);
  assert.equal(computeExitCode(base), EXIT.FINDINGS);
  assert.equal(
    computeExitCode({ summary: { error: 0, warning: 3, info: 0 }, failOn: "warning" }),
    EXIT.WARNINGS_ONLY,
  );
  assert.equal(computeExitCode({ summary: { error: 0, warning: 0, info: 9 }, failOn: "error" }), EXIT.OK);
});

test("用法错误：未知选项 / 未知格式 / 缺值 —— 都必须是 2 且报文可指认", async () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  await assert.rejects(
    () => runCli(["audit", dir, "--format=sraf"]),
    (error) => {
      assert.equal(error.exitCode, 2);
      assert.match(error.message, /只接受/);
      return true;
    },
  );
  await assert.rejects(
    () => runCli(["audit", dir, "--nope"]),
    (error) => {
      assert.equal(error.exitCode, 2);
      assert.match(error.message, /未知选项/);
      return true;
    },
  );
  await assert.rejects(
    () => runCli(["audit", dir, "--format"]),
    (error) => {
      assert.equal(error.exitCode, 2);
      assert.match(error.message, /需要一个值/);
      return true;
    },
  );
});

test("--out 写文件（原子写），且 stdout 不再输出正文", async () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  const { join } = await import("node:path");
  const out = join(dir, "report.json");
  const { stdout, stderr, code } = await runCli(["audit", dir, "--format=json", "--out", out]);
  assert.equal(code, 0);
  assert.equal(stdout, "", "给了 --out 时不往 stdout 打正文");
  assert.match(stderr, /已写入/);

  const { readFileSync } = await import("node:fs");
  const written = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(written.schemaVersion, 1);
  assert.ok(written.policy, "报告必须回显 policy");
});

test("doctor 对不可解析输入返回 3（不抛错）", async () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  writeFile(dir, "package.json", "{ nope");
  const { code, stdout } = await runCli(["doctor", dir]);
  assert.equal(code, EXIT.INPUT);
  assert.match(stdout, /输入不可解析/);
});
