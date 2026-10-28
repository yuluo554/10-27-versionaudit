# HANDOFF-M5（M5 收尾交接单）→ 下一棒 M6

> **命名口径（本项目已定夺，勿改）**：文件名取 **`M<已完成的里程碑>`**，不是"下一棒"。
> 布局门按 `plan/HANDOFF-M${k}.md`（k = 已 ✅ 的里程碑）取文件，改名成 `HANDOFF-M6.md`
> 会让 `LAYOUT.HANDOFFS` 报 `plan/HANDOFF-M5.md(缺)`（变异组 `L5b` 钉住）。
>
> **语义**：本文件是 **M5 的收尾记录**，其中「三、下一棒待办」是给 M6 的行动清单。
>
> **编号错位提醒**：`plan/03` 的模块编号与本文件的里程碑编号**差一位** ——
> `plan/03` 的 "M4 `conflict-explain`" + "M5 `report-ci`" = 里程碑 **M5**（本棒）；
> 看 `plan/03` 时认模块名，不要按编号对。
>
> 下一棒（M6）开工前：先跑五门 + 报告门（见 §七），必须全绿。

## 一、当前进度（含证据）

M5「冲突解释（`conflict-explain`）+ 报告与门禁（`report-ci`）」已完成。本棒做了三件事：
**落 SARIF 官方 schema 的离线副本并真跑校验**（把"结构断言"升级成"schema 校验"）、
**建报告门**（三格式一致性 + schema + `--out` 原子写）、
**走查报告层时修掉四个实测缺陷**（M0–M4 全绿也没抓到）。

| 项 | 证据 |
|---|---|
| **`minimalSet` 降级路径属性测试** | `tests/proof/m4-minimality.test.mjs` 新增 4 条：13 请求者超限（默认 12）→ `degraded: true` + `requesters > max`，且 `minimalSet` **仍无解 + 极小**；`--max-requesters=3` 同；**阴性对照**（`--max-requesters=20` 未超限 → `degraded: false` + 基数为 2 的最小 MUS）；顶层 `degraded` 数组带固定口径串。填掉 HANDOFF-M4 §三.1 的缺口 |
| **SARIF 官方 schema 离线副本** | `schema/sarif-2.1.0.json`（OASIS 2.1.0，112469 字节，`sha256 = c96eb2d3…0f785`，`$id` = oasis-tcs 那份）。构建期 `fetch` **一次**（HTTP 200），审计运行期仍零联网。台账 **A26** 记全部实测数（含"52 个 `$ref` 全部本地""`format` 只有 3 种"） |
| **零依赖 schema 校验器** | `src/report/json-schema.mjs`（draft-07 子集）。支持 `type/properties/required/additionalProperties/items/enum/const/pattern/minItems/uniqueItems/minimum/maximum/anyOf/oneOf/$ref`。`format` 按 draft-07 **annotation** 语义**登记为未校验**（不假装通过）；**未识别关键字报错**而不是静默跳过 |
| **报告门** | `tools/check-report-schema.mjs`（`npm run gate:report`）：① 16 个夹具（15 组向量 + 真实树）的 SARIF 过官方 schema；② `ruleId` 不得是 `"undefined"`；③ 三格式 `(ruleId, subject)` 集合一致；④ `--out` 原子写（建目录 / 无 `.tmp` 残留 / 失败不留半个产物 / stdout 静默） |
| **缺陷① `ruleId: "undefined"`** | `renderSarif` 写 `String(f.rule)`，而 **M2 finding 只有 `kind` 没有 `rule`** → 每条 M2 结果 `ruleId` 都是字符串 `"undefined"`；**冻结样例里就有**（`rules[]` 里真有 `id: "undefined"` 的空壳）。**官方 schema 抓不到**（`"undefined"` 是合法字符串）。修复 `f.rule ?? f.kind`，两者都缺直接抛错。变异组 `H23` |
| **缺陷② SARIF 丢掉 M3/M4 全部产物** | `renderSarif` 只遍历 `findings`。真实树实测：JSON 报 **2 条 error**，SARIF 报 **0 条**，而退出码是 1。修复：`collectEntries()` 统一枚举三类产物。变异组 `H24` |
| **缺陷③ `summary.highest` 只扫 findings** | 真实树实测 `summary.error = 2` 而 `highest = null`（自相矛盾）。修复：覆盖 findings + dedupe + conflicts。变异组 `H25` |
| **缺陷④ text 降级行打错字段** | 打的是 `item.reason`（两态 reason：`empty-intersection` / `no-locked-candidate`）→ 报文出现 `⚠ 已降级：empty-intersection`。修复：`item.degradeReason ?? "degraded"`。变异组 `H26` |
| **三格式一致性的期望值** | 门里**独立枚举**（`expectedEntries()`），**不调**被测的 `collectEntries()`。见 §二.3 的假门教训 |
| **样例** | `examples/report.sarif` 重生成（`undefined` 消失）；`gen-examples` 的自检新增 ⑤ SARIF 过官方 schema、⑥ `ruleId` 不得是 `undefined`（样例是冻结产物，漂了没人读） |
| **CI** | `ci.yml` 的 test job 新增 `Report gate` step；`gate:all` 里加 `gate:report`（9 段） |
| **测试** | `npm test` **192 通过**（M4 末 176，+16 = 报告面 12 + 降级属性 4） |
| **变异** | **52 组全部符合预期**（50 应红 + 1 阴性对照 + 1 跳过）。M5 新增 5 组：`H23`–`H26`、`P6` |
| **门** | 五门 + 向量门（15/15）+ 报告门全绿；`PROV.COVERAGE` 台账 **26 条**（24 引用 + `A16`/`A26` 豁免） |
| **样例 / 冒烟** | `node tools/gen-examples.mjs --check` 逐字节一致；`offline-smoke` 零联网（12 入口、6 命令、网络尝试 0） |
| **工作树状态** | **M0–M5 的改动仍未提交**。M6 开工前先 `git status` 认账 |

