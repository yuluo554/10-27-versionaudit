#!/usr/bin/env node
/**
 * 脱敏门：入库文本里不得出现本机痕迹。
 *
 * 四条规则（每条配一组变异，见 `tools/verify-layout-mutations.mjs`）：
 *   absolute-session-path  盘符绝对路径（占位符 `<user>` / `<repo>` 放行）
 *   msys-user-path         `/c/Users/<name>/…` 形态
 *   host-username          本机用户名（换机器改这一行）
 *   loopback-proxy         回环地址 + 端口
 *
 * 四条实测口径：
 *   ① **占位符必须放行**——`C:\Users\<user>\…` 是脱敏后的**正确**写法；
 *   ② **公开镜像不是私有代理**——只认回环/私网；
 *   ③ **门要豁免自己**（它必须写出被判据禁止的字面量），豁免面是**文件集合**，份数要打进结论；
 *   ④ **扫描面 = 仓库内容，不是本地环境**——`.gitignore` 声明的本地产物目录必须有对应 SKIP 项。
 *
 * 退出码：0 零命中 / 1 有命中 / 2 用法错误。
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** 自豁免面 = 文件集合（同时存在 .mjs / .py 两版门时只豁免一个会让另一个假红）。 */
const SELF = new Set(["tools/check-desensitized.mjs"]);

const SKIP_DIRS = new Set([
  ".git",
  ".tmp",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".venv",
  "_scratch",
  ".pytest_cache",
  ".mimosa",
  // 二次迭代交接物（`.gitignore` 同步 ignore 它）。两处**成对**：只 ignore 不 skip 会让门
  // 继续扫交接物里的实测路径；只 skip 不 ignore 会让交接物随提交进公共仓（DEC4=甲）。
  "update",
]);
const SKIP_SUFFIXES = [".egg-info", ".dist-info"];
const SKIP_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".zip",
  ".gz",
  ".exe",
  ".dll",
  ".pdf",
  ".woff",
  ".woff2",
]);

const RULES = [
  {
    id: "absolute-session-path",
    // 盘符绝对路径；`<user>` / `<repo>` 这类占位符放行（负向前瞻）
    re: /\b[A-Za-z]:[\\/](?:ProgramData|Users|repos?|projects?|zcode|work)[\\/](?!<)/,
  },
  {
    id: "msys-user-path",
    re: /\/[a-z]\/Users\/(?!<)[A-Za-z0-9._-]+\//,
  },
  {
    id: "host-username",
    // 本机用户名（实测值；换机器时改这一行）
    re: /\bASUS\b/,
  },
  {
    id: "loopback-proxy",
    re: /\b127\.0\.0\.1:\d{2,5}\b/,
  },
];

for (const arg of process.argv.slice(2)) {
  process.stderr.write(`check-desensitized: unknown argument ${arg}\n`);
  process.exit(2);
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue; // 目录形态与 worktree 文件形态一起挡
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_SUFFIXES.some((s) => entry.name.endsWith(s))) continue;
      yield* walk(join(dir, entry.name));
      continue;
    }
    if (!entry.isFile()) continue;
    const dot = entry.name.lastIndexOf(".");
    if (dot >= 0 && SKIP_EXTS.has(entry.name.slice(dot))) continue;
    yield join(dir, entry.name);
  }
}

const hits = [];
let scanned = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (SELF.has(rel)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // 二进制
  scanned += 1;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    for (const rule of RULES) {
      if (rule.re.test(lines[i])) {
        hits.push(`${rel}:${i + 1}: [${rule.id}] ${lines[i].trim().slice(0, 160)}`);
      }
    }
  }
}

if (hits.length > 0) {
  process.stdout.write(`脱敏门：${hits.length} 处命中（扫了 ${scanned} 个文本文件，豁免 ${SELF.size} 份）\n`);
  for (const h of hits) process.stdout.write(`FAIL  ${h}\n`);
  process.exit(1);
}
process.stdout.write(`脱敏门：扫了 ${scanned} 个文本文件，0 命中（豁免 ${SELF.size} 份）\n`);
