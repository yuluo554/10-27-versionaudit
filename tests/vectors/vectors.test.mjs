/**
 * 向量跑者：读 `fixtures/vectors/<id>/expected.json`，真跑 CLI，逐条断言。
 *
 * 断言语义（`plan/04` §二）：
 *   - `mustContain`：每条 `{path, value|contains|deepEqual}` 都必须成立
 *   - `mustNotContain`：每条都不能成立（防"报得太宽"）
 *   - `exitCode`：端到端退出码
 *   - `implementationVersions`：报告里的实现版本必须与声明一致（防"换了库版本却没重跑向量"）
 *
 * 路径语法（本项目自定，刻意简单）：
 *   `findings[0].rule`           数组下标
 *   `findings[?kind=x].dependency`  数组按字段值过滤后取第一个
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { cleanupFixtures } from "../helpers/fixtures.mjs";
import { REPO_ROOT } from "../../src/meta.mjs";

after(cleanupFixtures);

const VECTORS = join(REPO_ROOT, "fixtures", "vectors");
const BIN = join(REPO_ROOT, "bin", "versionaudit.mjs");

/** 解析路径：`a.b[0].c` 或 `a[?k=v&k2=v2].c`（多条件 AND）。 */
function resolvePath(root, path) {
  const tokens = [];
  const re = /([A-Za-z_][\w-]*)|\[\?([^\]]+)\]|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) tokens.push({ type: "key", value: m[1] });
    else if (m[2] !== undefined) {
      const conditions = m[2].split("&").map((pair) => {
        const eq = pair.indexOf("=");
        return { key: pair.slice(0, eq), value: pair.slice(eq + 1) };
      });
      tokens.push({ type: "filter", conditions });
    } else tokens.push({ type: "index", value: Number(m[3]) });
  }
  let cur = root;
  for (const t of tokens) {
    if (cur === undefined || cur === null) return undefined;
    if (t.type === "key") cur = cur[t.value];
    else if (t.type === "index") cur = Array.isArray(cur) ? cur[t.value] : undefined;
    else if (t.type === "filter") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur.find((x) => t.conditions.every((c) => String(x?.[c.key]) === c.value));
    }
  }
  return cur;
}

function checkAssertion(report, assertion) {
  const actual = resolvePath(report, assertion.path);
  if (assertion.value !== undefined) {
    return { ok: Object.is(actual, assertion.value) || actual === assertion.value, actual, expected: assertion.value };
  }
  if (assertion.contains !== undefined) {
    const ok = typeof actual === "string" && actual.includes(assertion.contains);
    return { ok, actual, expected: `contains ${assertion.contains}` };
  }
  if (assertion.deepEqual !== undefined) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(assertion.deepEqual);
    return { ok: a === b, actual, expected: assertion.deepEqual };
  }
  if (assertion.present !== undefined) {
    const has = actual !== undefined && actual !== null;
    return { ok: assertion.present ? has : !has, actual, expected: `present=${assertion.present}` };
  }
  return { ok: false, actual, expected: "断言形态未知（需 value/contains/deepEqual/present）" };
}

const vectorDirs = existsSync(VECTORS)
  ? readdirSync(VECTORS, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

// 非空跑自证：0 个向量时下面的 test 一条都不会生成 → 单独报一条
test("向量集非空（阳性对照）", () => {
  assert.ok(vectorDirs.length > 0, "fixtures/vectors 下没有任何向量（判据空转）");
});

for (const name of vectorDirs) {
  const expectedPath = join(VECTORS, name, "expected.json");
  const inputDir = join(VECTORS, name, "input");

  test(`向量 ${name}`, () => {
    assert.ok(existsSync(expectedPath), `${name}: 缺 expected.json`);
    const expected = JSON.parse(readFileSync(expectedPath, "utf8"));

    assert.ok(Array.isArray(expected.sources) && expected.sources.length > 0, `${name}: sources 为空（无来源的断言）`);
    assert.ok(Array.isArray(expected.mustContain) && expected.mustContain.length > 0, `${name}: mustContain 为空`);

    assert.ok(existsSync(inputDir), `${name}: 缺 input/ 目录`);

    let stdout;
    let code;
    // 向量可声明额外参数（如 R8 需要 --enable-r8 才开启）
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

    assert.equal(code, expected.exitCode, `${name}: 退出码 ${code} ≠ expected ${expected.exitCode}`);
    const report = JSON.parse(stdout);

    // 实现版本必须与声明一致
    if (expected.implementationVersions?.semver) {
      assert.equal(
        report.implementation.version,
        expected.implementationVersions.semver,
        `${name}: semver 版本漂移（向量需要重跑或台账需要更新）`,
      );
    }

    const failures = [];
    for (const assertion of expected.mustContain) {
      const r = checkAssertion(report, assertion);
      if (!r.ok) failures.push(`mustContain ${assertion.path} = ${JSON.stringify(r.expected)}，实际 ${JSON.stringify(r.actual)}`);
    }
    for (const assertion of expected.mustNotContain ?? []) {
      const r = checkAssertion(report, assertion);
      if (r.ok) failures.push(`mustNotContain ${assertion.path} 命中了 ${JSON.stringify(r.expected)}（报得太宽）`);
    }
    assert.deepEqual(failures, [], `${name}:\n${failures.join("\n")}`);
  });
}
