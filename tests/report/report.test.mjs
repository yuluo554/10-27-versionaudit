/**
 * M5 `report-ci` —— 报告面的**进程内**测试（`tools/check-report-schema.mjs` 是端到端的门）。
 *
 * 三层分工，避免"测同一件事三次"：
 *   - 本文件：三格式**内容一致**（同一份 JSON 产物 vs 渲染出的 SARIF 条目）、SARIF schema
 *     校验的**阳性/阴性对照**、`summary.highest` 覆盖三类产物、`--out` 原子写的行为；
 *   - `tools/check-report-schema.mjs`：跨全部夹具的端到端门（含 schema + 原子写）；
 *   - `tests/determinism`：逐字节确定性（已存在）。
 *
 * 为什么一致性别用"报文文本对切"：报文措辞一改判据就假绿/假红。这里比对的是
 * `collectEntries()` 产出的 `(ruleId, subject)` 集合 —— 与 SARIF `properties.subject` 同源。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { makeFixture, lockV3, runCli, cleanupFixtures, writeFile } from "../helpers/fixtures.mjs";
import { renderSarif, collectEntries } from "../../src/report/sarif.mjs";
import { validate, validateDetailed } from "../../src/report/json-schema.mjs";
import { REPO_ROOT } from "../../src/meta.mjs";

after(cleanupFixtures);

const SCHEMA_PATH = join(REPO_ROOT, "schema", "sarif-2.1.0.json");
const schema = existsSync(SCHEMA_PATH) ? JSON.parse(readFileSync(SCHEMA_PATH, "utf8")) : null;

/** 一份"三类产物都有"的夹具：M1 规则 + M2 不一致 + M3 不可收敛 + M4 冲突。 */
function richFixture() {
  const manifest = {
    name: "rich",
    version: "1.0.0",
    private: true,
    dependencies: { send: "^0.19.2", loose: ">=1.0.0", debug: "2.6.9" },
  };
  const lock = lockV3(
    { send: "^0.19.2", loose: ">=1.0.0", debug: "2.6.9" },
    {
      "node_modules/send": { version: "0.18.0", dependencies: { ms: "2.1.3" } },
      "node_modules/send/node_modules/ms": { version: "2.1.3" },
      "node_modules/loose": { version: "1.5.0", dependencies: { ms: "2.0.0" } },
      "node_modules/loose/node_modules/ms": { version: "2.0.0" },
      "node_modules/debug": { version: "2.6.9", dependencies: { ms: "2.0.0" } },
    },
  );
  return makeFixture(manifest, lock);
}

test("SARIF：官方 schema 副本在位且是 OASIS 2.1.0", () => {
  assert.ok(schema, "缺 schema/sarif-2.1.0.json（官方 schema 的离线副本）");
  assert.equal(
    schema.$id,
    "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    "schema 的 $id 不是 OASIS 官方 SARIF 2.1.0",
  );
  // 阳性对照：schema 里必须真有约束（空 schema 会让任何校验都"通过"）
  assert.ok(Object.keys(schema.definitions?.result?.properties ?? {}).length > 5, "schema 的 result 定义异常");
  assert.deepEqual(schema.definitions?.result?.required, ["message"], "result 的必填字段变了");
});

test("SARIF：三格式产物集合一致（同一批产物都要进 SARIF）", async () => {
  const dir = richFixture();
  const { json } = await runCli(["audit", dir, "--format=json"]);
  const sarifRun = await runCli(["audit", dir, "--format=sarif"]);
  const sarif = JSON.parse(sarifRun.stdout);

  const expected = collectEntries(json).map((e) => `${e.ruleId}|${e.subject}`).sort();
  const actual = (sarif.runs[0].results ?? []).map((r) => `${r.ruleId}|${r.properties?.subject}`).sort();

  assert.ok(expected.length > 0, "夹具必须产出至少一条产物（否则一致性判据空转）");
  assert.deepEqual(actual, expected, "SARIF 的产物集合与 JSON 报告不一致");

  // 具体钉住：三类产物（finding / dedupe / conflict）都必须有代表
  const kinds = new Set(collectEntries(json).map((e) => e.ruleId));
  assert.ok([...kinds].some((k) => /^R\d$/.test(k)), "缺 M1 规则产物");
  assert.ok([...kinds].some((k) => k === "manifest-not-satisfied"), "缺 M2 产物");
  assert.ok([...kinds].some((k) => ["CONVERGIBLE", "NOT_CONVERGIBLE", "REQUIRES_OVERRIDE"].includes(k)), "缺 M3 产物");
});

