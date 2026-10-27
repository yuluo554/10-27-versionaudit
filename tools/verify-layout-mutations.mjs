#!/usr/bin/env node
/**
 * 布局门的变异验证：**每条判据都要被证伪过一次**。
 *
 * 判据 = "一条门里有几个 add(...) 判据，变异清单就要覆盖几个"。
 * 任一组"改坏后仍绿" = 该判据是假门，必须修判据而不是放宽断言。
 *
 * 做法：把仓库复制到临时目录，在副本里改坏一处 → 在那个副本里跑门 → 断言退出码非 0
 * （或对"阴性对照"组断言仍为 0）。**绝不改工作区**（改完还原容易漏，且会污染 git status）。
 *
 * 用法：`node tools/verify-layout-mutations.mjs [--only m03]`
 * 退出码：0 全部符合预期 / 1 有组不符 / 2 用法错误。
 */

import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** 只跳过与判据无关的大目录。
 * **必须连 `node_modules` 一起复制**：布局门的 `LAYOUT.SKELETON` 会真跑 CLI，
 * 而 CLI 依赖钉死的 `semver`——不复制就会让**每一组变异**都因为"CLI 起不来"而变红，
 * 于是阴性对照（L12）假红、其它组"变红"也证明不了任何事（实测踩过）。
 */
const SKIP = new Set([".git", ".mimosa", "dist", "build", "coverage"]);

const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] !== "--only" && process.argv[i - 1] !== "--only") {
    process.stderr.write(`verify-layout-mutations: unknown argument ${process.argv[i]}\n`);
    process.exit(2);
  }
}

function copyRepo() {
  const dest = mkdtempSync(join(tmpdir(), "va-mutation-"));
  cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const rel = relative(ROOT, src);
      if (!rel) return true;
      const top = rel.split(/[\\/]/)[0];
      return !SKIP.has(top);
    },
  });
  return dest;
}

function runGate(dir, gateRel = "tools/check-sprint-layout.mjs") {
  const gate = join(dir, gateRel);
  if (!existsSync(gate)) return { code: 2, out: "门文件不存在" };
  try {
    const out = execFileSync(process.execPath, [gate], { encoding: "utf8", timeout: 60000 });
    return { code: 0, out };
  } catch (error) {
    return { code: typeof error.status === "number" ? error.status : 1, out: `${error.stdout ?? ""}` };
  }
}

/** 改文件并**断言字节真的变了**（防"变异退化成 no-op 却看起来变绿"）。 */
function edit(dir, rel, fn) {
  const path = join(dir, rel);
  if (!existsSync(path)) throw new Error(`变异靶子不存在: ${rel}`);
  const before = readFileSync(path, "utf8");
  const after = fn(before);
  if (after === before) throw new Error(`变异未产生字节变化: ${rel}（靶子没匹配上）`);
  writeFileSync(path, after, "utf8");
}

function remove(dir, rel) {
  const path = join(dir, rel);
  if (!existsSync(path)) throw new Error(`变异靶子不存在: ${rel}`);
  rmSync(path, { recursive: true, force: true });
}

/** 从副本里取"某个已 ✅ 的里程碑号"，用于构造状态冲突。 */
function doneMilestone(dir) {
  const text = readFileSync(join(dir, "plan", "00-README总览.md"), "utf8");
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("里程碑") && l.includes("状态"));
  if (headerIdx < 0) throw new Error("plan/00 找不到里程碑状态表");
  for (let i = headerIdx + 2; i < lines.length; i += 1) {
    if (!lines[i].startsWith("|")) break;
    const m = /^\|\s*\*{0,2}M(\d+)\b/.exec(lines[i]);
    if (!m) continue;
    const pending = ["⬜", "🟡"].some((mark) => lines[i].includes(mark));
    if (!pending) return Number(m[1]);
  }
  throw new Error("找不到任何已 ✅ 的里程碑（表结构变了？）");
}

/**
 * 两态探测（假门族 ⑭）：状态冲突的变异靶子要在"有待办"和"全部完成"两种态下都构得出来。
 *  - 有待办里程碑 → 在一个副本里把它翻成 ✅（跨副本不一致）
 *  - 全部已完成   → 在一个副本里把一条 ✅ 翻回 ⬜（同一类故障）
 * 两个分支都断言"字节真的变了"。
 */
