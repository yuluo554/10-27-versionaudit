#!/usr/bin/env node
/**
 * 向量门：`fixtures/vectors/` 的 14 个目录齐备 + `fixtures/real-tree/`（M4 真实树）齐备，
 * 且每个都有非空断言、端到端跑得通。
 *
 * 这是"交付文档里'覆盖了多少'这类声称必须由机器核"的具体落法（references M6 收尾条）：
 * `plan/01` §8 声明 14 组向量，如果少了一组**没有任何东西会红**。
 *
 * 判据：
 *   1. 14 个目录名逐一在位（缺与多都报）；
 *   2. 每目录有 `input/package.json` + `input/package-lock.json` + `expected.json`；
 *   3. `expected.json` 的 `mustContain` 非空（空数组 = "断言了全世界"）；
 *   4. 把 `input/` 真跑一次 CLI，断言退出码与 `exitCode` 一致（端到端，不是只读文件）。
 *   5. **真实树夹具**（`fixtures/real-tree/`）：四个文件齐（含 `SOURCE.md` 来源说明）、
 *      `expected.json` 与向量同形、锁里**至少一个同名包有两个版本**（拓扑未被压平）、
 *      端到端退出码一致。
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

/**
 * `plan/01` §8 声明的向量（这里是"分母"，不写字面数字 —— 由目录清单算出）。
 *
 * 15 组 = M1 的 8 组 R* + M5 的 1 组（退出码矩阵）+ M3 的 **5 组**：
 *   - `M2-lock-manifest` 覆盖 lockfileVersion 3（M2 的 DoD 要求"三种 lockfileVersion 各有夹具"）；
 *   - `M3-lockfile-v1` / `M3-lockfile-v2` 分别覆盖 lockfileVersion 1 与 2；
 *   - `M3-ms-duplicate`（可收敛到 2.1.3）/ `M3-ms-two-targets`（**两个**可行目标都要列出，
 *     M4 新增：`CONVERGIBLE` 的输出是全部可行版本，不是挑一个）；
 *   + `M4-peer-minimal-set` 1 组（冲突最小解释）。
 *
 * **退出码 3 的形态不进这里**（结构混用 / 不支持的 lockfileVersion / JSON 语法错误）：
 * 那类输入**不产生 JSON 报告**，而本门与 `tests/vectors` 都要求 `expected.json` 的
 * `mustContain` 含 `input.*` 绑定（`input` 来自报告）——把它们塞进来只能靠给
 * "输入绑定"这条纪律开洞。它们落在 `tests/exit-codes/lock-input.test.mjs`（端到端真跑 CLI）。
 */
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
  "M3-lockfile-v1",
  "M3-lockfile-v2",
  "M3-ms-duplicate",
  "M3-ms-two-targets",
  "M4-peer-minimal-set",
  "M5-exit-codes",
];

/** 真实树夹具（M4）：不在 `fixtures/vectors/` 里（它不是"最小复现"，是 20 包真实树）。 */
const REAL_TREE = "fixtures/real-tree";

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
  } else {
    // 判据 3b：**输入绑定**。每条向量的 mustContain 必须至少一条 `input.` 断言
    // （如 `input.declarations` / `input.packages`）。
    //
    // 为什么需要它（变异 H2 实测）：只断言"不该出现 X"的向量，在**输入被删掉后**
    // 会**真空变绿** —— 包都不在夹具里了，当然不会报。实测：把 R5 夹具里的反例包
    // `range-incl-single` 删掉，全部断言仍然通过、门仍然绿。
    // 绑定输入的计数后，删输入会立刻打挂这些断言。
    const bindsInput = expected.mustContain.some((a) => typeof a.path === "string" && a.path.startsWith("input."));
    if (!bindsInput) {
      problems.push(`${name}: mustContain 未绑定输入（缺 \`input.*\` 断言 → 删掉输入会真空变绿）`);
    }
  }
  if (!Array.isArray(expected.sources) || expected.sources.length === 0) {
    problems.push(`${name}: sources 为空（无来源的断言）`);
  }
  if (typeof expected.exitCode !== "number") {
    problems.push(`${name}: exitCode 必须是数字`);
  }
  verified += 1;
}