### 对 HANDOFF-M4 两处说法的落实（如实留痕）

1. HANDOFF-M4 §三.1「`minimalSet` 属性测试要覆盖降级路径」 —— **已补**（4 条，含阴性对照）。
2. HANDOFF-M4 §三.2「SARIF 官方 schema 校验器」 —— **已做**，且**没有**退化成"结构断言 + 声明"：
   落了官方 schema 离线副本 + 零依赖校验器。剩余边界只有 `format`（draft-07 annotation），
   **登记为未校验**并写进门的结论串，不是"通过了格式校验"。

## 二、当前事实·状态不变量（下一棒动手前必须知道）

1. **三格式必须报同一批产物**（K25）：`(ruleId, subject)` 集合在 text / json / sarif 之间一致。
   真实树是试金石 —— 它的 2 条 error **全在** `dedupe` / `conflicts` 里，`findings` 为空。
   **`ruleId` 是真键**：M1 用 `rule`、M2 用 `kind`、M3 用状态、M4 用 kind。改成 `String(f.rule)`
   会产出字面量 `"undefined"` 而 **schema 抓不到**（变异组 `H23`）。
2. **`properties.subject` 是机器可读的包名**：不从 `message.text` 切字符串反推。
   报文措辞一改，靠切字符串的判据就会假绿/假红（M5 第一版就踩了）。
3. **一致性判据的期望值必须独立枚举**：M5 第一版用 `collectEntries()`（被测实现）求 JSON 侧期望值，
   再与 SARIF 侧比对 —— 变异组 `H24`（把 dedupe/conflicts 段关掉）**假绿**，因为两侧同时少了同样的东西。
   现在门里自己写 `expectedEntries()`。
