# HANDOFF-M4（M4 收尾交接单）→ 下一棒 M5

> **命名口径（本项目已定夺，勿改）**：文件名取 **`M<已完成的里程碑>`**，不是"下一棒"。
> 布局门按 `plan/HANDOFF-M${k}.md`（k = 已 ✅ 的里程碑）取文件，改名成 `HANDOFF-M5.md`
> 会让 `LAYOUT.HANDOFFS` 报 `plan/HANDOFF-M4.md(缺)`（有变异组 `L5b` 钉住）。
>
> **语义**：本文件是 **M4 的收尾记录**，其中「三、下一棒待办」是给 M5 的行动清单。
>
> **编号错位提醒**：`plan/03` 的模块编号与本文件的里程碑编号**差一位** ——
> `plan/03` 的 "M3 `dedupe-feasibility`" = 里程碑 **M4**（本棒）；
> `plan/03` 的 "M4 `conflict-explain`" + "M5 `report-ci`" = 里程碑 **M5**（下一棒）。
> 看 `plan/03` 时认模块名，不要按编号对。
>
> 下一棒（M5）开工前：先跑五门（见 §七），必须全绿。

## 一、当前进度（含证据）

M4「收敛可行性（`dedupe-feasibility` 三态 + MUS）」已完成。本棒做了三件事：
**落真实树夹具**、**把"MUS 可机械校验"从口号变成真判据**（走查发现它原来是**真空**的）、
**修掉超限降级"把可满足集合报成冲突集"的编造语义**。

| 项 | 证据 |
|---|---|
| **20 包真实树落位** | `fixtures/real-tree/{input/package.json,input/package-lock.json,expected.json,SOURCE.md}`。树由本机 `npm 11.12.1` 的 `npm install --offline` **真写出**（`lockfileVersion 3`，只用本机缓存、零联网）；20 个已安装包（+根 = 21 条锁条目）；`ms@2.0.0`（顶层，`debug@2.6.9` 请求）与 `ms@2.1.3`（`node_modules/send/node_modules/`，`send@0.18.0` 请求）并存；`npm ls --all` **退出码 0**。包名按 §6.2 白名单替换、`resolved`/`integrity`/`license`/`engines` 删除，**版本号与范围字符串逐字未改**；来源/替换清单/复现命令全在 `SOURCE.md` |
| **真实树确定性结论** | `NOT_CONVERGIBLE` + 最小冲突集 = `debug@2.6.9` 的 `ms: "2.0.0"` 与 `send@0.18.0` 的 `ms: "2.1.3"`（两条精确锁定无共同解，`reason: empty-intersection`，`degraded: false`，`requesters: 2`）。断言：`tests/proof/real-tree.test.mjs`（结论 + 请求者路径 + MUS 机械校验 + **锁自洽性**＝`npm ls` 退出码 0 的本地形态）、`fixtures/real-tree/expected.json`（向量级断言）、`tests/rules/range-diff.test.mjs`（差分也把真实树当夹具跑） |
| **复核缺陷 ①（判据真空）** | `range-diff` 的 dedupe 分支读 `item.minimalConflictSet?.lockedVersions` / `.ranges` —— 报告里 `minimalConflictSet` 是**数组**，这两个字段不存在 → `?? []` 让循环体**一次也不执行**：这条"最小冲突集由库复算"**从来没核过任何东西**；且原措辞的判据本身也不对（MUS 是"没有版本同时满足全部"，不是"每个范围都不被任何版本满足"）。修复：读实际形状 + 用库复算 §7.2 两条性质 + **阳性对照**（`coverage.musChecked > 0`）。变异组 `H14` |
| **复核缺陷 ②（编造冲突）** | `--max-requesters` 超限时旧实现直接取"候选最少的 2 条"当 `minimalConflictSet` —— 那 2 条**可能可满足**。实测（12 条钉 `1.0.0` + 1 条 `^1.5.0`，13 请求者）：返回的两条都是 `1.0.0`，而锁定版本里就有 `1.0.0` → **集合有解**。修复：超限改走**删除法**（从已知无解的全量逐个移除，只有仍无解才移除），结果**仍是无解 + 极小的真 MUS**；`reason` 固定为 `requesters > max`。变异组 `H18`；留痕 `docs/limitations.md` §5.0.4 |
| MUS 可机械校验 | 两条性质：① 无解（没有锁定版本同时满足 MUS 的全部范围）② 极小（移除任一元素后有解）。**降级结果也必须满足**。落点：`tests/rules/range-diff.test.mjs`（逐夹具、逐条 dedupe 产物）+ `tests/proof/m3-dedupe.test.mjs`（属性断言 + 超限场景）+ `tests/proof/real-tree.test.mjs`（真实树） |
| 目标列表完整性（新判据面） | `CONVERGIBLE` 的输出必须是**全部**可行目标。新增向量 `M3-ms-two-targets`（两个请求者都 `^2.0.0`，2.0.0 与 2.1.3 都要列）；差分侧复算"凡可行都必须在列"，并计入阳性对照。变异组 `H19` |
| `reason` 两态不许合并 | 新增用例：区间**几何非空**但无锁定候选（`>=1.0.0 <1.0.2` ∩ `>1.0.0 <=1.0.2`）→ `no-locked-candidate`，与 `empty-intersection` 分开陈述。变异组 `H20` |
| `--prefer` 只改标注 | `latest` / `min-change` 两态都断言：状态与目标集合不变；`latest` 只倒序并标首选、`min-change` 只标最小目标；不给 `--prefer` 时不标 `preferred`。变异组 `H21` |
| `REQUIRES_OVERRIDE.suggestion.nature` | 断言由**条件式**改为**无条件**（原 `if (status === "REQUIRES_OVERRIDE")` 会让"状态漂了"时静默跳过）；同时断言同基数两个 MUS 都列在 `minimalConflictSets`。变异组 `H22` |
| 门 | `tools/check-vectors.mjs` 新增「真实树夹具」段（四个文件齐 / `expected.json` 同形 + `input.*` 绑定 / **同名包两个版本还在**＝拓扑未压平 / 端到端退出码）；`tools/check-provenance.mjs` 的 A 引用扫描面扩到 `fixtures/real-tree/expected.json`（真实树也是向量级断言） |
| 台账 | `data/README.md` §1.1 现 **25 条**（A25 = 真实 npm 锁的 hoisting 形态 + `npm ls --all` 退出码 0）；`PROV.COVERAGE`：24 条被引用 + `A16` 豁免 |
| 测试 | `npm test` **176 通过**（M3 末 157，+19 = 真实树 5 + 差分面扩 + 双目标/降级/两态/prefer/suggestion 用例） |
| 变异 | **47 组全部符合预期**（45 应红 + 1 阴性对照 + 1 跳过）。M4 新增 10 组：`H14`–`H22`、`P5` |
| 样例 / 冒烟 | `node tools/gen-examples.mjs --check` 逐字节一致；`node tools/offline-smoke.mjs` 零联网（12 入网点、6 条命令、网络尝试 0） |
| 工作树状态 | **M0–M4 的改动仍未提交**。M5 开工前先 `git status` 认账 |

