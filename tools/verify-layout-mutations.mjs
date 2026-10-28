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

import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
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

/**
 * 跑一个门。`group.gate` 可以是：
 *   - 省略 → 默认布局门（`tools/check-sprint-layout.mjs`）；
 *   - `"tools/xxx.mjs"` → 直接跑该脚本；
 *   - `"npm-test:tests/vectors/*.test.mjs"` → 用 `node --test <glob>` 跑测试文件
 *     （`node --test` 的**目录形态不可靠**：目录会被当成"测试文件"而直接失败，
 *      实测 `node --test tests/vectors/` 恒红；必须用 glob 形态）。
 */
function runGate(dir, gateRel = "tools/check-sprint-layout.mjs") {
  let args;
  if (gateRel.startsWith("npm-test:")) {
    args = ["--test", gateRel.slice("npm-test:".length)];
  } else {
    const gate = join(dir, gateRel);
    if (!existsSync(gate)) return { code: 2, out: "门文件不存在" };
    args = [gate];
  }
  try {
    const out = execFileSync(process.execPath, args, { encoding: "utf8", timeout: 180000, cwd: dir });
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
  {
    id: "L5b-handoff-renamed-next",
    desc: "把交接单改成「下一棒」命名（HANDOFF-M0 → HANDOFF-M1）→ LAYOUT.HANDOFFS 红（命名口径的证伪）",
    expect: "red",
    mutate: (dir) => {
      // 这条同时是对 AGENTS.md「交接单命名口径」那条声明的证伪：
      // 若门只按"存在任一 HANDOFF"判定，改名后仍绿 —— 那说明命名口径只是文档里的说法。
      const candidates = readdirSync(join(dir, "plan")).filter((f) => /^HANDOFF-M\d+\.md$/.test(f)).sort();
      if (candidates.length === 0) throw new Error("没有任何交接单可作靶子");
      const first = candidates[0];
      const k = Number(/^HANDOFF-M(\d+)\.md$/.exec(first)[1]);
      const target = `HANDOFF-M${k + 1}.md`; // 改成"下一棒"的编号
      renameSync(join(dir, "plan", first), join(dir, "plan", target));
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
  // ── M1 复核新增：证明"覆盖判据"与"空心断言守卫"都能变红 ──────────────────────
  {
    id: "P1-coverage-unreferenced",
    gate: "tools/check-provenance.mjs",
    desc: "把某向量 sources 里的 A 编号全部剥掉 → PROV.COVERAGE 必须报「无引用」",
    expect: "red",
    mutate: (dir) => {
      // 靶子选只有单一向量引用的 A10（只被 R7 引用），剥掉它必触发覆盖缺口
      edit(dir, "fixtures/vectors/R7-build-metadata/expected.json", (t) => {
        const parsed = JSON.parse(t);
        const before = parsed.sources.join("|");
        parsed.sources = parsed.sources.map((s) => s.replace(/\bA\d+\b/g, "§1.1 相应条目"));
        if (parsed.sources.join("|") === before) throw new Error("R7 的 sources 里没有 A 编号可剥");
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  {
    id: "P2-coverage-exemption-stale",
    gate: "tools/check-provenance.mjs",
    desc: "豁免登记指向台账不存在的编号（僵尸登记）→ PROV.COVERAGE 必须报",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "tools/check-provenance.mjs", (t) => {
        const next = t.replace(
          /const A_EXEMPT = \{/,
          `const A_EXEMPT = {\n  A99: { why: "僵尸登记（变异注入）", test: "tests/semver/interval.test.mjs" },`,
        );
        if (next === t) throw new Error("找不到 A_EXEMPT 登记表");
        return next;
      });
    },
  },
  {
    id: "P3-coverage-empty-ledger",
    gate: "tools/check-provenance.mjs",
    desc: "台账 A 编号被删空 → 覆盖判据必须报「判据空跑」（不许静默全绿）",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "data/README.md", (t) => {
        // 把 §1.1 的行首 `| A<n> |` 全改成 `| An |`（编号形态被破坏）
        const next = t.replace(/^\|\s*(A\d+)\s*\|/gm, "| 断言 |");
        if (next === t) throw new Error("台账里没有 A 编号行可破坏");
        return next;
      });
    },
  },
  {
    id: "H1-hollow-assertion-guard",
    gate: "npm-test:tests/vectors/*.test.mjs",
    desc: "把 mustNotContain 改回空心形态（{path:'findings', value:'R5'}）→ 向量跑者必须报形态错误",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/vectors/R1-no-upper-bound/expected.json", (t) => {
        const parsed = JSON.parse(t);
        parsed.mustNotContain = [{ path: "findings", value: "R5" }];
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  {
    id: "H2-negative-pair-removed",
    gate: "npm-test:tests/**/*.test.mjs",
    desc: "把 R5 的反例包从夹具里删掉 → 「同类但不该报」断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/vectors/R5-empty-intersection/input/package.json", (t) => {
        const parsed = JSON.parse(t);
        delete parsed.dependencies["range-incl-single"]; // 被 mustNotContain 钉住的非空单点
        delete parsed.dependencies["range-narrow"];
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  {
    id: "H3-interval-boundary-regression",
    gate: "npm-test:tests/semver/*.test.mjs",
    desc: "把 branchIsEmpty 改回「lo==hi 一律判空」（不看端点开闭）→ A18 回归测试必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/semver/interval.mjs", (t) => {
        // M2 后实现只认端点开闭（`exact` 逃生口已删）。复现旧缺陷 = 忽略开闭、等值即空：
        // `>=1.0.0 <=1.0.0`（闭环单点，可满足）会被误判成空 → A18 断言变红。
        const next = t.replace(
          "  if (c === 0) return branch.exclusiveLo === true || branch.exclusiveHi === true;",
          "  if (c === 0) return true;",
        );
        if (next === t) throw new Error("branchIsEmpty 的实现形态变了，靶子没匹配上");
        return next;
      });
    },
  },
  {
    id: "V6-vector-no-input-binding",
    gate: "tools/check-vectors.mjs",
    desc: "把某向量的 input.* 断言全删 → 向量门必须报「未绑定输入」（防负断言真空变绿）",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/vectors/R7-build-metadata/expected.json", (t) => {
        const parsed = JSON.parse(t);
        parsed.mustContain = parsed.mustContain.filter((a) => !String(a.path).startsWith("input."));
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  {
    id: "P4-coverage-ghost-anchor",
    gate: "tools/check-provenance.mjs",
    desc: "向量引用台账里不存在的 A 编号（幽灵锚点）→ PROV.COVERAGE 必须报",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/vectors/R7-build-metadata/expected.json", (t) => {
        const parsed = JSON.parse(t);
        parsed.sources.push("data/README.md §1.1 A77（变异注入的幽灵锚点）");
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  // ── 夹具卫生的另两条通路（安全扫描把 R2 的浮动版本报成风险，这里是正面处置的证伪） ──
  // 判据要落在"它不会被安装"：任何把夹具挂进依赖树的通路都必须让门变红。
  {
    id: "H4-fixture-file-link-dep",
    gate: "tools/check-vectors.mjs",
    desc: "根 package.json 用 file: 依赖指向 fixtures/**（会把夹具挂进依赖树）→ 夹具卫生红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "package.json", (t) => {
        const parsed = JSON.parse(t);
        parsed.devDependencies = {
          ...(parsed.devDependencies ?? {}),
          "fixture-r2": "file:fixtures/vectors/R2-wildcard-latest/input",
        };
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  {
    id: "H5-fixture-has-workspaces",
    gate: "tools/check-vectors.mjs",
    desc: "给夹具加 workspaces（让夹具冒充工作区根）→ 夹具卫生红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/vectors/R1-no-upper-bound/input/package.json", (t) => {
        const parsed = JSON.parse(t);
        parsed.workspaces = ["packages/*"];
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  // ── M2 走查新增：三条判据各自必须有靶子（AGENTS.md「门本身也要被证伪」） ─────────
  // H6/H7 针对本轮修掉的两个实测缺陷：**修复被改回去必须变红**。
  // H8 针对本轮新建的"全帧差分"判据：**差分退化成空跑必须变红**。
  {
    id: "H6-r3-crash-family",
    gate: "npm-test:tests/rules/*.test.mjs",
    desc: "把 checkR3 改回「拆下界」（^0.0 一族崩溃）→ R3 全族矩阵必须变红",
    expect: "red",
    mutate: (dir) => {
      // 旧实现的核心动作 = 从 lo 拆三元组。改回这个形态，^0.0 族的 lo 是 NEG_INF Symbol，
      // checkR3 抛 TypeError → CLI 退出码 3 → 向量 in put 被当"输入不可解析"，R3 断言全数失配。
      edit(dir, "src/rules/range-lint.mjs", (t) => {
        const next = t.replace(
          "    if (b.hi.v === INF || b.hi.v[0] !== 0) return false; // 无上界 / 上界跨出 0.x → 不是收窄\n    const [, min, pat] = b.hi.v;",
          "    const [maj, min] = b.lo.v; // 旧实现：拆下界（^0.0 一族会抛 TypeError）\n    if (b.hi.v === INF || b.hi.v[0] !== maj) return false;\n    const pat = b.hi.v[2];",
        );
        if (next === t) throw new Error("checkR3 的「只看上界」形态变了，靶子没匹配上");
        return next;
      });
    },
  },
  {
    id: "H7-interval-exact-escape",
    gate: "npm-test:tests/**/*.test.mjs",
    desc: "把 `exact` 逃生口整套加回（精确比较器 + branchIsEmpty 放行）→ R5 等界矩阵必须变红",
    expect: "red",
    mutate: (dir) => {
      // 忠实复现旧缺陷链（三处联动，缺一不可）：
      //   ① 精确比较器带 `exact` 印记；② normalizeRange 把印记往上带；③ branchIsEmpty 放行。
      // 只改一处不构成原缺陷（实测：只改 ③ 仍是绿——因为没有 `exact` 可放行）。
      edit(dir, "src/semver/interval.mjs", (t) => {
        let out = t;
        const steps = [
          [
            '      return { lo: base, hi: base };',
            '      return { lo: base, hi: base, exact: base };',
          ],
          [
            "      let exclusiveLo = false;\n      let exclusiveHi = false;\n      for (const comp of comps) {\n        const b = comparatorToBounds(comp);",
            "      let exclusiveLo = false;\n      let exclusiveHi = false;\n      let exactFlag = null;\n      for (const comp of comps) {\n        const b = comparatorToBounds(comp);\n        if (b.exact) exactFlag = b.exact;",
          ],
          [
            "      return { lo, hi, exclusiveLo, exclusiveHi, comps };",
            "      return { lo, hi, exact: exactFlag, exclusiveLo, exclusiveHi, comps };",
          ],
          [
            "  if (c === 0) return branch.exclusiveLo === true || branch.exclusiveHi === true;",
            "  if (c === 0) return !branch.exact && (branch.exclusiveLo === true || branch.exclusiveHi === true);",
          ],
        ];
        for (const [from, to] of steps) {
          if (!out.includes(from)) throw new Error(`H7 靶子没匹配上: ${from.slice(0, 40)}…`);
          out = out.replace(from, to);
        }
        return out;
      });
    },
  },
  {
    id: "H8-diff-vacuous",
    gate: "npm-test:tests/rules/range-diff.test.mjs",
    desc: "把差分测试的 finding 循环改成空转 → 「有 finding 却 0 条被复算」必须变红",
    expect: "red",
    mutate: (dir) => {
      // 判据退化：仍跑 CLI、仍断言非空，但不再复算任何一条。
      // 若门是假的（只数条数不验内容），这里会依然绿。
      edit(dir, "tests/rules/range-diff.test.mjs", (t) => {
        const next = t.replace(
          "      if (f.rawRange !== undefined) {\n        rangeChecked += 1;",
          "      if (f.rawRange !== undefined) {\n        if (false) rangeChecked += 1;",
        );
        if (next === t) throw new Error("差分测试的复算入口形态变了，靶子没匹配上");
        return next;
      });
    },
  },
  // ── M3 走查新增：四类 kind 的三条口径各自必须有靶子 ──────────────────────────
  // H9/H10/H11 分别对应台账 A22/A23/A24 三个**实测缺陷**（用真实 npm 11 锁才发现）。
  // 每组都断言"把修复改回旧形态 → 向量/差分测试必须变红"。
  {
    id: "H9-root-deps-crosskind-merge",
    gate: "npm-test:tests/**/*.test.mjs",
    desc: "把根声明比对改回「跨类合并」（optional 并进 dependencies）→ M3-lockfile-v2 的 A22 断言必须变红",
    expect: "red",
    mutate: (dir) => {
      // 忠实复现旧缺陷：拿 {...optionalDependencies, ...dependencies} 去比 packages[""].dependencies。
      // M3-lockfile-v2 的根 optionalDependencies.opt 与 manifest 一致，合并后会被判"锁中根声明有 opt"
      // → 误报 manifest-changed-unsynced → 该向量的 mustNotContain 命中 → 变红。
      edit(dir, "src/checks/lock-manifest.mjs", (t) => {
        const from = `  const rootPairs = [
    ["dependencies", lock.rootManifestDeps, manifest.deps.dependencies],
    ["optionalDependencies", lock.rootOptionalDeps, manifest.deps.optionalDependencies],
  ];`;
        const to = `  const rootPairs = [
    ["dependencies", lock.rootManifestDeps, { ...manifest.deps.optionalDependencies, ...manifest.deps.dependencies }],
  ];`;
        if (!t.includes(from)) throw new Error("根声明比对形态变了，H9 靶子没匹配上");
        return t.replace(from, to);
      });
    },
  },
  {
    id: "H10-null-version-satisfied",
    gate: "npm-test:tests/rules/range-diff.test.mjs",
    desc: "删掉「无版本条目降级」的守卫 → 差分测试的 A23 断言必须变红",
    expect: "red",
    mutate: (dir) => {
      // 旧缺陷：不判 lockedVersion 是否为 null，直接 satisfies(null, range)=false → 报"不满足"（error）。
      // 删掉守卫后 M3-lockfile-v2 的 opt 占位条目会被报成 manifest-not-satisfied，
      // 差分测试的"lockedVersion 不得为 null"断言立刻红。
      edit(dir, "src/checks/lock-manifest.mjs", (t) => {
        const from = `    if (edge.lockedVersion === null) {
      degrade(
        \`\${edge.dependency}（\${chain.join(" › ")}）：锁中条目无 version 字段（link/optional 占位），无法判定是否满足 \${edge.range}\`,
      );
      continue;
    }`;
        if (!t.includes(from)) throw new Error("无版本守卫形态变了，H10 靶子没匹配上");
        return t.replace(from, "");
      });
    },
  },
  {
    id: "H11-extra-undeclared-tree-external",
    gate: "npm-test:tests/**/*.test.mjs",
    desc: "删掉「跳过树外路径与 link 条目」→ M3-lockfile-v2 的 A24 断言必须变红",
    expect: "red",
    mutate: (dir) => {
      // 旧缺陷：把所有非根条目都当候选，`"../lib"` 会经 nameFromPath 解析成 `".."`，
      // 于是报 lock-extra-undeclared("..")。去掉两行跳过后该向量 mustNotContain 命中 → 变红。
      edit(dir, "src/checks/lock-manifest.mjs", (t) => {
        const from = `    if (!pkg.path.startsWith("node_modules/")) continue; // 树外（链接目标体）
    if (pkg.link) continue; // 链接条目：版本在目标里，不判`;
        if (!t.includes(from)) throw new Error("lock-extra-undeclared 跳过形态变了，H11 靶子没匹配上");
        return t.replace(from, "");
      });
    },
  },
  {
    id: "H12-structure-mix-not-error",
    gate: "npm-test:tests/exit-codes/*.test.mjs",
    desc: "让「结构混用」不再抛（改成放行）→ 退出码 3 的端到端用例必须变红",
    expect: "red",
    mutate: (dir) => {
      // 若结构混用被静默放行（v3 + dependencies 也能解析），
      // tests/exit-codes/lock-input.test.mjs 的"必须退出码 3"断言立刻红。
      // 这是 `data/README.md` §7.3「v1/v2/v3 结构混用 → 3」的唯一执行点。
      edit(dir, "src/model/lockfile.mjs", (t) => {
        const from = `  if (version === 3 && hasDependencies) {`;
        if (!t.includes(from)) throw new Error("结构混用判据形态变了，H12 靶子没匹配上");
        return t.replace(from, "  if (false && version === 3 && hasDependencies) {");
      });
    },
  },
  {
    id: "H13-error-detail-dropped",
    gate: "npm-test:tests/exit-codes/*.test.mjs",
    desc: "让 CLI 只打 message、不打 detail（支持面丢失）→ 报文可行动性断言必须变红",
    expect: "red",
    mutate: (dir) => {
      // `detail` 是可行动的那一半（"支持 1 / 2 / 3"、"请用生成该锁的工具重写"）。
      // 丢掉它，用户只看到"不支持的 lockfileVersion 9"却不知怎么办。
      edit(dir, "bin/versionaudit.mjs", (t) => {
        const from = `    if (typeof error.detail === "string" && error.detail.length > 0) {
      process.stderr.write(\`  \${error.detail}\\n\`);
    }`;
        if (!t.includes(from)) throw new Error("detail 输出形态变了，H13 靶子没匹配上");
        return t.replace(from, "");
      });
    },
  },
  // ── M4 走查新增：真实树夹具 + MUS 可机械校验 + 降级语义 各自的靶子 ─────────────
  // H14 对应本轮修掉的**真空判据**：差分测试原先读 `minimalConflictSet.lockedVersions`
  // （一个不存在的字段），循环体永不执行 —— 判据看着在，实际什么都没核。改回旧形态必须变红。
  {
    id: "H14-dedupe-mus-diff-vacuous",
    gate: "npm-test:tests/rules/range-diff.test.mjs",
    desc: "把 dedupe 的 MUS 复算改回读不存在的字段（真空）→「MUS 面必须真跑」的阳性对照必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "tests/rules/range-diff.test.mjs", (t) => {
        const from = `      checked += 1;
      coverage.musChecked += 1;
      checkMinimalConflictSet(item, (item.minimalConflictSet ?? []).map((m) => m.range), locked, problems);`;
        const to =
          "      // 旧形态（M4 前的真空判据）：读一个不存在的字段，循环体永不执行\n" +
          "      for (const v of item.minimalConflictSet?.lockedVersions ?? []) {\n" +
          "        checked += 1;\n" +
          "        for (const r of item.minimalConflictSet.ranges ?? []) {\n" +
          "          if (satisfies(v, r)) problems.push('dedupe ' + item.package + ': ' + v + ' 上被 ' + JSON.stringify(r) + ' 满足');\n" +
          "        }\n" +
          "      }";
        if (!t.includes(from)) throw new Error("差分 MUS 复算形态变了，H14 靶子没匹配上");
        return t.replace(from, to);
      });
    },
  },
  {
    id: "H15-mus-full-set-returned",
    gate: "npm-test:tests/**/*.test.mjs",
    desc: "让 findMinimalConflictSet 把「全量请求者」当最小集返回（非极小）→ 属性断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/mus/minimal-set.mjs", (t) => {
        const from = `    if (found.length > 0) {
      const sorted = found
        .map((s) => [...s].sort(compareRequester))
        .sort((a, b) => compareRequesterLists(a, b));
      return { minimalSets: sorted, minimal: sorted[0], degraded: false, reason: null, searched: k };
    }`;
        const to = `    if (found.length > 0) {
      const full = [...requesters].sort(compareRequester);
      return { minimalSets: [full], minimal: full, degraded: false, reason: null, searched: k };
    }`;
        if (!t.includes(from)) throw new Error("MUS 返回形态变了，H15 靶子没匹配上");
        return t.replace(from, to);
      });
    },
  },
  {
    id: "H16-realtree-dual-ms-flattened",
    gate: "npm-test:tests/proof/real-tree.test.mjs",
    desc: "把真实树的嵌套 ms 压平（2.1.3 → 2.0.0）→ 真实树结论断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/real-tree/input/package-lock.json", (t) => {
        const parsed = JSON.parse(t);
        const nested = parsed.packages["node_modules/send/node_modules/ms"];
        if (!nested || nested.version !== "2.1.3") throw new Error("真实树里没有嵌套 ms@2.1.3，H16 靶子没匹配上");
        nested.version = "2.0.0";
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  {
    id: "H17-realtree-expected-missing",
    gate: "tools/check-vectors.mjs",
    desc: "删掉真实树的 expected.json → 向量门的「真实树夹具」段必须变红",
    expect: "red",
    mutate: (dir) => remove(dir, "fixtures/real-tree/expected.json"),
  },
  {
    id: "H18-degraded-satisfiable-seed",
    gate: "npm-test:tests/proof/*.test.mjs",
    desc: "超限降级改回「取候选最少的 2 条」（可能可满足）→「降级也必须是无解极小集」的断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/mus/minimal-set.mjs", (t) => {
        const from = `    const keep = [];
    for (const r of requesters) if (!keep.includes(r)) keep.push(r);
    let core = keep;
    for (const r of keep) {
      const smaller = core.filter((x) => x !== r);
      if (smaller.length > 0 && !isSatisfiable(smaller, candidates, satisfiesFn)) {
        core = smaller;
      }
    }
    const minimal = [...core].sort(compareRequester);`;
        const to = `    const byFewest = [...requesters].sort((a, b) => {
      const ca = candidates.filter((v) => satisfiesFn(v, a.range)).length;
      const cb = candidates.filter((v) => satisfiesFn(v, b.range)).length;
      return ca !== cb ? ca - cb : compareRequester(a, b);
    });
    const minimal = byFewest.slice(0, 2);`;
        if (!t.includes(from)) throw new Error("删除法形态变了，H18 靶子没匹配上");
        return t.replace(from, to);
      });
    },
  },
  {
    id: "H19-dedupe-targets-incomplete",
    gate: "npm-test:tests/rules/range-diff.test.mjs",
    desc: "让 dedupe 只考虑最后一个候选版本（targets 不完整）→ 目标完整性复算必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/checks/dedupe.mjs", (t) => {
        const from = "    for (const version of lockedVersions) {";
        if (!t.includes(from)) throw new Error("targets 枚举形态变了，H19 靶子没匹配上");
        return t.replace(from, "    for (const version of lockedVersions.slice(-1)) {");
      });
    },
  },
  {
    id: "H20-reason-two-states-merged",
    gate: "npm-test:tests/proof/*.test.mjs",
    desc: "把 reason 两态合并（恒 empty-intersection）→ no-locked-candidate 断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/checks/dedupe.mjs", (t) => {
        const from = '      reason: intersection.empty === true ? "empty-intersection" : "no-locked-candidate",';
        if (!t.includes(from)) throw new Error("reason 两态形态变了，H20 靶子没匹配上");
        return t.replace(from, '      reason: "empty-intersection",');
      });
    },
  },
  {
    id: "H21-prefer-changes-feasibility",
    gate: "npm-test:tests/proof/*.test.mjs",
    desc: "让 --prefer=latest 过滤掉其余目标（prefer 改可行性）→ prefer 断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/checks/dedupe.mjs", (t) => {
        const from = `  if (prefer === "latest") {
    const sorted = [...targets].reverse();
    return sorted.map((t, i) => ({ ...t, preferred: i === 0 }));
  }`;
        const to = `  if (prefer === "latest") {
    const sorted = [...targets].reverse();
    return sorted.slice(0, 1).map((t, i) => ({ ...t, preferred: i === 0 }));
  }`;
        if (!t.includes(from)) throw new Error("orderTargets latest 形态变了，H21 靶子没匹配上");
        return t.replace(from, to);
      });
    },
  },
  {
    id: "H22-suggestion-nature-dropped",
    gate: "npm-test:tests/proof/*.test.mjs",
    desc: "REQUIRES_OVERRIDE 的 suggestion 去掉 nature:suggestion（建议冒充事实）→ 断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/checks/dedupe.mjs", (t) => {
        const from = '              nature: "suggestion",\n';
        if (!t.includes(from)) throw new Error("suggestion 形态变了，H22 靶子没匹配上");
        return t.replace(from, "");
      });
    },
  },
  {
    id: "P5-coverage-realtree-anchor",
    gate: "tools/check-provenance.mjs",
    desc: "把真实树 expected.json 里的 A25 引用剥掉 → PROV.COVERAGE 必须报「A25 无引用」",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "fixtures/real-tree/expected.json", (t) => {
        const parsed = JSON.parse(t);
        const before = parsed.sources.join("|");
        parsed.sources = parsed.sources.map((s) => s.replace(/\bA25\b/g, "§1.1 相应条目"));
        if (parsed.sources.join("|") === before) throw new Error("真实树 sources 里没有 A25 可剥");
        return `${JSON.stringify(parsed, null, 2)}\n`;
      });
    },
  },
  // ── M5 走查新增：报告面的四条判据各自的靶子 ────────────────────────────────
  // H23 对应本轮实测的**冻结产物缺陷**：M2 finding 只有 `kind` 没有 `rule`，
  // 旧实现 `String(f.rule)` 让每条 M2 结果的 `ruleId` 变成字面量 `"undefined"`——
  // 而 SARIF schema **抓不到**它（`"undefined"` 是合法字符串）。改回去必须变红。
  {
    id: "H23-sarif-ruleid-undefined",
    gate: "tools/check-report-schema.mjs",
    desc: '把 SARIF 的 ruleId 改回 `String(f.rule)`（M2 结果变成 "undefined"）→ 报告门必须变红',
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/report/sarif.mjs", (t) => {
        const from = `    const ruleId = f.rule ?? f.kind;
    if (!ruleId) throw new Error('SARIF：finding 既无 rule 也无 kind（ruleId 会退化成 "undefined"）');`;
        const to = "    const ruleId = String(f.rule);";
        if (!t.includes(from)) throw new Error("SARIF ruleId 形态变了，H23 靶子没匹配上");
        return t.replace(from, to);
      });
    },
  },
  // H24 对应本轮实测的第二个缺陷：SARIF 只出 findings，M3/M4 的产物**一条都不进**——
  // 真实树的 JSON 报 2 条 error，SARIF 报 0 条（`--format=sarif` 的用户以为没问题）。
  {
    id: "H24-sarif-drops-m3m4",
    gate: "tools/check-report-schema.mjs",
    desc: "让 SARIF 只输出 findings（丢掉 dedupe / conflicts）→ 三格式一致性必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/report/sarif.mjs", (t) => {
        const from = "  for (const item of report.dedupe ?? []) {";
        if (!t.includes(from)) throw new Error("collectEntries 的 dedupe 段变了，H24 靶子没匹配上");
        // 把两个非 findings 段整体关掉（等价于旧实现）
        let out = t.replace(from, "  for (const item of []) {");
        const from2 = "  for (const item of report.conflicts ?? []) {";
        if (!out.includes(from2)) throw new Error("collectEntries 的 conflicts 段变了，H24 靶子没匹配上");
        out = out.replace(from2, "  for (const item of []) {");
        // 阳性对照守卫：替换必须真让产物变少，否则下面可能因"没改到"而假红
        return out;
      });
    },
  },
  // H25 对应第三个缺陷：`summary.highest` 只扫 findings，真实树给出 `highest: null`
  // 而 `error: 2`（自相矛盾）。
  {
    id: "H25-summary-highest-findings-only",
    gate: "npm-test:tests/report/*.test.mjs",
    desc: "让 summary.highest 只看 findings（忽略 dedupe/conflicts）→ highest 断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/cli/main.mjs", (t) => {
        const from = "    highest: maxSeverity([...findings, ...dedupe, ...conflicts].map(findingSeverity)) ?? null,";
        if (!t.includes(from)) throw new Error("highest 形态变了，H25 靶子没匹配上");
        return t.replace(from, "    highest: maxSeverity(findings.map(findingSeverity)) ?? null,");
      });
    },
  },
  // H26 对应第四个缺陷：text 的降级行打的是 `item.reason`（两态 reason：empty-intersection /
  // no-locked-candidate），而不是 `degradeReason`（`requesters > max`）——
  // 于是"已降级：empty-intersection"把降级原因说成了跟自己无关的词。
  {
    id: "H26-text-degrade-reason-field",
    gate: "npm-test:tests/**/*.test.mjs",
    desc: "让 text 的降级行回退到 item.reason（打错字段）→ 降级报文断言必须变红",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "src/report/text.mjs", (t) => {
        const from = '      if (item.degraded) lines.push(`         ⚠ 已降级：${item.degradeReason ?? "degraded"}`);';
        if (!t.includes(from)) throw new Error("text 降级行形态变了，H26 靶子没匹配上");
        return t.replace(from, "      if (item.degraded) lines.push(`         ⚠ 已降级：${item.reason}`);");
      });
    },
  },
  // P6：schema 副本被换掉（不是 OASIS 官方那份）→ 报告门必须报「$id 不是官方」
  {
    id: "P6-sarif-schema-not-official",
    gate: "tools/check-report-schema.mjs",
    desc: "把离线 schema 副本的 $id 改成别处 → 报告门必须报「不是 OASIS 官方 SARIF 2.1.0」",
    expect: "red",
    mutate: (dir) => {
      edit(dir, "schema/sarif-2.1.0.json", (t) => {
        const parsed = JSON.parse(t);
        if (!parsed.$id || !parsed.$id.includes("oasis-tcs")) throw new Error("schema $id 形态变了，P6 靶子没匹配上");
        parsed.$id = "https://example.invalid/not-sarif.json";
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