4. **SARIF 合规由官方 schema 离线副本校验**（K26）：`schema/sarif-2.1.0.json`。
   门断言 `$id` 必须是 OASIS 那份（变异组 `P6`）。**不要**改这个 JSON 的任何字节 ——
   `sha256` 记在 A26。
5. **`format` 是 draft-07 annotation**：`uri-reference` / `date-time` / `uri` **不校验**。
   校验器把它登记进 `unvalidated` 列表并打进门的结论串。**不要**为了"更完整"自己实现
   URI 正则 —— 那会把"未校验"换成"编造的校验"（`docs/limitations.md` §3.2）。
6. **校验器对未识别关键字报错**，不静默跳过。所以**改官方 schema 文件会立刻让门红**（这是有意的）。
7. **`--out` 失败路径的判据必须跨平台确定**：Windows 上 `chmod` 对目录无效。
   现在的做法是"把 `--out` 的父路径占成一个普通文件"（`mkdirSync` 必然失败）。
   阴性对照是"可写目录必须真的写成功"。
8. **`summary.highest` 覆盖三类产物**（不只是 findings）。真实树是它的回归夹具（`error: 2` / `highest: "error"`）。
9. **text 的降级行打 `degradeReason`**（`requesters > max`），不是两态 `reason`。
   `reason` 是"为什么无解"（`empty-intersection` / `no-locked-candidate`），`degradeReason` 是"为什么降级"——
   两个字段语义不同，不许互换（变异组 `H26`）。
10. **`gen-examples` 的自检必须覆盖 SARIF schema**：只做"字段存在"断言是手写合规。
    现在的自检有 6 条（时间戳 / 绝对路径 / schemaVersion / driver 必填 / **官方 schema** / **ruleId**）。
11. **M1–M5 已冻结的判据别动**：R3 只看上界、R5 端点开闭、R8 默认关闭、M3 的逐类键比对/
    无版本降级/跳树外与 link、M4 的删除法降级与 `reason` 固定串、M5 的三格式一致与 schema 身份。
    确需动 → 同步 `plan/03` + `data/README.md`（含 §7.3 表）+ 相关夹具 + 变异组，并在交接单留痕。
12. **台账 26 条**（A1–A26）：新增 A 必须同时给它"谁验它"（向量 `sources` 引用或 `A_EXEMPT`
    带 `why` + 活测试），`PROV.COVERAGE` 会红。
13. `semver` 仍钉死 `7.8.5`；向量与真实树 `expected.json` 的 `implementationVersions` 必须一致。
14. **退出码矩阵已全覆盖**（0/1/2/3/4 各至少一条端到端，`tests/exit-codes`）。不要为"更全"
    把退出码 3 的输入塞进向量集（`plan/04` §二与 AGENTS.md 都写了原因）。

## 三、下一棒待办（M6 发布：tag + Release + 留档）

> DoD（`plan/00` / `plan/05` M6 行）：**git tag `v1.0.0` + GitHub Release 附产物 + 发布留档三件套**；
> 署名 `yuluo554`。细则在 `plan/05` §「发布节奏（M6 细则）」。

1. **先认账**：`git status` —— **M0–M5 的改动全部未提交**。首推前要决定提交划分
   （建议按里程碑切，便于 Release 正文引用）；**tag 之后不得再改交付面**（`bin/`、`src/`、`package.json`，
   AGENTS.md 明令）。
2. **版本号**：`package.json` 现在是 `0.1.0`。M6 要发 `v1.0.0` → 改版本号属于**交付面**改动，
   必须在 tag **之前**完成，并同步 `README` 状态行（只写"版本 + 能力"，不写"已发布"）。
   改完重跑样例（`gen-examples` 会把版本号写进产物）。
3. **`plan/RELEASE-M6.md` 两栏**（`一、tag 前事实` / `二、tag 后追加`）+ **§覆盖对账**：
   布局门 `LAYOUT.RELEASE` 在 M6 翻 ✅ 后**会开始判它**（当前报"尚不适用"）。
   覆盖对账必须逐条给"实现 / 不适用 + 理由 / 待首推"，至少 3 行三态。
