# HANDOFF-M2（M2 收尾交接单）→ 下一棒 M3

> **命名口径（本项目已定夺，勿改）**：文件名取 **`M<已完成的里程碑>`**，不是"下一棒"。
> 布局门按 `plan/HANDOFF-M${k}.md`（k = 已 ✅ 的里程碑）取文件，改名成 `HANDOFF-M3.md`
> 会让 `LAYOUT.HANDOFFS` 报 `plan/HANDOFF-M2.md(缺)`（有变异组 `L5b` 钉住）。
>
> **语义**：本文件是 **M2 的收尾记录**（M2 已达成的事实、K 口径、环境坑），
> 其中「三、下一棒待办」是给 M3 的行动清单。
>
> **编号错位提醒**：`plan/03` 的模块编号（"M1 `range-lint`"）与 `plan/00` 的
> **里程碑编号**（M2 = `range-lint`）**差一位**。看 `plan/03` 时认 `range-lint` 那一节，
> 不要按 M2 去找（M2 = `lock-manifest-check`）。
>
> 下一棒（M3）开工前：先跑 `node tools/check-sprint-layout.mjs` 与
> `node tools/check-desensitized.mjs`，两条门必须绿。

## 一、当前进度（含证据）

M2「范围语义（`range-lint` 实现 R1–R8）」已完成。**M2 做的是把骨架期实现提到"可独立验收"**：
逐条走查 R1–R8 与 `plan/03` / `data/README.md` §7.3 三处口径，把正反例扩成**全族矩阵**，
并加了"工具 vs 库"的**全帧差分**判据。走查中查出并修掉两个**实测缺陷**。

| 项 | 证据 |
|---|---|
| R1–R8 正反例全族矩阵 | R3 扩到 8 正例 / 6 反例（`^0.2.3`/`~0.2.3`/`^0.0.3` + `^0.0`/`~0.0`/`^0.0.0`/`~0.0.0`/`^0.0.x`/`~0.0.3`；反例 `^1.2.3`/`~1.2.3`/`^0`/`~0`/`^0.x`/`~0.x`）；R4 扩到 4 正例 / 5 反例；R5 扩到 5 正例 / 5 反例；R7 扩到 5 正例 / 4 反例；R8 扩到 3 正例 / 6 反例。`node tools/check-vectors.mjs` 12/12 端到端 |
| **`expandedRange` 全链路来自库调用** | 新增 `tests/rules/range-diff.test.mjs`：真跑 12 组向量的 CLI，对**每一条** finding 复算 `expandedRange === validRange(rawRange)`（逐字节、含 `null`），并复算 R1/R7/R8 的判据本身；对 M2 的 `manifest-not-satisfied` 复算 `satisfies` 必为 `false`；对 M3/M4 的 dedupe/conflict **证明**也逐条复算（`tests/rules/range-diff.test.mjs`，25 条断言，配变异组 `H8`） |
| 复核缺陷 ① | **R3 在 `^0.0` 族上崩溃**（`TypeError: symbol is not iterable`，整次审计退出码 3、stdout 0 字节——**合法输入被判"输入不可解析"**）。根因 = `checkR3` 从区间内部结构拆下界，而这族展开**无下界**（台账 A20）。修复在 `src/rules/range-lint.mjs:checkR3`（**只看上界**），变异组 `H6` 钉住 |
| 复核缺陷 ② | **R5 漏判"精确比较器 + 排除侧"**（`1.0.0 <1.0.0` / `1.0.0 >1.0.0` / `>1.0.0 1.0.0` 实测永不满足却不报）。根因 = 区间代数里 `exact` 特权字段 + `branchIsEmpty` 的 `!branch.exact &&` 逃生口，且 `normalizeRange` 合并等界时会覆盖前一条的开闭标记。修复在 `src/semver/interval.mjs`（删 `exact`；等值点只看两侧开闭；等界合并改 OR），变异组 `H7` 钉住 |
| 台账 | `data/README.md` §1.1 现 **21 条**（A1–A21）。A20 = `^0` 一族展开无下界；A21 = 等界排除形态永不满足。两条均**双副本交叉校验**（7.8.5 / 7.7.4），并配了留痕段落 |
| 口径同步 | `plan/03` M1 的 R3/R5 行更新为实现口径；`plan/01` §3.1 的 R3/R5 正反例列补全族；`docs/limitations.md` 新增 §5.0.2/§5.0.3（两条缺陷留痕）与 §5.1（R5 只判端点几何的能力边界） |
| 测试 | `npm test` **128 通过**（M1 末为 103；+25 = 全帧差分） |
| 门 | 五门 + 向量门全绿；`node tools/gen-examples.mjs --check` 逐字节一致（本轮因 R3 evidence 措辞变化**按生成器重生成**过一次）；`node tools/offline-smoke.mjs` 零联网（12 入网点、6 条命令、网络尝试 0） |
| 变异验证 | **32 组全部符合预期**：14 布局门 `L*` + 8 向量门/夹具卫生门 `V*`/`H4`/`H5` + 4 溯源覆盖门 `P*` + 6 断言纪律 `H1`–`H3`、`H6`–`H8`。新增 3 组（`H6` R3 崩溃族 / `H7` 等界逃生口 / `H8` 差分退化） |
| 工作树状态 | **M0–M2 的改动尚未提交**（M1 收尾也未 commit；`plan/HANDOFF-M1.md` 仍是 untracked）。M3 开工前先 `git status` 认账，别把上一棒的改动当成自己的 |