test("SARIF：ruleId 不得是 'undefined'（M2 finding 只有 kind）", async () => {
  const dir = richFixture();
  const sarifRun = await runCli(["audit", dir, "--format=sarif"]);
  const sarif = JSON.parse(sarifRun.stdout);
  const bad = (sarif.runs[0].results ?? []).filter((r) => r.ruleId === "undefined" || !r.ruleId);
  assert.deepEqual(bad, [], "SARIF 里出现 ruleId='undefined'（f.rule 为 undefined 时没回落到 f.kind）");
  // rules 数组里同样不许有空壳
  const badRules = (sarif.runs[0].tool.driver.rules ?? []).filter((r) => r.id === "undefined" || !r.id);
  assert.deepEqual(badRules, [], "SARIF rules 里出现 id='undefined'");
});

test("SARIF：全部向量的 SARIF 都过官方 schema（逐个校验）", async () => {
  assert.ok(schema, "缺官方 schema 副本");
  const vectorsDir = join(REPO_ROOT, "fixtures", "vectors");
  const names = readdirSync(vectorsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  assert.ok(names.length > 0, "0 组向量（判据空转）");

  const problems = [];
  for (const name of [...names, "real-tree"]) {
    const inputDir =
      name === "real-tree"
        ? join(REPO_ROOT, "fixtures", "real-tree", "input")
        : join(vectorsDir, name, "input");
    if (!existsSync(inputDir)) continue;
    const run = await runCli(["audit", inputDir, "--format=sarif"]);
    const doc = JSON.parse(run.stdout);
    const errors = validate(doc, schema);
    for (const e of errors.slice(0, 3)) problems.push(`${name}: ${e}`);
  }
  assert.deepEqual(problems, [], `SARIF schema 校验失败：\n${problems.join("\n")}`);
});

test("JSON Schema 校验器：负例必须被抓（阳性对照，防「永远绿」）", () => {
  assert.ok(schema, "缺官方 schema 副本");
  const good = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "x", version: "1.0.0", informationUri: "https://example.invalid" } },
        results: [
          {
            ruleId: "R1",
            level: "warning",
            message: { text: "m" },
            locations: [{ physicalLocation: { artifactLocation: { uri: "<input>/package.json" } } }],
          },
        ],
      },
    ],
  };
  assert.deepEqual(validate(good, schema), [], "合法 SARIF 不得报错");

  const cases = [
    ["version 漂了", (d) => (d.version = "2.0.0")],
    ["缺 driver.name", (d) => delete d.runs[0].tool.driver.name],
    ["level 非法", (d) => (d.runs[0].results[0].level = "fatal")],
    ["多出未知字段", (d) => (d.runs[0].results[0].bogus = 1)],
    ["results 元素缺 message", (d) => delete d.runs[0].results[0].message],
  ];
  for (const [label, mutate] of cases) {
    const bad = JSON.parse(JSON.stringify(good));
    mutate(bad);
    assert.ok(validate(bad, schema).length > 0, `负例「${label}」必须被 schema 校验抓到`);
  }
});

test("JSON Schema 校验器：format 是 annotation（登记为未校验，不算失败）", async () => {
  assert.ok(schema, "缺官方 schema 副本");
  const dir = richFixture();
  const run = await runCli(["audit", dir, "--format=sarif"]);
  const { errors, unvalidated } = validateDetailed(JSON.parse(run.stdout), schema);
  assert.deepEqual(errors, [], "合法 SARIF 不应有 schema 错误");
  assert.ok(unvalidated.length > 0, "SARIF 里应有 format 约束（uri-reference）；没有说明 schema 变了");
  assert.ok(
    unvalidated.every((u) => typeof u.format === "string" && u.path.startsWith("/")),
    "未校验项必须带路径与 format 名（否则「未校验」不可核对）",
  );
});

test("summary.highest 覆盖三类产物（不只 findings）", async () => {
  // 真实树：findings 为空，error 全在 dedupe/conflicts 里
  const realTree = join(REPO_ROOT, "fixtures", "real-tree", "input");
  assert.ok(existsSync(realTree), "缺真实树夹具");
  const { json } = await runCli(["audit", realTree, "--format=json"]);

  assert.equal(json.findings.length, 0, "真实树不该有 findings（它的产物在 dedupe/conflicts）");
  assert.ok(json.summary.error > 0, "真实树必须有 error（NOT_CONVERGIBLE）");
  assert.equal(
    json.summary.highest,
    "error",
    "highest 必须覆盖 dedupe/conflicts（旧实现只扫 findings → 给出 null 而 error=2，自相矛盾）",
  );
});