function mutateStatusConflict(dir) {
  const text = readFileSync(join(dir, "plan", "00-README总览.md"), "utf8");
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("里程碑") && l.includes("状态"));
  if (headerIdx < 0) throw new Error("plan/00 找不到里程碑状态表");

  let pendingRow = -1;
  let doneRow = -1;
  for (let i = headerIdx + 2; i < lines.length; i += 1) {
    if (!lines[i].startsWith("|")) break;
    if (!/^\|\s*\*{0,2}M(\d+)\b/.test(lines[i])) continue;
    const isPending = ["⬜", "🟡"].some((mark) => lines[i].includes(mark));
    if (isPending && pendingRow < 0) pendingRow = i;
    else if (!isPending && doneRow < 0) doneRow = i;
  }

  if (pendingRow >= 0) {
    const before = lines[pendingRow];
    lines[pendingRow] = before.replace(/[⬜🟡]/g, "✅");
    if (lines[pendingRow] === before) throw new Error("有待办行但翻转未改变字节");
    writeFileSync(join(dir, "plan", "00-README总览.md"), lines.join("\n"), "utf8");
  } else if (doneRow >= 0) {
    const before = lines[doneRow];
    lines[doneRow] = before.replace(/✅/g, "⬜");
    if (lines[doneRow] === before) throw new Error("全完成态但翻回未改变字节");
    writeFileSync(join(dir, "plan", "00-README总览.md"), lines.join("\n"), "utf8");
  } else {
    throw new Error("状态表里既无待办行也无已完成行");
  }
}

