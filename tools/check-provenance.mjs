#!/usr/bin/env node
/**
 * 溯源门：每条规则/状态都必须能在 `data/README.md` 找到依据锚点。
 *
 * 判据（D 栏 20 分的机器化）：
 *   1. `src/policy/severity.mjs` 的默认档位表里，每个键都必须在 `data/README.md` 出现过
 *      （M1 规则 `R1`–`R8`、M2 kind、M3 状态、M4 kind）；
 *   2. 每个 `fixtures/vectors/*` 目录必须有 `expected.json` 且含 `sources` 字段
 *      （指向 `data/README.md` 的 A 编号或章节），空数组即 FAIL；
 *   3. `data/README.md` 的 §7 数值口径小节必须存在（唯一定义处不能再搬走）；
 *   4. **反向覆盖（PROV.COVERAGE）**：§1.1 台账的**每条** A 编号都必须被某个向量的
 *      `sources` 引用，或被列入显式豁免登记（豁免必须带理由 + 活测试锚点）。
 *      为什么需要：判据 2 只保证"向量的来源非空"，**不保证"台账每条实测都被复核过"**——
 *      M0 期 12 组向量就漏了 A2/A5/A6/A7（HANDOFF-M0 §三 第 0 条如实登记），
 *      而当时四条门全绿。"覆盖了多少"必须由机器核（references M6 收尾条）。
 *
 * 退出码：0 全绿 / 1 有 FAIL / 2 用法错误。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : null);

for (const arg of process.argv.slice(2)) {
  process.stderr.write(`check-provenance: unknown argument ${arg}\n`);
  process.exit(2);
}

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok, detail });

// ── 1. 档位表每个键都要有依据 ──────────────────────────────────────────────
function checkSeverityKeys() {
  const ledger = read("data/README.md") ?? "";
  const src = read("src/policy/severity.mjs") ?? "";
  if (!src) {
    add("PROV.SEVERITY", false, "src/policy/severity.mjs 不存在");
    return;
  }
  const block = src.split("DEFAULT_SEVERITY = Object.freeze({")[1]?.split("});")[0] ?? "";
  const keys = [...block.matchAll(/^\s*(?:"([^"]+)"|([A-Za-z_][\w-]*))\s*:/gm)].map((m) => m[1] ?? m[2]);
  if (keys.length === 0) {
    add("PROV.SEVERITY", false, "档位表解析出 0 个键（判据空跑）");
    return;
  }
  const missing = keys.filter((k) => !ledger.includes(k));
  add(
    "PROV.SEVERITY",
    missing.length === 0,
    missing.length ? `${keys.length} 个键中 ${missing.length} 个在 data/README.md 无锚点: ${missing.join(", ")}` : `${keys.length} 个档位键均有台账锚点`,
  );
}

// ── 2. 向量必须有 sources ─────────────────────────────────────────────────
function checkVectorSources() {
  const dir = join(ROOT, "fixtures", "vectors");
  if (!existsSync(dir)) {
    add("PROV.VECTORS", false, "fixtures/vectors 不存在");
    return;
  }
  const vectors = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
  if (vectors.length === 0) {
    add("PROV.VECTORS", false, "fixtures/vectors 下 0 个向量（判据空跑）");
    return;
  }
  const bad = [];
  let withExpected = 0;
  for (const name of vectors) {
    const rel = `fixtures/vectors/${name}/expected.json`;
    const text = read(rel);
    if (text === null) {
      bad.push(`${name}: 缺 expected.json`);
      continue;
    }
    withExpected += 1;
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      bad.push(`${name}: expected.json 不是合法 JSON`);
      continue;
    }
    if (!Array.isArray(json.sources) || json.sources.length === 0) {
      bad.push(`${name}: sources 缺失或为空（无来源的断言视为缺陷）`);
    }
    for (const field of ["rule", "mustContain", "mustNotContain", "exitCode", "implementationVersions"]) {
      if (!(field in json)) bad.push(`${name}: 缺字段 ${field}`);
    }
  }
  add(
    "PROV.VECTORS",
    bad.length === 0,
    bad.length ? bad.join("；") : `${vectors.length} 个向量齐备（${withExpected} 份 expected.json 含 sources）`,
  );
}

// ── 3. 数值口径小节必须在位 ───────────────────────────────────────────────
function checkNumbersSection() {
  const ledger = read("data/README.md") ?? "";
  const ok = /^##\s*7\.\s*数值口径/m.test(ledger) || ledger.includes("## 7. 数值口径");
  add("PROV.NUMBERS", ok, ok ? "data/README.md §7 数值口径在位（唯一定义处）" : "data/README.md 缺 §7 数值口径（唯一定义处搬走了？）");
}

// ── 4. 反向覆盖：台账每条 A# 都要被引用或有豁免登记 ─────────────────────────
/**
 * 豁免登记。**每条必须给理由 + 活测试锚点**（理由不能是"没时间"）。
 * 有活测试锚点的意思：该行为在 `tests/` 里有真跑的断言，只是没有"产品面"可供向量断言。
 */
