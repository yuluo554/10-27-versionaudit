#!/usr/bin/env node
/**
 * 样例生成器 + 两态守门（`plan/04` §五）。
 *
 * 两个通路：
 *   `node tools/gen-examples.mjs`          → 重新生成 `examples/report.json` / `report.sarif`
 *   `node tools/gen-examples.mjs --check`  → 重生成到临时目录，与冻结产物**逐字节**比对
 *
 * 为什么必须两层：只断言"盘上冻结产物形态正确"的守门，在**生成器被改坏**时照样绿
 * （因为被测对象是生成器，断言读的却是它上次的产出）。`--check` 通路的自检
 * **挂在 build() 末尾**而不是 `__main__` 里 —— 否则 CI 走 build() 时自检从没执行过。
 *
 * 确定性：产物不含时间戳/主机名/绝对路径；LF 结尾；两次生成逐字节相同。
 */

import { existsSync, readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/cli/args.mjs";
import { run } from "../src/cli/main.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "fixtures", "vectors", "M2-lock-manifest", "input");
const EXAMPLES = join(ROOT, "examples");

/** 生成两份样例，返回 { path: content }。 */
async function build() {
  const outputs = {};
  for (const [file, format] of [
    ["report.json", "json"],
    ["report.sarif", "sarif"],
  ]) {
    const parsed = await parseArgs(["audit", FIXTURE, `--format=${format}`]);
    let captured = "";
    await run(parsed, {
      stdout: (s) => {
        captured += s;
      },
      stderr: () => {},
    });
    outputs[file] = captured;
  }

  // 自检挂在 build() 末尾（不是 __main__）：`--check` 也走 build()，否则自检在门下从没跑过
  selfCheck(outputs);
  return outputs;
}

function selfCheck(outputs) {
  const json = outputs["report.json"];
  const sarif = outputs["report.sarif"];

  if (!json) throw new Error("自检失败：report.json 为空");
  if (!sarif) throw new Error("自检失败：report.sarif 为空");

  // ① 不含时间戳
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(json)) throw new Error("自检失败：report.json 含 ISO 时间戳");
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(sarif)) throw new Error("自检失败：report.sarif 含 ISO 时间戳");

  // ② 不含盘符绝对路径（`https://` 的 `s:/` 不算：要求盘符前是非字母数字）
  const absRe = /(^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s"'/\\]/;
  if (absRe.test(json)) throw new Error("自检失败：report.json 含绝对路径");
  if (absRe.test(sarif)) throw new Error("自检失败：report.sarif 含绝对路径");

  // ③ schema 基本形态
  const report = JSON.parse(json);
  if (report.schemaVersion !== 1) throw new Error("自检失败：schemaVersion 不是 1");
  if (!report.policy) throw new Error("自检失败：缺 policy（灰区必须回显）");

  const s = JSON.parse(sarif);
  if (s.version !== "2.1.0") throw new Error("自检失败：SARIF version 不是 2.1.0");
  if (!Array.isArray(s.runs) || s.runs.length === 0) throw new Error("自检失败：SARIF 无 runs");
  const driver = s.runs[0].tool?.driver;
  if (!driver?.name || !driver?.version || !driver?.informationUri) {
    throw new Error("自检失败：SARIF driver 缺必填字段");
  }

  // ④ 行尾必须是 LF（Windows 文本流会把 \n 翻成 \r\n）
  for (const [name, content] of Object.entries(outputs)) {
    if (content.includes("\r\n")) throw new Error(`自检失败：${name} 含 CRLF`);
    if (!content.endsWith("\n")) throw new Error(`自检失败：${name} 缺结尾换行`);
  }
}

async function main() {
  const check = process.argv.includes("--check");
  for (const arg of process.argv.slice(2)) {
    if (arg !== "--check") {
      process.stderr.write(`gen-examples: unknown argument ${arg}\n`);
      process.exitCode = 2;
      return;
    }
  }

  const outputs = await build();

  if (check) {
    // 重生成到临时目录（这里不需要真写，比对内存即可），与冻结产物逐字节比对
    const problems = [];
    for (const [file, content] of Object.entries(outputs)) {
      const path = join(EXAMPLES, file);
      if (!existsSync(path)) {
        problems.push(`${file}: 冻结产物不存在`);
        continue;
      }
      const frozen = readFileSync(path, "utf8");
      if (frozen !== content) {
        const firstDiff = [...content].findIndex((c, i) => c !== frozen[i]);
        problems.push(`${file}: 与冻结产物不一致（首个差异在字节 ${firstDiff}）`);
      }
    }
    if (problems.length) {
      process.stdout.write(`样例 --check：${problems.length} 项不一致\n`);
      for (const p of problems) process.stdout.write(`FAIL  ${p}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`样例 --check：${Object.keys(outputs).length} 份冻结产物逐字节一致\n`);
    process.exitCode = 0;
    return;
  }

  mkdirSync(EXAMPLES, { recursive: true });
  const tmp = mkdtempSync(join(tmpdir(), "va-examples-"));
  try {
    for (const [file, content] of Object.entries(outputs)) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(join(tmp, file), content, "utf8");
      const target = join(EXAMPLES, file);
      const { renameSync } = await import("node:fs");
      writeFileSync(`${target}.tmp`, content, "utf8");
      renameSync(`${target}.tmp`, target);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write(`样例已生成：${Object.keys(outputs).length} 份 → examples/\n`);
  process.exitCode = 0;
}

main();
