/**
 * 夹具跑者：读 `<dir>/expected.json`，真跑 CLI，逐条断言。
 *
 * 两类被测对象（**同一套语义**，`plan/04` §二）：
 *   - `fixtures/vectors/*`（14 组差分向量）
 *   - `fixtures/real-tree`（M4 的 20 包真实树，目录布局与向量同形）
 *
 * 断言语义：
 *   - `mustContain`：每条 `{path, value|contains|deepEqual|present}` 都必须成立
 *   - `mustNotContain`：每条都不能成立（防"报得太宽"）
 *   - `exitCode`：端到端退出码
 *   - `implementationVersions`：报告里的实现版本必须与声明一致（防"换了库版本却没重跑向量"）
 *
 * 断言引擎在 `tests/helpers/assertions.mjs`（真实树跑者共用；形态守卫也在那里）。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { cleanupFixtures } from "../helpers/fixtures.mjs";
import { evaluateExpected } from "../helpers/assertions.mjs";
import { satisfies } from "../../src/semver/adapter.mjs";
import { REPO_ROOT } from "../../src/meta.mjs";

after(cleanupFixtures);

const VECTORS = join(REPO_ROOT, "fixtures", "vectors");
const REAL_TREE = join(REPO_ROOT, "fixtures", "real-tree");
const BIN = join(REPO_ROOT, "bin", "versionaudit.mjs");

const vectorDirs = existsSync(VECTORS)
  ? readdirSync(VECTORS, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

/** 被测夹具：14 组向量 + 真实树（后者没有子目录，直接是一个夹具根）。 */
const CASES = [
  ...vectorDirs.map((name) => ({ label: `向量 ${name}`, dir: join(VECTORS, name) })),
  ...(existsSync(join(REAL_TREE, "expected.json")) ? [{ label: "真实树 real-tree", dir: REAL_TREE }] : []),
];

// 非空跑自证：0 个向量时下面的 test 一条都不会生成 → 单独报一条
test("向量集非空（阳性对照）", () => {
  assert.ok(vectorDirs.length > 0, "fixtures/vectors 下没有任何向量（判据空转）");
});

for (const unit of CASES) {
  const expectedPath = join(unit.dir, "expected.json");
  const inputDir = join(unit.dir, "input");

  test(unit.label, () => {
    assert.ok(existsSync(expectedPath), `${unit.label}: 缺 expected.json`);
    const expected = JSON.parse(readFileSync(expectedPath, "utf8"));

    assert.ok(Array.isArray(expected.sources) && expected.sources.length > 0, `${unit.label}: sources 为空（无来源的断言）`);
    assert.ok(Array.isArray(expected.mustContain) && expected.mustContain.length > 0, `${unit.label}: mustContain 为空`);

    assert.ok(existsSync(inputDir), `${unit.label}: 缺 input/ 目录`);

    let stdout;
    let code;
    // 夹具可声明额外参数（如 R8 需要 --enable-r8 才开启）
    const extraArgs = Array.isArray(expected.args) ? expected.args : [];
    try {
      stdout = execFileSync(process.execPath, [BIN, "audit", inputDir, "--format=json", ...extraArgs], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      code = 0;
    } catch (error) {
      stdout = error.stdout ?? "";
      code = typeof error.status === "number" ? error.status : -1;
    }

    assert.equal(code, expected.exitCode, `${unit.label}: 退出码 ${code} ≠ expected ${expected.exitCode}`);
    const report = JSON.parse(stdout);

    // 实现版本必须与声明一致
    if (expected.implementationVersions?.semver) {
      assert.equal(
        report.implementation.version,
        expected.implementationVersions.semver,
        `${unit.label}: semver 版本漂移（向量需要重跑或台账需要更新）`,
      );
    }

    // 向量声明的 **Node 范围**必须覆盖当前解释器（D2 修复：此前 `?.node` 从未被读，
    // 15 份 expected.json 写 `">=20"` 只是装饰）。判据用本仓自己的 semver（K5 = 唯一适配层），
    // 与报告侧同一套范围语义，不引入第二种解析口径。
    if (expected.implementationVersions?.node) {
      const declaredRange = expected.implementationVersions.node;
      const actual = process.versions.node;
      assert.ok(
        satisfies(actual, declaredRange),
        `${unit.label}: 该向量声明了 node ${declaredRange}，当前 ${actual}（向量需要重跑或声明需要更新）`,
      );
    }

    const failures = evaluateExpected(report, expected, unit.label);
    assert.deepEqual(failures, [], `${unit.label}:\n${failures.join("\n")}`);
  });
}