const A_EXEMPT = {
  A16: {
    why: "`includePrerelease` 是**库调用参数**，本项目 CLI 无对应开关（零联网审计不做「放开预发布」这种放宽判据）",
    test: "tests/semver/interval.test.mjs",
  },
  A26: {
    why: "SARIF 官方 schema 的**离线副本**（$id + sha256）是**报告形态**的实测，不是某个夹具的语义结论 —— 没有向量能「引用」它而不把报告形态伪装成语义断言。校验面在 `tools/check-report-schema.mjs`（真跑官方 schema）与 `tests/report/report.test.mjs`（$id / sha256 / 负例阳性对照）",
    test: "tests/report/report.test.mjs",
  },
};

/** 从 §1.1 表格里抽出 A 编号（只认表格行首格的 `A<n>`）。 */
function ledgerAssertionIds() {
  const lines = (read("data/README.md") ?? "").split("\n");
  const ids = [];
  let inSection = false;
  for (const line of lines) {
    if (/^###\s*1\.1\s/.test(line)) {
      inSection = true;
      continue;
    }
    if (/^###\s*1\.2\s/.test(line)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;
    const m = /^\|\s*(A\d+)\s*\|/.exec(line);
    if (m) ids.push(m[1]);
  }
  return [...new Set(ids)].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

/**
 * 收集全部夹具 `expected.json` 里出现的 `A<n>` 引用。
 * 扫描面 = `fixtures/vectors/*` **+ `fixtures/real-tree`**（M4）：真实树也是向量级断言，
 * 它引用的台账编号同样要管（幽灵锚点 / 覆盖计数都算它）。
 */
function vectorsReferencing() {
  const referenced = new Map(); // A<n> -> [vector...]
  const note = (text, label) => {
    for (const m of text.matchAll(/\bA(\d+)\b/g)) {
      const key = `A${m[1]}`;
      if (!referenced.has(key)) referenced.set(key, []);
      if (!referenced.get(key).includes(label)) referenced.get(key).push(label);
    }
  };

  const dir = join(ROOT, "fixtures", "vectors");
  if (existsSync(dir)) {
    for (const name of readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()) {
      const text = read(`fixtures/vectors/${name}/expected.json`);
      if (text === null) continue;
      note(text, name);
    }
  }
  const realTree = read("fixtures/real-tree/expected.json");
  if (realTree !== null) note(realTree, "real-tree");

  return referenced;
}

function checkAssertionCoverage() {
  const ids = ledgerAssertionIds();
  if (ids.length === 0) {
    add("PROV.COVERAGE", false, "data/README.md §1.1 台账解析出 0 条 A 编号（判据空跑）");
    return;
  }
  const referenced = vectorsReferencing();
  if (referenced.size === 0) {
    add("PROV.COVERAGE", false, "没有任何向量引用 A 编号（判据空跑）");
    return;
  }
  const uncovered = [];
  const exemptHits = [];
  for (const id of ids) {
    if (referenced.has(id)) continue;
    const exemption = A_EXEMPT[id];
    if (exemption) {
      if (!exemption.why || !exemption.test) {
        uncovered.push(`${id} 的豁免登记不完整（必须给 why + test）`);
        continue;
      }
      if (!existsSync(join(ROOT, exemption.test))) {
        uncovered.push(`${id} 的豁免指向的测试文件不存在: ${exemption.test}`);
        continue;
      }
      exemptHits.push(`${id}(→${exemption.test})`);
      continue;
    }
    uncovered.push(id);
  }
  // 豁免登记表里出现"台账里已不存在"的编号 = 僵尸登记，必须清理
  const zombie = Object.keys(A_EXEMPT).filter((id) => !ids.includes(id));

  // 幽灵锚点：向量引用了台账里**不存在**的 A 编号 = 凭空来源（比"没来源"更隐蔽）
  const ledgerSet = new Set(ids);
  const ghosts = [];
  for (const [id, vectors] of [...referenced.entries()].sort()) {
    if (!ledgerSet.has(id)) ghosts.push(`${id}(被 ${vectors.join(", ")} 引用)`);
  }

  const problems = [];
  if (uncovered.length) {
    problems.push(`${uncovered.length} 条台账实测既无向量引用也无豁免登记: ${uncovered.join(", ")}`);
  }
  if (zombie.length) problems.push(`豁免登记指向台账里不存在的编号（僵尸登记）: ${zombie.join(", ")}`);
  if (ghosts.length) problems.push(`向量引用了台账里不存在的 A 编号（幽灵锚点）: ${ghosts.join(", ")}`);

  add(
    "PROV.COVERAGE",
    problems.length === 0,
    problems.length
      ? problems.join("；")
      : `§1.1 台账 ${ids.length} 条实测：${referenced.size} 条被向量引用 + ${exemptHits.length} 条显式豁免（${exemptHits.join(", ") || "无"}），无遗漏`,
  );
}

for (const run of [checkSeverityKeys, checkVectorSources, checkNumbersSection, checkAssertionCoverage]) {
  try {
    run();
  } catch (error) {
    add(run.name, false, error.message);
  }
}

const failed = checks.filter((c) => !c.ok);
process.stdout.write("溯源门（每条断言必须有来源）\n");
process.stdout.write(`${"=".repeat(64)}\n`);
for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.id}  ${c.detail}\n`);
process.stdout.write(`${"=".repeat(64)}\n`);
process.stdout.write(`结论: ${failed.length === 0 ? "全绿" : `${failed.length} 项 FAIL`}\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
