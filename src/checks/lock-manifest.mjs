/**
 * M2 `lock-manifest-check` —— 双向一致性（`plan/03` M2）。
 *
 * 四类 `kind` 的判据**只在 `plan/03` 定义**（`data/README.md` §7 不含此四词），本文件是它的实现。
 *
 * 核心承诺（`plan/00` D1，对 `npm ci` 的补位）：每条 finding 都带
 *   `declaringPackage` / `declaredRange` / `requesterPath`
 * ——`npm ci` 只给目标版本 `0.19.2`，范围与来源都没有。
 */

import { satisfies, validRange } from "../semver/adapter.mjs";
import { pathToChain, resolveDependency } from "../model/graph.mjs";
import { ROOT_MARKER } from "../model/lock-common.mjs";

const SEVERITY_FALLBACK = Object.freeze({
  "manifest-not-satisfied": "error",
  "missing-from-lock": "error",
  "manifest-changed-unsynced": "error",
  "lock-extra-undeclared": "warning",
  "lock-outdated": "warning",
});

/**
 * @param {object} manifest ManifestIR
 * @param {object} lock LockIR
 * @param {object} graph GraphIR
 * @param {{severityTable: object, strict?: boolean,
 *          onDegraded?: (msg: string) => void}} ctx
 * @returns {{findings: object[], degradations: string[]}}
 *   `degradations` 非空的含义是"有判定做不了"（当前只有一类：锁条目无 `version`，
 *   见 K17 —— 那是"无法判定"，不是"不满足"）。缺省也该由调用方写进报告的
 *   `degraded` 字段（K8：任何降级必须带 `degraded: true` + `reason`，不许静默近似）。
 */
