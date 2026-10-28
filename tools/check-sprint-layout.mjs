#!/usr/bin/env node
// ═══ 布局门（方法论装订第②件） ═══
// 判据只落**仓库内文件**（不读 git 元数据 —— 浅克隆下 tag/历史深度会翻转）。
// 每个判据都能被变异验证跑红（`tools/verify-layout-mutations.mjs`）。
// 退出码：0 全绿 / 1 有 FAIL / 2 用法错误。
//
// 本项目的判据集（判据几条，变异就几组）：
//   LAYOUT.FILES       必备文件在位（plan 00–06 / data / README / AGENTS / package.json / bin / src）
//   LAYOUT.BINDING      plan/00 顶部装订行（三锚点同现：方法论名 + 门命令 + 日期）
//   LAYOUT.SECTIONS    各 plan 文件含必需小节（按标题关键词）
//   LAYOUT.STATUS       里程碑状态在多处副本间一致（逐副本采集，不取单一真值）
//   LAYOUT.HANDOFFS     每个 ✅ 里程碑有交接单（M0 已声明豁免）
//   LAYOUT.GAPS        plan/06 缺口列不得再提已 ✅ 里程碑（剥文件名后匹配）
//   LAYOUT.LEDGER      plan/00 承诺-证据台账不得挂未完成标记于已 ✅ 里程碑
//   LAYOUT.RELEASE     发布留档：M6 未 ✅ 时报 PASS 并写明不适用
//   LAYOUT.DOC_TOOLS   文档点名的 tools/ 脚本必须有实物（三态：在位 / PENDING / 缺失）
//   LAYOUT.SKELETON    骨架产物在位且 CLI 可跑（bin + src 目录非空）

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [];
const add = (id, ok, detail) => checks.push({ id, ok, detail });
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), "utf8") : null);

const scanned = { docs: 0, handoffs: 0, copies: 0, docTools: 0, statusRows: 0 };

const REQUIRED_FILES = [
  "AGENTS.md",
  "README.md",
  "data/README.md",
  "package.json",
  "bin/versionaudit.mjs",
  "src/index.mjs",
  "plan/00-README总览.md",
  "plan/01-题目文档.md",
  "plan/02-架构与技术选型.md",
  "plan/03-模块详设.md",
  "plan/04-数据计划.md",
  "plan/05-里程碑与发布.md",
  "plan/06-交付对标与决策.md",
];

/** 装订行：三锚点**必须同现于一行**（前瞻 = 顺序无关，防"写死顺序"假红）。 */
const BINDING_LINE = /^>(?=.*ai-tool-project-sprint)(?=.*check-sprint-layout)(?=.*20\d{2}-\d{2}-\d{2}).*$/m;

const REQUIRED_SECTIONS = {
  "plan/00-README总览.md": ["文档索引", "决策记录", "承诺-证据台账", "里程碑"],
  "plan/01-题目文档.md": ["任务要求", "评分", "边界与非目标"],
  "plan/02-架构与技术选型.md": ["分层", "构建"],
  "plan/03-模块详设.md": ["契约冻结"],
  "plan/04-数据计划.md": ["数据清单", "真值纪律", "数值口径"],
  "plan/05-里程碑与发布.md": ["DoD", "已知未验证项"],
  "plan/06-交付对标与决策.md": ["评分对标", "风险登记"],
  "data/README.md": ["依据查证记录", "数值口径"],
};

/** HANDOFF 七节（与硬约束①一致）。项目自定更细的格式是合法超集——只断言"必需节都存在"。 */
const HANDOFF_SECTIONS = ["当前进度", "当前事实", "待办", "既定口径", "环境坑", "DoD", "命令速查"];

/** 项目**已声明**的豁免（装订门必须复用，不许另立更严的一套）。
 *
 * 本项目的 M0 **不豁免**：`plan/HANDOFF-M0.md` 是真实落盘的交接单（七节齐），
 * 它同时是 HANDOFFS 判据的变异靶子（`verify-layout-mutations.mjs` 的 L5 删它必须变红）。
 * 曾一度声明"M0 的收尾记录 = 计划套件本身"，那样会让 L5 无靶可打 → 该判据从未被证伪。
 */
