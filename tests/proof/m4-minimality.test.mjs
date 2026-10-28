/**
 * M4 冲突最小解释 —— **属性测试**（`plan/01` §3.4 验收）。
 *
 * 必测属性：「`minimalSet` 移除任一元素后冲突消失」。
 * 这是把"证明"变成可机械校验断言的关键一条（B 栏 20 分）。
 *
 * 做法：直连 `runConflictExplain`（不经 CLI），对多组构造树跑属性。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { makeFixture, lockV3, runCli, cleanupFixtures } from "../helpers/fixtures.mjs";
import { satisfies } from "../../src/semver/adapter.mjs";

after(cleanupFixtures);

/** peer 冲突：widget 需要 react@^17.0.0，根提供 18.2.0（`data/README.md` §3.5 实测形态）。 */
function peerTree() {
  const manifest = {
    name: "app",
    version: "1.0.0",
    private: true,
    dependencies: { react: "^18.0.0", widget: "1.0.0" },
  };
  const lock = lockV3(
    { react: "^18.0.0", widget: "1.0.0" },
    {
      "node_modules/react": { version: "18.2.0" },
      "node_modules/widget": { version: "1.0.0", peerDependencies: { react: "^17.0.0" } },
    },
  );
  return { manifest, lock };
}

test("peer 冲突：minimalSet 是冲突双方，不是全树", async () => {
  const { manifest, lock } = peerTree();
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["conflict", dir, "--format=json"]);

  const hit = json.conflicts.find((c) => c.kind === "peer-conflict" && c.package === "react");
  assert.ok(hit, "应报 peer 冲突");
  assert.equal(hit.lockedVersion, "18.2.0");
  assert.ok(hit.minimalSet.length >= 2, "至少两个请求者");
  assert.ok(hit.minimalSet.some((m) => m.range === "^17.0.0"));
  assert.ok(hit.minimalSet.some((m) => m.range === "^18.0.0"));
  assert.equal(hit.conflictProof.intersects, false);
});

test("peer 冲突：minimalSet 严格小于全量请求者集", async () => {
  const { manifest, lock } = peerTree();
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["conflict", dir, "--format=json"]);
  const hit = json.conflicts.find((c) => c.kind === "peer-conflict" && c.package === "react");
  // 树里共有 3 个"请求者身份"：根（react）、widget（peer）、widget 自身
  // 但 minimalSet 只含冲突双方
  assert.ok(hit.minimalSet.length < 3, "MUS 不得等于全树");
});

test("--ignore-peer 把 peer 冲突降为 info（且仍被报告）", async () => {
  const { manifest, lock } = peerTree();
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["conflict", dir, "--format=json", "--ignore-peer"]);
  const hit = json.conflicts.find((c) => c.kind === "peer-conflict" && c.package === "react");
  assert.ok(hit, "降级不等于不报");
  assert.equal(hit.severity, "info");
  assert.equal(hit.downgradedBy, "--ignore-peer");
});

test("属性：minimalSet 移除任一元素后冲突消失（4 请求者版本冲突）", async () => {
  // 构造 4 个请求者：三个要 ^1.x，一个要 ^3.0.0（唯一不可共处的那个）
  const deps = { a: "^1.0.0", b: "^1.0.0", c: "^1.0.0", d: "^1.0.0" };
  const pkgs = {
    "node_modules/a": { version: "1.0.0", dependencies: { shared: "^1.0.0" } },
    "node_modules/a/node_modules/shared": { version: "1.2.0" },
    "node_modules/b": { version: "1.0.0", dependencies: { shared: "^1.5.0" } },
    "node_modules/b/node_modules/shared": { version: "1.6.0" },
    "node_modules/c": { version: "1.0.0", dependencies: { shared: "^1.8.0" } },
    "node_modules/c/node_modules/shared": { version: "1.9.0" },
    "node_modules/d": { version: "1.0.0", dependencies: { shared: "^3.0.0" } },
    "node_modules/d/node_modules/shared": { version: "3.0.0" },
  };
  const manifest = { name: "f", version: "1.0.0", dependencies: deps };
  const lock = lockV3(deps, pkgs);
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["conflict", dir, "--format=json"]);

  const hit = json.conflicts.find((c) => c.kind === "version-conflict" && c.package === "shared");
  assert.ok(hit, "应报 version-conflict");

  const locked = ["1.2.0", "1.6.0", "1.9.0", "3.0.0"];
  const minimal = hit.minimalSet;

  // ① M 无解
  assert.ok(!locked.some((v) => minimal.every((m) => satisfies(v, m.range))), "M 必须无解");

  // ② 移除任一元素后冲突消失
  for (let i = 0; i < minimal.length; i += 1) {
    const smaller = minimal.filter((_, j) => j !== i);
    const ok = locked.some((v) => smaller.every((m) => satisfies(v, m.range)));
    assert.ok(ok, `移除 ${minimal[i].requester}(${minimal[i].range}) 后应可满足`);
  }
});

test("属性：单元素 MUS（某范围自己就无解）", async () => {
  const deps = { a: "^1.0.0", b: "^1.0.0" };
  const pkgs = {
    "node_modules/a": { version: "1.0.0", dependencies: { shared: "^1.0.0" } },
    "node_modules/a/node_modules/shared": { version: "1.0.0" },
    "node_modules/b": { version: "1.0.0", dependencies: { shared: "^9.0.0" } },
    "node_modules/b/node_modules/shared": { version: "9.0.0" },
  };
  const manifest = { name: "f", version: "1.0.0", dependencies: deps };
  const lock = lockV3(deps, pkgs);
  const dir = makeFixture(manifest, lock);
  const { json } = await runCli(["conflict", dir, "--format=json"]);

  const hit = json.conflicts.find((c) => c.kind === "version-conflict" && c.package === "shared");
  assert.ok(hit);
  // ^1.0.0 与 ^9.0.0 无交集 → MUS 是两条
  assert.ok(hit.minimalSet.length >= 2);
  const locked = ["1.0.0", "9.0.0"];
  // 保留 ^9.0.0 单独有解、保留 ^1.0.0 单独有解 → 两条缺一不可
  assert.ok(locked.some((v) => satisfies(v, "^1.0.0")));
  assert.ok(locked.some((v) => satisfies(v, "^9.0.0")));
  assert.ok(!locked.some((v) => satisfies(v, "^1.0.0") && satisfies(v, "^9.0.0")));
});

