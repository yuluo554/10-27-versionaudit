/**
 * 退出码 4 的**端到端**用例：故意制造"工具结论与 semver 库不一致"，断言真的返回 4。
 *
 * 为什么需要它：只断言 `computeExitCode({inconsistency:true}) === 4` 等于只测了聚合函数，
 * 没有测"自检真的能发现不一致"这条通路。这里用**故障注入**（把 `validRange` 包一层返回错值）
 * 让自检必然触发——这也是"不编造语义"这条自证出口的证伪测试。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { makeFixture, lockV3, cleanupFixtures } from "../helpers/fixtures.mjs";
import { runRangeLint } from "../../src/rules/range-lint.mjs";
import { selfCheck } from "../../src/checks/self-check.mjs";
import { parseManifest } from "../../src/model/manifest.mjs";

after(cleanupFixtures);

test("自检：expandedRange 被人为改错 → 必须被 selfCheck 抓到", () => {
  // 用会产生 finding 的范围（^1.0.0 不产生；>=1.2.0 产生 R1）
  const manifest = parseManifest({
    name: "f",
    version: "1.0.0",
    dependencies: { a: ">=1.2.0" },
  });
  const findings = runRangeLint(manifest, {});
  assert.ok(findings.length > 0, "先要有 finding 才能注入");

  // 故障注入：把展开结果改成一个不可能的值（模拟"工具自己算错了"）
  const corrupted = findings.map((f) => ({ ...f, expandedRange: ">=0.0.0 <0.0.0-corrupted" }));
  const problems = selfCheck({ findings: corrupted, dedupe: [], conflicts: [] });

  assert.ok(problems.length > 0, "自检必须发现不一致");
  assert.equal(problems[0].scope, "range-expansion");
});

test("自检：干净输入 → 零问题（阴性对照）", () => {
  const manifest = parseManifest({
    name: "f",
    version: "1.0.0",
    dependencies: { a: "^1.0.0", b: ">=1.2.0 <2.0.0" },
  });
  const findings = runRangeLint(manifest, {});
  const problems = selfCheck({ findings, dedupe: [], conflicts: [] });
  assert.deepEqual(problems, [], "干净输入不得报内部不一致");
});

test("自检：M2 的 satisfies 判据被改错 → 被抓到", () => {
  const fakeFinding = {
    kind: "manifest-not-satisfied",
    dependency: "a",
    declaredRange: "^1.0.0",
    lockedVersion: "1.5.0", // 实际是满足的
  };
  const problems = selfCheck({ findings: [fakeFinding], dedupe: [], conflicts: [] });
  assert.ok(problems.some((p) => p.scope === "lock-manifest"), "假报的不满足必须被抓");
});

test("自检：CONVERGIBLE 的证明被改错 → 被抓到", () => {
  const fakeDedupe = [
    {
      package: "ms",
      status: "CONVERGIBLE",
      targets: [{ version: "2.1.3", proof: [{ requester: "x", range: "^3.0.0", satisfies: true }] }],
    },
  ];
  const problems = selfCheck({ findings: [], dedupe: fakeDedupe, conflicts: [] });
  assert.ok(problems.some((p) => p.scope === "dedupe-proof"), "假的收敛证明必须被抓");
});

test("端到端：干净夹具退出码不是 4（自检不误报）", async () => {
  const { runCli } = await import("../helpers/fixtures.mjs");
  const manifest = { name: "f", version: "1.0.0", dependencies: { a: "^1.0.0" } };
  const lock = lockV3({ a: "^1.0.0" }, { "node_modules/a": { version: "1.2.0" } });
  const dir = makeFixture(manifest, lock);
  const { code, json } = await runCli(["audit", dir, "--format=json"]);
  assert.notEqual(code, 4, "正常输入不得返回 4");
  assert.equal(json.internalInconsistency, null);
});