### 对 HANDOFF-M3 两处说法的事实更正（如实留痕）

1. HANDOFF-M3 §三.3 说"差分测试已在复算这一面（dedupe 分支）" —— **不成立**：那条判据读的是
   不存在的字段，循环体恒不执行（本棒缺陷①）。现在的复算才是真的，且有阳性对照。
2. HANDOFF-M3 §三.3 说 `tests/proof/m4-minimality.test.mjs` "是骨架" —— **不成立**：它在 M0/M3
   就已有真实断言（peer 冲突 + 4 请求者属性测试）。M4 的 MUS 校验落在 dedupe 面
   （`m3-dedupe.test.mjs` / `range-diff.test.mjs` / `real-tree.test.mjs`），没有动那个文件。

## 二、当前事实·状态不变量（下一棒动手前必须知道）

1. **超限降级只降"基数最小 / 平局全列"**：走删除法，结果仍**无解 + 极小**；`degraded: true` +
   `reason: "requesters > max"`（固定串，别自撰）。**可满足的集合不得报成 `minimalConflictSet`**
   —— 那是编造冲突（变异组 `H18`）。
2. **`reason` 两态不许合并**：`empty-intersection`（区间本身空）vs `no-locked-candidate`
   （区间非空、无锁定候选）。变异组 `H20`。
3. **"证明/复算"类判据必须有阳性对照**：`range-diff` 用 `coverage.targetsChecked / musChecked`
   计数，文件末尾有专项测试。判据在、测试在、但循环不执行 = 假门（本棒缺陷①）。
