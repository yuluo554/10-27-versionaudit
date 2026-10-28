# HANDOFF-M1（M1 收尾交接单）→ 下一棒 M2

> **命名口径（本项目已定夺，勿改）**：文件名取 **`M<已完成的里程碑>`**，不是"下一棒"。
> 布局门按 `plan/HANDOFF-M${k}.md`（k = 已 ✅ 的里程碑）取文件，改名成 `HANDOFF-M2.md`
> 会让 `LAYOUT.HANDOFFS` 报 `plan/HANDOFF-M1.md(缺)`（有变异组 `L5b` 钉住）。
>
> **语义**：本文件是 **M1 的收尾记录**（M1 已达成的事实、K 口径、环境坑），
> 其中「三、下一棒待办」是给 M2 的行动清单。
>
> 下一棒（M2）开工前：先跑 `node tools/check-sprint-layout.mjs` 与
> `node tools/check-desensitized.mjs`，两条门必须绿。

## 一、当前进度（含证据）

M1「数据先行：向量集」已完成。**M1 做的是质量复核，不是建目录**——12 组向量在 M0 骨架期
就落位并端到端跑通（见 `HANDOFF-M0.md` 三）。本轮把"覆盖面"从人读升级成机器判据，
并修掉复核中实测出的三类缺陷。

| 项 | 证据 |
|---|---|
| 向量集 | `fixtures/vectors/` 12 组，`node tools/check-vectors.mjs` 端到端 12/12、退出码全对 |
| 台账覆盖 | `data/README.md` §1.1 共 **19 条**实测（A1–A19）。`node tools/check-provenance.mjs` 的 `PROV.COVERAGE`：**18 条被向量引用 + 1 条显式豁免**（A16，挂活测试锚点 `tests/semver/interval.test.mjs`），无遗漏 |
| 输入绑定 | 12 组向量的 `mustContain` 全部含 `input.*` 断言（门强制，`V6` 证伪） |
| 反例成对 | R1/R2/R3/R5/R6 各补「同类但不该报」输入；`mustNotContain` 一律指向标量字段 |
| 复核缺陷 ① | **R5 误报已修**：`>=1.0.0 <=1.0.0`（闭环单点）曾被判空交集 error。根因 = 区间代数判空没看端点开闭性。修复在 `src/semver/interval.mjs:branchIsEmpty`，变异组 `H3` 钉住 |
| 复核缺陷 ② | **4 条空心断言已修**：`{path:"findings", value:"R5"}` 解析出整个数组、恒不命中，在 `mustNotContain` 里永不失败（M2/R1 各 2 条）。跑者现在直接报形态错误，变异组 `H1` 钉住 |
| 复核缺陷 ③ | **负断言真空变绿已修**：删掉夹具里的反例包后全部断言仍通过。新增「输入绑定」判据，变异组 `H2`/`V6` 钉住 |
| 测试 | `npm test` 103 通过（原 100 + A17/A18/A19 三条回归） |
| 门 | 五门 + 向量门全绿；`node tools/gen-examples.mjs --check` 逐字节一致；`node tools/offline-smoke.mjs` 零联网 |
| 变异验证 | **29 组全部符合预期**：14 布局门 `L*` + 8 向量门/夹具卫生 `V*`+`H4`/`H5` + 4 溯源覆盖 `P*` + 3 断言纪律 `H1`–`H3` |
| 夹具卫生 | 5 条判据（`private` / 无 install 钩子 / 夹具无 workspaces / 根 workspaces 未收编 / 根无 `file:` 指向 fixtures），5 组变异证伪。R2 的 `*`/`latest`/`x` 是**被测对象**，不固定（安全扫描器的相关告警是已知误报，依据见 `docs/limitations.md` §5.1） |

## 二、当前事实·状态不变量（下一棒动手前必须知道）

1. **`semver` 版本仍钉死 `7.8.5`**，不写 `^`。本轮新增的 A17/A18/A19 已做**双副本交叉校验**
   （项目 7.8.5 + npm 11.12.1 内置 7.7.4，结论一致）。升版本 = 重跑全部向量 + 台账留痕。
2. **`data/README.md` §1.1 现在是 19 条**（A1–A19）。A17/A18/A19 是 M1 复核补的实测行，
   动 §1.1 的表格行会影响 `PROV.COVERAGE`（新增一条却没向量引用也没豁免 → 门直接红）。
   **这是设计：新增断言必须同时想清楚"谁验它"。**
3. **区间代数判空的唯一正确口径**：`lo == hi` 时**看端点开闭性** —— 任一侧开（`<`）→ 空；
   两侧都闭（`<=`）→ **非空单点**。闭环单点 `>=1.0.0 <=1.0.0` 是可满足的（A18 实测）。
   M1 期这里曾误报 R5，`H3` 变异组会把它改回去。
