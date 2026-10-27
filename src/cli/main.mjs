/**
 * 命令分派与报告组装。
 *
 * 分工纪律：
 *   - 本文件**不做判定**，只编排：读输入 → 调模块 → 组装报告 → 选格式 → 定退出码；
 *   - 所有"判定语义"在 `src/rules/` 与 `src/checks/`；
 *   - 所有"输出形态"在 `src/report/`。
 *
 * 骨架期的能力面（M0）：`doctor` 与 `audit`（M1 + M2 已实现）、`dedupe`、`conflict`
 * 均可跑；M5 的 SARIF 只在有 findings 时有意义，但格式通道已全通。
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadManifest, declarationCount } from "../model/manifest.mjs";
import { loadLock } from "../model/lockfile.mjs";
import { buildGraph } from "../model/graph.mjs";
import { runRangeLint, sortFindings } from "../rules/range-lint.mjs";
import { runLockManifestCheck, prereleaseTargetsFromLock, sortM2 } from "../checks/lock-manifest.mjs";
import { runDedupeFeasibility } from "../checks/dedupe.mjs";
import { runConflictExplain } from "../checks/conflict.mjs";
import { selfCheck } from "../checks/self-check.mjs";
import { buildSeverityTable, maxSeverity } from "../policy/severity.mjs";
import { makeReport, serializeJson, serializeText, writeArtifact, assertSerializableDeterminism } from "../report/serialize.mjs";
import { renderText } from "../report/text.mjs";
import { renderSarif } from "../report/sarif.mjs";
import { computeExitCode, EXIT } from "./exit.mjs";
import { toolInfo } from "../meta.mjs";
import { IMPLEMENTATION } from "../semver/adapter.mjs";
import { InputError, UsageError } from "../errors.mjs";

export const COMMANDS = Object.freeze(["audit", "range-lint", "lock-manifest", "dedupe", "conflict", "doctor"]);

/**
 * 主入口。
 * @param {{options: object, positionals: string[]}} parsed
 * @param {{stdout: (s:string)=>void, stderr:(s:string)=>void}} io
 * @returns {Promise<number>} 退出码
 */
export async function run(parsed, io) {
  const { options, positionals } = parsed;
  const [command = "audit", ...rest] = positionals;

  if (options.help) {
    io.stdout(helpText());
    return EXIT.OK;
  }
  if (options.version) {
    io.stdout(`${toolInfo().name} ${toolInfo().version}\n`);
    return EXIT.OK;
  }
  if (!COMMANDS.includes(command)) {
    throw new UsageError(`未知命令 ${JSON.stringify(command)}（可用：${COMMANDS.join(" / ")}）`);
  }

  const target = rest[0] ?? ".";
  const dir = resolve(target);

  if (command === "doctor") {
    return runDoctor(dir, options, io);
  }

  const context = loadContext(dir, options);
  return runChecks(command, context, options, io);
}

function loadContext(dir, options) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new InputError(`目标不是目录：${options.verbosePaths ? dir : "<input>"}`);
  }
  const manifestPath = join(dir, "package.json");
  const lockPath = join(dir, "package-lock.json");
  if (!existsSync(manifestPath)) throw new InputError("缺少 package.json", { file: options.verbosePaths ? manifestPath : "package.json" });
  if (!existsSync(lockPath)) throw new InputError("缺少 package-lock.json", { file: options.verbosePaths ? lockPath : "package-lock.json" });

  const manifest = loadManifest(dir);
  const lock = loadLock(dir);
  const graph = buildGraph(manifest, lock);

  const severityOverrides = loadSeverityOverrides(options);
  const { table, overrides, rejected } = buildSeverityTable(severityOverrides);
  if (rejected.length > 0) throw new UsageError(`--severity-map 有无效条目：${rejected.join("；")}`);

  return { dir, manifest, lock, graph, severityTable: table, severityOverrides: overrides, options };
}

