/**
 * 包内公共导出（供测试与后续里程碑复用）。
 * 形状稳定即可；这里故意不导出 CLI 内部状态。
 */

export { parseArgs, splitCommand } from "./cli/args.mjs";
export { run, COMMANDS, helpText } from "./cli/main.mjs";
export { computeExitCode, EXIT } from "./cli/exit.mjs";
export { loadManifest, parseManifest, flattenDeclarations } from "./model/manifest.mjs";
export { loadLock, parseLock, detectLockfileVersion, SUPPORTED_LOCKFILE_VERSIONS } from "./model/lockfile.mjs";
export { buildGraph, resolveDependency, pathToChain, groupByName } from "./model/graph.mjs";
export { runRangeLint } from "./rules/range-lint.mjs";
export { runLockManifestCheck } from "./checks/lock-manifest.mjs";
export { runDedupeFeasibility } from "./checks/dedupe.mjs";
export { runConflictExplain } from "./checks/conflict.mjs";
export { findMinimalConflictSet, combinations } from "./mus/minimal-set.mjs";
export { normalizeRange, intersectRanges, rangeIsEmpty, sortVersions } from "./semver/interval.mjs";
export { IMPLEMENTATION } from "./semver/adapter.mjs";
export { buildSeverityTable, DEFAULT_SEVERITY } from "./policy/severity.mjs";
export { makeReport, serializeJson, serializeText } from "./report/serialize.mjs";
export { SCHEMA_VERSION } from "./report/schema.mjs";
export { renderSarif } from "./report/sarif.mjs";
export { toolInfo } from "./meta.mjs";
export { InputError, UsageError, InternalInconsistency } from "./errors.mjs";
