/**
 * 全帧差分测试：**每个被测夹具的每一条产物**都要与 `semver` 库直接复算的结果一致。
 *
 * 为什么单独一个文件（`plan/04` §三「差分双向」/ `plan/01` §3.1 验收）：
 *   `range-lint.test.mjs` 只覆盖**手写样例**，`tests/vectors` 只断言 `expected.json` 里的
 *   **若干条**字段。两者都不保证"夹具里出现的**每一条** finding / dedupe 证明 / MUS
 *   都真的成立"——某条产物恰好没被断言到，它就可以漂。
 *
 * 本文件的做法：真跑全部夹具（14 组向量 + `fixtures/real-tree`，后者也是 `input/` +
 * `expected.json` 同形）的 CLI，对每一类产物用库复算：
 *   ① M1 finding：`expandedRange === validRange(rawRange)`（逐字节，含 `null`），
 *      并复算 R7 的"去 +… 后不变"、R8 的裸版本形态、R1 的"无上界分支"；
 *   ② M2 finding：`satisfies(lockedVersion, declaredRange)` 必须为 `false`，
 *      且 `lockedVersion` **不得为 null**（无版本条目应走 `degraded`，A23）；
 *   ③ dedupe（M4 里程碑）：
 *      - `CONVERGIBLE`：每个目标满足全体请求者，且 **targets 列表完整**
 *        （凡已锁定版本满足全体请求者的都必须列出）；
 *      - 非 `CONVERGIBLE`：最小冲突集满足 §7.2 的两条性质 —— **M 无解** + **移除任一元素后有解**；
 *   ④ conflicts：`minimalSet` 内的范围两两不相交（库的 `intersects`）。
 *
 * **M3 面用原始 JSON 自己复算**（不复用 `src/model/*`）：否则"解析错了"与"判据错了"会一起错。
 *
 * **不覆盖**：R5 的空判定（区间代数专有，离散域能力边界见 `docs/limitations.md` §5.1）、
 * R6 的 `subset` 判定（库能力本身，已由 `tests/rules` 覆盖）。
 * 这些不在这里假装覆盖。
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validRange, satisfies, intersects } from "../../src/semver/adapter.mjs";
import { REPO_ROOT } from "../../src/meta.mjs";

const VECTORS = join(REPO_ROOT, "fixtures", "vectors");
const REAL_TREE = join(REPO_ROOT, "fixtures", "real-tree");
const BIN = join(REPO_ROOT, "bin", "versionaudit.mjs");

const vectorNames = existsSync(VECTORS)
  ? readdirSync(VECTORS, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : [];

/**
 * 被测夹具清单：14 组向量 + 真实树。
 * 真实树与向量同形（`input/package.json` + `input/package-lock.json` + `expected.json`），
 * 所以走同一套差分面 —— 这也是"M4 的真实树结论必须可复现"的机器化落点。
 */
const RUNS = [
  ...vectorNames.map((name) => ({ name, dir: join(VECTORS, name) })),
  { name: "real-tree", dir: REAL_TREE },
];

function runVector({ name, dir }) {
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));
  const extraArgs = Array.isArray(expected.args) ? expected.args : [];
  let stdout;
  try {
    stdout = execFileSync(
      process.execPath,
      [BIN, "audit", join(dir, "input"), "--format=json", ...extraArgs],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    stdout = error.stdout ?? "";
  }
  return { name, expected, report: JSON.parse(stdout) };
}

/** 已复算的条目计数：让"判据空转"变红（阳性对照见文件末尾）。 */
const coverage = { targetsChecked: 0, musChecked: 0 };

/**
 * §7.2 的两条性质（最小冲突集的可机械校验形态）。
 * **降级（`degraded: true`）也必须满足**：超限走删除法，降级的只是"基数最小 / 平局全列"，
 * 不是"是不是真冲突"。
 */
function checkMinimalConflictSet(item, ranges, locked, problems) {
  const label = `dedupe ${item.package}（status=${item.status}, degraded=${item.degraded === true}）`;
  if (ranges.length === 0) {
    problems.push(`${label}: 非 CONVERGIBLE 却没有 minimalConflictSet`);
    return;
  }
  if (locked.length === 0) {
    problems.push(`${label}: 没有 lockedVersions，无法校验最小冲突集`);
    return;
  }
  const allSatisfiedBy = (v, set) => set.every((r) => satisfies(v, r));
  // ① M 无解
  const witness = locked.find((v) => allSatisfiedBy(v, ranges));
  if (witness !== undefined) {
    problems.push(`${label}: 冲突集在已锁定版本 ${witness} 上被全部满足（M 必须无解）`);
  }
  // ② M 极小：移除任一元素后有解
  for (let i = 0; i < ranges.length; i += 1) {
    const rest = ranges.filter((_, j) => j !== i);
    if (!locked.some((v) => allSatisfiedBy(v, rest))) {
      problems.push(`${label}: 移除 ${JSON.stringify(ranges[i])} 后仍无解（不是极小集）`);
    }
  }
}