/** `--severity-map` 只在这里读一次；文件不存在/不是 JSON 都是输入错误（3），不是用法错误。 */
function loadSeverityOverrides(options) {
  if (!options.severityMap) return {};
  const path = resolve(options.severityMap);
  if (!existsSync(path)) throw new InputError(`--severity-map 文件不存在：${options.severityMap}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new InputError(`--severity-map 不是合法 JSON：${options.severityMap}`, { detail: error.message });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InputError("--severity-map 顶层必须是对象（规则名 → 级别）");
  }
  return raw;
}

function runDoctor(dir, options, io) {
  const lines = [];
  let ok = true;
  try {
    const manifest = loadManifest(dir);
    const lock = loadLock(dir);
    const decls = declarationCount(manifest);
    const graph = buildGraph(manifest, lock);
    lines.push(`${options.verbosePaths ? dir : "<input>"}`);
    lines.push(`  package.json        OK（声明 ${decls} 条）`);
    lines.push(`  package-lock.json   OK（lockfileVersion ${lock.lockfileVersion}，${lock.packages.length} 个条目）`);
    lines.push(`  声明图              边 ${graph.edges.length} 条 / 可达 ${graph.reachable.size} 个包`);
    lines.push(`  semver              ${IMPLEMENTATION.library} ${IMPLEMENTATION.version}`);
    lines.push(`  结论                输入可解析`);
  } catch (error) {
    ok = false;
    lines.push(`  结论                输入不可解析：${error.message}`);
  }
  io.stdout(`${lines.join("\n")}\n`);
  return ok ? EXIT.OK : EXIT.INPUT;
}

function runChecks(command, context, options, io) {
  const { manifest, lock, graph, severityTable } = context;
  const prereleaseTargets = prereleaseTargetsFromLock(lock);

  const wantRange = command === "audit" || command === "range-lint";
  const wantLock = command === "audit" || command === "lock-manifest";
  const wantDedupe = command === "dedupe" || command === "audit";
  const wantConflict = command === "conflict" || command === "audit";

  const findings = [];
  if (wantRange) {
    findings.push(
      ...runRangeLint(manifest, {
        severityTable,
        enableR8: options.enableR8 === true,
        prereleaseTargets,
      }),
    );
  }
  if (wantLock) {
    findings.push(
      ...runLockManifestCheck(manifest, lock, graph, {
        severityTable,
        strict: options.strict === true,
      }),
    );
  }

  const sorted = mergeFindings(findings, wantRange);
  const dedupe = wantDedupe
    ? runDedupeFeasibility(graph, {
        severityTable,
        maxRequesters: options.maxRequesters,
        prefer: options.prefer,
      })
    : [];
  const conflicts = wantConflict
    ? runConflictExplain(graph, { severityTable, maxRequesters: options.maxRequesters, ignorePeer: options.ignorePeer })
    : [];

  const summary = summarize(sorted, dedupe, conflicts);
  const degraded = [
    ...dedupe.filter((d) => d.degraded).map((d) => `${d.package}: ${d.degradeReason ?? "degraded"}`),
    ...conflicts.filter((c) => c.degraded).map((c) => `${c.package}: ${c.degradeReason ?? "degraded"}`),
  ];
  const inconsistencies = selfCheck({ findings: sorted, dedupe, conflicts });

  const report = makeReport({
    tool: toolInfo(),
    implementation: { library: IMPLEMENTATION.library, version: IMPLEMENTATION.version },
    policy: {
      name: options.severityMapPath ? "file-override" : "builtin-default",
      overrides: context.severityOverrides,
      failOn: options.failOn,
      strict: options.strict === true,
      prefer: options.prefer,
      ignorePeer: options.ignorePeer === true,
      maxRequesters: options.maxRequesters,
      note: "默认档位是策略，不是事实；--severity-map 可整表覆盖",
    },
    input: {
      manifest: "package.json",
      lockfile: "package-lock.json",
      lockfileVersion: lock.lockfileVersion,
      format: lock.format,
      declarations: declarationCount(manifest),
      packages: lock.packages.length,
      reachable: graph.reachable.size,
    },
    summary,
    findings: sorted,
    dedupe,
    conflicts,
    degraded,
    internalInconsistency: inconsistencies.length ? inconsistencies : null,
  });

  emit(report, options, io);

  return computeExitCode({
    summary,
    failOn: options.failOn,
    inputError: false,
    inconsistency: inconsistencies.length > 0,
  });
}

/** M1 与 M2 的 finding 混在一起时，排序键要同时照顾两类（M1 有 rule，M2 有 kind）。 */
function mergeFindings(findings, wantRange) {
  const rangeFindings = sortFindings(findings.filter((f) => f.rule !== undefined));
  const lockFindings = sortM2(findings.filter((f) => f.kind !== undefined));
  return [...rangeFindings, ...lockFindings];
}

function summarize(findings, dedupe, conflicts) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  for (const d of dedupe) counts[d.severity] = (counts[d.severity] ?? 0) + 1;
  for (const c of conflicts) counts[c.severity] = (counts[c.severity] ?? 0) + 1;
  return {
    error: counts.error,
    warning: counts.warning,
    info: counts.info,
    total: counts.error + counts.warning + counts.info,
    highest: maxSeverity(findings.map(findingSeverity)) ?? null,
  };
}

function findingSeverity(f) {
  return f.severity;
}

function emit(report, options, io) {
  let content;
  let serializedForCheck;
  if (options.format === "json") {
    content = serializeJson(report);
    serializedForCheck = assertSerializableDeterminism(report, serializeJson);
  } else if (options.format === "sarif") {
    const sarif = renderSarif(report);
    content = serializeJson(sarif);
    serializedForCheck = assertSerializableDeterminism(sarif, serializeJson);
  } else {
    content = serializeText(renderText(report));
    serializedForCheck = content;
  }

  if (serializedForCheck !== content) {
    throw new Error("序列化自检失败：两次输出不同（内部缺陷）");
  }

  if (options.out) {
    writeArtifact(options.out, content);
    io.stderr(`已写入 ${options.out}（${Buffer.byteLength(content, "utf8")} 字节）\n`);
    return;
  }
  io.stdout(content);
}

export function helpText() {
  const { name, version } = toolInfo();
  return `${name} ${version} —— 离线版本约束审计器

用法：
  versionaudit <command> [dir] [options]

命令：
  audit           一次跑完 M1 + M2 + M3 + M4（默认）
  range-lint      仅范围语义（R1–R8）
  lock-manifest   仅锁与声明一致性（M2）
  dedupe          仅重复版本收敛可行性（M3）
  conflict        仅冲突最小解释（M4）
  doctor          输入可读性诊断（不产出发现）

选项：
  --format=text|json|sarif   输出格式（默认 text）
  --out <file>               显式给出才写文件（原子写）
  --fail-on=error|warning|never  默认 error
  --severity-map <file>      JSON 档位覆盖表（未知键会被拒绝）
  --strict                   把"锁中版本 != 声明下界"视为 lock-outdated
  --prefer=latest|min-change 只影响收敛目标的排序与标注，不改可行性
  --ignore-peer              peer 冲突降为 info
  --enable-r8                开启 R8（裸版本跨生态误用提示，默认关闭）
  --max-requesters <n>       MUS 上限（默认 12，超限显式降级）
  --verbose-paths            允许输出绝对路径（默认全部相对）
  --help / --version

退出码：0 无问题 / 1 error / 2 仅 warning 且 --fail-on=warning / 3 输入不可解析 / 4 内部不一致
口径定义：data/README.md §7（唯一真相源）
`;
}
