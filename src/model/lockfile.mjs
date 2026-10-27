/**
 * lockfile 分派器：**版本探测 + 结构一致性检查**（`plan/01` §3.6 最后一行）。
 *
 * 硬纪律：
 *   - `lockfileVersion` 1 / 2 / 3 各有一份解析器，产出**同形 IR**；
 *   - v1 的嵌套 `dependencies` 与 v2/v3 的 `packages` **混用即输入不可解析**（退出码 3），
 *     不做"尽量猜"；
 *   - 未知 `lockfileVersion` → 退出码 3，且报文里列出支持的版本面。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { InputError } from "../errors.mjs";
import { parseLockV1 } from "./lock-v1.mjs";
import { parseLockV2 } from "./lock-v2.mjs";
import { parseLockV3 } from "./lock-v3.mjs";

export const SUPPORTED_LOCKFILE_VERSIONS = Object.freeze([1, 2, 3]);

export function detectLockfileVersion(raw, { file = "package-lock.json" } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InputError("package-lock.json 顶层必须是对象", { file });
  }
  const version = raw.lockfileVersion;
  if (version === undefined) {
    // npm 6 及更早没有 lockfileVersion 字段 → 语义等同 v1（嵌套 dependencies）
    if (raw.dependencies && !raw.packages) return 1;
    throw new InputError("缺少 lockfileVersion 字段，且无法从结构推断", { file });
  }
  if (!Number.isInteger(version)) {
    throw new InputError(`lockfileVersion 必须是整数`, { file, detail: `实际是 ${JSON.stringify(version)}` });
  }
  if (!SUPPORTED_LOCKFILE_VERSIONS.includes(version)) {
    throw new InputError(`不支持的 lockfileVersion ${version}`, {
      file,
      detail: `支持 ${SUPPORTED_LOCKFILE_VERSIONS.join(" / ")}`,
    });
  }
  return version;
}

/**
 * 结构混用检查：v2 允许同时有 `packages` 与 `dependencies`（且必须互相自洽）；
 * v1 有 `packages` 或 v3 有 `dependencies` 都是**结构混用**，不是"可容忍的冗余"。
 */
function assertStructureMatchesVersion(raw, version, { file }) {
  const hasPackages = raw.packages !== undefined;
  const hasDependencies = raw.dependencies !== undefined;
  if (version === 1) {
    if (hasPackages && !hasDependencies) {
      throw new InputError("lockfileVersion 1 却只有 packages 字段（v3 形态）：结构混用", {
        file,
        detail: "v1/v2/v3 结构混用；请用生成该锁的工具重写锁文件（不做'尽量猜'）",
      });
    }
    return;
  }
  if (version === 3 && hasDependencies) {
    throw new InputError("lockfileVersion 3 却带 dependencies 字段（v2 形态）", {
      file,
      detail: "v3 只应有 packages；结构混用不做猜测",
    });
  }
  if (version === 2 && !hasPackages) {
    throw new InputError("lockfileVersion 2 缺少 packages 字段", {
      file,
      detail: "v2 必须同时提供 packages 与 dependencies 两个视图；结构混用不做猜测",
    });
  }
}

export function parseLock(raw, { file = "package-lock.json" } = {}) {
  const version = detectLockfileVersion(raw, { file });
  assertStructureMatchesVersion(raw, version, { file });
  const parse = version === 1 ? parseLockV1 : version === 2 ? parseLockV2 : parseLockV3;
  const ir = parse(raw, { file });
  return { ...ir, lockfileVersion: version };
}

export function loadLock(dir) {
  const file = join(dir, "package-lock.json");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new InputError("无法读取 package-lock.json", { file, detail: error.message });
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new InputError("package-lock.json 不是合法 JSON", { file, detail: error.message });
  }
  return parseLock(raw, { file });
}
