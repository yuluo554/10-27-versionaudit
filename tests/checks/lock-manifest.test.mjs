/**
 * M2 锁与声明一致性测试。
 *
 * 核心验收（`plan/01` §3.2）：`send@0.18.0`（锁）vs `^0.19.2`（manifest）场景，
 * 输出必须指出**声明项 = send、请求者路径 = 根项目**，而不只是一个目标版本号。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { runCli, cleanupFixtures } from "../helpers/fixtures.mjs";
import { makeFixture, lockV3, lockV2, lockV1 } from "../helpers/fixtures.mjs";

after(cleanupFixtures);

const SEND_MANIFEST = {
  name: "fixture",
  version: "1.0.0",
  private: true,
  dependencies: { send: "^0.19.2" },
};

const SEND_LOCK_V3 = lockV3(
  { send: "^0.19.2" },
  {
    "node_modules/send": { version: "0.18.0", dependencies: { ms: "2.1.3" } },
    "node_modules/send/node_modules/ms": { version: "2.1.3" },
  },
);

test("send 场景：必须给声明项 + 声明范围 + 锁中版本 + 请求者路径", async () => {
  const dir = makeFixture(SEND_MANIFEST, SEND_LOCK_V3);
  const { code, json } = await runCli(["audit", dir, "--format=json"]);
  assert.equal(code, 1, "manifest-not-satisfied 是 error，退出码应为 1");

  const hit = json.findings.find((f) => f.kind === "manifest-not-satisfied" && f.dependency === "send");
  assert.ok(hit, "应报 manifest-not-satisfied");
  assert.equal(hit.declaringPackage, "fixture", "声明项必须是根项目");
  assert.deepEqual(hit.declaringPath, ["<root>"]);
  assert.equal(hit.declaredRange, "^0.19.2", "必须给范围，不是目标版本号");
  assert.equal(hit.lockedVersion, "0.18.0");
  assert.deepEqual(hit.requesterPath, ["<root>"], "请求者路径是必需字段");
});

test("missing-from-lock：声明了但锁里没有", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { ghost: "^1.0.0" } };
  const lock = lockV3({ ghost: "^1.0.0" }, {});
  const dir = makeFixture(manifest, lock);
  const { code, json } = await runCli(["lock-manifest", dir, "--format=json"]);
  assert.equal(code, 1);
  const hit = json.findings.find((f) => f.kind === "missing-from-lock");
  assert.ok(hit);
  assert.equal(hit.dependency, "ghost");
  assert.equal(hit.lockedVersion, null);
  assert.deepEqual(hit.requesterPath, ["<root>"]);
});

test("optional 依赖缺失不算 missing-from-lock", async () => {
  const manifest = {
    name: "f",
    version: "1.0.0",
    dependencies: {},
    optionalDependencies: { "opt-dep": "^1.0.0" },
  };
  // 真实 npm 把根 optional 声明写在 `packages[""].optionalDependencies`（台账 A22），
  // 不是写进 `dependencies`。旧夹具按"并进 dependencies"构造，那形态 npm 从不产生。
  const lock = lockV3({}, {}, { optionalDependencies: { "opt-dep": "^1.0.0" } });
  const dir = makeFixture(manifest, lock);
  const { code } = await runCli(["lock-manifest", dir]);
  assert.equal(code, 0, "optional 缺失不应报错");
});

test("manifest-changed-unsynced：根声明不一致（最接近 npm ci 的基线）", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^2.0.0" } };
  const lock = lockV3({ a: "^1.0.0" }, { "node_modules/a": { version: "1.5.0" } });
  const dir = makeFixture(manifest, lock);
  const { code, json } = await runCli(["lock-manifest", dir, "--format=json"]);
  assert.equal(code, 1);
  const hit = json.findings.find((f) => f.kind === "manifest-changed-unsynced" && f.dependency === "a");
  assert.ok(hit);
  assert.equal(hit.declaredRange, "^2.0.0");
  assert.equal(hit.lockedVersion, "^1.0.0", "锁中根声明范围");
});

test("lock-extra-undeclared：锁里有、声明图不可达", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
  const lock = lockV3(
    { a: "^1.0.0" },
    { "node_modules/a": { version: "1.0.0" }, "node_modules/stray": { version: "9.9.9" } },
  );
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["lock-manifest", dir, "--format=json"]);
  const hit = json.findings.find((f) => f.kind === "lock-extra-undeclared" && f.dependency === "stray");
  assert.ok(hit);
  assert.equal(hit.lockedVersion, "9.9.9");
  // 判据是声明图可达性，不是 node_modules 是否存在
  assert.ok(hit.explanation.includes("声明图"));
});

test("transitive 请求者路径要能表达链（不是只有根）", async () => {
  // fixture → a@1.0.0 → b@^2.0.0，但锁里 a 下装的是 b@1.0.0
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
  const lock = lockV3(
    { a: "^1.0.0" },
    {
      "node_modules/a": { version: "1.0.0", dependencies: { b: "^2.0.0" } },
      "node_modules/a/node_modules/b": { version: "1.0.0" },
    },
  );
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["lock-manifest", dir, "--format=json"]);
  const hit = json.findings.find((f) => f.kind === "manifest-not-satisfied" && f.dependency === "b");
  assert.ok(hit, "应报 b 不满足");
  assert.deepEqual(hit.requesterPath, ["<root>", "a@1.0.0"], "请求者路径必须含传递链");
});

test("--strict 把锁中版本 != 声明下界升级为 lock-outdated；默认不判", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
  const lock = lockV3({ a: "^1.0.0" }, { "node_modules/a": { version: "1.9.0" } });
  const dir = makeFixture(manifest, lock);

  const plain = await runCli(["lock-manifest", dir, "--format=json"]);
  assert.ok(!plain.json.findings.some((f) => f.kind === "lock-outdated"), "默认档不判过期");

  const strict = await runCli(["lock-manifest", dir, "--format=json", "--strict"]);
  const hit = strict.json.findings.find((f) => f.kind === "lock-outdated");
  assert.ok(hit, "--strict 应报 lock-outdated");
  assert.equal(hit.severity, "warning");
});

test("lockfileVersion 2：双视图自洽即通过", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
  const lock = lockV2(
    { a: "^1.0.0" },
    { "node_modules/a": { version: "1.0.0" } },
    { a: { version: "1.0.0" } },
  );
  const dir = makeFixture(manifest, lock);
  const { code, json } = await runCli(["doctor", dir]);
  assert.equal(code, 0);
  assert.ok(json === null || json.input.lockfileVersion === 2);
});

test("lockfileVersion 2：双视图版本不一致 → 输入不可解析（3）", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
  const lock = lockV2(
    { a: "^1.0.0" },
    { "node_modules/a": { version: "1.0.0" } },
    { a: { version: "1.0.1" } },
  );
  const dir = makeFixture(manifest, lock);
  await assert.rejects(
    () => runCli(["lock-manifest", dir]),
    (error) => {
      assert.match(error.message, /结构不一致/);
      return true;
    },
  );
});

test("lockfileVersion 1：嵌套 dependencies 可读", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { send: "^0.18.0" } };
  const lock = lockV1({
    send: { version: "0.18.0", requires: { ms: "2.0.0" }, dependencies: { ms: { version: "2.1.3" } } },
  });
  const dir = makeFixture(manifest, lock);
  const { code, stdout } = await runCli(["doctor", dir]);
  assert.equal(code, 0, stdout);
  assert.ok(stdout.includes("lockfileVersion 1"));
});

test("lockfileVersion 1 + packages 字段 → 结构混用，输入不可解析", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: {} };
  const lock = {
    name: "f",
    version: "1.0.0",
    lockfileVersion: 1,
    packages: { "": { name: "f" } },
  };
  const dir = makeFixture(manifest, lock);
  await assert.rejects(
    () => runCli(["lock-manifest", dir]),
    (error) => {
      assert.equal(error.exitCode, 3);
      assert.match(error.message, /结构混用/);
      return true;
    },
  );
});

test("lockfileVersion 3 + dependencies 字段 → 结构混用", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: {} };
  const lock = {
    name: "f",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: { "": { name: "f" } },
    dependencies: {},
  };
  const dir = makeFixture(manifest, lock);
  await assert.rejects(
    () => runCli(["lock-manifest", dir]),
    (error) => {
      assert.equal(error.exitCode, 3);
      return true;
    },
  );
});

test("未知 lockfileVersion → 退出码 3 且列出支持面", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: {} };
  const lock = { name: "f", version: "1.0.0", lockfileVersion: 9, packages: {} };
  const dir = makeFixture(manifest, lock);
  await assert.rejects(
    () => runCli(["lock-manifest", dir]),
    (error) => {
      assert.equal(error.exitCode, 3);
      assert.match(error.detail, /1 \/ 2 \/ 3/);
      return true;
    },
  );
});
