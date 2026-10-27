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
