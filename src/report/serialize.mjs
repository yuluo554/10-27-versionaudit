/**
 * 序列化单点（`plan/03` K1 / `data/README.md` §7.5）。
 *
 * 三条纪律：
 *   1. **键序由 schema 表驱动**，不依赖对象插入顺序；
 *   2. **数组按稳定键排序**（在各自构造处做，这里只做最终自检）；
 *   3. LF + 结尾换行 + 无时间戳/主机名/绝对路径。
 *
 * 唯一写盘入口 `writeArtifact`：先写临时文件再 rename（原子），失败不留半个产物。
 */

import { writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { REPORT_FIELDS, SCHEMA_VERSION } from "./schema.mjs";

/** 按给定字段表重排对象（未列出的字段排在后面并按字典序，保证不静默丢字段）。 */
export function orderFields(obj, fields) {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const key of fields) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  const extras = Object.keys(obj)
    .filter((k) => !fields.includes(k))
    .sort();
  for (const key of extras) out[key] = obj[key];
  return out;
}

/** 递归按键排序（用于 policy 这类"无固定 schema"的自由映射）。 */
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value === null || typeof value !== "object") return value;
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = sortKeysDeep(value[key]);
  return out;
}

/** JSON 序列化：键序由调用方先 orderFields 决定，这里只固定缩进/换行。 */
export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function serializeText(lines) {
  const body = lines.join("\n").replace(/\r\n/g, "\n");
  return body.endsWith("\n") ? body : `${body}\n`;
}

/** 报告骨架：所有产生报告的路径都从这里出发（保证 schemaVersion 与字段集一致）。 */
export function makeReport({ tool, implementation, policy, input, summary, findings, dedupe, conflicts, degraded, internalInconsistency }) {
  return orderFields(
    {
      schemaVersion: SCHEMA_VERSION,
      tool,
      implementation,
      policy,
      input,
      summary,
      findings,
      dedupe,
      conflicts,
      degraded,
      internalInconsistency,
    },
    REPORT_FIELDS,
  );
}

/** 原子写：同目录临时文件 → rename。返回实际写入的字节数（便于测试断言非空）。 */
export function writeArtifact(path, content) {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, content, { encoding: "utf8" });
    renameSync(tmp, path);
  } catch (error) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* 清理失败不掩盖原错误 */
    }
    throw error;
  }
  return Buffer.byteLength(content, "utf8");
}

/** 确定性自检：两次序列化必须逐字节相同（在报告构造处调用，不等到 CI）。 */
export function assertSerializableDeterminism(value, serialize) {
  const a = serialize(value);
  const b = serialize(value);
  if (a !== b) throw new Error("序列化不确定：两次输出不同（键序或随机值泄漏）");
  return a;
}