const EXEMPT_MILESTONES = [];
const HANDOFF_EXEMPT_LAST = false;

/** 状态副本：同一里程碑在这几处的状态必须互相一致。 */
const STATUS_COPIES = [
  { file: "plan/00-README总览.md", kind: "里程碑表" },
  { file: "plan/05-里程碑与发布.md", kind: "状态表" },
  { file: "README.md", kind: "状态表" },
];

/** 只认"状态行"：表格行且首格就是里程碑号（不扫自由文本 —— 防张冠李戴的假红）。 */
const STATUS_LINE = /^\|\s*\*{0,2}M(\d+)\b/;
const PENDING_MARKERS = ["⬜", "🟡", "未开始", "未执行", "待执行", "待确认"];

function checkRequiredFiles() {
  const missing = REQUIRED_FILES.filter((rel) => !existsSync(join(ROOT, rel)));
  scanned.docs = REQUIRED_FILES.length - missing.length;
  add("LAYOUT.FILES", missing.length === 0, missing.length ? `缺: ${missing.join(", ")}` : `${scanned.docs} 份必备文件齐备`);
}

function checkBindingHead() {
  const text = read("plan/00-README总览.md") ?? "";
  const ok = BINDING_LINE.test(text);
  add(
    "LAYOUT.BINDING",
    ok,
    ok ? "plan/00 顶部有装订行（三锚点齐）" : "plan/00 顶部缺装订行（需同现：方法论名 + 布局门命令 + 装订日期）",
  );
}

function checkSections() {
  const bad = [];
  for (const [rel, needles] of Object.entries(REQUIRED_SECTIONS)) {
    const text = read(rel);
    if (text === null) continue;
    const missing = needles.filter((n) => !text.includes(n));
    if (missing.length) bad.push(`${rel}: ${missing.join("/")}`);
  }
  add("LAYOUT.SECTIONS", bad.length === 0, bad.length ? bad.join("；") : `${Object.keys(REQUIRED_SECTIONS).length} 份小节齐备`);
}

/**
 * 逐副本采集状态：`Map<k, Set<"done"|"pending">>`。
 * **真值不取自任何单一副本**（自我参照的真值源会让"在一个副本里改坏"掉出待检集合 → 恒绿）。
 *
 * **只扫"状态表"这一张表，不是文件里所有以 `| M<n> |` 开头的行**（实测假红）：
 * 同一文件里还有「每周可演示口径」这类表，行也以 `| M1 |` 开头但不含状态标记 →
 * 被读成 `done`，于是 `M1 在副本间状态不一致（done vs pending）` + `HANDOFF-M1 缺`
 * 两条假红同时出现。正解 = 先按表头定位「里程碑 + 状态」那张表，再扫它的数据行。
 */
function collectStates() {
  const states = new Map();
  const rowsByCopy = new Map();
  const note = (k, state) => {
    if (!states.has(k)) states.set(k, new Set());
    states.get(k).add(state);
  };
  for (const copy of STATUS_COPIES) {
    const text = read(copy.file);
    if (text === null) continue;
    scanned.copies += 1;
    let rows = 0;
    for (const line of statusTableRows(text)) {
      const m = STATUS_LINE.exec(line);
      if (!m) continue;
      rows += 1;
      scanned.statusRows += 1;
      const pending = PENDING_MARKERS.some((mark) => line.includes(mark));
      note(Number(m[1]), pending ? "pending" : "done");
    }
    rowsByCopy.set(copy.file, rows);
  }
  return { states, rowsByCopy };
}

/**
 * 取出「里程碑状态表」的数据行。
 * 定位条件：表头行同时含「里程碑」与「状态」两列（`plan/00` / `plan/05` / `README` 都是这个形状）。
 * 扫描面 = 表头后首行起，到**首条非表格行**止（不跨到下一张表）。
 * 找不到表头 → 返回空（上层会因"合计 0 行"报 FAIL，不会被静默当成"都关完了"）。
 */
function statusTableRows(text) {
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("里程碑") && l.includes("状态"));
  if (headerIdx < 0) return [];
  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i += 1) {
    if (!lines[i].startsWith("|")) break;
    rows.push(lines[i]);
  }
  return rows;
}

