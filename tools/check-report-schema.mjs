#!/usr/bin/env node
/**
 * 报告门（M5）：JSON / SARIF 的**结构与 schema**、三格式**内容一致**、`--out` 原子写。
 *
 * 四条判据，每条都配变异组（`tools/verify-layout-mutations.mjs` 的 `H23`–`H26`）：
 *   1. **SARIF 过官方 schema**：用仓库内的 OASIS schema 离线副本
 *      （`schema/sarif-2.1.0.json`，sha256 钉在 `data/README.md` §1.1 A26）真跑校验器，
 *      不是手写字段断言。跑全部 15 组向量 + 真实树。
 *   2. **`ruleId` 不得是 `undefined`**：M2 finding 只有 `kind` 没有 `rule`，旧实现
 *      `String(f.rule)` 会产出字面量 `"undefined"`（M5 走查实测，冻结样例里就有）。
 *      schema 校验**抓不到**这条（`"undefined"` 是合法字符串）——必须单独判。
 *   3. **三格式内容一致**：同一输入下 text / json / sarif 必须报同一批产物
 *      （旧实现 SARIF 只出 findings，真实树报 0 条而 JSON 报 2 条）。
 *   4. **`--out` 原子写**：写到不存在目录可创建；写失败不留半个产物（`.tmp-<pid>` 不残留）。
 *
 * 退出码：0 全绿 / 1 有 FAIL / 2 用法错误。
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { validateDetailed } from "../src/report/json-schema.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "versionaudit.mjs");
const SCHEMA_PATH = join(ROOT, "schema", "sarif-2.1.0.json");
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : null);

for (const arg of process.argv.slice(2)) {
  process.stderr.write(`check-report-schema: unknown argument ${arg}\n`);
  process.exit(2);
}

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok, detail });

/**
 * 真跑 CLI，**不关心退出码**（有 findings 时非 0 是正确行为）。
 *
 * 实测坑：`execFileSync` 在子进程**非 0 退出**时抛错，正常情况下 `error.stdout` 仍带全文；
 * 但在高负载下偶发拿到**空 stdout**（本门首次落地时踩到一次，随后 40 次复跑不再复现）。
 * 空 stdout 会让"SARIF 不是合法 JSON"这种**假红**出现，所以这里显式重试一次并**计数**——
 * 重试次数会打进结论，不静默。两次都空才算失败（带 status 便于定位）。
 *
 * `allowEmpty`：给了 `--out` 时 stdout **本来就该是空的**（那是判据要断言的行为），
 * 不能被重试守卫当成环境问题（首次落地时踩到：`checkOutAtomic` 恒红）。
 */
let cliRetries = 0;
function runCli(args, { allowEmpty = false } = {}) {
  const attempt = () => {
    try {
      return { out: execFileSync(process.execPath, [BIN, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
      }), status: 0 };
    } catch (error) {
      return { out: typeof error.stdout === "string" ? error.stdout : "", status: error.status ?? -1 };
    }
  };
  const first = attempt();
  if (first.out.trim().length > 0 || allowEmpty) return first.out;
  cliRetries += 1;
  const second = attempt();
  if (second.out.trim().length > 0) return second.out;
  throw new Error(
    `子进程两次都没有 stdout（${args.join(" ")}；退出码 ${first.status}/${second.status}）——这不是判据失败，是运行环境问题`,
  );
}

/** 被测夹具：15 组向量 + 真实树。 */
function fixtures() {
  const dir = join(ROOT, "fixtures", "vectors");
  const list = existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort()
        .map((name) => ({ label: name, dir: join(dir, name, "input") }))
    : [];
  const realTree = join(ROOT, "fixtures", "real-tree", "input");
  if (existsSync(join(realTree, "package.json"))) list.push({ label: "real-tree", dir: realTree });
  return list;
}

