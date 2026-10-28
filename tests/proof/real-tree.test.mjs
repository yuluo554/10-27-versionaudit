/**
 * M4 真实树验收（`plan/01` §3.3 / `plan/05` M4 DoD / `fixtures/real-tree/SOURCE.md`）。
 *
 * 被测对象是**真实 npm 写出的 20 包树**（`npm 11.12.1` 的 `npm install --offline` 产物，
 * 只改了包名与删了 `resolved`/`integrity`/`license`/`engines`；版本号与范围字符串逐字未改）。
 * 本文件要证明的是 M4 的两句话：
 *   ① 真实树上给出**确定性结论**（这里：不可收敛 + 最小冲突集）；
 *   ② 结论**可机械校验**：MUS 满足 §7.2 的两条性质，且请求者范围与原始 JSON 逐一核对。
 *
 * **不复用 `src/model/*`**：本文件直接读 `input/*.json` 自己推导请求者与候选版本，
 * 复用被测解析器会让"解析错了"与"判据错了"一起错（M3 差分测试的同一条纪律）。
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../helpers/fixtures.mjs";
import { satisfies } from "../../src/semver/adapter.mjs";
import { REPO_ROOT } from "../../src/meta.mjs";

const INPUT = join(REPO_ROOT, "fixtures", "real-tree", "input");
const manifest = JSON.parse(readFileSync(join(INPUT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(INPUT, "package-lock.json"), "utf8"));
const packages = lock.packages ?? {};

/** `node_modules/a/node_modules/@scope/b` → `@scope/b`（只做路径拆解，不做语义判断）。
 *
 * 注意：**不能用 `split("/node_modules/").pop()`** —— 顶层路径 `node_modules/ms` 没有前导斜杠，
 * 会被拆成 `["node_modules/ms"]` 并解析出包名 `"node_modules"`（M4 实测踩过，
 * `tools/check-vectors.mjs` 的拓扑判据也踩过一次）。
 */
function nameOf(path) {
  const matches = [...path.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/g)];
  return matches[matches.length - 1][1];
}

