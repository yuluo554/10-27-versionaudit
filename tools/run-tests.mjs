#!/usr/bin/env node
/**
 * 跨 Node 主版本可移植的测试跑法（M6 首推实测缺陷的修复）。
 *
 * 为什么不能直接用 `node --test`：
 *   - `node --test "tests/**\/*.test.mjs"` —— **glob 形态是 Node 21 才加的**，
 *     在 Node 20 上直接报 `Could not find '…tests/**\/*.test.mjs'` 并退出 1。
 *     （CI 首推实测：`test (20)` 红、`test (22)`/`test (24)` 绿，本机 node 24 也绿。）
 *   - `node --test tests/vectors` —— **目录形态在 Node 22+ 已失效**（目录被当成测试文件，
 *     `✖ tests/vectors 'test failed'`）。M1–M5 的交接单里写的"用 glob，别用目录"，
 *     只对 node 22/24 成立；对 node 20 恰好相反。
 *
 * 两种形态各在一个主版本上崩 ⇒ 判据不能依赖任何一种。正解 = **自己枚举文件**，
 * 再把**显式文件列表**交给 `node --test`（这条通路在 18/20/22/24 上都成立）。
 *
 * 退出码：0 全绿 / 1 有测试失败 / 2 用法错误或无文件匹配（**不许静默空跑**）。
 * 空匹配必须是非 0：否则"跑零个测试"会看起来像"全绿"，而变异门会把它当成
 * "预期红"平凡通过（假绿）。`-e` 的变异组 `H27` 钉住这条。
 *
 * 最后一行 stderr 是**机读串**：`run-tests: files=N exit=K patterns=…`。
 * 需要"这轮真扫到了东西"的调用方（如变异门的预检）解析它，别去猜输出格式。
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PATTERNS = ["tests/**/*.test.mjs"];

/** `**` 跨目录、`*` 不跨目录（只支持本仓库用到的两种元字符，不做通用 glob 库）。 */
function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        i += 1;
        if (pattern[i + 1] === "/") {
          i += 1;
          re += "(?:[^/]+/)*";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(ch)) {
      re += `\\${ch}`;
    } else {
      re += ch;
    }
  }
  return new RegExp(`^${re}$`);
}

/** 递归收集文件，返回 POSIX 风格相对路径（Windows 的 `\` 一律换成 `/` 再匹配）。 */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full).split(sep).join("/"));
  }
  return out;
}

function main() {
  const patterns = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("-")) {
      process.stderr.write(`run-tests: unknown option ${arg}（只接受 glob 位置参数）\n`);
      return 2;
    }
  }

  const usePatterns = patterns.length ? patterns : DEFAULT_PATTERNS;

  // ① **字面路径**（无元字符）：直接当文件收，不经 glob 匹配。
  //    为什么要这条通路：守门测试要用**树外**临时测试文件证明"真被执行过"，
  //    而树外路径无法用 `tests/**` 这类相对 glob 表达。
  const literal = [];
  const globs = [];
  for (const p of usePatterns) {
    if (p.includes("*") || p.includes("?")) {
      globs.push(p);
    } else {
      const full = resolve(ROOT, p);
      if (existsSync(full) && statSync(full).isFile()) literal.push(full);
      else if (existsSync(full) && statSync(full).isDirectory()) {
        // 目录形态**故意不支持**：Node 22+ 已把目录当测试文件而恒红，Node 20 却支持，
        // 依赖它会得到"换个主版本就崩"的判据。让调用方显式写 glob 或文件。
        process.stderr.write(`run-tests: ${p} 是目录（不支持目录形态，请写 glob 或具体文件）\n`);
        process.stderr.write(`run-tests: files=0 exit=2 patterns=${usePatterns.join(",")}\n`);
        return 2;
      }
    }
  }

  // ② **glob 形态**：在 tests/ 下自己枚举（不交给 `node --test`，那条通路跨版本不一致）。
  const matched = [];
  if (globs.length) {
    const testDir = join(ROOT, "tests");
    let files = [];
    try {
      statSync(testDir);
      files = walk(testDir);
    } catch {
      files = [];
    }
    const res = globs.map(globToRegExp);
    matched.push(...files.filter((rel) => res.some((re) => re.test(rel))).map((rel) => join(ROOT, rel)));
  }

  const all = [...new Set([...literal, ...matched])].sort();
  if (all.length === 0) {
    process.stderr.write(`run-tests: 0 个文件匹配 ${JSON.stringify(usePatterns)}（空跑不算通过）\n`);
    process.stderr.write(`run-tests: files=0 exit=2 patterns=${usePatterns.join(",")}\n`);
    return 2;
  }

  let code = 0;
  try {
    // **必须剥掉 `NODE_TEST_CONTEXT`**（M6 首推回归实测到的第三种空转形态）：
    // 本 runner 自己可能就运行在 `node --test` 里（守门测试会这样调它），而 node:test 把
    // 该变量传给子进程后，子进程的 `node --test` 会判成"嵌套递归调用"→
    // 打印 `Warning: node:test run() is being called recursively within a test file.
    // skipping running files.` 并 **退出码 0**：一个测试文件都没跑，却报成功。
    // 这正是"看起来绿、其实空转"，与"空匹配必须非 0"同族，故一并钉在 H27 里。
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["--test", ...all], { cwd: ROOT, stdio: "inherit", env });
  } catch (error) {
    code = typeof error.status === "number" ? error.status : 1;
  }
  process.stderr.write(`run-tests: files=${all.length} exit=${code} patterns=${usePatterns.join(",")}\n`);
  return code;
}

process.exitCode = main();
