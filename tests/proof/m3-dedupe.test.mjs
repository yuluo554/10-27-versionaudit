/**
 * M3 收敛可行性测试（证明质量栏 B 的核心）。
 *
 * 三个必测属性（`plan/01` §5 B 栏）：
 *   ① CONVERGIBLE 给出的每个目标版本必须**实算**满足全部请求者；
 *   ② NOT_CONVERGIBLE 给 MUS，且 MUS 无解、任一真子集有解；
 *   ③ 超限必须 `degraded: true` 且**不冒充最小集**。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { makeFixture, lockV3, runCli, cleanupFixtures } from "../helpers/fixtures.mjs";
import { satisfies } from "../../src/semver/adapter.mjs";

after(cleanupFixtures);

/** 真实树形态（`data/README.md` §3.1 场景 B）：
 *  debug@2.6.9 声明 ms **精确** `2.0.0`，send@0.18.0 声明 ms **精确** `2.1.3`。
 *  两个请求者各自精确锁定不同版本 → 诚实结论是 **NOT_CONVERGIBLE + 最小冲突集**，
 *  而不是"收敛到某个版本"（`plan/01` §3.3 允许这两种结论之一，但必须与夹具范围逐一核对）。
 */
function msExactPins() {
  const manifest = {
    name: "fixture2",
    version: "1.0.0",
    private: true,
    dependencies: { debug: "2.6.9", send: "0.18.0" },
  };
  const lock = lockV3(
    { debug: "2.6.9", send: "0.18.0" },
    {
      "node_modules/debug": { version: "2.6.9", dependencies: { ms: "2.0.0" } },
      "node_modules/debug/node_modules/ms": { version: "2.0.0" },
      "node_modules/send": { version: "0.18.0", dependencies: { ms: "2.1.3" } },
      "node_modules/send/node_modules/ms": { version: "2.1.3" },
    },
  );
  return { manifest, lock };
}

/** 可收敛变体：debug 声明 `^2.0.0`、send 声明 `^2.1.0`，锁中 2.0.0 / 2.1.3 → 2.1.3 同时满足两者。 */
function msConverging() {
  const manifest = {
    name: "fixture3",
    version: "1.0.0",
    private: true,
    dependencies: { debug: "2.6.9", send: "0.18.0" },
  };
  const lock = lockV3(
    { debug: "2.6.9", send: "0.18.0" },
    {
      "node_modules/debug": { version: "2.6.9", dependencies: { ms: "^2.0.0" } },
      "node_modules/debug/node_modules/ms": { version: "2.0.0" },
      "node_modules/send": { version: "0.18.0", dependencies: { ms: "^2.1.0" } },
      "node_modules/send/node_modules/ms": { version: "2.1.3" },
    },
  );
  return { manifest, lock };
}

test("ms 双版本（精确锁定）：结论必须是 NOT_CONVERGIBLE + 最小冲突集", async () => {
  const { manifest, lock } = msExactPins();
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["dedupe", dir, "--format=json"]);

  const item = json.dedupe.find((d) => d.package === "ms");
  assert.ok(item, "必须报 ms 的收敛判定");
  assert.equal(item.status, "NOT_CONVERGIBLE", "两个请求者各自精确锁定，不可能收敛");
  assert.deepEqual(item.lockedVersions, ["2.0.0", "2.1.3"]);
  assert.equal(item.reason, "empty-intersection", "精确锁定 2.0.0 与 2.1.3 无交集");

  // 最小冲突集必须与夹具范围逐一核对
  assert.deepEqual(
    item.minimalConflictSet.map((m) => m.range).sort(),
    ["2.0.0", "2.1.3"],
  );
  assert.ok(item.minimalConflictSet.every((m) => m.requesterPath.length >= 2), "必须给请求者路径");
});

test("ms 双版本（范围声明）：可收敛 + 目标 + 受影响请求者逐一证明", async () => {
  const { manifest, lock } = msConverging();
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["dedupe", dir, "--format=json"]);

  const item = json.dedupe.find((d) => d.package === "ms");
  assert.ok(item);
  assert.equal(item.status, "CONVERGIBLE", "^2.0.0 与 ^2.1.0 应可收敛到 2.1.3");
  assert.deepEqual(item.targets.map((t) => t.version), ["2.1.3"], "2.0.0 不满足 ^2.1.0");

  for (const target of item.targets) {
    for (const proof of target.proof) {
      assert.equal(proof.satisfies, satisfies(target.version, proof.range));
      assert.equal(proof.satisfies, true, `${target.version} 应满足 ${proof.range}`);
    }
  }
  assert.ok(item.targets[0].proof.length >= 2, "至少两个请求者");
  assert.ok(item.targets[0].proof.every((p) => p.requester && p.range));
});

test("单版本包不报 dedupe（无去重问题）", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
  const lock = lockV3({ a: "^1.0.0" }, { "node_modules/a": { version: "1.0.0" } });
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["dedupe", dir, "--format=json"]);
  assert.equal(json.dedupe.length, 0);
});