export function runLockManifestCheck(manifest, lock, graph, ctx = {}) {
  const table = ctx.severityTable ?? SEVERITY_FALLBACK;
  const degradations = [];
  const degrade = (msg) => {
    degradations.push(msg);
    ctx.onDegraded?.(msg);
  };
  const findings = [];
  const push = (finding) => {
    findings.push({ ...finding, severity: table[finding.kind] ?? SEVERITY_FALLBACK[finding.kind] ?? "info" });
  };

  // ── 1. manifest-not-satisfied / missing-from-lock ─────────────────────────
  for (const edge of graph.edges) {
    const chain = pathToChain(graph.nodes, edge.declaringPath);
    const declaringPackage = edge.declaringPath === ROOT_MARKER
      ? (manifest.name ?? "<root>")
      : `${graph.nodes.get(edge.declaringPath)?.name ?? "?"}@${graph.nodes.get(edge.declaringPath)?.version ?? "?"}`;

    if (!edge.lockedPath) {
      if (edge.optional) continue; // optional 缺了不算错（plan/03 M2 判据）
      push({
        kind: "missing-from-lock",
        declaringPackage,
        declaringPath: chain,
        dependency: edge.dependency,
        declaredRange: edge.range,
        lockedVersion: null,
        requesterPath: chain,
        explanation: `${declaringPackage} 声明 ${edge.dependency}@${edge.range}，锁中无对应条目`,
      });
      continue;
    }

    // **`latest` 等 dist-tag 不是 semver 范围**（data/README.md A13：validRange 为 null）。
    // 对它跑 satisfies 必然 false —— 那是编造语义。正解：显式跳过 satisfies 判定，
    // 只记录"声明的是 dist-tag"，把判定交给 R2（已在 M1 报出）。
    const declaredExpanded = validRange(edge.range);
    if (declaredExpanded === null) {
      // 非 semver 范围（含 `file:` / `link:` 本地路径）：不做满足性判定
      continue;
    }

    // **锁中条目没有版本时不得制造"不满足"**（台账 A23）。
    // 实测 npm 11.12.1 会写出两类无版本条目：
    //   ① `{"resolved":"../lib","link":true}` —— file:/workspace 链接，真实版本在链接目标里，锁不记录；
    //   ② `{"optional": true}` —— 声明了但没装上（平台不匹配 / 离线缺缓存）。
    // 这两种情形下 `satisfies(null, range)` 恒为 false，直接判"不满足"= 把"无法判定"
    // 说成"判定为错"。真实 npm 锁上实测 `npm ci` 两者都 PASS。
    if (edge.lockedVersion === null) {
      degrade(
        `${edge.dependency}（${chain.join(" › ")}）：锁中条目无 version 字段（link/optional 占位），无法判定是否满足 ${edge.range}`,
      );
      continue;
    }

    const ok = satisfies(edge.lockedVersion, edge.range);
    if (!ok) {
      push({
        kind: "manifest-not-satisfied",
        declaringPackage,
        declaringPath: chain,
        dependency: edge.dependency,
        declaredRange: edge.range,
        lockedVersion: edge.lockedVersion,
        requesterPath: chain,
        explanation: `${declaringPackage} 声明 ${edge.dependency}@${edge.range}，锁中解析为 ${edge.lockedVersion}`,
      });
      continue;
    }

    // --strict：锁中版本 vs 声明下界所指最小版本 → lock-outdated（默认不判，plan/01 §3.6）
    if (ctx.strict) {
      const min = minVersionOf(edge.range);
      if (min && edge.lockedVersion !== min) {
        push({
          kind: "lock-outdated",
          declaringPackage,
          declaringPath: chain,
          dependency: edge.dependency,
          declaredRange: edge.range,
          lockedVersion: edge.lockedVersion,
          requesterPath: chain,
          explanation: `--strict：声明下界为 ${min}，锁中为 ${edge.lockedVersion}（默认档不判"过期 vs 有意 override"）`,
        });
      }
    }
  }

  // ── 2. manifest-changed-unsynced ─────────────────────────────────────────
  // 这是最接近 `npm ci` 的基线对照：lock 内 packages[""] 的各声明键 vs manifest。
  //
  // **口径修正（M3，台账 A22/A23）**：旧实现假设"npm 把 optionalDependencies 也写进根
  // dependencies"，于是拿 `{...optional, ...dependencies}` 去比对 `packages[""].dependencies`。
  // 实测 npm 11.12.1 的根条目是**四类键各写各的**：
  //   {"dependencies":{"semver":"7.8.5"},"devDependencies":{…},"optionalDependencies":{…}}
  // 旧口径在**任何**带 optionalDependencies 的真实锁上都会误报
  // `manifest-changed-unsynced`（报"锁中根声明缺失"，实测工具退出码 1 而 `npm ci` 退出码 0）。
  // 正解：**逐类对比同一类键**（dependencies↔dependencies、optionalDependencies↔…），
  // 不做跨类合并。锁里没写该类键时（键缺失 = 该类无声明）按"空"比对。
  //
  // 注意 devDependencies：实测 `npm ci` 在 manifest 增减/修改 dev 依赖时**均 PASS**
  // （A24：npm 只校验"锁能否满足 manifest"，不管锁是否多余），所以 dev **不参与**这里
  // 的比对 —— 比 dev 只会制造 npm ci 不会有的失败。这是有意为之，登记在
  // `docs/limitations.md` §3.4。
  const rootPairs = [
    ["dependencies", lock.rootManifestDeps, manifest.deps.dependencies],
    ["optionalDependencies", lock.rootOptionalDeps, manifest.deps.optionalDependencies],
  ];
  const hasLockRootDeps =
    Object.keys(lock.rootManifestDeps ?? {}).length > 0 ||
    Object.keys(lock.rootOptionalDeps ?? {}).length > 0;
  if (hasLockRootDeps) {
    for (const [kind, lockMap, manifestMap] of rootPairs) {
      const keys = new Set([...Object.keys(lockMap ?? {}), ...Object.keys(manifestMap ?? {})]);
      for (const name of [...keys].sort()) {
        const inLock = (lockMap ?? {})[name];
        const inManifest = (manifestMap ?? {})[name];
        if (inLock === inManifest) continue;
        push({
          kind: "manifest-changed-unsynced",
          declaringPackage: manifest.name ?? "<root>",
          declaringPath: [ROOT_MARKER],
          dependency: name,
          declaredRange: inManifest ?? null,
          lockedVersion: inLock !== undefined ? inLock : null,
          requesterPath: [ROOT_MARKER],
          explanation:
            inManifest === undefined
              ? `锁中根 ${kind} 有 ${name}@${inLock}，manifest 已删除该声明`
              : inLock === undefined
                ? `manifest 声明 ${name}@${inManifest}，锁中根 ${kind} 缺失（npm ci 会 EUSAGE）`
                : `manifest 声明 ${name}@${inManifest}，锁中根 ${kind} 为 ${name}@${inLock}`,
        });
      }
    }
  }

  // ── 3. lock-extra-undeclared ─────────────────────────────────────────────
  // 判据 = 声明图可达性（不依赖 node_modules 是否存在，plan/01 §3.2）。
  // **跳过两类条目（台账 A24 实测）**：
  //   ① `link: true` 的链接条目 —— 真实 npm 会对 file:/workspace 依赖写
  //      `node_modules/lib: {"resolved":"../lib","link":true}`，它由 `file:` 声明引入，
  //      只是版本在链接目标里而不在锁里；真版本另存于 `"../lib"` 这类树外路径条目。
  //   ② 树外路径条目（不以 `node_modules/` 开头，如 `"../lib"`）—— 那是链接目标的体，
  //      不是被安装到树里的包；旧实现的 `nameFromPath("../lib")` 会解析出 `".."`，
  //      于是在**任何**含 file: 依赖的真实锁上误报 `lock-extra-undeclared("..")`。
  for (const pkg of lock.packages) {
    if (pkg.path === ROOT_MARKER) continue;
    if (!pkg.path.startsWith("node_modules/")) continue; // 树外（链接目标体）
    if (pkg.link) continue; // 链接条目：版本在目标里，不判
    if (graph.reachable.has(pkg.path)) continue;
    push({
      kind: "lock-extra-undeclared",
      declaringPackage: null,
      declaringPath: [],
      dependency: pkg.name ?? "?",
      declaredRange: null,
      lockedVersion: pkg.version,
      requesterPath: [],
      explanation: `锁中 ${pkg.path} 在 manifest 可达图里没有任何请求者（基于声明图，不依赖 node_modules 实际存在）`,
    });
  }

  return { findings: sortM2(findings), degradations };
}