## 二、当前事实·状态不变量（下一棒动手前必须知道）

1. **R3 判据只看展开上界**（`hi.v[0] === 0` 且 `hi` 落在 0.x 小步进内），**不读区间内部下界**。
   `^0`/`~0`/`^0.x`/`~0.x` 上界为 `<1.0.0-0`（整个 0.x 可取）→ **不**报 R3。
   改回"拆下界"会让 `^0.0` 一族崩溃（变异组 `H6` 会红）。
2. **区间代数里没有 `exact` 字段了**。branch 的形状是 `{ lo, hi, exclusiveLo, exclusiveHi, comps }`。
   等值点（`lo == hi`）判空**只看两侧开闭**；`normalizeRange` 合并等界端点时必须 `OR` 开闭标记
   （否则 `>1.0.0 1.0.0` 的"排除"会被后一条比较器抹掉）。变异组 `H7` 会把这套改回去。
3. **`data/README.md` §1.1 现在是 21 条**（A1–A21）。增删表格行会影响 `PROV.COVERAGE`：
   **新增一条 A 必须同时给它"谁验它"**（某个向量的 `sources` 引用，或 `tools/check-provenance.mjs`
   的 `A_EXEMPT` 显式豁免 + 活测试锚点）。这是设计，不是麻烦。
4. **R5 的能力边界是登记过的**（`docs/limitations.md` §5.1）：只判**端点几何**，
   不判离散版本域（`>1.0.0 <1.0.1`、`<0.0.0`）与预发布可达性（A8）造成的空集。
   **不要用 `minVersion` / `subset` 去顶替判空**——实测两者都不可靠
   （`minVersion` 对 `>=1.0.0 <1.0.0 || ^2.0.0` 假空；`subset(R,'<0.0.0-0')` 在 1316 条语料上 43 条不一致）。
5. **全帧差分是一条新判据面**：`tests/rules/range-diff.test.mjs`。它的"非空自证"依赖
   `findings` / `dedupe` / `conflicts` 三类**至少一类非空**——M3 若给某个向量改成"三类全空"，
   这条测试会（正确地）报"判据空转"，那时要么补断言、要么调整自证口径。
6. **每个向量的 `mustContain` 必须含 `input.*` 绑定**（`tools/check-vectors.mjs` 强制，变异 `V6`）。
   负断言不绑输入会在**输入被删掉后真空变绿**。
7. **`fixtures/vectors/` 恰好 12 组**，目录名在 `tools/check-vectors.mjs` 的 `REQUIRED_VECTORS` 白名单里，
   "多（未声明）"会红。**M3 若要新增向量目录，必须同步该白名单 + `plan/01` §8 + `plan/04` §二**
   （三处都写了 12 组的确切清单）；更省事的做法是把 M3 的输入并进现有 `M2-lock-manifest` 向量。
8. `semver` 仍钉死 `7.8.5`；向量 `implementationVersions.semver` 必须一致，否则差分测试报版本漂移。

## 三、下一棒待办（M3 `lock-manifest-check` v1/v2/v3）