test("差分：夹具清单非空（阳性对照）", () => {
  assert.ok(vectorNames.length > 0, "fixtures/vectors 下没有任何向量（判据空转）");
  assert.ok(existsSync(join(REAL_TREE, "expected.json")), "fixtures/real-tree 缺 expected.json");
});

for (const run of RUNS) {
  test(`差分 ${run.name}：每条 finding 的 expandedRange 都由 validRange 复现`, () => {
    const { report } = runVector(run);
    const findings = report.findings ?? [];
    // M4 的向量可以**没有任何 finding**（它是收敛可行性向量，结论在 `dedupe` 里）。
    // 所以"非空自证"要求三类产物至少有一类非空，而不是强求 findings 非空。
    const dedupe = report.dedupe ?? [];
    const conflicts = report.conflicts ?? [];
    assert.ok(
      findings.length + dedupe.length + conflicts.length > 0,
      `${run.name}: findings / dedupe / conflicts 三类全空（差分判据空转）`,
    );

    const problems = [];
    let rangeChecked = 0;
    let satisfiesChecked = 0;

    for (const f of findings) {
      // ── M1 finding：expandedRange 必须逐字节等于库的返回值 ──────────────
      if (f.rawRange !== undefined) {
        rangeChecked += 1;
        const recomputed = validRange(f.rawRange);
        if (recomputed !== f.expandedRange) {
          problems.push(
            `${f.rule} ${f.package} ${JSON.stringify(f.rawRange)}：expandedRange=${JSON.stringify(f.expandedRange)} ≠ validRange=${JSON.stringify(recomputed)}`,
          );
        }

        // R7：判据是"去掉 +… 后 validRange 不变"——用库直接复算这条判据本身。
        if (f.rule === "R7") {
          const stripped = f.rawRange.replace(/\+[0-9A-Za-z.-]+/g, "");
          const a = validRange(f.rawRange);
          const b = validRange(stripped);
          if (a === null || b === null || a !== b) {
            problems.push(`R7 ${f.package} ${JSON.stringify(f.rawRange)}：报 R7 但去 +… 后展开变了`);
          }
        }

        // R8：判据是裸三位版本——用库印证 expand 后是单点。
        if (f.rule === "R8") {
          if (!/^\d+\.\d+\.\d+$/.test(f.rawRange.trim())) {
            problems.push(`R8 ${f.package} ${JSON.stringify(f.rawRange)}：不是裸三位版本却被报 R8`);
          }
        }

        // R1：判据是"存在无上界的 >=/> 且无 <"——用库的 Range 结构复算。
        if (f.rule === "R1") {
          const expanded = validRange(f.rawRange);
          if (expanded === null) {
            problems.push(`R1 ${f.package} ${JSON.stringify(f.rawRange)}：非范围却被判 R1`);
          } else {
            const branches = expanded.split("||").map((b) => b.trim());
            const anyOffending = branches.some((b) => /(^|\s)(>=|>)/.test(b) && !b.includes("<"));
            if (!anyOffending) {
              problems.push(`R1 ${f.package} ${JSON.stringify(f.rawRange)}：展开里没有无上界分支却被报 R1`);
            }
          }
        }
      }

      // ── M2 finding：manifest-not-satisfied 必须由 satisfies 复现为 false ──
      if (f.kind === "manifest-not-satisfied" && f.lockedVersion) {
        satisfiesChecked += 1;
        const ok = satisfies(f.lockedVersion, f.declaredRange);
        if (ok !== false) {
          problems.push(
            `manifest-not-satisfied ${f.dependency}@${f.lockedVersion} vs ${JSON.stringify(f.declaredRange)}：satisfies=${ok}，不是 false`,
          );
        }
      }

      // ── 缺陷② 的守卫：无版本条目**不许**出现在 manifest-not-satisfied 里 ──
      // （A23：`satisfies(null, range)` 恒 false，凭它报"不满足"等于编造语义。
      //   正确出口是报告 `degraded`，不是 error。这条断言让"改回直接判不满足"必红。）
      if (f.kind === "manifest-not-satisfied" && !f.lockedVersion) {
        problems.push(
          `manifest-not-satisfied ${f.dependency}：lockedVersion 为 ${JSON.stringify(f.lockedVersion)}（无版本条目不构成"不满足"，应走 degraded）`,
        );
      }
    }

    assert.deepEqual(problems, [], `${run.name}:\n${problems.join("\n")}`);
    // 非空自证：**本测试的判据面**（findings）非空时必须真被复算；
    // findings 为空（纯 dedupe / 真实树夹具）不算空跑——那条面由下一条测试自证。
    if (findings.length > 0) {
      assert.ok(rangeChecked + satisfiesChecked > 0, `${run.name}: 有 ${findings.length} 条 finding 却 0 条被复算`);
    } else {
      assert.equal(rangeChecked + satisfiesChecked, 0, `${run.name}: 无 finding 却有复算计数（判据错位）`);
    }
  });

  // M3/M4 的"证明"也必须由库复算：这是 B 栏 20 分的机械校验面。
  test(`差分 ${run.name}：dedupe / conflict 的满足性证明都由库复算`, () => {
    const { report } = runVector(run);
    const problems = [];
    let checked = 0;

    for (const item of report.dedupe ?? []) {
      const locked = item.lockedVersions ?? [];

      if (item.status === "CONVERGIBLE") {
        // ── CONVERGIBLE：① 每个目标满足全体请求者；② **目标列表完整** ──
        if (!Array.isArray(item.targets) || item.targets.length === 0) {
          problems.push(`dedupe ${item.package}: CONVERGIBLE 却没有 targets`);
          continue;
        }
        const ranges = (item.targets[0].proof ?? []).map((p) => p.range);
        for (const target of item.targets) {
          checked += 1;
          coverage.targetsChecked += 1;
          if ((target.proof ?? []).length !== ranges.length) {
            problems.push(`dedupe ${item.package}@${target.version}: proof 条数与首个目标不一致（请求者集合应相同）`);
          }
          for (const proof of target.proof ?? []) {
            const actual = satisfies(target.version, proof.range);
            if (actual !== proof.satisfies) {
              problems.push(
                `dedupe ${item.package}@${target.version} vs ${JSON.stringify(proof.range)}：记录 ${proof.satisfies}，库复算 ${actual}`,
              );
            }
            if (actual !== true) {
              problems.push(`dedupe ${item.package}@${target.version}: 目标版本不满足 ${JSON.stringify(proof.range)}（不配当目标）`);
            }
          }
        }
        // 完整性：凡已锁定版本满足全部请求者，都必须出现在 targets 里
        const feasible = locked.filter((v) => ranges.every((r) => satisfies(v, r)));
        const listed = item.targets.map((t) => t.version);
        if (JSON.stringify([...feasible].sort()) !== JSON.stringify([...listed].sort())) {
          problems.push(
            `dedupe ${item.package}: targets 不完整（可行 ${JSON.stringify(feasible)}，列出 ${JSON.stringify(listed)}）`,
          );
        }
        continue;
      }

      // ── 非 CONVERGIBLE：最小冲突集的两条性质（§7.2），**降级也必须满足** ──
      checked += 1;
      coverage.musChecked += 1;
      checkMinimalConflictSet(item, (item.minimalConflictSet ?? []).map((m) => m.range), locked, problems);
    }

    for (const item of report.conflicts ?? []) {
      // 冲突结论：minimalSet 里两两范围必须真的不相交（用库的 `intersects` 复算）。
      const ranges = (item.minimalSet ?? []).map((m) => m.range).filter(Boolean);
      for (let i = 0; i < ranges.length; i += 1) {
        for (let j = i + 1; j < ranges.length; j += 1) {
          checked += 1;
          if (intersects(ranges[i], ranges[j])) {
            problems.push(
              `conflict ${item.package}：${JSON.stringify(ranges[i])} 与 ${JSON.stringify(ranges[j])} 库判定相交，不能构成冲突`,
            );
          }
        }
      }
    }

    assert.deepEqual(problems, [], `${run.name}:\n${problems.join("\n")}`);
    // 允许 0 条：M1 向量本来就没有 dedupe/conflict（那条通路由 M3/M4 自己非空自证）
    if (checked === 0) {
      assert.ok(
        !(report.dedupe?.length || report.conflicts?.length),
        `${run.name}: 有 dedupe/conflict 产物却 0 条被复算`,
      );
    }
  });

  // ── M3 三面独立复算（A22–A24）。**不复用 `src/model/*`**：自己读原始 JSON —— ──
  // 若复用被测的解析器，"解析错了"与"判据错了"会一起错，差分就失去意义。
  test(`差分 ${run.name}：M3 四类 kind 的判据都由原始 JSON 独立复算`, () => {
    const { report } = runVector(run);
    const findings = report.findings ?? [];
    const m3 = findings.filter((f) => f.kind !== undefined);
    if (m3.length === 0) return; // 该夹具没有 M3 产物（由 M2-lock-manifest 等向量自证非空）

    const inputDir = join(run.dir, "input");
    const manifest = JSON.parse(readFileSync(join(inputDir, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(join(inputDir, "package-lock.json"), "utf8"));
    const lockPkgs = lock.packages ?? {};
    const rootEntry = lockPkgs[""] ?? {};

    const problems = [];
    let checked = 0;

    for (const f of m3) {
      checked += 1;

      if (f.kind === "manifest-changed-unsynced") {
        // 独立复算：该名字在其**同名键**里（dependencies / optionalDependencies）确实不一致。
        // 这条同时钉住缺陷①（A22）：若实现回到"跨类合并比对"，带 optional 的真实锁会误报，
        // 而复算会发现"manifest 与锁在同类键上其实一致" → 报问题。
        const name0 = f.dependency;
        const inDepsM = manifest.dependencies?.[name0];
        const inOptM = manifest.optionalDependencies?.[name0];
        const inDepsL = rootEntry.dependencies?.[name0];
        const inOptL = rootEntry.optionalDependencies?.[name0];
        const consistent = inDepsM === inDepsL && inOptM === inOptL;
        if (consistent) {
          problems.push(`manifest-changed-unsynced ${name0}：同类键其实一致却被报（跨类合并？A22）`);
        }
        if (f.declaredRange !== (inDepsM ?? inOptM ?? null)) {
          problems.push(`manifest-changed-unsynced ${name0}：declaredRange=${JSON.stringify(f.declaredRange)} ≠ manifest=${JSON.stringify(inDepsM ?? inOptM ?? null)}`);
        }
      }

      if (f.kind === "missing-from-lock") {
        // 独立复算：锁里确实找不到任何 `node_modules/<dep>` 路径。
        const name0 = f.dependency;
        const anyPath = Object.keys(lockPkgs).some((p) => p === `node_modules/${name0}` || p.endsWith(`/node_modules/${name0}`));
        if (anyPath) problems.push(`missing-from-lock ${name0}：锁里其实存在该路径`);
        if (manifest.optionalDependencies?.[name0] !== undefined && manifest.dependencies?.[name0] === undefined) {
          problems.push(`missing-from-lock ${name0}：它是 optional 声明，缺了不该报`);
        }
      }

      if (f.kind === "lock-extra-undeclared") {
        // 独立复算：该 dep 名确实不在 manifest 的任何声明键里（根或传递都算不到时才是"无请求者"）。
        // 这里只做**根层**可机械核的部分，并钉住缺陷③：不可是树外路径/链接条目解析出的怪名。
        const name0 = f.dependency;
        if (name0 === ".." || name0.includes("/") && name0.startsWith("..")) {
          problems.push(`lock-extra-undeclared ${JSON.stringify(name0)}：树外路径被当成包名（A24）`);
        }
        const declaredAnywhere =
          ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].some(
            (k) => manifest[k]?.[name0] !== undefined,
          ) || Object.entries(lockPkgs).some(([p, e]) => p !== "" && e && ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].some((k) => e[k]?.[name0] !== undefined));
        if (declaredAnywhere && !f.requesterPath?.length) {
          problems.push(`lock-extra-undeclared ${name0}：它其实被某处声明，不该报`);
        }
      }
    }

    assert.deepEqual(problems, [], `${run.name}:\n${problems.join("\n")}`);
    assert.ok(checked > 0, `${run.name}: 有 M3 finding 却 0 条被复算（判据空转）`);
  });
}

// ── 正面控制：两条图表外的复算面（targets 完整性 / MUS 极小性）必须真跑过 ──────────
// 没有这一条时，两处循环可能被改回"读不存在的字段"而**静默空转**（M4 实测就是如此）。
test("差分：targets 完整性与 MUS 极小性两面都真被复算（阳性对照）", () => {
  assert.ok(
    coverage.targetsChecked > 0,
    "没有任何 CONVERGIBLE 目标被复算（targets 完整性判据空转）",
  );
  assert.ok(
    coverage.musChecked > 0,
    "没有任何最小冲突集被复算（MUS 判据空转：夹具里必须有非 CONVERGIBLE 的 dedupe 条目）",
  );
});