4. **CI 首推验证**：`plan/05` §已知未验证项里 `CI 实跑` 是 ⬜。首推后回填真实 run id，
   并把该条从 ⬜ 改为具体 run（布局门的 `LAYOUT.STATUS` 不看这一张表，但 `plan/06` 缺口表会被扫）。
5. **跨 Node 主版本矩阵**也是 ⬜（CI 配了 20/22/24，但未实跑）。首推后回填。
6. **`SHA256SUMS` 只写包内哈希，不写包外**；Release 正文写复验命令（`plan/05` §发布节奏 第 5 条）。
7. **不要顺手改 M5 的判据**：三格式一致（含 `properties.subject`）、schema 身份（`$id`）、
   `summary.highest` 三类覆盖、text 降级打 `degradeReason`、`gen-examples` 的 6 条自检 —— 都是冻结面。
8. 收尾：三处状态副本翻 ✅（M6 那行）+ `plan/HANDOFF-M6.md`（七节齐，**这一份是收官交接单**：
   它之后没有 M7，所以「下一棒待办」写"维护期待办"而不是新里程碑 DoD）。

## 四、既定口径清单（K 编号，动了会打挂测试）

> K1–K12 见 `plan/HANDOFF-M1.md` §四与 `plan/03` 契约冻结表；K13–K15 见 `plan/HANDOFF-M2.md` §四；
> K16–K20 见 `plan/HANDOFF-M3.md` §四；K21–K24 见 `plan/HANDOFF-M4.md` §四。**M5 新增**：

| 编号 | 口径 | 落点 |
|---|---|---|
| **K25（M5 新增）** | **三格式必须报同一批产物**：`(ruleId, subject)` 集合在 text/json/sarif 之间一致；`ruleId` 是真键（不得退化成 `"undefined"`），`properties.subject` 是机器可读包名；一致性判据的期望值**独立枚举**，不调被测的 `collectEntries` | `src/report/sarif.mjs` + `tools/check-report-schema.mjs`（变异 `H23`/`H24`/`H25`） |
| **K26（M5 新增）** | **SARIF 合规由官方 schema 的离线副本校验**（`schema/sarif-2.1.0.json`，A26），不是手写字段断言；`format` 是 draft-07 annotation，**登记为未校验、不假装通过**；未识别关键字报错而非静默跳过 | `src/report/json-schema.mjs` + `tools/check-report-schema.mjs`（变异 `P6`）；A26 |

## 五、本机环境坑（只写实测过的）

1. **`execFileSync` 在高负载下偶发**返回空 stdout（M5 首次跑报告门踩到一次，随后 40 次复跑未再复现）。
   报告门里做了**显式重试 + 计数**（重试次数打进结论串），**不静默**。
2. **`--out` 时 stdout 本来就该为空** —— "空 stdout 重试守卫"必须带 `allowEmpty`，
   否则原子写那条判据恒红（M5 踩过）。
3. **Windows 上 `chmod 0o555` 对目录基本无效** → 靠它构造"不可写"会让判据真空。用"父路径占成普通文件"。
4. **`node --test <目录>` 恒红**（目录被当成测试文件）：用 glob —— `node --test "tests/**/*.test.mjs"`。
5. **Bash 工具不能直接写仓库文件**（`>` / heredoc 会被安全钩子拦）。源码/夹具/文档用 **Write/Edit**。
   写 `package.json` 这类源码也要走 Write/Edit（`node -e fs.writeFileSync` 会被拦）。
6. **`execFileSync` 在子进程退出码非 0 时会抛**（即使指定 `encoding`）：取 `error.status` / `error.stdout`。
7. **官方 SARIF schema 里有 `$schema` 作为 properties 键**（不是 JSON Schema 的保留字位置）——
   校验器按 `properties` 走，不要特殊处理。
