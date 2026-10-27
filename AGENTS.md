# AGENTS.md

本仓库遵循 **`ai-tool-project-sprint`** 方法论（装订日期：2026-10-27）。

## 任何新对话的第一件事

```bash
node tools/check-sprint-layout.mjs     # 布局门（方法论装订）
node tools/check-desensitized.mjs      # 脱敏门
node tools/check-scope.mjs             # 范围门（无许可证判定能力）
node tools/check-provenance.mjs        # 溯源门（每条断言有台账锚点）
node tools/check-workflows.mjs         # workflow 门（推送前抓 jobs=0 形态）
```

- 五条门必须绿；红了先修再干活（把"修门"记进当前 HANDOFF 待办）。
- 全套：`npm run gate:all`。
- 续接对话：读 `plan/HANDOFF-M<k>.md`（第 k 棒开工用的交接单），**先跑上面的门**。
- 接手对话（无 HANDOFF）：先读 `plan/00`、`plan/05`、`plan/06` 与各 HANDOFF，重建
  "当前状态 + K 口径清单"再动手。
- **门不存在 = 本项目没装订** → 先补装订，再做别的。

## 强制布局（布局门逐条断言，改动前先看这里）

| 项 | 位置 | 判据 |
| --- | --- | --- |
| 计划套件 | `plan/00–06` + `data/README.md` | 存在且各含必需小节（标题关键词） |
| 数据台账 | `data/README.md` | 依据查证记录 + 数值口径（唯一定义处）在位 |
| 交接单 | `plan/HANDOFF-M<k>.md` | 每个 ✅ 里程碑一份，七节齐（含"当前事实·状态不变量"）；M0 已有 `HANDOFF-M0.md`。**命名取 `M<已完成的里程碑>`，不是"下一棒"**——见下条 |

### 交接单命名口径（本项目已定夺，勿改）

`ai-tool-project-sprint` 内部有两套矛盾写法：`HANDOFF-M<next>`（下一棒）与 `HANDOFF-M<k>`（同号）。
**本项目取"同号"**，依据是只有它被实现成了可跑判据——模板
`references/templates/check-sprint-layout.mjs:200`：

```js
for (const k of done) {          // done = 已 ✅ 的里程碑
  const rel = `plan/HANDOFF-M${k}.md`;
```

实测：把 `HANDOFF-M0.md` 改名成 `HANDOFF-M1.md` → `LAYOUT.HANDOFFS plan/HANDOFF-M0.md(缺)` 报红。
所以 **M0 收尾写 `HANDOFF-M0.md`，M1 收尾写 `HANDOFF-M1.md`**（后者同时承载 M2 的待办）。
| 里程碑状态副本 | `plan/00` 里程碑表 + `plan/00` 承诺-证据台账 + `plan/05` 状态表 + `README` 状态表 | **逐处一致**；只认表格行（`\| M<k> \| …`），散文状态行不参与判定 |
| 骨架产物 | `bin/versionaudit.mjs`、`src/`、`package.json` | 存在；CLI 可 `--help` / `--version` |
| 发布留档 | `plan/RELEASE-M6.md`（两栏）或 `plan/WRAPUP-M6.md` | M6 未 ✅ 时本项报 PASS 并写明"尚不适用" |
| 发布门覆盖对账 | `plan/RELEASE-M6.md` §覆盖对账 | 阶段 7 出口门逐条：实现 / 不适用+理由 / 待首推 |

## 布局门的变异验证

门本身也要被证伪：`node tools/verify-layout-mutations.mjs` 逐组改坏仓库副本再复跑，
**任何一组不变红 = 门有假判据**。收尾棒必须全组通过（含阴性对照）。当前 **18 组**
（13 组布局门 + 5 组向量门/夹具卫生门），全部在临时副本里跑，不碰工作区。

## 环境事实与禁忌（只写实测过的）

- 本机：node v24.15.0 / npm 11.12.1；`semver@7.8.5` 为钉死的唯一运行时依赖（实测
  `npm view semver version` = 7.8.5，与 `data/README.md` §1.1 的实现版本一致）。
- 审计运行期**零网络**：不查 registry、不解析 `resolved` URL 主机、不读 dist-tag。
  验收用 `node tools/offline-smoke.mjs`（进程内 DNS/net 钩子全部抛错）+ CI 的 `--network none` 容器。
- 输出确定性：同输入两次运行逐字节一致（`tests/determinism`）；JSON 键序固定、数组稳定排序、
  不含时间戳/主机名/绝对路径（除 `--verbose-paths`）。
- **夹具（`fixtures/*/input/`）是只读审计输入，不是依赖表**：全部 `private: true`、
  无 `install`/`postinstall` 钩子、根 `package.json` 无 `workspaces` 收编它们。
  这三条由 `tools/check-vectors.mjs` 的「夹具卫生」判据断言（3 组变异 V1–V3 证伪）。
  **不要"为了安全"把 R2 向量里的 `*` / `latest` 改成固定版本** ——那是该规则的被测对象本身，
  固定掉等于删掉唯一正例；风险处置落在"它不会被安装"，不是"它不能写浮动版本"。
- 禁止：把"未执行"写成已完成；在 tag 之后改交付面（`bin/`、`src/`、`package.json`）；
  跨生态复用 npm 范围语义（Cargo `1.2.3` 是 caret，npm 是精确锁定）。