function checkStatusAgreement({ states, rowsByCopy }) {
  const conflicts = [];
  for (const [k, set] of [...states.entries()].sort((a, b) => a[0] - b[0])) {
    if (set.size > 1) conflicts.push(`M${k} 在副本间状态不一致（${[...set].sort().join(" vs ")}）`);
  }
  const total = [...rowsByCopy.values()].reduce((a, b) => a + b, 0);
  // 每份副本命中行数必须可见：0 行 = 这份"副本"不参与判定，不许它冒充已核对
  const perCopy = [...rowsByCopy.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([file, rows]) => `${file.split("/").pop()}:${rows}`)
    .join(" ");
  if (conflicts.length === 0 && total === 0) {
    add("LAYOUT.STATUS", false, `所有副本合计 0 行状态行（判据空跑）：${perCopy}`);
    return;
  }
  add(
    "LAYOUT.STATUS",
    conflicts.length === 0,
    conflicts.length
      ? conflicts.join("；")
      : `${scanned.copies} 处副本 × ${states.size} 个里程碑 状态全一致（行数 ${perCopy}）`,
  );
}

function checkHandoffs(done, allMilestones) {
  const last = Math.max(0, ...allMilestones);
  const missing = [];
  for (const k of done) {
    if (EXEMPT_MILESTONES.includes(k)) continue;
    if (HANDOFF_EXEMPT_LAST && k === last) continue;
    const rel = `plan/HANDOFF-M${k}.md`;
    const text = read(rel);
    if (text === null) {
      missing.push(`${rel}(缺)`);
      continue;
    }
    scanned.handoffs += 1;
    const lack = HANDOFF_SECTIONS.filter((n) => !text.includes(n));
    if (lack.length) missing.push(`${rel}(缺节: ${lack.join("/")})`);
  }
  add(
    "LAYOUT.HANDOFFS",
    missing.length === 0,
    missing.length
      ? missing.join("；")
      : `${scanned.handoffs} 份交接单齐（每个 ✅ 里程碑一份）`,
  );
}

/**
 * plan/06 的「缺口」列是状态的隐蔽副本。
 * **按表头定位列号再取单元格**（不是"行里含『缺口』二字"）。
 * 扫描面 = 表头 → 第一张表结束（首条非 `|` 行即止）。
 * **匹配前剥掉行内代码与文件名**（否则 `plan/RELEASE-M6.md` 里的 `M6` 会被判成"仍提 M6"）。
 */
