#!/usr/bin/env node
/**
 * Workflow 门：本地解析 `.github/workflows/*.yml`，在**推送前**抓出会让 GitHub
 * "不建 job"的形态。
 *
 * 为什么必须本地抓（references 阶段 7 D 条实测）：
 *   step 的 `name:` 里含**裸 `: `**（冒号+空格）会让 YAML 把整行读成映射键，
 *   于是 GitHub 直接不建 job —— run 显示 failure 而 `jobs=0`，**文件字节与语法都正常**。
 *   首次 push 才会发现，且现象与"代码缺陷"完全同形。
 *
 * 判据：
 *   1. 每个 workflow 文件能被严格 YAML 解析成对象（不用 YAML 库时做最小缩进/键形态检查）；
 *   2. 顶层必有 `on:` 与 `jobs:`；
 *   3. 每个 job 必须有 `runs-on`；
 *   4. **所有 `name:` 值不得含裸 `: `**（要么加引号，要么改用全角冒号）；
 *   5. 不得出现 `container.options` 里带 `--network none`（与 Actions 的 job 容器互斥）。
 *
 * 退出码：0 全绿 / 1 有 FAIL / 2 用法错误。
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WF_DIR = join(ROOT, ".github", "workflows");

for (const arg of process.argv.slice(2)) {
  process.stderr.write(`check-workflows: unknown argument ${arg}\n`);
  process.exit(2);
}

const problems = [];
let scanned = 0;

if (!existsSync(WF_DIR)) {
  problems.push(".github/workflows 目录不存在");
} else {
  const files = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();
  if (files.length === 0) problems.push(".github/workflows 下 0 个 workflow 文件（判据空转）");

  for (const file of files) {
    scanned += 1;
    const text = readFileSync(join(WF_DIR, file), "utf8");
    const lines = text.split("\n");

    // ① 顶层键
    if (!/^on:/m.test(text)) problems.push(`${file}: 缺顶层 on:`);
    if (!/^jobs:/m.test(text)) problems.push(`${file}: 缺顶层 jobs:`);

    // ② `name:` 值里的裸 `: `（会把该行读成映射 → jobs=0）
    for (let i = 0; i < lines.length; i += 1) {
      const m = /^(\s*(?:-\s+)?)name:\s*(.+)$/.exec(lines[i]);
      if (!m) continue;
      const value = m[2].trim();
      if (value.startsWith('"') || value.startsWith("'")) continue;
      if (/: /.test(value)) {
        problems.push(`${file}:${i + 1}: name 值含裸 ": "（GitHub 会不建 job）：${value.slice(0, 80)}`);
      }
    }

    // ③ 每个 job 必须有 runs-on
    const jobNames = [];
    let inJobs = false;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^jobs:\s*$/.test(lines[i])) {
        inJobs = true;
        continue;
      }
      if (!inJobs) continue;
      if (/^\S/.test(lines[i]) && !/^jobs:\s*$/.test(lines[i])) {
        inJobs = false;
        continue;
      }
      const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
      if (m) jobNames.push({ name: m[1], line: i + 1 });
    }
    for (const job of jobNames) {
      // 在该 job 的块里找 runs-on
      let hasRunsOn = false;
      for (let j = job.line; j < lines.length; j += 1) {
        if (j > job.line && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(lines[j])) break;
        if (/^\s+runs-on:/.test(lines[j])) {
          hasRunsOn = true;
          break;
        }
      }
      if (!hasRunsOn) problems.push(`${file}:${job.line}: job "${job.name}" 缺 runs-on`);
    }

    // ④ `--network none` 不得写进 job 容器的 options（与 Actions 容器模型互斥）
    if (/container:/.test(text) && /--network\s+none/.test(text)) {
      const containerIdx = lines.findIndex((l) => /^\s+container:/.test(l));
      if (containerIdx >= 0) {
        for (let j = containerIdx; j < Math.min(containerIdx + 8, lines.length); j += 1) {
          if (/--network\s+none/.test(lines[j])) {
            problems.push(
              `${file}:${j + 1}: --network none 写进了 job 容器的 options（docker 互斥，实测 Exit 125）；改用嵌套 docker run`,
            );
          }
        }
      }
    }
  }
}

process.stdout.write("Workflow 门（推送前抓『不建 job』的形态）\n");
process.stdout.write(`${"=".repeat(64)}\n`);
process.stdout.write(`扫了 ${scanned} 个 workflow 文件\n`);
for (const p of problems) process.stdout.write(`FAIL  ${p}\n`);
if (problems.length === 0) process.stdout.write("PASS  顶层键齐 / name 无裸冒号 / 每个 job 有 runs-on / 无容器网络互斥\n");
process.stdout.write(`${"=".repeat(64)}\n`);
process.stdout.write(`结论: ${problems.length === 0 ? "全绿" : `${problems.length} 项 FAIL`}\n`);
process.exitCode = problems.length === 0 ? 0 : 1;