const GROUPS = [
  {
    id: "L1-files",
    desc: "删 AGENTS.md → LAYOUT.FILES 红",
    expect: "red",
    mutate: (dir) => remove(dir, "AGENTS.md"),
  },
  {
    id: "L1b-plan-suite",
    desc: "删一份 plan/0<k> → LAYOUT.FILES 红",
    expect: "red",
    mutate: (dir) => remove(dir, "plan/03-模块详设.md"),
  },
  {
    id: "L2-binding",
    desc: "删 plan/00 顶部整行装订行（整行移除） → LAYOUT.BINDING 红",
    expect: "red",
    mutate: (dir) =>
      edit(dir, "plan/00-README总览.md", (t) =>
        t
          .split("\n")
          .filter((l) => !(l.startsWith(">") && l.includes("ai-tool-project-sprint")))
          .join("\n"),
      ),
  },
  {
    id: "L3-sections",
    desc: "删 plan/03 的「契约冻结」小节 → LAYOUT.SECTIONS 红",
    expect: "red",
    mutate: (dir) => edit(dir, "plan/03-模块详设.md", (t) => t.replace(/##\s*契约冻结/g, "## 其它")),
  },
  {
    id: "L4-status",
    desc: "在一个副本里翻转一个里程碑状态（两态探测） → LAYOUT.STATUS 红",
    expect: "red",
    mutate: mutateStatusConflict,
  },
  {
    id: "L5-handoffs",
    desc: "删一份交接单 → LAYOUT.HANDOFFS 红（靶子动态选：取实际存在的第一份）",
    expect: "red",
    mutate: (dir) => {
      // 靶子动态选取（假门族 ⑪）：M0 被豁免、后续里程碑可能尚无交接单，
      // 所以不能写死 `HANDOFF-M0`，而是枚举"已 ✅ 且已有交接单"的里程碑取最小者。
      const candidates = readdirSync(join(dir, "plan"))
        .filter((f) => /^HANDOFF-M\d+\.md$/.test(f))
        .sort();
      if (candidates.length === 0) {
        throw new Error("没有任何交接单可作靶子（本轮 HANDOFFS 判据实际是空转）");
      }
      remove(dir, `plan/${candidates[0]}`);
    },
  },
  {
    id: "L6-gaps",
    desc: "把已 ✅ 的里程碑写回 plan/06 的缺口格 → LAYOUT.GAPS 红",
    expect: "red",
    mutate: (dir) => {
      const m = doneMilestone(dir);
      edit(dir, "plan/06-交付对标与决策.md", (t) => {
        const lines = t.split("\n");
        const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("缺口"));
        if (headerIdx < 0) throw new Error("plan/06 找不到缺口表");
        const col = lines[headerIdx].split("|").length - 2;
        for (let i = headerIdx + 2; i < lines.length; i += 1) {
          if (!lines[i].startsWith("|")) break;
          const cells = lines[i].split("|");
          cells[col] = ` 待 M${m} 复核 `;
          lines[i] = cells.join("|");
          return lines.join("\n");
        }
        throw new Error("缺口表没有数据行");
      });
    },
  },
  {
    id: "L7-ledger",
    desc: "把台账里某条 ✅ 行改成 `⬜ 待 M<k>` → LAYOUT.LEDGER 红",
    expect: "red",
    mutate: (dir) => {
      const m = doneMilestone(dir);
      edit(dir, "plan/00-README总览.md", (t) => {
        const lines = t.split("\n");
        const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("承诺") && l.includes("状态"));
        if (headerIdx < 0) throw new Error("找不到承诺-证据台账表头");
        for (let i = headerIdx + 2; i < lines.length; i += 1) {
          if (!lines[i].startsWith("|")) break;
          const cells = lines[i].split("|");
          const statusIdx = cells.length - 2;
          if (cells[statusIdx].includes("✅")) {
            cells[statusIdx] = ` ⬜ 待 M${m} `;
            lines[i] = cells.join("|");
            return lines.join("\n");
          }
        }
        throw new Error("台账里没有 ✅ 行可作靶子");
      });
    },
  },
  {
    id: "L8-doc-tools",
    desc: "在 AGENTS.md 里点名一个不存在的 tools 脚本 → LAYOUT.DOC_TOOLS 红",
    expect: "red",
    mutate: (dir) =>
      edit(dir, "AGENTS.md", (t) => `${t}\n\n参考：\`node tools/this-does-not-exist.mjs\`\n`),
  },
  {
    id: "L9-skeleton",
    desc: "把 bin/versionaudit.mjs 的版本输出改坏 → LAYOUT.SKELETON 红",
    expect: "red",
    mutate: (dir) => {
      // 直接改 package.json 版本（CLI 读它）→ 版本会跟着变；正解是改坏 CLI 自己
      edit(dir, "bin/versionaudit.mjs", (t) => t.replace("import { run }", "import { run as runX }"));
      // 这个改动会让 CLI 崩（runX 未定义），--version 失败 → SKELETON 红
    },
  },
  {
    id: "L10-release",
    desc: "把发布里程碑翻 ✅ 但保留缺档（构造『已发布却无留档』） → LAYOUT.RELEASE 红",
    expect: "red",
    mutate: (dir) => {
      // 在 plan/00 的 M6 行把它翻成 ✅（唯一副本即可触发 RELEASE 判据）
      edit(dir, "plan/00-README总览.md", (t) => {
        const lines = t.split("\n");
        const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("里程碑") && l.includes("状态"));
        for (let i = headerIdx + 2; i < lines.length; i += 1) {
          if (!lines[i].startsWith("|")) break;
          if (!/^\|\s*\*{0,2}M6\b/.test(lines[i])) continue;
          const before = lines[i];
          lines[i] = before.replace(/[⬜🟡]/g, "✅");
          if (lines[i] === before) throw new Error("M6 行没有未完成标记，翻转无变化");
          return lines.join("\n");
        }
        throw new Error("plan/00 找不到 M6 行");
      });
    },
  },
  {
    id: "L11-noop-guard",
    desc: "变异不产生字节变化时必须报错（防假变异）—— 本组预期为 SKIP（无法构造）",
    expect: "skip",
    mutate: () => {
      throw new Error("SKIP");
    },
  },
  {
    id: "L12-doc-gaps-file-ref",
    desc: "缺口格写「✅ 已完成（见 plan/RELEASE-M6.md）」→ 必须**放行**（阴性对照：剥文件名）",
    expect: "green",
    mutate: (dir) => {
      // 先让 M6 未 ✅（否则 RELEASE 判据会因缺档报红，混淆归因）
      edit(dir, "plan/06-交付对标与决策.md", (t) => {
        const lines = t.split("\n");
        const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("缺口"));
        if (headerIdx < 0) throw new Error("plan/06 找不到缺口表");
        for (let i = headerIdx + 2; i < lines.length; i += 1) {
          if (!lines[i].startsWith("|")) break;
          const cells = lines[i].split("|");
          cells[cells.length - 2] = " ✅ 已完成（见 `plan/RELEASE-M1.md`） ";
          lines[i] = cells.join("|");
          return lines.join("\n");
        }
        throw new Error("缺口表没有数据行");
      });
    },
  },
  // ── 夹具卫生判据的变异（目标门是 check-vectors，用组内 `gate` 指定） ─────────────
  // 这几组证明"夹具卫生"这条不是装饰：去掉 private / 加 install 钩子 / 把 fixtures 收进
  // workspaces，三种都会让夹具真的被安装 —— 必须变红。
  {
    id: "V1-fixture-not-private",
    gate: "tools/check-vectors.mjs",
    desc: "把 R2 夹具的 private 去掉 → 夹具卫生红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/vectors/R2-wildcard-latest/input/package.json", (t) => {
        const next = t.replace(/\s*"private":\s*true,?/, "");
        if (next === t) throw new Error("夹具里没有 private: true（已红？）");
        return next;
      });
    },
  },
  {
    id: "V2-fixture-install-hook",
    gate: "tools/check-vectors.mjs",
    desc: "给夹具加 postinstall 脚本 → 夹具卫生红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/vectors/R1-no-upper-bound/input/package.json", (t) => {
        const parsed = JSON.parse(t);
        parsed.scripts = { postinstall: "node -e \"process.exit(0)\"" };
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  {
    id: "V3-fixtures-in-workspaces",
    gate: "tools/check-vectors.mjs",
    desc: "根 package.json 的 workspaces 收编 fixtures → 夹具卫生红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "package.json", (t) => {
        const parsed = JSON.parse(t);
        parsed.workspaces = ["fixtures/vectors/*"];
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  {
    id: "V4-vector-expected-missing",
    gate: "tools/check-vectors.mjs",
    desc: "删掉一个向量的 expected.json → 向量门红",
    expect: "red",
    mutate: (dir) => remove(dir, "fixtures/vectors/R7-build-metadata/expected.json"),
  },
  {
    id: "V5-vector-exit-mismatch",
    gate: "tools/check-vectors.mjs",
    desc: "把某向量的 exitCode 改错 → 向量门红（端到端断言真在跑）",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/vectors/R5-empty-intersection/expected.json", (t) => {
        const parsed = JSON.parse(t);
        parsed.exitCode = 0; // 实际是 1
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
];

const results = [];
for (const group of GROUPS) {
  if (only && !group.id.startsWith(only)) continue;
  if (group.expect === "skip") {
    results.push({ ...group, actual: "skip", ok: true });
    continue;
  }
  const dir = copyRepo();
  try {
    group.mutate(dir);
    const { code, out } = runGate(dir, group.gate);
    let actual;
    if (group.expect === "red") actual = code !== 0 ? "red" : "green";
    else actual = code === 0 ? "green" : "red";
    const ok = actual === group.expect;
    results.push({ ...group, actual, ok, out });
  } catch (error) {
    results.push({ ...group, actual: `error: ${error.message}`, ok: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

process.stdout.write("布局门变异验证（每条判据必须被证伪过一次）\n");
process.stdout.write(`${"=".repeat(64)}\n`);
for (const r of results) {
  const label = r.ok ? "OK  " : "FAIL";
  process.stdout.write(`${label}  ${r.id.padEnd(22)} 预期=${r.expect.padEnd(6)} 实际=${String(r.actual).slice(0, 60)}  ${r.desc}\n`);
}
process.stdout.write(`${"=".repeat(64)}\n`);

const failed = results.filter((r) => !r.ok);
const reds = results.filter((r) => r.expect === "red").length;
const greens = results.filter((r) => r.expect === "green").length;
process.stdout.write(`共 ${results.length} 组：应红 ${reds} / 阴性对照 ${greens} / 跳过 ${results.length - reds - greens}\n`);
process.stdout.write(`结论: ${failed.length === 0 ? "全部符合预期" : `${failed.length} 组不符`}\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