> DoD（`plan/00` / `plan/05` M3 行）：复现 `send@0.18.0` 场景并输出 **声明项 / 范围 / 锁中版本 /
> 请求者路径**；`lockfileVersion` 1/2/3 各有夹具；**混用 → 退出码 3**。
> 模块口径在 `plan/03` 的 **M2 `lock-manifest-check`** 一节（四类 `kind` 的唯一定义处）。

1. **逐条核对四类 `kind` 的实现判据**（`src/checks/lock-manifest.mjs`）与 `plan/03` M2 表格、
   `data/README.md` §7.3 的 M2 状态键默认级别表，确认三处逐字一致（`manifest-not-satisfied` /
   `missing-from-lock` / `manifest-changed-unsynced` 默认 **error**；`lock-extra-undeclared` /
   `lock-outdated` 默认 warning）。
2. **扩展"全帧差分"覆盖 M3 的判定面**：现有 `tests/rules/range-diff.test.mjs` 已复算
   `manifest-not-satisfied` 的 `satisfies`。M3 应补：`missing-from-lock` 的"锁中确实无条目"、
   `lock-extra-undeclared` 的"声明图确实不可达"、`manifest-changed-unsynced` 的"根声明确实不一致"
   ——每条都能用库/夹具独立复算。
3. **退出码 3（输入不可解析）要有端到端向量**：v1/v2/v3 结构混用、`lockfileVersion` 不支持、
   JSON 语法错误三种形态各一条，断言退出码 3（`data/README.md` §7.3 优先级 `3 > 4 > 1 > 2 > 0`，`K2`）。
4. **每种新判据配变异组**（AGENTS.md「门本身也要被证伪」）：例如"混用不再报 3"、
   "`requesterPath` 字段被删掉"、"`--strict` 的 `lock-outdated` 默认也报"。变异组总数会从 32 往上加，
   记得同步 `AGENTS.md` 顶部那句"当前 **N 组**"。
5. **不要顺手做 M4 的事**：`fixtures/real-tree/`（20 包真实树）属 M4；`dedupe-feasibility` /
   MUS 属 M4。M3 只碰锁与声明的一致性。
6. **别动 R1–R8 已冻结的判据**（R3 只看上界、R5 端点开闭、R8 默认关闭）。若确需动，
   必须同步 `plan/03` + `data/README.md`（含 §7.3 表）+ 相关向量 + 变异组，并在本类交接单留痕。
7. 收尾时：三处状态副本翻 ✅（`plan/00` 里程碑表 / `plan/05` 状态表 / `README` 状态表），
   写 `plan/HANDOFF-M3.md`（七节齐）。

## 四、既定口径清单（K 编号，动了会打挂测试）

> K1–K12 见 `plan/HANDOFF-M1.md` §四与 `plan/03` 契约冻结表。M2 新增：

| 编号 | 口径 | 落点 |
|---|---|---|
| **K13（M2 新增）** | **R3 判据只看展开上界**（`hi` 落在 0.x 小步进内即算收窄；`^0.0` 一族展开无下界也照报），**不读区间内部下界** | `src/rules/range-lint.mjs:checkR3`（A20；变异 `H6`） |
| **K14（M2 新增）** | **区间判空只看端点开闭**：`lo == hi` 时任一侧开 → 空、两侧都闭 → 非空单点；**没有 `exact` 特权字段**；`normalizeRange` 合并等界端点时开闭标记必须 `OR` | `src/semver/interval.mjs:branchIsEmpty` / `normalizeRange`（A21；变异 `H7`/`H3`） |
| **K15（M2 新增）** | **全帧差分**：每条 finding 的 `expandedRange` 必须能由 `validRange` 逐字节复算，且同类证明（M2 的 `satisfies`、M3/M4 的 proof）也要复算；**判据面留空 = 报"空转"** | `tests/rules/range-diff.test.mjs`（变异 `H8`） |

## 五、本机环境坑（只写实测过的）

1. **`execFileSync` 在子进程退出码非 0 时会抛**（即使指定 `encoding`）。断言"有 findings 时退出码 ≠ 0
   且 stdout 完整"必须 `try/catch` 取 `error.stdout`（`tests/rules/range-diff.test.mjs` 就是这么写的）。
