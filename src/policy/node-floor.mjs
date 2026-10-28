/**
 * Node 运行时下限 —— **单一真源**（`package.json` 的 `engines.node` 是它的声明副本）。
 *
 * 为什么要有这个文件：v1.0.0 的 `engines.node: ">=20"` 是**零代码消费**的装饰
 * （`grep -rn "process.version|nodeVersion|engines" src/ bin/ tools/*.mjs` → 0 命中），
 * 于是用户用 Node 18 跑只会拿到 `ERR_UNKNOWN_FILE_EXTENSION` 之类的**间接**错误，
 * 而不是"需要 Node >= 20"。声明变成契约的落点就在这里。
 *
 * 纪律：
 *   1. **纯函数**（版本串作为参数传入，不读 `process.versions`）——否则永远只能测
 *      "当前这台机器的主版本"，18 / 20 两个分支在本机（node 24）上根本走不到。
 *   2. **不 import 任何东西**（尤其不 import `src/semver/adapter.mjs`）：这条检查要在
 *      其它模块加载**之前**跑，才能保证"缺依赖 / 旧 Node"时打出的是下限报文而不是
 *      `ERR_MODULE_NOT_FOUND`。版本串用最小正则解析，不借 `semver`（K5 的例外不成立——
 *      这里没有语义判定，只有主版本号比较）。
 *   3. 非法输入**返回失败**而不是抛未捕获异常：它跑在 CLI 最外层，抛出去会把
 *      "环境不满足"变成"内部错误"。
 */

/** 唯一的下限定义处。改它必须同步 `package.json` 的 `engines.node`
 *  （`tests/policy/engines-contract.test.mjs` 断言两侧一致）。 */
export const MIN_NODE_MAJOR = 20;

/** `v18.20.0` / `18.20.0` / `20.0.0-rc.1` / `24.15.0+abc` 都接受；其余一律判不可解析。 */
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * 判断 `currentVersion` 的主版本是否满足下限。
 *
 * @param {string} currentVersion 形如 `process.versions.node`（`"24.15.0"`）
 * @param {number} [minMajor] 下限主版本，默认 `MIN_NODE_MAJOR`
 * @returns {{ok: boolean, reason?: string}} `reason` 只在不满足时出现，且带上实际值
 */
export function checkNodeFloor(currentVersion, minMajor = MIN_NODE_MAJOR) {
  if (typeof currentVersion !== "string" || currentVersion.trim().length === 0) {
    return { ok: false, reason: `无法识别的 Node 版本串 ${JSON.stringify(currentVersion)}` };
  }
  if (!Number.isInteger(minMajor) || minMajor <= 0) {
    return { ok: false, reason: `下限配置非法 ${JSON.stringify(minMajor)}（应为正整数主版本）` };
  }
  const match = VERSION_RE.exec(currentVersion.trim());
  if (match === null) {
    return { ok: false, reason: `无法解析的 Node 版本串 ${JSON.stringify(currentVersion)}` };
  }
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major)) {
    return { ok: false, reason: `Node 主版本溢出 ${JSON.stringify(currentVersion)}` };
  }
  if (major < minMajor) {
    return { ok: false, reason: `Node ${major} 低于下限 ${minMajor}（当前 ${currentVersion}）` };
  }
  return { ok: true };
}