// 夹具卫生（安全扫描的正面处置）：fixtures 下的 input/package.json 是**只读审计输入**，
// 不是任何项目的依赖表。因此必须满足五条，否则"不会被安装"只是口头承诺：
//   1. 每份夹具 private: true（npm 拒绝发布，且语义上明确"非发布物"）；
//   2. 夹具不得含 install / preinstall / postinstall 生命周期脚本；
//   3. 仓库根 package.json 不得用 workspaces 把 fixtures 收进工作区
//      （收进去就会让 npm install 真的去解析这些浮动版本）；
//   4. **仓库根不得有 `dependencies` / `devDependencies` 之类的 `file:` 指向 fixtures**
//      （`"x": "file:fixtures/vectors/R2-wildcard-latest/input"` 会把夹具挂进依赖树）；
//   5. **夹具自身不得声明 dependencies**（否则就算被手工 install 也会去解析浮动版本）。
//
// 注意：**浮动版本（* / latest / x）是 R2 向量的被测对象本身**，不能"固定掉"——
// 固定版本等于删掉该规则的唯一正例（`plan/04` §六、`docs/limitations.md` §5.1）。
// 判据要落在"它不会被安装"，而不是"它不能写浮动版本"。
// 安全扫描器把 `tagged: latest` / `x-range: x` 报成"浮动版本风险"是**误报**：
// 这两行是被审计的输入样本，且上述 5 条由本函数断言、配 5 组变异（V1–V3 + H4/H5）证伪。
function checkFixtureHygiene() {
  const problems = [];
  let checked = 0;

  const rootPkgText = read("package.json");
  if (rootPkgText) {
    let rootPkg = {};
    try {
      rootPkg = JSON.parse(rootPkgText);
    } catch {
      problems.push("根 package.json 不是合法 JSON");
    }
    const ws = rootPkg.workspaces;
    const wsGlobs = Array.isArray(ws) ? ws : Array.isArray(ws?.packages) ? ws.packages : [];
    if (wsGlobs.some((g) => String(g).includes("fixtures"))) {
      problems.push("根 package.json 的 workspaces 收编了 fixtures/**（会让夹具被真安装）");
    }
    // 判据 4：根的任何依赖区段都不得用 file:/link: 指向 fixtures
    for (const kind of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [dep, spec] of Object.entries(rootPkg[kind] ?? {})) {
        if (/^(file|link):/.test(String(spec)) && String(spec).includes("fixtures")) {
          problems.push(`根 package.json 的 ${kind}.${dep} = ${spec} 指向 fixtures/**（会把夹具挂进依赖树）`);
        }
      }
    }
  }

  for (const name of REQUIRED_VECTORS) {
    const rel = `fixtures/vectors/${name}/input/package.json`;
    const text = read(rel);
    if (text === null) continue;
    checked += 1;
    let pkg;
    try {
      pkg = JSON.parse(text);
    } catch {
      problems.push(`${rel}: 不是合法 JSON`);
      continue;
    }
    if (pkg.private !== true) problems.push(`${rel}: 缺 private: true（夹具不该是可发布包）`);
    for (const hook of ["install", "preinstall", "postinstall", "prepublish"]) {
      if (pkg.scripts && pkg.scripts[hook]) problems.push(`${rel}: 含 ${hook} 生命周期脚本`);
    }
    // 判据 5 的反面（**别写错**）：夹具**必须**声明 `dependencies` —— 那是被审计的输入本身
    // （审计器读的就是这个字段）。禁掉它等于让全部向量失去被测对象。
    // 所以这里断言的是相反的形态：夹具不得带 `workspaces`（夹具不是自己的工作区根）。
    if (pkg.workspaces) {
      problems.push(`${rel}: 夹具带 workspaces（夹具是只读输入，不是工作区根）`);
    }
  }

  // 真实树也是夹具：同一套卫生判据（它是 20 包树，体积大，但仍是只读审计输入）
  {
    const rel = `${REAL_TREE}/input/package.json`;
    const text = read(rel);
    if (text !== null) {
      checked += 1;
      let pkg;
      try {
        pkg = JSON.parse(text);
      } catch {
        problems.push(`${rel}: 不是合法 JSON`);
      }
      if (pkg) {
        if (pkg.private !== true) problems.push(`${rel}: 缺 private: true（夹具不该是可发布包）`);
        for (const hook of ["install", "preinstall", "postinstall", "prepublish"]) {
          if (pkg.scripts && pkg.scripts[hook]) problems.push(`${rel}: 含 ${hook} 生命周期脚本`);
        }
        if (pkg.workspaces) problems.push(`${rel}: 夹具带 workspaces（夹具是只读输入，不是工作区根）`);
      }
    }
  }

  if (checked === 0) problems.push("夹具卫生：0 份夹具被检查（判据空跑）");
  return { problems, checked };
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

/**
 * 真实树夹具（M4 DoD「20 包真实树上给出确定性结论」的载具）。四条判据：
 *   1. 四个文件齐备（`SOURCE.md` 是"来源说明"——没有来源的真实树看起来像夹具，比没有更糟）；
 *   2. `expected.json` 与向量同形（含 `input.*` 绑定、`sources` 非空、`exitCode` 数字）；
 *   3. 锁里**至少一个同名包有两个不同版本**——重复版本拓扑被压平，这棵树就不再是
 *      "真实树的形状"（它存在的唯一理由）；
 *   4. 端到端退出码与 `expected.exitCode` 一致。
 */