/** npm 的解析算法：从请求者目录逐级向上找最近的 `node_modules/<name>`。 */
function resolveFrom(fromPath, name) {
  let scope = fromPath;
  for (;;) {
    const candidate = scope ? `${scope}/node_modules/${name}` : `node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (!scope) return null;
    const idx = scope.lastIndexOf("/node_modules/");
    scope = idx < 0 ? "" : scope.slice(0, idx);
  }
}

/** 从原始 JSON 推导某个包名的「已锁定版本」与「请求者（声明者 + 范围 + 解析到的路径）」。 */
function collectRequesters(name) {
  const versions = new Map(); // version -> [path...]
  for (const [path, entry] of Object.entries(packages)) {
    if (!path) continue;
    if (nameOf(path) !== name) continue;
    if (!versions.has(entry.version)) versions.set(entry.version, []);
    versions.get(entry.version).push(path);
  }
  const requesters = [];
  // 根声明来自 manifest（根条目只是镜像，M3 已证明两者可能不同步；这里用 manifest）
  for (const kind of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const [dep, range] of Object.entries(manifest[kind] ?? {})) {
      if (dep !== name) continue;
      requesters.push({ declaringPath: "", range, resolved: resolveFrom("", dep), kind });
    }
  }
  for (const [path, entry] of Object.entries(packages)) {
    if (!path) continue;
    for (const kind of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [dep, range] of Object.entries(entry[kind] ?? {})) {
        if (dep !== name) continue;
        requesters.push({ declaringPath: path, range, resolved: resolveFrom(path, dep), kind });
      }
    }
  }
  return { versions: [...versions.keys()].sort(), versionsByPath: Object.fromEntries(versions), requesters };
}

let cachedReport = null;
async function audit() {
  if (cachedReport) return cachedReport;
  const { code, json } = await runCli(["audit", INPUT, "--format=json"]);
  assert.ok(json, "真实树必须产出可解析的 JSON 报告");
  cachedReport = { code, json };
  return cachedReport;
}

test("真实树：规模与拓扑未被压平（20 个已安装包、双 ms、两层嵌套路径）", async () => {
  const installed = Object.keys(packages).filter((p) => p);
  assert.equal(installed.length, 20, "必须是 20 个已安装包（plan/01 §3.3 的规模要求）");
  assert.equal(Object.keys(packages).length, 21, "锁条目 = 20 + 根条目");

  const ms = collectRequesters("ms");
  assert.deepEqual(ms.versions, ["2.0.0", "2.1.3"], "ms 必须两个版本并存");
  // 拓扑：2.0.0 在顶层、2.1.3 嵌套在 send 下 —— 这正是 npm 实际 hoisting 的结果，不许压平
  assert.deepEqual(ms.versionsByPath["2.0.0"], ["node_modules/ms"]);
  assert.deepEqual(ms.versionsByPath["2.1.3"], ["node_modules/send/node_modules/ms"]);

  const { json } = await audit();
  assert.equal(json.input.packages, 21, "报告的锁条目数必须与原始 JSON 一致");
  assert.equal(json.input.reachable, 20, "20 个已安装包全部可达");
  assert.equal(json.input.declarations, 3, "根声明 3 条（bytes / debug / send）");
  assert.equal(json.input.lockfileVersion, 3);
});

test("真实树：结论是 NOT_CONVERGIBLE + 最小冲突集（不是 CONVERGIBLE）", async () => {
  const { code, json } = await audit();
  const item = json.dedupe.find((d) => d.package === "ms");
  assert.ok(item, "必须对 ms 给出收敛判定");
  assert.equal(item.status, "NOT_CONVERGIBLE", "两个精确锁定没有共同解 → 不可收敛");
  assert.equal(item.reason, "empty-intersection", "2.0.0 与 2.1.3 的区间本身为空");
  assert.equal(item.degraded, false, "2 个请求者远未触及 --max-requesters 上限");
  assert.equal(item.requesters, 2);
  assert.deepEqual(item.lockedVersions, ["2.0.0", "2.1.3"]);

  // 不许给出"目标"（CONVERGIBLE 才该有）
  assert.equal(Array.isArray(item.targets) ? item.targets.length : 0, 0, "不可收敛就不该有 targets");
  assert.equal(item.minimalConflictSet.length, 2);

  // 退出码 1：NOT_CONVERGIBLE（error）+ version-conflict（error）
  assert.equal(code, 1);
});

test("真实树：最小冲突集与原始 JSON 的请求者范围逐一核对", async () => {
  const { json } = await audit();
  const item = json.dedupe.find((d) => d.package === "ms");
  const raw = collectRequesters("ms");

  // 原始 JSON 里的请求者：debug@2.6.9 → "2.0.0"、send@0.18.0 → "2.1.3"
  assert.equal(raw.requesters.length, 2, "夹具里 ms 的声明者恰好两条");
  const rawByRequester = new Map(
    raw.requesters.map((r) => [`${r.declaringPath}|${r.range}|${r.resolved}`, r]),
  );
  assert.ok(rawByRequester.has("node_modules/debug|2.0.0|node_modules/ms"), "debug 精确钉 ms 2.0.0（顶层）");
  assert.ok(
    rawByRequester.has("node_modules/send|2.1.3|node_modules/send/node_modules/ms"),
    "send 精确钉 ms 2.1.3（嵌套）",
  );

  // 报告给出的集合必须与原始 JSON 的声明一一对应（range 与请求者路径都核对）
  assert.deepEqual(
    item.minimalConflictSet.map((m) => m.range).sort(),
    raw.requesters.map((r) => r.range).sort(),
  );
  assert.deepEqual(item.minimalConflictSet[0].requesterPath, ["<root>", "debug@2.6.9"]);
  assert.deepEqual(item.minimalConflictSet[1].requesterPath, ["<root>", "send@0.18.0"]);
});

test("真实树：MUS 可机械校验（M 无解 + 移除任一元素后有解）", async () => {
  const { json } = await audit();
  const item = json.dedupe.find((d) => d.package === "ms");
  const locked = item.lockedVersions;
  const ranges = item.minimalConflictSet.map((m) => m.range);

  // ① 无解：任何已锁定版本都不能同时满足 M 的全部范围
  for (const v of locked) {
    assert.ok(
      !ranges.every((r) => satisfies(v, r)),
      `M 在 ${v} 上有解 → 不能构成冲突集（范围 ${JSON.stringify(ranges)}）`,
    );
  }
  // ② 极小：移除任一元素后，存在已锁定版本满足剩余全部范围
  for (let i = 0; i < ranges.length; i += 1) {
    const rest = ranges.filter((_, j) => j !== i);
    assert.ok(
      locked.some((v) => rest.every((r) => satisfies(v, r))),
      `移除 ${JSON.stringify(ranges[i])} 后应当可满足（否则不是极小集）`,
    );
  }
});

test("真实树：锁自洽（每条声明都由其解析到的版本满足）—— npm ls 退出码 0 的本地形态", async () => {
  const problems = [];
  const declarations = [];
  for (const [dep, range] of Object.entries(manifest.dependencies ?? {})) {
    declarations.push({ from: "", dep, range });
  }
  for (const [path, entry] of Object.entries(packages)) {
    if (!path) continue;
    for (const kind of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [dep, range] of Object.entries(entry[kind] ?? {})) {
        declarations.push({ from: path, dep, range });
      }
    }
  }
  for (const d of declarations) {
    const resolved = resolveFrom(d.from, d.dep);
    if (!resolved) {
      problems.push(`${d.from || "<root>"} 声明 ${d.dep}@${d.range}，但树里没有解析目标`);
      continue;
    }
    if (!satisfies(packages[resolved].version, d.range)) {
      problems.push(
        `${d.from || "<root>"} 声明 ${d.dep}@${d.range}，解析到 ${resolved}@${packages[resolved].version}（不满足）`,
      );
    }
  }
  assert.deepEqual(problems, [], `真实树必须是 npm ls 式的自洽树：\n${problems.join("\n")}`);

  // 本工具的 M2 面也必须给出同一结论：零 finding（no false positive on real data）
  const { json } = await audit();
  assert.deepEqual(json.findings, [], "真实树上 M1/M2 不得报任何 finding");
});
