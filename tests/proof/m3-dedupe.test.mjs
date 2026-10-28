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

  // MUS 可机械校验：① 无解 ② 移除任一元素后可解
  assertMusProperties(item);
});

test("REQUIRES_OVERRIDE：MUS 严格小于全量请求者（建议必须标为 suggestion）", async () => {
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
  // ^9.0.0 与其余两条都无法共处 → MUS 是 {a,c} / {b,c}（各 2 条）
  assert.equal(item.status, "REQUIRES_OVERRIDE", "MUS 严格小于全量请求者 → REQUIRES_OVERRIDE");
  assert.ok(item.minimalConflictSet.length < item.requesters, "MUS 必须小于全量请求者集");
  // §7.2「平局全返回」：两个同基数 MUS 都要回，不随机取一个
  assert.ok(Array.isArray(item.minimalConflictSets), "同基数多个 MUS 时必须列 minimalConflictSets");
  assert.equal(item.minimalConflictSets.length, 2, "本树有两个 2 元 MUS");
  for (const set of item.minimalConflictSets) {
    assert.equal(set.length, 2);
    assert.ok(set.some((m) => m.range === "^9.0.0"), "每个 MUS 都含唯一的冲突源 ^9.0.0");
  }
  // 建议必须标为 suggestion（不是事实）——无条件断言，不做 if 跳过
  assert.equal(item.suggestion?.nature, "suggestion", "建议必须标为 suggestion 而非事实");
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

/**
 * MUS 的两条性质（`data/README.md` §7.2）——**降级结果也必须满足**：
 *   ① M 无解：没有任何已锁定版本同时满足 M 的全部范围；
 *   ② M 极小：移除 M 的任一元素后，存在已锁定版本满足剩余全部范围。
 * 这是"最小冲突集可机械校验"的可执行形态（`plan/05` M4 DoD）。
 */
function assertMusProperties(item) {
  const ranges = item.minimalConflictSet.map((m) => m.range);
  const locked = item.lockedVersions;
  assert.ok(ranges.length > 0, "MUS 不能为空集");
  assert.ok(
    !locked.some((v) => ranges.every((r) => satisfies(v, r))),
    `M 必须无解（有解就不是冲突集）：${JSON.stringify(ranges)}`,
  );
  for (let i = 0; i < ranges.length; i += 1) {
    const rest = ranges.filter((_, j) => j !== i);
    assert.ok(
      locked.some((v) => rest.every((r) => satisfies(v, r))),
      `移除 ${JSON.stringify(ranges[i])} 后必须可满足（否则不是极小集）`,
    );
  }
}

test("--max-requesters 超限：必须显式 degraded + 固定口径 reason + **仍是无解的极小集**", async () => {
  // 12 条精确钉 1.0.0 + 1 条 ^1.5.0 → 13 个请求者（超过默认上限 12），全量无解。
  // 旧实现（取"候选最少的 2 条"）会返回两条 "1.0.0"——那两条**可满足**，等于把"不是冲突"报成冲突。
  const deps = {};
  const pkgs = {};
  for (let i = 0; i < 12; i += 1) {
    const name = `p${String(i).padStart(2, "0")}`;
    deps[name] = "^1.0.0";
    pkgs[`node_modules/${name}`] = { version: "1.0.0", dependencies: { shared: "1.0.0" } };
    pkgs[`node_modules/${name}/node_modules/shared`] = { version: "1.0.0" };
  }
  deps.q = "^1.0.0";
  pkgs["node_modules/q"] = { version: "1.0.0", dependencies: { shared: "^1.5.0" } };
  pkgs["node_modules/q/node_modules/shared"] = { version: "1.5.0" };
  const manifest = { name: "f", version: "1.0.0", dependencies: deps };
  const dir = makeFixture(manifest, lockV3(deps, pkgs));
  const { json } = await runCli(["dedupe", dir, "--format=json"]);
  const item = json.dedupe.find((d) => d.package === "shared");
  assert.ok(item);
  assert.equal(item.degraded, true, "超限必须显式降级");
  assert.equal(item.degradeReason, "requesters > max", "reason 用 §7.2 的固定口径串");
  assert.equal(item.requesters, 13);
  assertMusProperties(item);
  assert.ok(item.minimalConflictSet.length < item.requesters);
  assert.ok(json.degraded.length > 0, "报告顶层必须汇总降级");
  assert.ok(json.degraded[0].includes("requesters > max"));
});

test("--max-requesters=5：14 个互不相同范围上也必须是无解的极小集", async () => {
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
  const dir = makeFixture(manifest, lockV3(deps, pkgs));
  const { json } = await runCli(["dedupe", dir, "--format=json", "--max-requesters=5"]);
  const item = json.dedupe.find((d) => d.package === "shared");
  assert.ok(item);
  assert.equal(item.degraded, true, "超限必须显式降级");
  assert.equal(item.degradeReason, "requesters > max");
  assertMusProperties(item);
  assert.ok(json.degraded.length > 0, "报告顶层必须汇总降级");
});

test("reason 两态不许合并：区间非空但无候选 → no-locked-candidate", async () => {
  // 两个范围几何上相交（(1.0.0, 1.0.2)），但锁定版本只有 1.0.0 / 1.0.2 → 没有候选落在交集里。
  // 这与"区间本身为空"是两件事（plan/03 M3 诚实性约束 / data/README §7.1）。
  const deps = { a: "^1.0.0", b: "^1.0.0" };
  const lock = lockV3(deps, {
    "node_modules/a": { version: "1.0.0", dependencies: { shared: ">=1.0.0 <1.0.2" } },
    "node_modules/a/node_modules/shared": { version: "1.0.0" },
    "node_modules/b": { version: "1.0.0", dependencies: { shared: ">1.0.0 <=1.0.2" } },
    "node_modules/b/node_modules/shared": { version: "1.0.2" },
  });
  const dir = makeFixture({ name: "f", version: "1.0.0", private: true, dependencies: deps }, lock);
  const { json } = await runCli(["dedupe", dir, "--format=json"]);
  const item = json.dedupe.find((d) => d.package === "shared");
  assert.ok(item);
  assert.equal(item.status, "NOT_CONVERGIBLE");
  assert.equal(item.reason, "no-locked-candidate", "区间非空、无锁定候选 —— 不许说成 empty-intersection");
  assertMusProperties(item);
});

/** 两个可行目标的最小树：两个请求者都声明 `^2.0.0`，锁定 2.0.0 / 2.1.3 都满足。 */
function twoTargets() {
  const deps = { a: "^1.0.0", b: "^1.0.0" };
  const lock = lockV3(deps, {
    "node_modules/a": { version: "1.0.0", dependencies: { shared: "^2.0.0" } },
    "node_modules/a/node_modules/shared": { version: "2.0.0" },
    "node_modules/b": { version: "1.0.0", dependencies: { shared: "^2.0.0" } },
    "node_modules/b/node_modules/shared": { version: "2.1.3" },
  });
  return makeFixture({ name: "f", version: "1.0.0", private: true, dependencies: deps }, lock);
}

test("CONVERGIBLE：目标列表必须完整（全部满足全体的锁定版本都在）", async () => {
  const dir = twoTargets();
  const { json } = await runCli(["dedupe", dir, "--format=json"]);
  const item = json.dedupe.find((d) => d.package === "shared");
  assert.equal(item.status, "CONVERGIBLE");
  assert.deepEqual(item.targets.map((t) => t.version), ["2.0.0", "2.1.3"], "全部可行目标都要列出");
});

test("--prefer=latest 只改排序与标注：目标集合不变", async () => {
  const dir = twoTargets();
  const plain = await runCli(["dedupe", dir, "--format=json"]);
  const latest = await runCli(["dedupe", dir, "--format=json", "--prefer=latest"]);
  const a = plain.json.dedupe.find((d) => d.package === "shared");
  const b = latest.json.dedupe.find((d) => d.package === "shared");
  assert.equal(a.status, b.status, "prefer 不得改变状态");
  assert.deepEqual(
    a.targets.map((t) => t.version).sort(),
    b.targets.map((t) => t.version).sort(),
    "prefer 不得改变可行目标集合",
  );
  assert.deepEqual(b.targets.map((t) => t.version), ["2.1.3", "2.0.0"], "latest 只是把顺序倒过来");
  assert.equal(b.targets[0].preferred, true, "latest 标最高版本为首选");
  assert.equal(a.targets.some((t) => t.preferred === true), false, "不给 --prefer 时不标注首选");
});

test("--prefer=min-change 也只改标注：状态与目标集合不变", async () => {
  const dir = twoTargets();
  const plain = await runCli(["dedupe", dir, "--format=json"]);
  const minChange = await runCli(["dedupe", dir, "--format=json", "--prefer=min-change"]);
  const a = plain.json.dedupe.find((d) => d.package === "shared");
  const b = minChange.json.dedupe.find((d) => d.package === "shared");
  assert.equal(a.status, b.status, "prefer 不得改变状态");
  assert.deepEqual(
    a.targets.map((t) => t.version).sort(),
    b.targets.map((t) => t.version).sort(),
    "prefer 不得改变可行目标集合",
  );
  assert.equal(b.targets.filter((t) => t.preferred === true).length, 1, "min-change 只标一个首选");
  assert.equal(b.targets[0].preferred, true, "min-change 标最小的那个（变更最小）");
});

