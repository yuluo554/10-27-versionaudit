/**
 * `package.json` → ManifestIR。
 *
 * 只做"读与规整"，不做任何语义判定（判定在 `src/rules/` 与 `src/checks/`）。
 * 关键纪律：
 *   - **不改写范围字符串**：`rawRange` 原样保留（归一化只在输出 `expandedRange` 时由库做）；
 *   - `overrides` / `resolutions` 是**声明**，不是"实际装了什么"，必须与 dependencies 分开存；
 *   - 根包名不是判定依据（私包常无 name），缺字段记 `name: null` 而不是编一个。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { InputError } from "../errors.mjs";

export const DEP_KINDS = Object.freeze([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);

export const ROOT_PATH = "<root>";

function readJson(file, label) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new InputError(`无法读取 ${label}`, { file, detail: error.message });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new InputError(`${label} 不是合法 JSON`, { file, detail: error.message });
  }
}

/** 只保留字符串值；非字符串（对象形态的 override 等）单独记录，不静默丢弃。 */
function pickStringMap(value, label, { allowObject = false } = {}) {
  if (value === undefined || value === null) return { map: {}, nested: {} };
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(`${label} 必须是对象`, { detail: `实际是 ${Array.isArray(value) ? "数组" : typeof value}` });
  }
  const map = {};
  const nested = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    if (typeof entry === "string") map[key] = entry;
    else if (allowObject && entry && typeof entry === "object" && !Array.isArray(entry)) nested[key] = entry;
    else throw new InputError(`${label}.${key} 必须是字符串`, { detail: `实际是 ${typeof entry}` });
  }
  return { map, nested };
}

export function parseManifest(raw, { file = "package.json" } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InputError("package.json 顶层必须是对象", { file });
  }
  const deps = {};
  for (const kind of DEP_KINDS) {
    deps[kind] = pickStringMap(raw[kind], kind).map;
  }
  const overrides = pickStringMap(raw.overrides, "overrides", { allowObject: true });
  const resolutions = pickStringMap(raw.resolutions, "resolutions", { allowObject: true });

  return {
    name: typeof raw.name === "string" ? raw.name : null,
    version: typeof raw.version === "string" ? raw.version : null,
    private: raw.private === true,
    workspaces: raw.workspaces ?? null,
    deps,
    overrides: overrides.map,
    overridesNested: overrides.nested,
    resolutions: resolutions.map,
    resolutionsNested: resolutions.nested,
    file,
  };
}

export function loadManifest(dir) {
  return parseManifest(readJson(join(dir, "package.json"), "package.json"));
}

/** 展平成 (kind, name, range) 列表，供规则逐条遍历（顺序稳定）。 */
export function flattenDeclarations(manifest) {
  const out = [];
  for (const kind of DEP_KINDS) {
    for (const name of Object.keys(manifest.deps[kind])) {
      out.push({ kind, name, rawRange: manifest.deps[kind][name] });
    }
  }
  for (const name of Object.keys(manifest.overrides)) {
    out.push({ kind: "overrides", name, rawRange: manifest.overrides[name] });
  }
  for (const name of Object.keys(manifest.resolutions)) {
    out.push({ kind: "resolutions", name, rawRange: manifest.resolutions[name] });
  }
  return out;
}

/** 声明总数（用于 doctor 的非空自证 —— "扫到了几个"必须可打印）。 */
export function declarationCount(manifest) {
  return flattenDeclarations(manifest).length;
}