8. **`git status` 显示 M0–M5 大量改动未提交**（含本轮）。M6 开工前先认账。

## 六、DoD 逐项 checklist（M5）

- [x] `minimalSet` 属性测试通过，**含 `--max-requesters` 超限的降级路径**（仍无解 + 极小）+ 阴性对照
- [x] 退出码 0/1/2/3/4 全覆盖（`tests/exit-codes`，M0–M4 已建，M5 复核）
- [x] **SARIF 过官方 schema**：离线副本 `schema/sarif-2.1.0.json`（A26）+ 零依赖校验器，16 个夹具真跑
- [x] **三格式产物集合一致**（期望值独立枚举；`properties.subject` 机器可读）
- [x] `--out` 原子写：建目录 / 无 `.tmp` 残留 / 失败不留半个产物 / stdout 静默（跨平台确定）
- [x] 缺陷①（`ruleId: "undefined"`）已修 + 变异组 `H23`
- [x] 缺陷②（SARIF 丢 M3/M4 产物）已修 + 变异组 `H24`
- [x] 缺陷③（`summary.highest` 只扫 findings）已修 + 变异组 `H25`
- [x] 缺陷④（text 降级打错字段）已修 + 变异组 `H26`
- [x] schema 身份判据 + 变异组 `P6`
- [x] 样例重生成 + 逐字节一致；`gen-examples` 自检接 schema 校验
- [x] 台账 A26 + `A_EXEMPT` 豁免（带 why + 活测试）；`PROV.COVERAGE` 26 条
- [x] `npm test` **192 通过**；五门 + 向量门（15/15）+ 报告门全绿
- [x] 变异验证 **52 组全部符合预期**（M5 新增 `H23`–`H26`、`P6`）
- [x] `offline-smoke` 零联网（12 入口、6 命令、网络尝试 0）
- [x] 三处状态副本同步 ✅（`LAYOUT.STATUS` 断言一致）
- [x] 本交接单（七节齐）

## 七、关键命令速查

```bash
# 门（新对话第一件事）
node tools/check-sprint-layout.mjs
node tools/check-desensitized.mjs
node tools/check-scope.mjs
node tools/check-provenance.mjs       # 含 PROV.COVERAGE（台账 26 条）
node tools/check-workflows.mjs
node tools/check-vectors.mjs          # 15 组向量 + 真实树夹具
node tools/check-report-schema.mjs    # M5 新增：SARIF schema / 三格式一致 / --out 原子写

# 门的自证（52 组）
node tools/verify-layout-mutations.mjs
node tools/verify-layout-mutations.mjs --only H23   # ruleId "undefined" 回归
node tools/verify-layout-mutations.mjs --only H24   # SARIF 丢 M3/M4 产物回归
node tools/verify-layout-mutations.mjs --only H25   # summary.highest 漏算回归
node tools/verify-layout-mutations.mjs --only H26   # text 降级字段回归
node tools/verify-layout-mutations.mjs --only P6    # schema 身份回归

# 测试与冒烟
npm test                                              # 192 条（glob 形态）
node --test "tests/report/*.test.mjs"                 # 报告面（schema / 一致性 / 原子写 / 降级报文）
node --test "tests/proof/m4-minimality.test.mjs"      # minimalSet 属性 + 降级路径
node tools/offline-smoke.mjs

# 报告面演示
node bin/versionaudit.mjs audit fixtures/real-tree/input --format=sarif
node bin/versionaudit.mjs audit fixtures/real-tree/input --format=sarif --out r.sarif
node bin/versionaudit.mjs audit fixtures/vectors/M2-lock-manifest/input --format=sarif | head -40

# 样例
node tools/gen-examples.mjs            # 重生成（改了输出形态才跑）
node tools/gen-examples.mjs --check    # 逐字节比对 + 6 条自检（含官方 schema）

# 全量
npm run gate:all
```