2. **盘符绝对路径正则 `[A-Za-z]:[\\/]` 会误伤 `https://`**（`s:/` 命中）。要加"盘符前不是字母数字"。
3. **`node --test <目录>` 恒红**（目录被当成测试文件）。用 glob：`node --test "tests/**/*.test.mjs"`。
4. **Bash 工具不能直接 `>` 重定向写仓库文件**（会被安全钩子拦：`Mimosa 拒绝了通过 Bash 直接写入 ...`）。
   源码/夹具/文档用 **Write/Edit 工具**落盘；`node --input-type=module -e` 里用 `fs.writeFileSync`
   写 **临时目录**（如 `C:/Users/<user>/AppData/Local/Temp/...`）没问题。
5. **`node --input-type=module` 里没有 `require`**（`ReferenceError: require is not defined`）。读文件用
   `import { readFileSync } from "node:fs"`。若一定要 `require`，用 `createRequire`。
6. **npm 内置 semver 副本路径**：`C:/Program Files/nodejs/node_modules/npm/node_modules/semver`
   （`createRequire('file:///D:/')` + 绝对路径可加载；`npm root -g` 那条路不通）。交叉校验用得上。
7. **`git status` 里 `.mimosa/` 是工具状态目录**，已在脱敏门 `SKIP_DIRS`；不要提交它。

## 六、DoD 逐项 checklist（M2）

- [x] R1–R8 每条至少 1 正例 + 1 反例断言，且覆盖 `data/README.md` §1.1 全部实测语义（`PROV.COVERAGE` 21 条：20 引用 + `A16` 豁免）
- [x] **R4 / R7 / R8 的「同族多形态」反例矩阵**（各 4–6 个反例形态，断言指向标量/标量过滤路径）
- [x] **R3 全族矩阵**（`^0.0` 一族由崩溃转正例；`^0`/`^0.x` 等为反例）
- [x] **R5 等界开闭矩阵**（精确比较器 + 排除侧三种空形态；闭环单点 / 窄区间 / 裸版本 / 闭环预发布单点四种反例）
- [x] **`expandedRange` 全部来自 `validRange`**：`tests/rules/range-diff.test.mjs` 对 12 组向量逐 finding 复算
- [x] **差分测试与 semver 库一致**：diff 测试复算 R1/R7/R8 判据 + M2 `satisfies` + M3/M4 proof
- [x] 复核缺陷 ①（R3 崩溃）已修 + 台账 A20 + 留痕 + 变异组 `H6`
- [x] 复核缺陷 ②（R5 等界漏判）已修 + 台账 A21 + 留痕 + 变异组 `H7`
- [x] `npm test` 128 通过；五门 + 向量门 12/12 全绿
- [x] 变异验证 **32 组全部符合预期**（含 `H3` 靶子随实现更新）
- [x] 样例按生成器重生成后 `--check` 逐字节一致；`offline-smoke` 零联网
- [x] M2 三处状态副本同步 ✅（`layout/STATUS` 断言一致性）
- [x] 本交接单（七节齐）

## 七、关键命令速查

```bash
# 门（新对话第一件事）
node tools/check-sprint-layout.mjs
node tools/check-desensitized.mjs
node tools/check-scope.mjs
node tools/check-provenance.mjs     # 含 PROV.COVERAGE（台账覆盖，现 21 条）
node tools/check-workflows.mjs

# 门的自证
node tools/verify-layout-mutations.mjs                # 全 32 组
node tools/verify-layout-mutations.mjs --only H6      # R3 崩溃族回归
node tools/verify-layout-mutations.mjs --only H7      # R5 等界逃生口回归
node tools/verify-layout-mutations.mjs --only H8      # 差分退化

# 测试与冒烟
npm test                            # 128 条（glob 形态；目录形态恒红）
node --test "tests/rules/range-diff.test.mjs"    # 全帧差分单跑（12 组向量）
node tools/check-vectors.mjs        # 12 组向量 + 输入绑定 + 端到端退出码
node tools/offline-smoke.mjs

# 样例
node tools/gen-examples.mjs                 # 仅在"输出确实变了"时重生成
node tools/gen-examples.mjs --check

# CLI
node bin/versionaudit.mjs --help
node bin/versionaudit.mjs range-lint fixtures/vectors/R5-empty-intersection/input
node bin/versionaudit.mjs audit fixtures/vectors/R3-caret-zero/input --format=json
node bin/versionaudit.mjs audit fixtures/vectors/R8-bare-version-cross-ecosystem/input --format=json --enable-r8
```