function checkStaleGaps(done) {
  const lines = (read("plan/06-交付对标与决策.md") ?? "").split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("缺口"));
  if (headerIdx < 0) {
    add("LAYOUT.GAPS", false, "plan/06 找不到含『缺口』表头的表（判据表搬走了？）");
    return;
  }
  const col = lines[headerIdx].split("|").length - 2;
  const stale = [];
  let scannedRows = 0;
  for (let i = headerIdx + 2; i < lines.length; i += 1) {
    if (!lines[i].startsWith("|")) break;
    scannedRows += 1;
    const cells = lines[i].split("|");
    const cell = (cells[col] ?? "")
      .replace(/`[^`]*`/g, " ")
      .replace(/[\w./-]+\.(?:md|py|mjs|js|json|toml|txt|yml|yaml)/g, " ");
    for (const k of done) {
      if (new RegExp(`(^|[^0-9A-Za-z])M${k}([^0-9]|$)`).test(cell)) {
        stale.push(`plan/06 缺口列仍提 M${k}: ${cell.trim()}`);
      }
    }
  }
  add(
    "LAYOUT.GAPS",
    stale.length === 0,
    stale.length ? stale.join("；") : `plan/06 缺口列扫了 ${scannedRows} 行，无已 ✅ 里程碑`,
  );
}

/** 承诺-证据台账是第四份状态副本，但它没有「里程碑」+「状态」表头，`statusRows()` 扫不到。 */
function checkLedger(done) {
  const lines = (read("plan/00-README总览.md") ?? "").split("\n");
  const headerIdx = lines.findIndex((l) => l.startsWith("|") && l.includes("承诺") && l.includes("状态"));
  if (headerIdx < 0) {
    add("LAYOUT.LEDGER", false, "plan/00 找不到『承诺-证据台账』表头（承诺项与状态列）");
    return;
  }
  scanned.copies += 1;
  const bad = [];
  let rows = 0;
  for (let i = headerIdx + 2; i < lines.length; i += 1) {
    if (!lines[i].startsWith("|")) break;
    rows += 1;
    const cells = lines[i].split("|").map((c) => c.trim());
    const status = cells[cells.length - 2] ?? "";
    const pending = /[⬜🟡]|未开始|待 M\d|待开工/.test(status);
    if (!pending) continue;
    for (const k of done) {
      if (new RegExp(`(^|[^0-9A-Za-z])M${k}([0-9]|$)`, "i").test(status)) {
        bad.push(`台账行仍挂未完成: ${status.slice(0, 60)}`);
      }
    }
  }
  add(
    "LAYOUT.LEDGER",
    bad.length === 0 && rows > 0,
    rows === 0 ? "台账表 0 行——判据空跑" : bad.length ? bad.join("；") : `台账 ${rows} 行，已成 ✅ 的里程碑无未完成标记`,
  );
}

const RELEASE_MILESTONE = 6;

function checkReleaseDoc(done, allMilestones) {
  const releaseMilestone = RELEASE_MILESTONE || Math.max(0, ...allMilestones);
  if (!done.includes(releaseMilestone)) {
    add("LAYOUT.RELEASE", true, `发布里程碑 M${releaseMilestone} 未完成，收尾记录尚不适用（已扫 ${done.length} 个 ✅ 里程碑）`);
    return;
  }
  const release = read(`plan/RELEASE-M${releaseMilestone}.md`);
  const wrapup = read(`plan/WRAPUP-M${releaseMilestone}.md`);
  if (!release && !wrapup) {
    add("LAYOUT.RELEASE", false, `缺 plan/RELEASE-M${releaseMilestone}.md 或 plan/WRAPUP-M${releaseMilestone}.md`);
    return;
  }
  if (release) {
    const cols = /^##\s*一、tag 前事实/m.test(release) && /^##\s*二、tag 后追加/m.test(release);
    const heading = /^#{2,3}.*覆盖对账/m.test(release);
    const rows = (release.match(/^\|.*(实现|不适用|待首推).*\|$/gm) ?? []).length;
    add("LAYOUT.RELEASE", cols && heading && rows >= 3, `两栏:${cols} 覆盖对账小节:${heading} 三态行数:${rows}`);
    return;
  }
  add("LAYOUT.RELEASE", true, "WRAPUP 形态");
}

/**
 * 文档点名的工具必须有实物（三态：在位 / PENDING_TOOLS / 缺失）。
 * 判据只认路径形态、不读文档语义 —— 成本极低，能直接抓"文档写了但脚本不存在"。
 */
function checkDocumentedToolsExist(doneMilestones) {
  const EXEMPT = new Set([]);
  const PENDING_TOOLS = {}; // { "tools/x.mjs": 里程碑号 }；该里程碑翻 ✅ 后必须删除
  const docs = [
    "AGENTS.md",
    ...(existsSync(join(ROOT, "plan"))
      ? readdirSync(join(ROOT, "plan"))
          .filter((f) => f.endsWith(".md"))
          .sort()
          .map((f) => `plan/${f}`)
      : []),
  ];
  const referenced = new Set();
  for (const rel of docs) {
    const text = read(rel);
    if (text === null) continue;
    // **路径必须从"仓库根 / 行内代码 / 空白"起算**（负向后顾）。
    // 不加这条会误报：HANDOFF-M6 里写 `tests/tools/run-tests.test.mjs`（一个真实存在的
    // 测试文件）时，裸的 `tools/run-tests.test.mjs` 子串被当成了"文档点名的 tools 脚本"，
    // 于是 `LAYOUT.DOC_TOOLS` 报它不存在 —— **被测对象是测试文件，判据却按 tools/ 脚本找**。
    // 变异组 `L8` 仍钉住真缺失（AGENTS.md 里点名一个不存在的 tools 脚本必须红）。
    for (const m of text.matchAll(/(?<![\w./-])tools\/[\w.-]+\.(?:mjs|js|cjs|py|sh|ps1)/g)) referenced.add(m[0]);
  }
  if (referenced.size === 0) {
    add("LAYOUT.DOC_TOOLS", false, `扫了 ${docs.length} 份文档，0 处 tools/ 引用——判据是空的（阳性对照失败）`);
    return;
  }
  scanned.docTools = referenced.size;
  const missing = [];
  const deferred = [];
  const stale = [];
  for (const rel of [...referenced].sort()) {
    if (existsSync(join(ROOT, rel)) || EXEMPT.has(rel)) continue;
    const milestone = PENDING_TOOLS[rel];
    if (milestone === undefined) missing.push(rel);
    else if (doneMilestones.includes(milestone)) stale.push(`${rel}（M${milestone} 已 ✅，登记项必须清理）`);
    else deferred.push(`${rel}(M${milestone})`);
  }
  const problems = [...missing, ...stale];
  let detail = `${referenced.size} 个文档点名的 tools/ 脚本`;
  if (problems.length) detail += `；问题: ${problems.join(", ")}`;
  else if (deferred.length) detail += `；${deferred.length} 个待里程碑落位: ${deferred.join(", ")}`;
  else detail += " 全部在位"; // 登记表清空是"正确终态"，措辞要随之切换
  add("LAYOUT.DOC_TOOLS", problems.length === 0, detail);
}

/** 骨架产物：CLI 可 --version 且版本与 package.json 一致（版本四处一致的可跑红版）。 */
function checkSkeleton() {
  const bin = join(ROOT, "bin", "versionaudit.mjs");
  if (!existsSync(bin)) {
    add("LAYOUT.SKELETON", false, "bin/versionaudit.mjs 不存在");
    return;
  }
  let out;
  try {
    out = execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8", timeout: 20000 });
  } catch (error) {
    add("LAYOUT.SKELETON", false, `bin/versionaudit.mjs --version 失败：${error.message}`);
    return;
  }
  const pkg = JSON.parse(read("package.json") ?? "{}");
  const ok = out.trim() === `${pkg.name} ${pkg.version}`;
  add("LAYOUT.SKELETON", ok, ok ? `CLI 可跑：${out.trim()}` : `版本不一致：CLI="${out.trim()}" package="${pkg.name} ${pkg.version}"`);
}

function main() {
  for (const run of [checkRequiredFiles, checkBindingHead, checkSections, checkSkeleton]) {
    try {
      run();
    } catch (error) {
      add(run.name, false, error.message);
    }
  }

  const { states, rowsByCopy } = collectStates();
  const done = [...states.entries()].filter(([, set]) => set.has("done")).map(([k]) => k);
  const allMilestones = [...states.keys()];

  try {
    checkDocumentedToolsExist(done);
  } catch (error) {
    add("LAYOUT.DOC_TOOLS", false, error.message);
  }

  for (const run of [
    () => checkStatusAgreement({ states, rowsByCopy }),
    () => checkHandoffs(done, allMilestones),
    () => checkStaleGaps(done),
    () => checkLedger(done),
    () => checkReleaseDoc(done, allMilestones),
  ]) {
    try {
      run();
    } catch (error) {
      add(run.name, false, error.message);
    }
  }

  const failed = checks.filter((c) => !c.ok);
  process.stdout.write("布局门（方法论装订） · 判据只落仓库内文件\n");
  process.stdout.write(`${"=".repeat(64)}\n`);
  for (const c of checks) process.stdout.write(`${c.ok ? "PASS" : "FAIL"}  ${c.id}  ${c.detail}\n`);
  process.stdout.write(`${"=".repeat(64)}\n`);
  process.stdout.write(
    `这轮扫到：必备文件 ${scanned.docs} / 交接单 ${scanned.handoffs} / 状态副本 ${scanned.copies} / 状态行 ${scanned.statusRows} / 文档点名工具 ${scanned.docTools}\n`,
  );
  process.stdout.write(`结论: ${failed.length === 0 ? "全绿" : `${failed.length} 项 FAIL`}\n`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
