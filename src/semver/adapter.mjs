/**
 * semver 适配层 —— **全仓唯一允许 import('semver') 的地方**（plan/03 K5）。
 *
 * 为什么必须收成一个卡点：
 *   1. 差分测试（工具 vs 直接算库）需要一个"对照实现"的单一来源；
 *   2. 实现版本必须随每条语义结论输出（`data/README.md` §1.1 有 7.7.4 / 7.8.5 交叉记录，
 *      而预发布默认语义在别的生态里已经变过——Python packaging 26.0）；
 *   3. 换成别的库/版本时，只需检查这一个文件与全部向量。
 *
 * 纪律：本文件只做**转发 + 标签**，不实现任何 semver 规则（不编造语义）。
 */

import semver from "semver";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

function readSemverVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "node_modules", "semver", "package.json"), "utf8"));
    return pkg.version;
  } catch {
    return semver.SEMVER_SPEC_VERSION ? "unknown" : "unknown";
  }
}

/** 实现标签：所有语义结论都必须带上它（plan/03 K9）。 */
export const IMPLEMENTATION = Object.freeze({
  library: "node-semver",
  version: readSemverVersion(),
  spec: semver.SEMVER_SPEC_VERSION ?? null,
});

/** 原子能力，原样转发。不许在这里加业务判断。 */
export const validRange = (range, options) => semver.validRange(range, options);
export const satisfies = (version, range, options) => semver.satisfies(version, range, options);
export const intersects = (a, b, options) => semver.intersects(a, b, options);
export const subset = (sub, dom, options) => semver.subset(sub, dom, options);
export const compare = (a, b, options) => semver.compare(a, b, options);
export const rcompare = (a, b, options) => semver.rcompare(a, b, options);
export const valid = (version, options) => semver.valid(version, options);
export const parse = (version, options) => semver.parse(version, options);
export const coerce = (value, options) => semver.coerce(value, options);
export const minVersion = (range, options) => semver.minVersion(range, options);
export const Range = semver.Range;
export const SemVer = semver.SemVer;

/**
 * 把 `validRange` 的展开结果解析成比较器列表（只做结构拆分，不做语义推断）。
 * 返回 `null` 表示该串**不是** semver 范围（如 `latest` → validRange 为 null）。
 */
export function comparatorsOf(range) {
  const expanded = semver.validRange(range);
  if (expanded === null) return null;
  const branches = expanded
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/).filter(Boolean));
  return { expanded, branches };
}
