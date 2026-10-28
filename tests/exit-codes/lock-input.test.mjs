/**
 * 退出码 3（输入不可解析）的**端到端**覆盖（`plan/01` §3.5 / `data/README.md` §7.3）。
 *
 * 为什么单独一个文件、且**不做成向量**（HANDOFF-M3 §三.3 的落点选择）：
 *   这类输入**不产生 JSON 报告**（进程在 `loadContext` 就抛 `InputError`，stdout 为空）。
 *   而 `fixtures/vectors` 的两条不变量都要求"有报告"：
 *     ① `tools/check-vectors.mjs` 要求 `expected.json.mustContain` 含 `input.*` 绑定
 *        （`input` 只来自报告）；② `tests/vectors` 无条件 `JSON.parse(stdout)`。
 *   把退出码 3 塞进向量只能靠给这两条纪律开洞 —— 那正好是变异组 `V6` 守的东西。
 *   所以它们落在这里：**真 spawn CLI**，断言进程退出码 + stderr 报文。
 *
 * 三形态（`data/README.md` §7.3 的"输入不可解析"枚举，逐条对应）：
 *   1. v1/v2/v3 结构混用
 *   2. lockfileVersion 不支持
 *   3. JSON 语法错误
 *
 * 纪律：优先级 `3 > 4 > 1 > 2 > 0`（K2）。因此**同时含真实 error 发现**的输入也必须返回 3 ——
 * 这条单独断言（"3 压过 1"），否则"先报发现再报输入错"的实现照样绿。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { makeFixture, lockV3, writeFile, cleanupFixtures } from "../helpers/fixtures.mjs";
import { REPO_ROOT } from "../../src/meta.mjs";
import { EXIT } from "../../src/cli/exit.mjs";

after(cleanupFixtures);

const BIN = join(REPO_ROOT, "bin", "versionaudit.mjs");

/**
 * 真 spawn CLI（不是 import `run`）：退出码必须由**进程**给出，
 * 才能证明 `bin/versionaudit.mjs` 的错误分支（`process.exitCode = code`）真的生效。
 */
function spawnCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      code: typeof error.status === "number" ? error.status : -1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

const CLEAN_MANIFEST = { name: "f", version: "1.0.0", private: true, dependencies: { a: "^1.0.0" } };
const CLEAN_LOCK = lockV3({ a: "^1.0.0" }, { "node_modules/a": { version: "1.0.0" } });

/** 写一份锁到临时目录（覆盖 helper 生成的那份）。 */
function withLock(lockObject) {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  writeFile(dir, "package-lock.json", `${JSON.stringify(lockObject, null, 2)}\n`);
  return dir;
}

// ── 形态 1：v1/v2/v3 结构混用（两个方向各一条）──────────────────────────────
test("退出码 3：lockfileVersion 1 却只有 packages 字段（v1 声明 + v3 结构）", () => {
  const dir = withLock({
    name: "f",
    version: "1.0.0",
    lockfileVersion: 1,
    packages: { "": { name: "f", version: "1.0.0" } },
  });
  const { code, stderr, stdout } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.INPUT, `实际退出码 ${code}`);
  assert.equal(stdout, "", "输入不可解析时不得产出（半截）JSON 报告");
  assert.match(stderr, /结构混用/);
});

test("退出码 3：lockfileVersion 3 却带 dependencies 字段（v3 声明 + v2 结构）", () => {
  const dir = withLock({
    name: "f",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: { "": { name: "f", version: "1.0.0" } },
    dependencies: {},
  });
  const { code, stderr } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.INPUT, `实际退出码 ${code}`);
  assert.match(stderr, /结构混用/);
});

test("退出码 3：lockfileVersion 2 缺少 packages（双视图缺一半）", () => {
  const dir = withLock({ name: "f", version: "1.0.0", lockfileVersion: 2, dependencies: {} });
  const { code, stderr } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.INPUT, `实际退出码 ${code}`);
  assert.match(stderr, /packages/);
});

// ── 形态 2：lockfileVersion 不支持 ────────────────────────────────────────────
test("退出码 3：不支持的 lockfileVersion，报文列出支持面", () => {
  const dir = withLock({ name: "f", version: "1.0.0", lockfileVersion: 9, packages: {} });
  const { code, stderr } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.INPUT, `实际退出码 ${code}`);
  assert.match(stderr, /不支持的 lockfileVersion 9/);
  assert.match(stderr, /1 \/ 2 \/ 3/, "必须列出支持面，否则用户无法行动");
});

test("退出码 3：lockfileVersion 不是整数", () => {
  const dir = withLock({ name: "f", version: "1.0.0", lockfileVersion: "3", packages: {} });
  const { code, stderr } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.INPUT, `实际退出码 ${code}`);
  assert.match(stderr, /必须是整数/);
});

// ── 形态 3：JSON 语法错误（manifest 与 lock 两侧各一条）──────────────────────
test("退出码 3：package-lock.json 不是合法 JSON", () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  writeFile(dir, "package-lock.json", "{ broken json");
  const { code, stderr, stdout } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.INPUT, `实际退出码 ${code}`);
  assert.equal(stdout, "");
  assert.match(stderr, /不是合法 JSON/);
});

test("退出码 3：package.json 不是合法 JSON", () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  writeFile(dir, "package.json", "{ nope");
  const { code, stderr } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.INPUT, `实际退出码 ${code}`);
  assert.match(stderr, /不是合法 JSON/);
});

// ── 优先级：3 压过 1（同一输入既有真实 error 发现，又是结构混用）────────────
test("优先级 3 > 1：同时存在真实 error 发现与结构损坏时返回 3", () => {
  // manifest 声明 ^2.0.0、锁里是 1.0.0 —— 若按发现走会是 1；
  // 但锁结构混用（v3 带 dependencies）必须压过它。
  const dir = makeFixture(
    { name: "f", version: "1.0.0", private: true, dependencies: { a: "^2.0.0" } },
    CLEAN_LOCK,
  );
  writeFile(
    dir,
    "package-lock.json",
    `${JSON.stringify(
      {
        name: "f",
        version: "1.0.0",
        lockfileVersion: 3,
        packages: { "": { name: "f", version: "1.0.0", dependencies: { a: "^2.0.0" } }, "node_modules/a": { version: "1.0.0" } },
        dependencies: {},
      },
      null,
      2,
    )}\n`,
  );
  const { code } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.INPUT, "结构混用必须压过「有 error 发现」");
});

// ── 阴性对照：干净输入不得是 3（防"一律返回 3"的假实现）────────────────────
test("阴性对照：干净输入返回 0（不是 3）", () => {
  const dir = makeFixture(CLEAN_MANIFEST, CLEAN_LOCK);
  const { code, stdout } = spawnCli(["audit", dir, "--format=json"]);
  assert.equal(code, EXIT.OK);
  assert.doesNotThrow(() => JSON.parse(stdout), "干净输入必须产出可解析的 JSON 报告");
});
