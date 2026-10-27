#!/usr/bin/env node
/**
 * 范围门：仓库不得出现"许可证合规判定"相关能力（`plan/01` 一票否决项之一）。
 *
 * 判据（不读文档语义，只扫**源码与测试**的标识符面）：
 *   1. `src/` 与 `bin/` 里不得出现 `license` / `SPDX` 相关的**判定逻辑**（读字段、分类、合规判定）；
 *   2. 允许出现的是"许可证"这个词在文档里的**边界声明**（README / docs / plan），
 *      以及 `package.json` 的 `license` 字段（npm 包的元数据，不是判定逻辑）。
 *
 * 为什么需要它：题面把"出现许可证相关内容"列为一票否决。一票否决项不能靠自查自觉，
 * 要有可跑红的门 —— 否则某天有人顺手加个 `readLicense()` 没有任何东西会红。
 *
 * 退出码：0 无问题 / 1 有命中 / 2 用法错误。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["src", "bin", "tests", "tools"];
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".mimosa"]);
const SELF = new Set(["tools/check-scope.mjs"]);

/**
 * 只认"能力形态"的 token：读许可证字段、SPDX 标识判定、合规结论。
 * 不认裸词 `license`（`package.json` 的字段名、文档里的边界声明都会出现它）。
 */
const RULES = [
  { id: "license-field-read", re: /\b(?:read|parse|extract|load)License\w*\s*\(/ },
  { id: "spdx-identifier", re: /\bSPDX(?:-|\b)/ },
  { id: "license-classification", re: /\bclassifyLicense\w*\s*\(|\bcomplianceVerdict\w*\s*\(/ },
];

for (const arg of process.argv.slice(2)) {
  process.stderr.write(`check-scope: unknown argument ${arg}\n`);
  process.exit(2);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.(?:mjs|cjs|js|ts|json)$/.test(entry.name)) continue;
    yield join(dir, entry.name);
  }
}

const hits = [];
let scanned = 0;
for (const rel of SCAN_DIRS) {
  const dir = join(ROOT, rel);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const relPath = relative(ROOT, file).split(sep).join("/");
    if (SELF.has(relPath)) continue;
    const text = readFileSync(file, "utf8");
    scanned += 1;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      for (const rule of RULES) {
        if (rule.re.test(lines[i])) {
          hits.push(`${relPath}:${i + 1}: [${rule.id}] ${lines[i].trim().slice(0, 140)}`);
        }
      }
    }
  }
}

if (hits.length > 0) {
  process.stdout.write(`范围门：${hits.length} 处命中（扫了 ${scanned} 个源文件，豁免 ${SELF.size} 份）\n`);
  for (const h of hits) process.stdout.write(`FAIL  ${h}\n`);
  process.exit(1);
}
process.stdout.write(`范围门：扫了 ${scanned} 个源文件，0 处许可证判定能力（豁免 ${SELF.size} 份）\n`);