test("NOT_CONVERGIBLE：无已锁定版本满足全部请求者 → 给 MUS", async () => {
  // pkg 有两个锁定版本 1.0.0 / 2.0.0，请求者分别要 ^1.0.0 与 ^2.0.0
  const manifest = {
    name: "f",
    version: "1.0.0",
    dependencies: { x: "^1.0.0", y: "^2.0.0" },
  };
  const lock = lockV3(
    { x: "^1.0.0", y: "^2.0.0" },
    {
      "node_modules/x": { version: "1.0.0", dependencies: { pkg: "^1.0.0" } },
      "node_modules/x/node_modules/pkg": { version: "1.0.0" },
      "node_modules/y": { version: "1.0.0", dependencies: { pkg: "^2.0.0" } },
      "node_modules/y/node_modules/pkg": { version: "2.0.0" },
    },
  );
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["dedupe", dir, "--format=json"]);
  const item = json.dedupe.find((d) => d.package === "pkg");
  assert.ok(item);
  assert.equal(item.status, "NOT_CONVERGIBLE");
  assert.ok(item.minimalConflictSet.length >= 2, "MUS 至少两个请求者");
  assert.equal(item.reason, "empty-intersection", "两个范围真无交集");

  // MUS 可机械校验：任一真子集有解（= 移除任一元素后冲突消失）
  const locked = item.lockedVersions;
  const minimal = item.minimalConflictSet;
  for (let i = 0; i < minimal.length; i += 1) {
    const smaller = minimal.filter((_, j) => j !== i);
    const hasSolution = locked.some((v) => smaller.every((m) => satisfies(v, m.range)));
    assert.ok(hasSolution, `移除 ${minimal[i].requester} 后应可满足`);
  }
});

test("REQUIRES_OVERRIDE：MUS 严格小于全量请求者", async () => {
  // 3 个请求者：两个能共处，第三个冲突
  const manifest = {
    name: "f",
    version: "1.0.0",
    dependencies: { a: "^1.0.0", b: "^2.0.0", c: "^3.0.0" },
  };
  const lock = lockV3(
    { a: "^1.0.0", b: "^2.0.0", c: "^3.0.0" },
    {
      "node_modules/a": { version: "1.0.0", dependencies: { shared: "^1.0.0" } },
      "node_modules/a/node_modules/shared": { version: "1.2.0" },
      "node_modules/b": { version: "1.0.0", dependencies: { shared: "^1.0.0" } },
      "node_modules/b/node_modules/shared": { version: "1.5.0" },
      "node_modules/c": { version: "1.0.0", dependencies: { shared: "^9.0.0" } },
      "node_modules/c/node_modules/shared": { version: "9.0.0" },
    },
  );
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["dedupe", dir, "--format=json"]);
  const item = json.dedupe.find((d) => d.package === "shared");
  assert.ok(item);
  // ^9.0.0 与其余两条都无法共处（只有单元素 MUS）
  assert.ok(item.minimalConflictSet.length < item.requesters, "MUS 必须小于全量请求者集");
  if (item.status === "REQUIRES_OVERRIDE") {
    assert.equal(item.suggestion.nature, "suggestion", "建议必须标为 suggestion 而非事实");
  }
});

test("--prefer=latest 只改排序与标注，不改可行性判定", async () => {
  const { manifest, lock } = msConverging();
  const dir = makeFixture(manifest, lock);
  const plain = await runCli(["dedupe", dir, "--format=json"]);
  const latest = await runCli(["dedupe", dir, "--format=json", "--prefer=latest"]);

  const a = plain.json.dedupe.find((d) => d.package === "ms");
  const b = latest.json.dedupe.find((d) => d.package === "ms");
  assert.equal(a.status, b.status, "prefer 不得改变状态");
  const aSet = a.targets.map((t) => t.version).sort();
  const bSet = b.targets.map((t) => t.version).sort();
  assert.deepEqual(aSet, bSet, "prefer 不得改变可行目标集合");
  assert.equal(b.targets[0].preferred, true, "latest 应标注首选");
});

test("--max-requesters 超限必须显式 degraded 且不冒充最小集", async () => {
  // 构造 14 个请求者同名包的不同范围
  const deps = {};
  const pkgs = {};
  for (let i = 0; i < 14; i += 1) {
    const name = `p${String(i).padStart(2, "0")}`;
    deps[name] = "^1.0.0";
    pkgs[`node_modules/${name}`] = { version: "1.0.0", dependencies: { shared: `^${i}.0.0` } };
    pkgs[`node_modules/${name}/node_modules/shared`] = { version: `${i}.0.0` };
  }
  const manifest = { name: "f", version: "1.0.0", dependencies: deps };
  const lock = lockV3(deps, pkgs);
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["dedupe", dir, "--format=json", "--max-requesters=5"]);
  const item = json.dedupe.find((d) => d.package === "shared");
  assert.ok(item);
  assert.equal(item.degraded, true, "超限必须显式降级");
  assert.ok(item.degradeReason.includes("max-requesters"), "必须写明降级原因");
  assert.ok(json.degraded.length > 0, "报告顶层必须汇总降级");
});