function checkRealTree() {
  const problems = [];
  let checked = 0;

  for (const rel of [
    `${REAL_TREE}/SOURCE.md`,
    `${REAL_TREE}/input/package.json`,
    `${REAL_TREE}/input/package-lock.json`,
    `${REAL_TREE}/expected.json`,
  ]) {
    if (!existsSync(join(ROOT, rel))) problems.push(`缺文件: ${rel}`);
  }

  let expected = null;
  const expectedText = read(`${REAL_TREE}/expected.json`);
  if (expectedText !== null) {
    try {
      expected = JSON.parse(expectedText);
    } catch {
      problems.push("expected.json 不是合法 JSON");
    }
    if (expected) {
      checked += 1;
      if (!Array.isArray(expected.mustContain) || expected.mustContain.length === 0) {
        problems.push("expected.json 的 mustContain 为空（「断言了全世界」）");
      } else if (!expected.mustContain.some((a) => typeof a.path === "string" && a.path.startsWith("input."))) {
        problems.push("expected.json 未绑定输入（缺 `input.*` 断言 → 删掉输入会真空变绿）");
      }
      if (!Array.isArray(expected.sources) || expected.sources.length === 0) {
        problems.push("expected.json 的 sources 为空（无来源的断言）");
      }
      if (typeof expected.exitCode !== "number") problems.push("expected.json 的 exitCode 必须是数字");
      for (const field of ["rule", "mustNotContain", "implementationVersions"]) {
        if (!(field in expected)) problems.push(`expected.json 缺字段 ${field}`);
      }
    }
  }

  // 拓扑：同名包的两个版本必须还在（ms@2.0.0 / ms@2.1.3 就是这棵树存在的理由）
  const lockText = read(`${REAL_TREE}/input/package-lock.json`);
  if (lockText !== null) {
    let lock = null;
    try {
      lock = JSON.parse(lockText);
    } catch {
      problems.push("package-lock.json 不是合法 JSON");
    }
    if (lock) {
      checked += 1;
      const versions = new Map();
      for (const path of Object.keys(lock.packages ?? {})) {
        if (!path) continue;
        // 包名取路径里**最后一个** node_modules 段。不要用 `split("/node_modules/").pop()`
        // —— 顶层路径 `node_modules/ms` 没有前导斜杠，会解析出 "node_modules"（假判据：
        // 所有顶层包被并成一个名字，`set.size > 1` 恒成立，等于这条判据永不失败）。
        const matches = [...path.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/g)];
        const name = matches[matches.length - 1][1];
        if (!versions.has(name)) versions.set(name, new Set());
        versions.get(name).add(lock.packages[path].version);
      }
      const dup = [...versions.entries()].filter(([, set]) => set.size > 1);
      if (dup.length === 0) {
        problems.push("锁里没有任何同名包的两个版本（重复版本拓扑被压平了？）");
      }
    }
  }

  // 端到端
  if (expected && typeof expected.exitCode === "number" && existsSync(join(ROOT, REAL_TREE, "input"))) {
    let actual;
    try {
      execFileSync(process.execPath, [join(ROOT, "bin", "versionaudit.mjs"), "audit", join(ROOT, REAL_TREE, "input"), "--format=json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      actual = 0;
    } catch (error) {
      actual = typeof error.status === "number" ? error.status : -1;
    }
    checked += 1;
    if (actual !== expected.exitCode) problems.push(`退出码 ${actual} ≠ expected ${expected.exitCode}`);
  }

  return { problems, checked };
}

process.stdout.write(`向量门（${REQUIRED_VECTORS.length} 组差分向量 + 1 组真实树夹具）\n`);

process.stdout.write(`${"=".repeat(64)}\n`);
process.stdout.write(`声明向量 ${REQUIRED_VECTORS.length} 组 / 实际目录 ${present.length} 组\n`);

// 夹具卫生：浮动版本是 R2 的被测对象，判据落在"不会被安装"
const hygiene = checkFixtureHygiene();
for (const p of hygiene.problems) problems.push(`[hygiene] ${p}`);
if (hygiene.problems.length === 0) {
  process.stdout.write(
    `PASS  夹具卫生（5 条）：${hygiene.checked} 份 private:true / 无 install 钩子 / 无 workspaces 字段 / 根 workspaces 未收编 fixtures / 根无 file: 依赖指向 fixtures\n`,
  );
}

// 真实树夹具（M4）
const realTree = checkRealTree();
for (const p of realTree.problems) problems.push(`[real-tree] ${p}`);
if (realTree.problems.length === 0) {
  process.stdout.write(
    `PASS  真实树夹具（4 条）：SOURCE.md + input/ + expected.json 齐备 / 断言同形且有 input.* 绑定 / 重复版本拓扑在位 / 端到端退出码一致\n`,
  );
}

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