4. **真实树拓扑冻结**：`fixtures/real-tree/` 的**版本号与范围字符串禁改**；改包名/删字段的口径
   写在 `SOURCE.md`。它同时被 `check-vectors`（真实树段）、`tests/vectors`、`range-diff`、
   `real-tree.test.mjs` 四处使用 —— 改夹具会四处一起动。
5. **真实树的结论是 `NOT_CONVERGIBLE`**（`debug` 钉 `ms: "2.0.0"`、`send` 钉 `ms: "2.1.3"`）。
   **不要**为了让演示"好看"把范围改成 `^2.0.0`/`^2.1.0` —— 那会得出相反结论，且不是这棵树的真相
   （想看"可收敛"用 `M3-ms-duplicate` 向量，想看"两个目标"用 `M3-ms-two-targets`）。
6. **向量集现在 15 组**，目录名在 `tools/check-vectors.mjs` 的 `REQUIRED_VECTORS` 白名单里，
   "多（未声明）"会红。新增目录必须**三处同步**：白名单 + `plan/01` §8 + `plan/04` §二。
7. **真实树不在 `fixtures/vectors/` 里**（它不是最小复现，是 20 包树），所以
   `REQUIRED_VECTORS` 不计它；它的门在 `check-vectors` 的独立段落，端到端也被
   `tests/vectors`（`CASES` 里加一项）与 `range-diff`（`RUNS`）覆盖。
8. **断言引擎在 `tests/helpers/assertions.mjs`**（`resolvePath` / `checkAssertion` /
   `evaluateExpected`）：向量跑者与真实树跑者共用，**形态守卫（空心断言直接报错）也在那里**。
   改它等于同时改两边的语义。
9. **差分测试不复用 `src/model/*`**（M3 纪律）：真实树测试也自己读 `input/*.json`
   （自己实现 npm 的"逐级向上找 node_modules"解析），复用被测解析器会让"解析错"与"判据错"一起错。
10. **包名解析的坑**：取路径里的包名要用正则抓**最后一个** `node_modules/<name>`；
    `split("/node_modules/").pop()` 在顶层路径（`node_modules/ms`，无前导斜杠）上会解析出
    `"node_modules"` —— 本棒在测试和门里各踩过一次（会让"双版本"判据**恒真**，是假门）。
11. **M1–M4 已冻结的判据别动**：R3 只看上界、R5 端点开闭、R8 默认关闭、M3 的逐类键比对/
    无版本降级/跳树外与 link、M4 的删除法降级与 `reason` 固定串。确需动 → 同步
    `plan/03` + `data/README.md`（含 §7.3 表）+ 相关夹具 + 变异组，并在交接单留痕。
12. **台账 25 条**（A1–A25）：新增 A 必须同时给它"谁验它"（向量 `sources` 引用或 `A_EXEMPT`
    带 `why` + 活测试），`PROV.COVERAGE` 会红。
13. `semver` 仍钉死 `7.8.5`；向量与真实树 `expected.json` 的 `implementationVersions` 必须一致。

## 三、下一棒待办（M5 `conflict-explain` + `report-ci`）

> DoD（`plan/00` / `plan/05` M5 行）：`minimalSet` 属性测试通过；退出码 0/1/2/3/4 全覆盖；
> JSON/SARIF 通过结构校验；零联网验收。模块口径在 `plan/03` 的 **M4 `conflict-explain`** 与
> **M5 `report-ci`** 两节（注意编号差一位）。

1. **`minimalSet` 属性测试要覆盖降级路径**：`tests/proof/m4-minimality.test.mjs` 已覆盖 peer 冲突与
   4 请求者版本冲突（真实断言，不是骨架），但**没有**"`--max-requesters` 超限时 `minimalSet`
   仍无解 + 极小"的用例 —— 补上（MUS 内核本棒已保证，缺的是断言）。
2. **SARIF 官方 schema 校验器**（`docs/limitations.md` §3.2 已登记缺口）：无网环境不可用在线校验器，
   要么落一份离线 JSON Schema 副本 + 自研最小校验，要么继续结构断言但把"未跑官方校验"写清楚。
   **别假装跑过**。
3. **`report-ci` 三格式 + 退出码矩阵**：`tests/exit-codes` 已有 0/1/2/3/4 的端到端与优先级用例；
   M5 要补的是"三格式同一报告内容一致"（text/json/sarif 的 finding 集合一致）与
   `--out` 原子写的失败路径。