/** 声明范围下界所指的最小版本（只在 --strict 用；不装新依赖，用 validRange 的展开结果自行取）。 */
function minVersionOf(range) {
  const expanded = validRange(range);
  if (expanded === null) return null;
  const first = expanded.split("||")[0].trim();
  const comps = first.split(/\s+/).filter(Boolean);
  let best = null;
  for (const comp of comps) {
    const m = /^(>=|\^|~|=)?(.+)$/.exec(comp);
    if (!m) continue;
    const op = m[1] ?? "=";
    if (!["=", ">=", "^", "~"].includes(op)) continue;
    const v = normalizeTo3(m[2]);
    if (!v) continue;
    if (best === null || compareTuple(v, best) > 0) best = v;
  }
  return best ? best.join(".") : null;
}

function normalizeTo3(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(v);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareTuple(a, b) {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

export function sortM2(findings) {
  return [...findings].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    const pa = (a.requesterPath ?? []).join("/");
    const pb = (b.requesterPath ?? []).join("/");
    if (pa !== pb) return pa < pb ? -1 : 1;
    if (a.dependency !== b.dependency) return (a.dependency ?? "") < (b.dependency ?? "") ? -1 : 1;
    return String(a.lockedVersion ?? "") < String(b.lockedVersion ?? "") ? -1 : 1;
  });
}

/** R4 需要的预发布目标：从锁中挑出同名的预发布版本。 */
export function prereleaseTargetsFromLock(lock) {
  const map = new Map();
  for (const pkg of lock.packages) {
    if (pkg.path === ROOT_MARKER || !pkg.name || !pkg.version) continue;
    if (!pkg.version.includes("-")) continue;
    const [maj, min, pat] = pkg.version.split(/[-+]/)[0].split(".").map(Number);
    if (!map.has(pkg.name)) map.set(pkg.name, []);
    map.get(pkg.name).push({ version: pkg.version, major: maj, minor: min, patch: pat, isPrerelease: true });
  }
  return map;
}