test("summary.highest：三类产物混排时取最高级别", async () => {
  const dir = richFixture();
  const { json } = await runCli(["audit", dir, "--format=json"]);
  const all = [
    ...json.findings.map((f) => f.severity),
    ...json.dedupe.map((d) => d.severity),
    ...json.conflicts.map((c) => c.severity),
  ];
  const expected = all.includes("error") ? "error" : all.includes("warning") ? "warning" : all.length ? "info" : null;
  assert.equal(json.summary.highest, expected);
});

test("--out 原子写：写到不存在的嵌套目录会建目录并落盘", async () => {
  const dir = richFixture();
  const out = join(dir, "nested", "deep", "report.json");
  const { stdout, stderr, code } = await runCli(["audit", dir, "--format=json", "--out", out]);
  assert.equal(code, 1, "有 error 级产物时退出码仍应是 1（--out 不改变退出码）");
  assert.equal(stdout, "", "给了 --out 时不往 stdout 打正文");
  assert.match(stderr, /已写入/);
  assert.ok(existsSync(out), "--out 未创建缺失的父目录");

  const parsed = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(parsed.schemaVersion, 1);
  // 父目录里不得残留临时文件
  const leftovers = readdirSync(join(dir, "nested", "deep")).filter((f) => f.includes(".tmp-"));
  assert.deepEqual(leftovers, [], "残留临时文件（原子写没走 rename）");
});

test("--out 失败路径：父路径是普通文件时不写半个产物（跨平台确定）", async () => {
  const dir = richFixture();
  // 把父路径占成一个普通文件 → mkdirSync 必然失败（Windows 上 chmod 对目录无效，
  // 旧写法靠 chmod 会让这条判据在 Windows 上真空）
  const blocker = join(dir, "blocker");
  writeFile(dir, "blocker", "not a directory\n");
  assert.ok(statSync(blocker).isFile(), "前置条件：blocker 必须是普通文件");

  const target = join(blocker, "sub", "report.json");
  await assert.rejects(
    () => runCli(["audit", dir, "--format=json", "--out", target]),
    (error) => {
      assert.ok(error, "写失败必须抛错而不是静默");
      return true;
    },
  );
  assert.ok(!existsSync(target), "写失败却留下了产物（非原子）");
});

/**
 * 超过 `--max-requesters` 的树：12 个请求者精确钉 `1.0.0` + 1 个请求 `^1.5.0`。
 * 全量无解 → 删除法降级（`degraded: true` + `requesters > max`）。
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
  pkgs["node_modules/q/node_modules/shared"] = { version: "1.5.0" };
  return makeFixture({ name: "f", version: "1.0.0", private: true, dependencies: deps }, lockV3(deps, pkgs));
}

test("text：降级行必须打 degradeReason（requesters > max），不是两态 reason", async () => {
  const dir = degradedTree();
  const { json } = await runCli(["audit", dir, "--format=json"]);
  const item = json.dedupe.find((d) => d.package === "shared");
  assert.ok(item, "15 个同名请求者 → 必须有 dedupe 条目");
  assert.equal(item.degraded, true, "超过默认上限 12 必须降级");
  assert.equal(item.degradeReason, "requesters > max");

  const text = (await runCli(["audit", dir, "--format=text"])).stdout;
  assert.ok(text.includes("已降级"), "text 必须显式标注降级（不许静默近似，K8）");
  assert.ok(
    text.includes("requesters > max"),
    `text 的降级行必须打 degradeReason；实际报文里只有两态 reason（${JSON.stringify(item.reason)}）——` +
      "把降级原因说成 empty-intersection / no-locked-candidate 是打错字段",
  );
  // 反面：降级的**原因**不能是两态 reason
  const degradeLine = text.split("\n").find((l) => l.includes("已降级")) ?? "";
  assert.ok(
    !degradeLine.includes(item.reason),
    `降级行同时出现两态 reason（${item.reason}）——字段打错了`,
  );
});

test("text / json / sarif：降级信息在三种格式里都可见", async () => {
  const dir = degradedTree();
  const text = (await runCli(["audit", dir, "--format=text"])).stdout;
  const { json } = await runCli(["audit", dir, "--format=json"]);
  const sarif = JSON.parse((await runCli(["audit", dir, "--format=sarif"])).stdout);

  assert.ok(json.degraded.length > 0, "JSON 顶层 degraded 必须非空");
  assert.ok(text.includes("requesters > max"), "text 必须点名降级原因");

  const sarifDegraded = (sarif.runs[0].results ?? []).filter((r) => r.properties?.degraded === true);
  assert.ok(sarifDegraded.length > 0, "SARIF 必须带 degraded: true（否则 CI 侧看不到降级）");
  assert.ok(
    sarifDegraded.every((r) => r.properties?.degradeReason === "requesters > max"),
    "SARIF 的降级结果必须带固定口径串",
  );
});