4. **`examples/` 重生成**：若 M5 动了输出形态，`node tools/gen-examples.mjs`（不带 `--check`）重生成，
   再跑 `--check` 逐字节确认；**样例里不许出现时间戳/绝对路径**（`gen-examples` 自检会拦）。
5. **不要顺手改 M4 的判据**：三态顺序（CONVERGIBLE → MUS → 分类）、`reason` 两态、
   删除法降级的"仍无解 + 极小"、`requesters > max` 固定串、真实树拓扑 —— 都是冻结面。
6. 收尾：三处状态副本翻 ✅（`plan/00` 里程碑表 / `plan/05` 状态表 / `README` 状态表），
   写 `plan/HANDOFF-M5.md`（七节齐），并把新判据配上变异组（M4 加了 10 组，M5 同规格）。

## 四、既定口径清单（K 编号，动了会打挂测试）

> K1–K12 见 `plan/HANDOFF-M1.md` §四与 `plan/03` 契约冻结表；K13–K15 见 `plan/HANDOFF-M2.md` §四；
> K16–K20 见 `plan/HANDOFF-M3.md` §四。**M4 新增**：

| 编号 | 口径 | 落点 |
|---|---|---|
| **K21（M4 新增）** | **真实树夹具是"拓扑冻结的真实 npm 锁"**：`fixtures/real-tree/` 的版本号与范围字符串禁改；四个文件（`input/package.json`、`input/package-lock.json`、`expected.json`、`SOURCE.md`）齐备；判据在 `tools/check-vectors.mjs` 的「真实树夹具」段 + `tests/proof/real-tree.test.mjs` + `tests/vectors` + `range-diff` | 变异组 `H16`/`H17`；A25 |
| **K22（M4 新增）** | **MUS 超限降级用删除法**：结果仍满足 §7.2 两条（无解 + 移除任一元素后有解），降级的**只是**"基数最小 / 平局全列"；`reason` 固定 `requesters > max`；**可满足的集合不得报成 `minimalConflictSet`** | `src/mus/minimal-set.mjs`（变异 `H18`）；`docs/limitations.md` §5.0.4 |
| **K23（M4 新增）** | **"证明/复算"类判据必须有阳性对照**：目标完整性（`targetsChecked`）与 MUS 极小性（`musChecked`）在 `range-diff` 里有计数与专项断言；循环读了不存在的字段 = 判据真空 = 缺陷 | `tests/rules/range-diff.test.mjs`（变异 `H14`） |
| **K24（M4 新增）** | **`CONVERGIBLE` 的目标列表必须完整**（全部可行版本，按 semver 升序）；`--prefer` 只改排序与标注 | `src/checks/dedupe.mjs`（变异 `H19`/`H21`）；`M3-ms-two-targets` |

## 五、本机环境坑（只写实测过的）

1. **npm 缓存不在 `~/.npm/_cacache`**（实测该目录不存在）：`npm config get cache` 指向**仓库外**
   的一个目录；本机 registry 配的是 npmmirror 镜像。`npm install --offline --no-audit --no-fund`
   只读缓存（零联网）；缓存里没有的包会 `ENOTCACHED`（M3 期踩过：`ms@2.1.2` 不在缓存）。
2. **`npm ls --all` 的输出第一行含绝对路径**（`<name>@<ver> C:\...\Temp\...`）。往仓库文档里抄
   必须脱敏（`<本机探针目录，已脱敏>`），否则脱敏门会红（`absolute-session-path` + 用户名规则）。
3. **`execFileSync` 在子进程退出码非 0 时会抛**（即使指定 `encoding`）：断言"退出码 ≠ 0 且
   stdout 有内容"必须 `try/catch` 取 `error.status` / `error.stdout` / `error.stderr`。
4. **`node --test <目录>` 恒红**（目录被当成测试文件）：用 glob —— `node --test "tests/**/*.test.mjs"`。
5. **Bash 工具不能直接写仓库文件**（`>` / heredoc 会被安全钩子拦）。源码/夹具/文档用 **Write/Edit**；
   `node --input-type=module -e` 里 `fs.writeFileSync` 写 `os.tmpdir()` 可以，写仓库文件会被拦。
6. **不能用 `require('/tmp/x.json')`**（Windows 下 `/tmp` 不映射）：用管道把 stdout 喂给
   `node -e "let s='';process.stdin..."`。