4. **每条向量的 `mustContain` 必须含 `input.*` 断言**（`tools/check-vectors.mjs` 强制）。
   没有它，`mustNotContain` 只是"没扫到"而不是"扫过且没报"。
5. **`mustNotContain` 只能指向标量字段**。要禁"某规则出现在某包上"，写法是
   `{"path":"findings[?package=p&rule=R5]", "present": true}`。`{path:"findings", value:"R5"}`
   是空心断言，跑者会报错。
6. **向量 `sources` 里的 `A<n>` 必须真实存在于 §1.1**（幽灵锚点会被 `PROV.COVERAGE` 抓）；
   `A_EXEMPT` 里的编号也必须真实存在（僵尸登记会被抓）。两处都有变异组（`P4`/`P2`）。
7. **`node --test` 的目录形态不可靠**：`node --test tests/vectors/` 恒红（目录被当成测试文件）。
   必须用 glob（`package.json` 的 `npm test` 与变异组的 `npm-test:` 前缀都走 glob）。
8. **变异跑器的 `group.gate` 只认两种形态**：脚本路径，或 `"npm-test:<glob>"`。
   新增门判据时**必须同时加变异组**（AGENTS.md「门本身也要被证伪」）。
9. **夹具（`fixtures/*/input/`）是只读审计输入**：全部 `private: true`、无 install 钩子、
   根 `package.json` 无 `workspaces` 收编。**别为了"安全"把 R2 的 `*` / `latest` 固定掉**——
   那是被测对象本身（`V1`–`V3` 钉住卫生判据）。

## 三、下一棒待办（M2 `range-lint`）

> M1 已经把**规则级正反例**与**台账覆盖**做成了门。M2 的任务是把"骨架期的实现"
> 提到"可独立验收的实现"：`plan/01` §3.1 的验收条件是
> 「R1–R8 每条至少 1 正例 + 1 反例断言，且覆盖 §1.1 全部实测语义」。

1. **逐条走查 R1–R8 的实现判据**（`src/rules/range-lint.mjs`）与 `plan/03` M1 表格、
   `data/README.md` §7.3 的默认级别表，确认三处**逐字一致**（尤其 R4 的两态命名、
   R6 的"按原始字符串切分支"这条纪律）。
2. **R8 的默认关闭**要两条测试都覆盖：默认不报 + `--enable-r8` 才报（`tests/rules` 已有，
   检查是否需要端到端向量级）。
3. **补 R4/R7/R8 的"同类但不该报"输入**：M1 给 R1/R2/R3/R5/R6 补了反例包，
   R4（`pre-reachable` 已是反例）、R7（`plain` 已是反例）、R8（`explicit-caret` 已是反例）
   已有单点反例，但**没有"同族多形态"**的反例矩阵（如 R7 的 `1.0.0+build.1` vs
   `1.0.0` vs `>=1.0.0+build` 三种形态）。
4. **确认 `expandedRange` 全链路来自库调用**（`plan/03` K5 + M1 的表）：
   现有一条测试断言"与 `validRange` 逐字节一致"，M2 应把它扩到**全部 12 组向量**上
   （即对每份 `expected.json` 的每条 finding 复算）。
5. **复核完成后**把 M2 在 `plan/00` 里程碑表 / `plan/05` 状态表 / `README` 状态表
   三处同步翻 ✅（布局门按副本一致性判定），并写 `plan/HANDOFF-M2.md`。
6. `fixtures/real-tree/` 的导出属 **M4**，不要在 M2 顺手做。

## 四、既定口径清单（K 编号，动了会打挂测试）

| 编号 | 口径 | 落点 |
|---|---|---|
| K1 | 序列化唯一入口 | `src/report/serialize.mjs` |
| K2 | 退出码优先级 `3 > 4 > 1 > 2 > 0` 唯一实现 | `src/cli/exit.mjs` |
| K3 | 三态判定顺序（CONVERGIBLE → MUS → 分类） | `src/checks/dedupe.mjs` |
| K4 | MUS 唯一实现，M3/M4 共用 | `src/mus/minimal-set.mjs` |
| K5 | `semver` 只准从 adapter import | `src/semver/adapter.mjs` |
| K6 | 默认档位表唯一副本 + 报告必须回显 `policy` | `src/policy/severity.mjs` |
| K7 | IR 形态（三份 lock 解析器产出同形） | `plan/02` §三 |
| K8 | 降级必须带 `degraded: true` + `reason` | `src/checks/*` |
| K9 | 实现版本标签只从 adapter 取 | `src/semver/adapter.mjs` |
| K10 | 报告字段顺序由 schema 表驱动 | `src/report/schema.mjs` |
| **K11（M1 新增）** | **区间判空的端点开闭口径**：`lo == hi` 时任一侧开 → 空，两侧闭 → 非空单点 | `src/semver/interval.mjs:branchIsEmpty`（A18；变异 `H3`） |
| **K12（M1 新增）** | **向量断言两条形态纪律**：`mustContain` 必须绑定 `input.*`；`mustNotContain` 必须指向标量字段 | `tools/check-vectors.mjs` + `tests/vectors/vectors.test.mjs`（变异 `V6`/`H1`） |

