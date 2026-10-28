/**
 * 最小 JSON Schema 校验器（draft-07 子集）—— 只为实现**离线** SARIF 2.1.0 校验。
 *
 * 为什么自研而不是引 `ajv`：本项目**零运行时依赖**（只有钉死的 `semver`），
 * 而 SARIF 官方 schema 用到的关键字面极窄（实测该 schema 里出现的关键字只有：
 * `$id` / `$ref` / `$schema` / `additionalProperties` / `anyOf` / `const` / `default` /
 * `definitions` / `description` / `enum` / `format` / `items` / `maximum` / `minItems` /
 * `minimum` / `oneOf` / `pattern` / `properties` / `required` / `title` / `type` / `uniqueItems`）。
 *
 * **这不是通用校验器**，能力边界必须写明（`docs/limitations.md` §3.2）：
 *   - 支持：`type` / `properties` / `required` / `additionalProperties`(bool 或 schema) /
 *     `items`(schema) / `enum` / `const` / `pattern` / `minItems` / `uniqueItems` /
 *     `minimum` / `maximum` / `anyOf` / `oneOf` / 本地 `$ref`（`#/definitions/x`）。
 *   - **不校验** `format`：draft-07 里 `format` 是 **annotation（默认不产生校验失败）**，
 *     且 `uri-reference` / `date-time` 需要 RFC 级解析。这里**不假装校验它**，而是把命中的
 *     每一条 `format` 作为"未校验断言"显式返回（`collectUnvalidated`），由调用方登记。
 *   - 未识别的关键字**报错而不是静默跳过**：静默跳过会让"校验器不认识这条约束"看起来像"通过了"。
 *
 * 错误路径用 JSON Pointer 形态（`/runs/0/results/3/level`），便于直接定位。
 */

/**
 * **已知但不校验**的关键字（draft-07 annotation 语义）。
 * 与"未识别关键字"区分开：前者是规范允许的、我们明确登记不校验的；后者是 bug 面。
 */
const KNOWN_UNVALIDATED = new Set(["format"]);

