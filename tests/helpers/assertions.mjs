/**
 * `expected.json` 的断言引擎（**向量跑者与真实树跑者共用**）。
 *
 * 路径语法（本项目自定，刻意简单）：
 *   `findings[0].rule`              数组下标
 *   `findings[?kind=x].dependency`  数组按字段值过滤后取第一个
 *
 * 两条断言纪律（`plan/04` §二）在这里落地：
 *   1. **形态守卫**：`{path:"findings", value:"R5"}` 是**空心断言**——解析出的是整个数组，
 *      与字符串比恒为 false，放在 `mustNotContain` 里永远不会失败。这类写法必须报错。
 *   2. 断言要指到**标量字段**（如 `dedupe[?package=ms].status`），或用 `present` 判存在性。
 */

/** 解析路径：`a.b[0].c` 或 `a[?k=v&k2=v2].c`（多条件 AND）。 */
export function resolvePath(root, path) {
  const tokens = [];
  const re = /([A-Za-z_][\w-]*)|\[\?([^\]]+)\]|\[(\d+)\]/g;
  let m;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) tokens.push({ type: "key", value: m[1] });
    else if (m[2] !== undefined) {
      const conditions = m[2].split("&").map((pair) => {
        const eq = pair.indexOf("=");
        return { key: pair.slice(0, eq), value: pair.slice(eq + 1) };
      });
      tokens.push({ type: "filter", conditions });
    } else tokens.push({ type: "index", value: Number(m[3]) });
  }
  let cur = root;
  for (const t of tokens) {
    if (cur === undefined || cur === null) return undefined;
    if (t.type === "key") cur = cur[t.value];
    else if (t.type === "index") cur = Array.isArray(cur) ? cur[t.value] : undefined;
    else if (t.type === "filter") {
      if (!Array.isArray(cur)) return undefined;
      cur = cur.find((x) => t.conditions.every((c) => String(x?.[c.key]) === c.value));
    }
  }
  return cur;
}

export function checkAssertion(report, assertion) {
  const actual = resolvePath(report, assertion.path);
  if (assertion.value !== undefined) {
    // 形态守卫：`{path:"findings", value:"R5"}` 是**空心断言** —— 解析出的是整个数组，
    // 与字符串比恒为 false，于是它在 mustNotContain 里永远不会失败。
    // 这类写法必须报错，而不是静默通过：断言得指到**标量字段**（如 `findings[?rule=R5]` + present）。
    if (actual !== null && typeof actual === "object") {
      return {
        ok: false,
        shapeError: true,
        actual: Array.isArray(actual) ? `数组(${actual.length} 项)` : "对象",
        expected: assertion.value,
      };
    }
    return { ok: Object.is(actual, assertion.value) || actual === assertion.value, actual, expected: assertion.value };
  }
  if (assertion.contains !== undefined) {
    const ok = typeof actual === "string" && actual.includes(assertion.contains);
    return { ok, actual, expected: `contains ${assertion.contains}` };
  }
  if (assertion.deepEqual !== undefined) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(assertion.deepEqual);
    return { ok: a === b, actual, expected: assertion.deepEqual };
  }
  if (assertion.present !== undefined) {
    const has = actual !== undefined && actual !== null;
    return { ok: assertion.present ? has : !has, actual, expected: `present=${assertion.present}` };
  }
  return { ok: false, actual, expected: "断言形态未知（需 value/contains/deepEqual/present）" };
}

/**
 * 逐条应用 `mustContain` / `mustNotContain`，返回失败描述数组（空 = 全过）。
 * `label` 用于报文前缀（向量名 / 真实树）。
 */
export function evaluateExpected(report, expected, label) {
  const failures = [];
  for (const assertion of expected.mustContain ?? []) {
    const r = checkAssertion(report, assertion);
    if (r.shapeError) failures.push(`${label} mustContain ${assertion.path}：断言形态是空心的（解析出 ${r.actual}，不是标量字段）`);
    else if (!r.ok) failures.push(`${label} mustContain ${assertion.path} = ${JSON.stringify(r.expected)}，实际 ${JSON.stringify(r.actual)}`);
  }
  for (const assertion of expected.mustNotContain ?? []) {
    const r = checkAssertion(report, assertion);
    // 形态错误在 mustNotContain 里更危险：空心断言恒不命中 → 永远绿
    if (r.shapeError) failures.push(`${label} mustNotContain ${assertion.path}：断言形态是空心的（解析出 ${r.actual}，恒不命中）`);
    else if (r.ok) failures.push(`${label} mustNotContain ${assertion.path} 命中了 ${JSON.stringify(r.expected)}（报得太宽）`);
  }
  return failures;
}
