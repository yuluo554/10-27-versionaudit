#!/usr/bin/env node
/**
 * 溯源门：每条规则/状态都必须能在 `data/README.md` 找到依据锚点。
 *
 * 判据（D 栏 20 分的机器化）：
 *   1. `src/policy/severity.mjs` 的默认档位表里，每个键都必须在 `data/README.md` 出现过
 *      （M1 规则 `R1`–`R8`、M2 kind、M3 状态、M4 kind）；
 *   2. 每个 `fixtures/vectors/*` 目录必须有 `expected.json` 且含 `sources` 字段
 *      （指向 `data/README.md` 的 A 编号或章节），空数组即 FAIL；
 *   3. `data/README.md` 的 §7 数值口径小节必须存在（唯一定义处不能再搬走）。
 *
 * 为什么需要它：`plan/01` D 栏要求"每条语义断言可追溯"。这句话如果没有门，
 * 靠人读永远看不出漏了哪条 —— 这正是 references「交付文档里'覆盖了多少'必须由机器核」。
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

for (const run of [checkSeverityKeys, checkVectorSources, checkNumbersSection]) {
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