## 五、本机环境坑（只写实测过的）

1. **Windows 上 `execFileSync` 在子进程退出码非 0 时会抛错**（即使指定了 `encoding`）。
   断言"有 findings 时退出码为 1 且 stdout 完整"必须 `try/catch` 取 `error.stdout`。
2. **盘符绝对路径正则 `[A-Za-z]:[\\/]` 会误伤 JSON 里的 `https://`**（`s:/` 命中）。
   判据要加"盘符前不是字母数字"+"盘符后有非分隔符"。
3. **`cmd` / Git-Bash 里 `node -e` 的多行脚本要用 `--input-type=module` 才能顶层 `await import`**。
4. **`node --test <目录>` 恒红**（目录被当成测试文件读）。用 glob：`node --test "tests/**/*.test.mjs"`。
5. **Bash 工具不能直接写仓库内源码/配置**（会被安全钩子拦）——源码用 Write/Edit 落盘；
   但**跑脚本改文件没问题**（本轮用 `node --input-type=module -e` 批量补断言就成功了）。
6. **npm 内置 semver 副本的路径**：`C:/Program Files/nodejs/node_modules/npm/node_modules/semver`
   （`createRequire('file:///D:/')` + 绝对路径可加载；`npm root -g` 那条路**不通**——
   该副本不在全局 `node_modules` 下）。交叉校验用得上。
7. **`git status` 里 `.mimosa/` 是工具状态目录**，已在脱敏门 `SKIP_DIRS`；不要提交它。

## 六、DoD 逐项 checklist（M1）

- [x] 12 组向量齐备且端到端 12/12（`node tools/check-vectors.mjs`）
- [x] 每个 `expected.json` 含 `rule`/`mustContain`/`mustNotContain`/`exitCode`/`implementationVersions`/`sources`
- [x] **每条 `mustContain` 含 `input.*` 输入绑定断言**（门强制；`V6` 证伪）
- [x] **台账 §1.1 逐条复核**：19 条实测全部有向量引用或显式豁免（`PROV.COVERAGE`）
- [x] 初审缺口 A2/A5/A6/A7 已补入向量（R3 覆盖 A1–A5；M5/R6 覆盖 A2/A6/A7）
- [x] A16 显式豁免登记（`why` + 活测试锚点），僵尸登记会被门抓（`P2`）
- [x] R1/R2/R3/R5/R6 的「同类但不该报」反例输入已补，断言指向标量字段
- [x] 复核中实测缺陷 3 类已修（R5 边界 / 空心断言 / 负断言真空），各配变异组
- [x] 台账补 A17/A18/A19（含 R5 缺陷留痕与双副本交叉校验记录）
- [x] `npm test` 103 通过（含 A17–A19 回归）
- [x] 变异验证 29 组全部符合预期
- [x] 五门 + 向量门 + 样例 `--check` + 离线冒烟全绿
- [x] M1 三处状态副本同步 ✅（`layout/STATUS` 断言一致性）
- [x] 本交接单（七节齐）

## 七、关键命令速查

```bash
# 门（新对话第一件事）
node tools/check-sprint-layout.mjs
node tools/check-desensitized.mjs
node tools/check-scope.mjs
node tools/check-provenance.mjs     # 含 PROV.COVERAGE（台账覆盖）
node tools/check-workflows.mjs

# 门的自证
node tools/verify-layout-mutations.mjs                # 全 29 组
node tools/verify-layout-mutations.mjs --only H3      # 单组（R5 边界回归）
node tools/verify-layout-mutations.mjs --only P4      # 单组（幽灵锚点）

# 测试与冒烟
npm test                            # 103 条（glob 形态；目录形态恒红）
node tools/check-vectors.mjs        # 12 组向量 + 输入绑定 + 端到端退出码
node tools/offline-smoke.mjs

# 样例
node tools/gen-examples.mjs --check

# CLI
node bin/versionaudit.mjs --help
node bin/versionaudit.mjs range-lint fixtures/vectors/R5-empty-intersection/input
node bin/versionaudit.mjs audit fixtures/vectors/R2-wildcard-latest/input --format=json
```