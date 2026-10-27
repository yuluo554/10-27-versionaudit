#!/usr/bin/env node
/**
 * 向量门：`fixtures/vectors/` 的 12 个目录齐备，且每个都有非空断言。
 *
 * 这是"交付文档里'覆盖了多少'这类声称必须由机器核"的具体落法（references M6 收尾条）：
 * `plan/01` §8 声明 12 组向量，如果少了一组**没有任何东西会红**。
 *
 * 判据：
 *   1. 12 个目录名逐一在位（缺与多都报）；
 *   2. 每目录有 `input/package.json` + `input/package-lock.json` + `expected.json`；
 *   3. `expected.json` 的 `mustContain` 非空（空数组 = "断言了全世界"）；
 *   4. 把 `input/` 真跑一次 CLI，断言退出码与 `exitCode` 一致（端到端，不是只读文件）。
 *
 * 退出码：0 全绿 / 1 有 FAIL / 2 用法错误。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : null);

for (const arg of process.argv.slice(2)) {
  process.stderr.write(`check-vectors: unknown argument ${arg}\n`);
  process.exit(2);
}

/** `plan/01` §8 声明的 12 组向量（这里是"分母"，不写字面数字 —— 由目录清单算出）。 */
const REQUIRED_VECTORS = [
  "R1-no-upper-bound",
  "R2-wildcard-latest",
  "R3-caret-zero",
  "R4-prerelease-unreachable",
  "R5-empty-intersection",
  "R6-or-branch-subsumed",
  "R7-build-metadata",
  "R8-bare-version-cross-ecosystem",
  "M2-lock-manifest",
  "M3-ms-duplicate",
  "M4-peer-minimal-set",
  "M5-exit-codes",
];

const vectorsDir = join(ROOT, "fixtures", "vectors");
const present = existsSync(vectorsDir)
  ? readdirSync(vectorsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

const missing = REQUIRED_VECTORS.filter((v) => !present.includes(v));
const extra = present.filter((v) => !REQUIRED_VECTORS.includes(v));

const problems = [];
let verified = 0;

for (const name of REQUIRED_VECTORS) {
  if (!present.includes(name)) continue;
  const inputDir = join(vectorsDir, name, "input");
  for (const file of ["package.json", "package-lock.json"]) {
    if (!existsSync(join(inputDir, file))) problems.push(`${name}: 缺 input/${file}`);
  }
  const expectedPath = join(vectorsDir, name, "expected.json");
  if (!existsSync(expectedPath)) {
    problems.push(`${name}: 缺 expected.json`);
    continue;
  }
  let expected;
  try {
    expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  } catch {
    problems.push(`${name}: expected.json 不是合法 JSON`);
    continue;
  }
  if (!Array.isArray(expected.mustContain) || expected.mustContain.length === 0) {
    problems.push(`${name}: mustContain 为空（"断言了全世界"）`);
  }
  if (!Array.isArray(expected.sources) || expected.sources.length === 0) {
    problems.push(`${name}: sources 为空（无来源的断言）`);
  }
  if (typeof expected.exitCode !== "number") {
    problems.push(`${name}: exitCode 必须是数字`);
  }
  verified += 1;
}

// 端到端：把有 input 的向量真跑一次，断言退出码与 expected 一致
let e2eRun = 0;
for (const name of REQUIRED_VECTORS) {
  if (!present.includes(name)) continue;
  const inputDir = join(vectorsDir, name, "input");
  const expectedPath = join(vectorsDir, name, "expected.json");
  if (!existsSync(inputDir) || !existsSync(expectedPath)) continue;
  let expected;
  try {
    expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  } catch {
    continue;
  }
  if (typeof expected.exitCode !== "number") continue;
  const bin = join(ROOT, "bin", "versionaudit.mjs");
  let actual;
  try {
    execFileSync(process.execPath, [bin, "audit", inputDir, "--format=json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    actual = 0;
  } catch (error) {
    actual = typeof error.status === "number" ? error.status : -1;
  }
  e2eRun += 1;
  if (actual !== expected.exitCode) {
    problems.push(`${name}: 退出码 ${actual} ≠ expected ${expected.exitCode}`);
  }
}

process.stdout.write("向量门（12 组差分向量）\n");
process.stdout.write(`${"=".repeat(64)}\n`);
process.stdout.write(`声明向量 ${REQUIRED_VECTORS.length} 组 / 实际目录 ${present.length} 组\n`);
if (missing.length) process.stdout.write(`FAIL  缺: ${missing.join(", ")}\n`);
if (extra.length) process.stdout.write(`FAIL  多（未声明）: ${extra.join(", ")}\n`);
for (const p of problems) process.stdout.write(`FAIL  ${p}\n`);
if (problems.length === 0 && missing.length === 0 && extra.length === 0) {
  process.stdout.write(`PASS  ${verified} 组向量齐备；端到端跑通 ${e2eRun} 组，退出码全对\n`);
}
process.stdout.write(`${"=".repeat(64)}\n`);

// 分母由清单算出，不写死
process.stdout.write(`覆盖：${verified} / ${REQUIRED_VECTORS.length}\n`);
const failed = problems.length > 0 || missing.length > 0 || extra.length > 0;
process.stdout.write(`结论: ${failed ? `${problems.length + missing.length + extra.length} 项 FAIL` : "全绿"}\n`);
process.exitCode = failed ? 1 : 0;