/** draft-07 的 meta/annotation 关键字（不参与校验，出现它们是合法的）。 */
const METADATA_KEYWORDS = new Set([
  "$id",
  "$schema",
  "$ref",
  "$comment",
  "title",
  "description",
  "default",
  "definitions",
  "examples",
  "readOnly",
  "writeOnly",
  "deprecated",
]);

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value, type) {
  const actual = typeOf(value);
  if (type === "number") return actual === "number" || actual === "integer";
  if (type === "integer") return actual === "integer";
  return actual === type;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pointer(base, token) {
  return `${base}/${String(token).replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

/**
 * @param {unknown} value 待校验的实例
 * @param {object} schema schema 根（含 `definitions`）
 * @returns {string[]} 错误描述（空数组 = 通过）
 */
export function validate(value, schema) {
  return validateDetailed(value, schema).errors;
}

/**
 * 带"未校验断言"清单的校验。
 * @returns {{errors: string[], unvalidated: Array<{path: string, format: string}>}}
 *   `unvalidated` 非空**不代表失败**，但调用方必须把它登记出去（"没跑 format 校验"是事实）。
 */
export function validateDetailed(value, schema) {
  const ctx = { errors: [], unvalidated: [], root: schema };
  walk(value, schema, "", ctx);
  return { errors: ctx.errors, unvalidated: ctx.unvalidated };
}

function resolveRef(ref, root) {
  if (!ref.startsWith("#/")) return null;
  const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = root;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object" || !(part in cur)) return null;
    cur = cur[part];
  }
  return cur ?? null;
}

function walk(value, schema, path, ctx) {
  const { errors, root } = ctx;
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push(`${path || "/"}: schema 禁止任何值`);
    return;
  }
  if (typeof schema !== "object") return;

  // draft-07 annotation-only 关键字：**显式登记为未校验**，不产生失败。
  if (typeof schema.format === "string") {
    ctx.unvalidated.push({ path: path || "/", format: schema.format });
  }

  if (typeof schema.$ref === "string") {
    const target = resolveRef(schema.$ref, root);
    if (target === null) {
      errors.push(`${path || "/"}: 无法解析 $ref ${schema.$ref}（外部引用不在本校验器能力面）`);
      return;
    }
    walk(value, target, path, ctx);
    // `$ref` 在 draft-07 里与兄弟关键字互斥；这里保守地继续走兄弟关键字（更严，不是更松）
  }

  if (Array.isArray(schema.anyOf)) {
    const branchErrors = schema.anyOf.map((sub) => {
      const errs = [];
      walk(value, sub, path, { errors: errs, unvalidated: [], root });
      return errs;
    });
    if (!branchErrors.some((e) => e.length === 0)) {
      errors.push(`${path || "/"}: 不匹配 anyOf 的任何一个分支（${branchErrors.map((e) => e[0]).join(" | ")}）`);
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const passing = schema.oneOf.filter((sub) => {
      const errs = [];
      walk(value, sub, path, { errors: errs, unvalidated: [], root });
      return errs.length === 0;
    });
    if (passing.length !== 1) {
      errors.push(`${path || "/"}: oneOf 要求恰好匹配 1 个分支，实际 ${passing.length} 个`);
    }
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path || "/"}: 类型应为 ${types.join("|")}，实际 ${typeOf(value)}`);
      return; // 类型都不对，后面按类型断言只会刷屏
    }
  }

  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(`${path || "/"}: 应为常量 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(value)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((option) => deepEqual(value, option))) {
    errors.push(`${path || "/"}: 应为枚举 ${JSON.stringify(schema.enum)} 之一，实际 ${JSON.stringify(value)}`);
  }

  if (typeof value === "string" && typeof schema.pattern === "string") {
    if (!new RegExp(schema.pattern).test(value)) {
      errors.push(`${path || "/"}: 不匹配 pattern ${JSON.stringify(schema.pattern)}（实际 ${JSON.stringify(value)}）`);
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path || "/"}: ${value} < minimum ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path || "/"}: ${value} > maximum ${schema.maximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path || "/"}: 数组长度 ${value.length} < minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems === true) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) errors.push(`${path || "/"}: uniqueItems 被违反（重复元素 ${key.slice(0, 60)}）`);
        seen.add(key);
      }
    }
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      value.forEach((item, i) => walk(item, schema.items, pointer(path, i), ctx));
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        errors.push(`${path || "/"}: 缺必填字段 ${key}`);
      }
    }
    const props = schema.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        walk(value[key], sub, pointer(path, key), ctx);
      }
    }
    const extra = Object.keys(value).filter((k) => !Object.prototype.hasOwnProperty.call(props, k));
    if (schema.additionalProperties === false && extra.length > 0) {
      errors.push(`${path || "/"}: 不允许的额外字段 ${extra.join(", ")}（additionalProperties:false）`);
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of extra) {
        walk(value[key], schema.additionalProperties, pointer(path, key), ctx);
      }
    }
  }

  // 未识别的关键字**报错**：静默跳过会让"校验器不认识这条约束"看起来像"通过了"。
  // （`format` 属 KNOWN_UNVALIDATED，已在函数开头登记，不算"不认识"。）
  for (const keyword of Object.keys(schema)) {
    if (METADATA_KEYWORDS.has(keyword) || KNOWN_UNVALIDATED.has(keyword)) continue;
    if (SUPPORTED_KEYWORDS.includes(keyword)) continue;
    errors.push(`${path || "/"}: schema 用了本校验器未实现的关键字 ${keyword}（不假装校验它）`);
  }
}

/** 供门/测试断言"校验器确实认识这些关键字"（防"什么都没实现却永远绿"）。 */
export const SUPPORTED_KEYWORDS = Object.freeze([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "pattern",
  "minItems",
  "maximum",
  "minimum",
  "anyOf",
  "oneOf",
  "uniqueItems",
  "$ref",
]);

/** `format` 是 draft-07 annotation：已知、**明确不校验**，命中即登记（不是失败）。 */
export const DECLARED_UNVALIDATED_KEYWORDS = Object.freeze([...KNOWN_UNVALIDATED]);
