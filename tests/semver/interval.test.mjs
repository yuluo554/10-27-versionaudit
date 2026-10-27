/**
 * 区间代数测试 —— 逐条覆盖 `data/README.md` §1.1 的实测语义（A1–A16）。
 *
 * 这是"不编造 semver 规则"的最直接验证：每条断言都能在台账里找到编号。
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { normalizeRange, rangeIsEmpty, intersectRanges } from "../../src/semver/interval.mjs";
import { validRange, satisfies } from "../../src/semver/adapter.mjs";

const T = (id, title) => `${id} ${title}`;

test(T("A1", "^0.2.3 展开"), () => {
  assert.equal(validRange("^0.2.3"), ">=0.2.3 <0.3.0-0");
  assert.equal(normalizeRange("^0.2.3").expandedRange, ">=0.2.3 <0.3.0-0");
});

test(T("A2", "^0.2.3 满足性"), () => {
  assert.equal(satisfies("0.2.9", "^0.2.3"), true);
  assert.equal(satisfies("0.3.0", "^0.2.3"), false);
});

test(T("A3", "^0.0.3 展开"), () => {
  assert.equal(validRange("^0.0.3"), ">=0.0.3 <0.0.4-0");
});

test(T("A4", "^0.0.3 只等于 0.0.3"), () => {
  assert.equal(satisfies("0.0.4", "^0.0.3"), false);
  assert.equal(satisfies("0.0.3", "^0.0.3"), true);
});

test(T("A5", "~0.2.3 展开"), () => {
  assert.equal(validRange("~0.2.3"), ">=0.2.3 <0.3.0-0");
});

test(T("A6", "1.0（两位）展开不是 <2.0.0"), () => {
  assert.equal(validRange("1.0"), ">=1.0.0 <1.1.0-0");
  assert.equal(satisfies("1.1.0", "1.0"), false);
});

test(T("A7", "0.0（两位）展开 —— 台账已校正"), () => {
  // data/README.md A7 实测：validRange('0.0') = '<0.1.0-0'（原记 '>=0.0.0 <0.1.0-0'，7.7.4/7.8.5 一致）
  assert.equal(validRange("0.0"), "<0.1.0-0");
  assert.equal(satisfies("0.0.9", "0.0"), true);
  assert.equal(satisfies("0.1.0", "0.0"), false);
});

test(T("A8", "预发布不被无预发布的范围匹配"), () => {
  assert.equal(satisfies("1.0.0-beta", "^1.0.0"), false);
  assert.equal(satisfies("1.5.0-beta", "^1.0.0"), false);
  assert.equal(satisfies("1.0.0-beta", "*"), false);
});

test(T("A9", "带预发布下界可匹配同三元组预发布"), () => {
  assert.equal(validRange("^1.2.3-beta"), ">=1.2.3-beta <2.0.0-0");
  assert.equal(satisfies("1.2.3-beta.2", "^1.2.3-beta"), true);
});

test(T("A10", "build metadata 不参与比较"), () => {
  assert.equal(satisfies("1.0.0+build.1", "1.0.0"), true);
  assert.equal(satisfies("1.0.0", "1.0.0+build.1"), true);
});

test(T("A11", "空范围永不满足"), () => {
  assert.equal(satisfies("1.0.0", ">=1.0.0 <1.0.0"), false);
  assert.equal(satisfies("1.5.0", ">=1.0.0 <1.0.0"), false);
  assert.equal(rangeIsEmpty(">=1.0.0 <1.0.0"), true);
});

test(T("A12", "交集判定与库一致"), () => {
  assert.equal(intersectRanges(["^1.0.0", "^2.0.0"]).empty, true);
  assert.equal(intersectRanges(["^1.0.0", "^1.5.0"]).empty, false);
});

test(T("A13", "latest 不是范围"), () => {
  assert.equal(validRange("latest"), null);
  assert.equal(normalizeRange("latest"), null);
});

test(T("A14", "* 与空串等价"), () => {
  assert.equal(validRange("*"), "*");
  assert.equal(validRange(""), "*");
});

test(T("A15", "裸三位版本是精确锁定"), () => {
  assert.equal(validRange("1.2.3"), "1.2.3");
  assert.equal(satisfies("1.2.4", "1.2.3"), false);
});

test(T("A16", "includePrerelease 会放开预发布"), () => {
  assert.equal(satisfies("1.5.0-beta", "^1.0.0", { includePrerelease: true }), true);
});

test("区间代数：空分支与单点分支的区别", () => {
  // 精确版本是单点闭区间，非空
  assert.equal(rangeIsEmpty("1.2.3"), false);
  // >=1.0.0 <1.0.0 是空的（A11）
  assert.equal(rangeIsEmpty(">=1.0.0 <1.0.0"), true);
  // >1.0.0 是半开（无上界且下界开），非空
  assert.equal(rangeIsEmpty(">1.0.0"), false);
});

test("区间代数：多路求交（库不做这一层）", () => {
  assert.equal(intersectRanges([">=1.0.0 <2.0.0", ">=1.5.0"]).empty, false);
  assert.equal(intersectRanges([">=1.0.0 <2.0.0", ">=2.5.0"]).empty, true);
  assert.equal(intersectRanges(["^1.0.0", "^1.2.0", "^2.0.0"]).empty, true);
});

test("区间代数：|| 分支在求交里按分支展开", () => {
  // ^1.0.0 的两分支实际被 validRange 合并成一条，这里用真正不同的两个分支
  assert.equal(intersectRanges(["^1.0.0 || ^3.0.0", "^2.0.0"]).empty, true);
  assert.equal(intersectRanges(["^1.0.0 || ^3.0.0", "^1.5.0"]).empty, false);
});