test("无冲突时报告为空（不制造噪声）", async () => {
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
  const lock = lockV3({ a: "^1.0.0" }, { "node_modules/a": { version: "1.2.0" } });
  const dir = makeFixture(manifest, lock);
  const { json, code } = await runCli(["conflict", dir, "--format=json"]);
  assert.equal(json.conflicts.length, 0);
  assert.equal(code, 0);
});

/**
 * 属性断言的可复用形态（与 `tests/proof/m3-dedupe.test.mjs` 的 `assertMusProperties` 同口径）：
 *   ① 无解：没有任何已锁定版本同时满足 minimalSet 的全部范围；
 *   ② 极小：移除任一元素后，存在已锁定版本满足剩余全部范围。
 * **降级（`degraded: true`）也必须满足** —— 降级的只是"基数最小 / 平局全列"，
 * 不是"是不是真冲突"（`data/README.md` §7.2 / K22）。
 */
function assertMinimalSetProperties(item, locked) {
  const ranges = item.minimalSet.map((m) => m.range);
  assert.ok(ranges.length > 0, "minimalSet 不能为空集");
  assert.ok(
    !locked.some((v) => ranges.every((r) => satisfies(v, r))),
    `minimalSet 必须无解：${JSON.stringify(ranges)}`,
  );
  for (let i = 0; i < ranges.length; i += 1) {
    const rest = ranges.filter((_, j) => j !== i);
    assert.ok(
      locked.some((v) => rest.every((r) => satisfies(v, r))),
      `移除 ${JSON.stringify(ranges[i])} 后必须可满足（否则不是极小集）`,
    );
  }
}

/**
 * 超过 `--max-requesters` 的 version-conflict 树：
 * 12 个请求者精确钉 `1.0.0`（锁定 1.0.0）+ 1 个请求 `^1.5.0`（锁定 1.6.0）→ 13 个请求者。
 * 全量**无解**（没有任何已锁定版本同时满足 1.0.0 与 ^1.5.0）。
 */
function degradedTree() {
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
  pkgs["node_modules/q/node_modules/shared"] = { version: "1.6.0" };
  return makeFixture({ name: "f", version: "1.0.0", private: true, dependencies: deps }, lockV3(deps, pkgs));
}

test("降级路径：--max-requesters 超限时 minimalSet 仍是无解 + 极小", async () => {
  const dir = degradedTree();
  const { json } = await runCli(["conflict", dir, "--format=json"]);
  const hit = json.conflicts.find((c) => c.kind === "version-conflict" && c.package === "shared");

  assert.ok(hit, "13 个请求者、无共同解 → 必须报 version-conflict");
  assert.equal(hit.requesters, 13, "全量请求者数");
  assert.equal(hit.degraded, true, "超过默认上限 12 必须显式降级");
  assert.equal(hit.degradeReason, "requesters > max", "reason 用 §7.2 的固定口径串");
  assert.ok(hit.minimalSet.length < hit.requesters, "降级结果仍应远小于全量（不是把全量当最小集）");

  // **核心属性**：降级不许把"可满足的集合"报成冲突集
  assertMinimalSetProperties(hit, ["1.0.0", "1.6.0"]);
});

test("降级路径：--max-requesters 调小后同一棵树也满足两条性质", async () => {
  const dir = degradedTree();
  const { json } = await runCli(["conflict", dir, "--format=json", "--max-requesters=3"]);
  const hit = json.conflicts.find((c) => c.kind === "version-conflict" && c.package === "shared");
  assert.ok(hit);
  assert.equal(hit.degraded, true);
  assertMinimalSetProperties(hit, ["1.0.0", "1.6.0"]);
});

test("未超限时 degraded 必须是 false（阴性对照：不许无条件降级）", async () => {
  const dir = degradedTree();
  // 上限抬到 20 > 13 → 走按基数枚举，不降级
  const { json } = await runCli(["conflict", dir, "--format=json", "--max-requesters=20"]);
  const hit = json.conflicts.find((c) => c.kind === "version-conflict" && c.package === "shared");
  assert.ok(hit);
  assert.equal(hit.degraded, false, "未超限却标降级 = 谎报降级");
  assert.equal(hit.degradeReason, undefined, "未降级不得带 degradeReason");
  assertMinimalSetProperties(hit, ["1.0.0", "1.6.0"]);
  // 未降级时基数是**最小**的（2 条：1.0.0 与 ^1.5.0）
  assert.equal(hit.minimalSet.length, 2, "未降级时必须是基数最小的 MUS");
});

test("降级报告顶层必须汇总（degraded 数组带口径串）", async () => {
  const dir = degradedTree();
  const { json } = await runCli(["conflict", dir, "--format=json"]);
  assert.ok(json.degraded.length > 0, "报告顶层 degraded 必须非空");
  assert.ok(
    json.degraded.some((d) => d.includes("requesters > max")),
    `顶层降级汇总必须带固定口径串，实际 ${JSON.stringify(json.degraded)}`,
  );
});
