/**
 * 规则测试：R1–R8 每条至少一正例 + 一反例（`plan/01` §3.1 验收）。
 *
 * 纪律：**反例断言的是"不该报"**（`findings.filter(...)` 为空），不是"报了别的"。
 * 后者等于"断言了全世界"，任何一条规则在特定输入下误报都会让测试看起来正常。
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { runRangeLint } from "../../src/rules/range-lint.mjs";
import { parseManifest } from "../../src/model/manifest.mjs";

function lint(deps, opts = {}) {
  const manifest = parseManifest({ name: "fixture", version: "1.0.0", dependencies: deps });
  return runRangeLint(manifest, opts);
}

function rulesFor(findings, pkg) {
  return findings.filter((f) => f.package === pkg).map((f) => f.rule);
}

test("R1 正例：>=1.2.0 无上界", () => {
  const out = lint({ pkg: ">=1.2.0" });
  assert.ok(rulesFor(out, "pkg").includes("R1"));
});

test("R1 反例：>=1.2.0 <2.0.0 有上界", () => {
  const out = lint({ pkg: ">=1.2.0 <2.0.0" });
  assert.ok(!rulesFor(out, "pkg").includes("R1"), "不应报 R1");
});

test("R2 正例：* / 空串 / x / latest", () => {
  for (const range of ["*", "", "x", "latest"]) {
    const out = lint({ pkg: range });
    assert.ok(rulesFor(out, "pkg").includes("R2"), `${JSON.stringify(range)} 应报 R2`);
  }
});

test("R2：latest 必须判为'非范围'而不是宽范围", () => {
  const out = lint({ pkg: "latest" });
  const hit = out.find((f) => f.package === "pkg" && f.rule === "R2");
  assert.equal(hit.notARange, true);
  assert.equal(hit.expandedRange, null);
});

test("R2 反例：^1.0.0 不是宽范围", () => {
  const out = lint({ pkg: "^1.0.0" });
  assert.ok(!rulesFor(out, "pkg").includes("R2"));
});

test("R3 正例：^0.0.3 与 ^0.2.3", () => {
  const out = lint({ a: "^0.0.3", b: "^0.2.3" });
  assert.ok(rulesFor(out, "a").includes("R3"));
  assert.ok(rulesFor(out, "b").includes("R3"));
});

test("R3 反例：^1.2.3 不收窄", () => {
  const out = lint({ pkg: "^1.2.3" });
  assert.ok(!rulesFor(out, "pkg").includes("R3"));
});

test("R4 正例：^1.0.0 声明 + 1.0.0-beta 目标 → 不可达", () => {
  const targets = new Map([
    ["pkg", [{ version: "1.0.0-beta", major: 1, minor: 0, patch: 0, isPrerelease: true }]],
  ]);
  const out = lint({ pkg: "^1.0.0" }, { prereleaseTargets: targets });
  const hit = out.find((f) => f.package === "pkg" && f.rule === "R4");
  assert.ok(hit);
  assert.ok(hit.evidence.includes("prerelease-unreachable"));
});

test("R4 两态必须区分：目标根本不在候选集", () => {
  const targets = new Map([
    ["pkg", [{ version: "2.0.0-beta", major: 2, minor: 0, patch: 0, isPrerelease: true }]],
  ]);
  const out = lint({ pkg: "^1.0.0" }, { prereleaseTargets: targets });
  const hit = out.find((f) => f.package === "pkg" && f.rule === "R4");
  assert.ok(hit);
  assert.ok(hit.evidence.includes("target-not-in-candidate"), "应区分两态");
});

test("R4 反例：^1.2.3-beta 声明 + 1.2.3-beta.2 目标 → 可达", () => {
  const targets = new Map([
    ["pkg", [{ version: "1.2.3-beta.2", major: 1, minor: 2, patch: 3, isPrerelease: true }]],
  ]);
  const out = lint({ pkg: "^1.2.3-beta" }, { prereleaseTargets: targets });
  assert.ok(!rulesFor(out, "pkg").includes("R4"));
});

test("R5 正例：>=1.0.0 <1.0.0 与 >=2.0.0 <1.0.0", () => {
  const out = lint({ a: ">=1.0.0 <1.0.0", b: ">=2.0.0 <1.0.0" });
  assert.ok(rulesFor(out, "a").includes("R5"));
  assert.ok(rulesFor(out, "b").includes("R5"));
  assert.equal(out.filter((f) => f.rule === "R5").every((f) => f.severity === "error"), true, "R5 必须是 error");
});

test("R5 反例：>=1.0.0 <2.0.0 非空", () => {
  const out = lint({ pkg: ">=1.0.0 <2.0.0" });
  assert.ok(!rulesFor(out, "pkg").includes("R5"));
});

test("R6 正例：^1.0.0 || ^1.2.0 后者被包含", () => {
  const out = lint({ pkg: "^1.0.0 || ^1.2.0" });
  assert.ok(rulesFor(out, "pkg").includes("R6"));
});

test("R6 正例：* || ^1.0.0 整支被包含", () => {
  const out = lint({ pkg: "* || ^1.0.0" });
  assert.ok(rulesFor(out, "pkg").includes("R6"));
});

test("R6 反例：^1.0.0 || ^2.0.0 互不包含", () => {
  const out = lint({ pkg: "^1.0.0 || ^2.0.0" });
  assert.ok(!rulesFor(out, "pkg").includes("R6"));
});

test("R7 正例：1.0.0+build.1", () => {
  const out = lint({ pkg: "1.0.0+build.1" });
  assert.ok(rulesFor(out, "pkg").includes("R7"));
});

test("R7 反例：1.0.0 无 build metadata", () => {
  const out = lint({ pkg: "1.0.0" });
  assert.ok(!rulesFor(out, "pkg").includes("R7"));
});

test("R8 默认关闭", () => {
  const out = lint({ pkg: "1.2.3" });
  assert.ok(!rulesFor(out, "pkg").includes("R8"));
});

test("R8 显式开启才报，且必须是 info", () => {
  const out = lint({ pkg: "1.2.3" }, { enableR8: true });
  const hit = out.find((f) => f.package === "pkg" && f.rule === "R8");
  assert.ok(hit);
  assert.equal(hit.severity, "info");
  assert.ok(hit.evidence.includes("精确锁定"));
  assert.ok(hit.evidence.includes("Cargo"));
});

test("expandedRange 必须来自库调用（与 validRange 逐字节一致）", async () => {
  const { validRange } = await import("../../src/semver/adapter.mjs");
  const out = lint({ a: "^0.2.3", b: "1.0", c: "latest", d: ">=1.2.0" });
  for (const f of out) {
    assert.equal(f.expandedRange, validRange(f.rawRange), `${f.package} 的 expandedRange 不是库的返回值`);
  }
});
