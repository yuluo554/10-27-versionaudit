/**
 * 工具元信息（版本号的**唯一来源**之外的展示层）。
 *
 * 版本号真源 = `package.json` 的 `version`；这里读它，不手抄（references 的"版本四处一致"条）。
 * 测试 `tests/meta/version-consistency.test.mjs` 断言 package.json / CLI / README 三处一致。
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

let cached = null;

export function toolInfo() {
  if (cached) return cached;
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  cached = Object.freeze({
    name: pkg.name,
    version: pkg.version,
    informationUri: "https://github.com/yuluo554/10-27-versionaudit",
  });
  return cached;
}

export const REPO_ROOT = ROOT;