7. **包名解析**：`path.split("/node_modules/").pop()` 对顶层路径（`node_modules/ms`）解析出
   `"node_modules"` —— 用 `/node_modules\/((?:@[^/]+\/)?[^/]+)/g` 抓**最后一段**。
8. **证伪"`--prefer` 过滤目标"必须有 ≥2 个可行目标的夹具**：单目标夹具上过滤是 no-op，
   变异会假绿（本棒实测）。用 `M3-ms-two-targets`（或 `twoTargets()` 辅助函数）。
9. **`minimalConflictSet` 是数组**（元素 `{requester, range, requesterPath}`），
   `lockedVersions` 在 **item 顶层**；不存在 `{ranges, lockedVersions}` 这种对象形态。
10. **`git status` 显示 M0–M4 大量改动未提交**（含本轮）。开工前先认账。

## 六、DoD 逐项 checklist（M4）

- [x] 20 包真实树落位（`input/` + `expected.json` + `SOURCE.md`），实测锚点 A25
- [x] 真实树给出**确定性结论**（`NOT_CONVERGIBLE` + 最小冲突集，`tests/proof/real-tree.test.mjs`）
- [x] **MUS 可机械校验**：无解 + 移除任一元素后有解（差分逐夹具 + 属性断言 + 真实树）
- [x] **超限显式 `degraded`**：删除法（仍无解 + 极小）+ `reason: "requesters > max"`
- [x] 复核缺陷①（差分 MUS 面真空）已修 + 阳性对照 + 变异组 `H14`
- [x] 复核缺陷②（降级返回可满足集合）已修 + 留痕 §5.0.4 + 变异组 `H18`
- [x] `reason` 两态 / `--prefer` 只改标注 / `suggestion.nature` 三条断言到位（`H20`/`H21`/`H22`）
- [x] 目标列表完整性 + 新向量 `M3-ms-two-targets`（向量集 14 → 15）
- [x] 门：`check-vectors` 真实树段 + `check-provenance` 扫描面扩到真实树（变异 `H16`/`H17`/`P5`）
- [x] `npm test` **176 通过**；五门 + 向量门（15/15）全绿；`PROV.COVERAGE` 25 条（24 引用 + `A16` 豁免）
- [x] 变异验证 **47 组全部符合预期**（M4 新增 `H14`–`H22`、`P5`）
- [x] 样例 `--check` 逐字节一致；`offline-smoke` 零联网（12 入网点、6 命令、网络尝试 0）
- [x] 三处状态副本同步 ✅（`LAYOUT.STATUS` 断言一致）
- [x] 本交接单（七节齐）

## 七、关键命令速查

```bash
# 门（新对话第一件事）
node tools/check-sprint-layout.mjs
node tools/check-desensitized.mjs
node tools/check-scope.mjs
node tools/check-provenance.mjs     # 含 PROV.COVERAGE（台账 25 条）
node tools/check-workflows.mjs
node tools/check-vectors.mjs        # 15 组向量 + 真实树夹具

# 门的自证（47 组）
node tools/verify-layout-mutations.mjs
node tools/verify-layout-mutations.mjs --only H14   # 差分 MUS 面真空回归
node tools/verify-layout-mutations.mjs --only H18   # 超限降级"可满足集"回归
node tools/verify-layout-mutations.mjs --only H16   # 真实树拓扑压平回归
node tools/verify-layout-mutations.mjs --only P5    # 真实树台账锚点回归

# 测试与冒烟
npm test                            # 176 条（glob 形态；目录形态恒红）
node --test "tests/proof/real-tree.test.mjs"       # 真实树：结论 + MUS + 锁自洽
node --test "tests/rules/range-diff.test.mjs"      # 全帧差分（15 组向量 + 真实树）
node --test "tests/proof/m3-dedupe.test.mjs"       # 三态 / 降级 / 两态 reason / targets 完整
node tools/offline-smoke.mjs

# 真实树演示
node bin/versionaudit.mjs dedupe fixtures/real-tree/input --format=json
node bin/versionaudit.mjs audit  fixtures/real-tree/input --format=json

# 超限降级复现（13 个请求者 → 默认上限 12）
#   夹具形态见 tests/proof/m3-dedupe.test.mjs 的「--max-requesters 超限」用例：
#   12 条精确钉 1.0.0 + 1 条 ^1.5.0；期望 degraded:true / reason:"requesters > max"，
#   且返回集合必须"无解 + 移除任一元素后有解"

# 样例
node tools/gen-examples.mjs --check
```
