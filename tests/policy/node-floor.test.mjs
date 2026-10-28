/**
 * Node 运行时下限的纯函数测试（D1 的执行级证据）。
 *
 * 为什么必须是纯函数：本机只有 node v24.15.0，没有 18 / 20。若检查读 `process.versions.node`，
 * "旧 Node 分支"在本机**永远走不到**，那条测试就只是"在当前机器上绿"的装饰。
 * 版本串从参数进 → 18 / 20 / 24 三条分支在 24 上都能被测到。
 *
 * 第 ④ 条是**负控**：纯函数跑在 CLI 最外层，抛未捕获异常会把"环境不满足"
 * （退出码 5）变成"内部错误"（退出码 3）。
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { checkNodeFloor, MIN_NODE_MAJOR } from "../../src/policy/node-floor.mjs";

test("低于下限：18.20.0 + min 20 → ok:false，且 reason 说清是 18", () => {
  const result = checkNodeFloor("18.20.0", 20);
  assert.equal(result.ok, false);
  assert.equal(typeof result.reason, "string");
  assert.match(result.reason, /18/, `reason 必须带上实际主版本：${result.reason}`);
});

test("恰好等于下限：20.0.0 → ok:true（边界含等号，不许写成 > 20）", () => {
  assert.deepEqual(checkNodeFloor("20.0.0", 20), { ok: true });
});

test("高于下限：24.15.0（本机真实版本）→ ok:true", () => {
  assert.deepEqual(checkNodeFloor("24.15.0", 20), { ok: true });
});

test("负控：非法版本串不得抛未捕获异常，必须明确返回失败", () => {
  // 两个都不许 throw：纯函数跑在 CLI 最外层，抛出去会把"环境"变成"内部错误"。
  for (const bad of ["not-a-version", ""]) {
    let result;
    assert.doesNotThrow(() => {
      result = checkNodeFloor(bad, 20);
    }, `checkNodeFloor(${JSON.stringify(bad)}) 不许抛`);
    assert.equal(result.ok, false, `非法输入 ${JSON.stringify(bad)} 必须判失败`);
    assert.match(result.reason, /无法识别|无法解析/, `reason 必须说明是"解析不了"：${result.reason}`);
  }
  // 默认参数走的就是 MIN_NODE_MAJOR，不许多写一份字面量
  assert.equal(MIN_NODE_MAJOR, 20);
});