// ── 1 + 2. SARIF 过官方 schema，且 ruleId 不是 undefined ────────────────────
function checkSarifSchema() {
  if (!existsSync(SCHEMA_PATH)) {
    add("REPORT.SARIF_SCHEMA", false, "缺 schema/sarif-2.1.0.json（官方 schema 离线副本）");
    return;
  }
  let schema;
  try {
    schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  } catch (error) {
    add("REPORT.SARIF_SCHEMA", false, `schema 不是合法 JSON：${error.message}`);
    return;
  }
  if (schema.$id !== "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json") {
    add("REPORT.SARIF_SCHEMA", false, `schema 的 $id 不是 OASIS 官方 SARIF 2.1.0（实际 ${JSON.stringify(schema.$id)}）`);
    return;
  }

  const list = fixtures();
  if (list.length === 0) {
    add("REPORT.SARIF_SCHEMA", false, "0 个夹具被校验（判据空跑）");
    return;
  }

  const problems = [];
  let validated = 0;
  let resultCount = 0;
  let rulesCount = 0;
  let unvalidatedFormats = 0;

  for (const { label, dir } of list) {
    let raw;
    try {
      raw = runCli(["audit", dir, "--format=sarif"]);
    } catch (error) {
      problems.push(`${label}: 拿不到 SARIF 输出（${error.message}）`);
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (error) {
      problems.push(`${label}: SARIF 不是合法 JSON（${error.message}；${raw.length} 字节）`);
      continue;
    }
    validated += 1;
    const { errors, unvalidated } = validateDetailed(doc, schema);
    unvalidatedFormats += unvalidated.length;
    for (const e of errors.slice(0, 5)) problems.push(`${label}: schema ${e}`);

    const run = doc.runs?.[0] ?? {};
    resultCount += (run.results ?? []).length;
    rulesCount += (run.tool?.driver?.rules ?? []).length;

    // 判据 2：ruleId 必须是真键（schema 抓不到"undefined"这个字符串）
    for (const [i, r] of (run.results ?? []).entries()) {
      if (typeof r.ruleId !== "string" || r.ruleId === "undefined" || r.ruleId === "") {
        problems.push(`${label}: results[${i}].ruleId = ${JSON.stringify(r.ruleId)}（必须是真的规则/状态键）`);
      }
      if (r.locations?.length) {
        const uri = r.locations[0]?.physicalLocation?.artifactLocation?.uri;
        if (typeof uri === "string" && (/^[A-Za-z]:[\\/]/.test(uri) || uri.startsWith("/"))) {
          problems.push(`${label}: results[${i}] 的 artifactLocation.uri 是绝对路径（${uri}）`);
        }
      }
    }
  }

  // 阳性对照：不能"全绿"是因为压根没产物
  if (resultCount === 0) problems.push("所有夹具的 SARIF 结果合计 0 条（判据空跑：结果通道没接通）");

  add(
    "REPORT.SARIF_SCHEMA",
    problems.length === 0,
    problems.length
      ? problems.slice(0, 8).join("；")
      : `${validated} 个夹具过 OASIS SARIF 2.1.0 schema（results ${resultCount} 条 / rules ${rulesCount} 个；format 关键字 ${unvalidatedFormats} 处按 draft-07 annotation 语义未校验，已登记）`,
  );
}

// ── 3. 三格式内容一致 ──────────────────────────────────────────────────────
/**
 * 一致性口径：把 JSON 报告的产物摊平成 `(ruleId, subject)` 集合，再要求
 *   - SARIF 的 `(ruleId, subject)` 集合与之**完全相同**；
 *   - text 里每个 `ruleId` 都出现（text 是给人看的，不要求逐条可机读，但**不许漏类**）。
 * 只比"集合"，不比顺序：三格式的排序职责不同（text 分组，SARIF 按产出顺序）。
 *
 * **期望值必须独立枚举，不许调 `src/report/sarif.mjs` 的 `collectEntries`**：
 * 那是被测实现（SARIF 的产物来源）。用同一份枚举求期望 == 两侧一起坏掉仍一致
 * （实测：变异组 H24 把 dedupe/conflicts 段关掉，用 `collectEntries` 求期望时判据**假绿**）。
 */
function expectedEntries(report) {
  const out = [];
  for (const f of report.findings ?? []) {
    out.push({ ruleId: String(f.rule ?? f.kind), subject: f.package ?? f.dependency ?? "?" });
  }
  for (const d of report.dedupe ?? []) out.push({ ruleId: d.status, subject: d.package });
  for (const c of report.conflicts ?? []) out.push({ ruleId: c.kind, subject: c.package });
  return out;
}

function checkFormatConsistency() {
  const list = fixtures();
  const problems = [];
  let compared = 0;
  let totalEntries = 0;

  for (const { label, dir } of list) {
    const report = JSON.parse(runCli(["audit", dir, "--format=json"]));
    const sarifDoc = JSON.parse(runCli(["audit", dir, "--format=sarif"]));
    const text = runCli(["audit", dir, "--format=text"]);

    const expected = expectedEntries(report);
    const expectedKeys = expected.map((e) => `${e.ruleId}|${e.subject}`).sort();

    const sarifKeys = (sarifDoc.runs?.[0]?.results ?? [])
      .map((r) => `${r.ruleId}|${r.properties?.subject ?? "(缺 subject)"}`)
      .sort();

    compared += 1;
    totalEntries += expectedKeys.length;

    if (JSON.stringify(expectedKeys) !== JSON.stringify(sarifKeys)) {
      problems.push(
        `${label}: SARIF 与 JSON 的产物集合不一致（JSON ${expectedKeys.length} 条 / SARIF ${sarifKeys.length} 条；仅 JSON 有 ${JSON.stringify(expectedKeys.filter((k) => !sarifKeys.includes(k)).slice(0, 3))}；仅 SARIF 有 ${JSON.stringify(sarifKeys.filter((k) => !expectedKeys.includes(k)).slice(0, 3))}）`,
      );
    }

    // text 不得漏"类"：每个出现过的 ruleId 至少要在 text 里被点名一次
    const missingInText = [...new Set(expected.map((e) => e.ruleId))].filter((id) => !text.includes(id));
    if (missingInText.length > 0) {
      problems.push(`${label}: text 里缺了这些规则/状态的痕迹 ${JSON.stringify(missingInText)}`);
    }
    if (text.trim().length === 0) problems.push(`${label}: text 输出为空`);
  }

  if (compared === 0) problems.push("0 个夹具被比对（判据空跑）");
  add(
    "REPORT.FORMAT_CONSISTENCY",
    problems.length === 0,
    `${problems.length ? `${problems.slice(0, 6).join("；")}` : `${compared} 个夹具：text/json/sarif 三格式产物集合一致（合计 ${totalEntries} 条产物）`}${
      cliRetries ? `（子进程空 stdout 重试 ${cliRetries} 次）` : ""
    }`,
  );
}

// ── 4. --out 原子写 ────────────────────────────────────────────────────────
function checkOutAtomic() {
  const problems = [];
  const work = mkdtempSync(join(tmpdir(), "va-out-"));
  try {
    const fixture = join(ROOT, "fixtures", "vectors", "M2-lock-manifest", "input");
    if (!existsSync(fixture)) {
      add("REPORT.OUT_ATOMIC", false, "缺 M2-lock-manifest 夹具（判据空跑）");
      return;
    }

    // 4a. 写到不存在的嵌套目录：应创建目录并落盘
    const deep = join(work, "nested", "deeper", "report.json");
    runCli(["audit", fixture, "--format=json", "--out", deep], { allowEmpty: true });
    if (!existsSync(deep)) problems.push("--out 未创建缺失的父目录");
    else {
      const parsed = JSON.parse(readFileSync(deep, "utf8"));
      if (parsed.schemaVersion !== 1) problems.push("--out 写出的 JSON 缺 schemaVersion");
    }
    // 4b. 不留临时文件（`.tmp-<pid>`）
    const leftovers = existsSync(dirname(deep))
      ? readdirSync(dirname(deep)).filter((f) => f.includes(".tmp-"))
      : [];
    if (leftovers.length > 0) problems.push(`--out 残留临时文件 ${JSON.stringify(leftovers)}`);

    // 4c. 写失败路径（**跨平台确定**）：把 "--out 的父路径" 占成一个**普通文件**，
    //     于是 `mkdirSync(dir,{recursive:true})` 必然失败（ENOTDIR/EEXIST），与 chmod 语义无关。
    //     （旧写法靠 chmod 0o555：Windows 上对目录基本无效 → 这条判据在 Windows 上**真空**。）
    const blocker = join(work, "blocker");
    writeFileSync(blocker, "not a directory\n", "utf8");
    const blockedTarget = join(blocker, "sub", "blocked.json");
    let halfWritten = false;
    let blockedThrew = false;
    try {
      runCli(["audit", fixture, "--format=json", "--out", blockedTarget], { allowEmpty: true });
    } catch {
      blockedThrew = true;
    }
    if (existsSync(blockedTarget)) {
      try {
        JSON.parse(readFileSync(blockedTarget, "utf8"));
      } catch {
        halfWritten = true;
      }
    }
    // 父路径下不得残留临时文件
    if (existsSync(blocker) && statSync(blocker).isDirectory()) {
      const stuck = readdirSync(blocker).filter((f) => f.includes(".tmp-"));
      if (stuck.length > 0) halfWritten = true;
    }
    if (halfWritten) problems.push("--out 失败时留下了半个产物（非原子）");

    // 阴性对照：可写目录必须**真的写成功**（否则"永不写"也能让上面的断言变绿）
    const okDir = join(work, "writable");
    const okFile = join(okDir, "ok.json");
    runCli(["audit", fixture, "--format=json", "--out", okFile], { allowEmpty: true });
    if (!existsSync(okFile)) {
      problems.push("--out 在正常目录下没写出文件（阴性对照失败：上面的「失败不留产物」因此无意义）");
    } else {
      try {
        const parsed = JSON.parse(readFileSync(okFile, "utf8"));
        if (parsed.schemaVersion !== 1) problems.push("--out 写出的 JSON 缺 schemaVersion");
      } catch {
        problems.push("--out 写出的文件不是完整 JSON");
      }
    }
    void blockedThrew;

    // 4d. stdout 不再输出正文
    const stdoutWhenOut = runCli(["audit", fixture, "--format=json", "--out", join(work, "quiet.json")], { allowEmpty: true });
    if (stdoutWhenOut.trim().length > 0) problems.push("给了 --out 仍往 stdout 打正文");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  add(
    "REPORT.OUT_ATOMIC",
    problems.length === 0,
    problems.length ? problems.join("；") : "--out 原子写：建目录 / 无 .tmp 残留 / 失败不留半个产物 / stdout 静默",
  );
}

for (const run of [checkSarifSchema, checkFormatConsistency, checkOutAtomic]) {
  try {
    run();
  } catch (error) {
    add(run.name, false, error.message);
  }
}

const failed = checks.filter((c) => !c.ok);
process.stdout.write("报告门（三格式 + schema + 原子写）\n");
process.stdout.write(`${"=".repeat(64)}\n`);
for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.id}  ${c.detail}\n`);
process.stdout.write(`${"=".repeat(64)}\n`);
process.stdout.write(`结论: ${failed.length === 0 ? "全绿" : `${failed.length} 项 FAIL`}\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
