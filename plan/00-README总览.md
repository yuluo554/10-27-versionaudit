> 方法论：`ai-tool-project-sprint`（装订 2026-10-27）｜布局门：`node tools/check-sprint-layout.mjs`｜续接对话第一件事 = 跑它

# 10-27-versionaudit · 项目总览

离线版本约束审计器。纯本地 CLI，只读 `package.json` / `package-lock.json`，零联网。
首期仅 npm；输出范围语义风险、锁与 manifest 双向不一致（带请求者路径）、重复版本收敛可行性证明与最小冲突集。

- 题目文档：[`01-题目文档.md`](./01-题目文档.md)
- 事实台账：[`../data/README.md`](../data/README.md)

## 文档索引

| 文件 | 作用 |
|---|---|
| `plan/00-README总览.md` | 本文：决策记录、弃选项、承诺-证据台账、里程碑 |
| `plan/01-题目文档.md` | 十段式题面：定位、介绍、任务要求、提交材料、评分、锚点、边界、验收、风险、里程碑 |
| `data/README.md` | 依据查证记录 + semver 事实台账 + 跨生态同形异义 + 内置命令盲区 + 数值口径一处定义 |

## 决策记录

### D1 与内置命令的检测重叠是真实的——价值必须落在"证明 + 最小解释"

**背景**：`npm ci` 已能判定锁与 manifest 不同步（实测退出码 1，`EUSAGE`）；`pnpm dedupe --check` 已能判定"去重会不会有变更"（help 原文：*"Exits with a non-zero status code if changes are possible."*）。

**决策**：本项目**不以"能检测"为卖点**。每个模块必须产出内置命令没有的东西：

- M2 必须给 `declaringPackage` / `declaredRange` / `requesterPath` 三件套（`npm ci` 只给目标版本 `0.19.2`）。
- M3 必须给三态判定 + 收敛目标版本 或 最小冲突集（`dedupe --check` 只给布尔）。
- M4 必须给最小请求者集合（`npm ls` 给 `UNMET` / `invalid` 但不给最小集）。

**若做不到 → 项目会被 `npm dedupe --check` 一句话替代**。这是生死线，写进评分 B 栏（20 分）。

### D2 semver 库只提供原子能力，交集这层得自己算

`node-semver` 提供 `validRange` / `satisfies` / `intersects`（`intersects('^1.0.0','^2.0.0')=false` 实测可用），但**"多个请求者范围的交集是否非空、非空时具体落在哪个已锁定版本"**不在库里——`intersects` 是两两判定，不做多路求交、不给候选版本。

证据：`semver intersection in:name,description` 全 GitHub 只有 **4** 个仓库，最高 `snyamathi/semver-intersect` **9★**。这层确实是空的。**决策**：自研区间代数（半开区间 `[lo, hi)` + 预发布标记），但**范围展开一律调用被测库**，不手写近似展开（避免编造 semver 规则）。

### D3 不得跨生态复用同一套范围语义

实测/官方原文证明同形异义：

- 裸 `1.2.3`：npm = 精确 `1.2.3`；Cargo = `>=1.2.3, <2.0.0`（caret 为默认）。
- npm `0.2.3` = 精确；Cargo `0.2.3` = `>=0.2.3, <0.3.0`。
- 兼容性：Cargo 原文 *"compatible if their left-most non-zero major/minor/patch component is the same. This is different from SemVer which considers all pre-1.0.0 packages to be incompatible."*
- Python `~=1.4.2` = `>=1.4.2,<1.5.0`（与 npm `~1.4.2` 边界巧合相同，但 `~=1.4` 的语义与 npm `~1.4` 是另一套推导）；`~=1` 直接 `InvalidSpecifier`。
- Go 无范围语法，用 MVS，且官方 *"the build list is not saved in a 'lock' file"*。

**决策**：每生态独立实现其规范；共享的只有"区间代数/求交/MUS"这些与语法无关的内核。首期只实现 npm。

### D4 本机未实测 yarn / uv / go / pipdeptree / poetry，roadmap 前须逐生态补测

本机实测确认缺失（`command -v` 全部 MISSING）。因此：

- 题面中这些工具的行为**只引官方文档**并标注"未实测"。
- roadmap 顺序：pnpm（有本机 10.34.5）→ Python（有 3.12.10 + packaging 26.3）→ Cargo（有 1.95.0）→ Yarn/Poetry/uv/Go（需先装再补测）。
- **禁止**在未补测前把任何生态的语义当成已验收事实写入向量。

### D5 灰区一律配置化，默认档声明为策略

`--severity-map`、`--strict`、`--prefer=latest|min-change`、`--ignore-peer`、`--max-requesters`。默认档在每次输出中回显，报告必须能说明"用了哪套策略"。

### D6 与许可证题严格切割

本系列另一题做开源许可证合规（依赖清单 → 许可证判定）。本题只做版本解析，**全篇不涉及许可证**：不读 `license` 字段、不做 SPDX 识别、不在文档中提及该项目名称。共享的只有"读依赖清单"这一个输入动作。

## 弃选项（含已占证据）

| 候选 | 原设想 | 为何不单独成题 | 去向 |
|---|---|---|---|
| 候选 1 | 锁一致性检查器 | 被 `npm ci` / `--frozen-lockfile` / `--immutable` 贴住，单独做只剩布尔 | 降为 **M2** |
| 候选 2 | 范围 lint | 被 eslint 生态贴住（`eslint-plugin-depend` 495★、`check-dependency-version-consistency` 80★），单独做偏薄 | 降为 **M1** |
| 候选 3 | 去重工具 | `pnpm dedupe` 已内建；零散脚本 16★/15★/11★ 量级，检测层已被占 | 降为 **M3** |
| 候选 4 | 跨生态版本审计（npm+Python+Cargo+Go） | 一周不可行，且每生态需独立实测 | 降为 **roadmap 护城河** |
| 候选 5 | SBOM 生成 | syft 9764★ / cdxgen 1094★ / trivy 38764★ / sbom-tool 2089★ | **明确不做** |
| 候选 6 | 许可证合规 | 已被本系列另一题占用（切割声明 D6） | **明确不做** |
| 候选 7 | CVE 扫描 | retire.js 4190★ / pip-audit 1385★ / snyk 5689★；必须联网 | **明确不做** |
| 候选 8 | 未使用依赖清理 | knip 12533★ / depcheck 4908★ / deptry 1496★；需静态分析源码 | **明确不做** |
| 候选 9 | 自动升级 Bot | renovate 22915★ / dependabot 5817★ / npm-check-updates 10321★；必须联网 | **明确不做** |
| 候选 10 | 依赖求解器 | pubgrub 812★ / Molinillo 420★ / resolvo 228★；求解需 registry 元数据=联网 | **明确不做**，改为"对已锁定树的可满足性判定" |
| 候选 11 | monorepo 版本一致性 | syncpack 2109★ / manypkg 1046★ | **明确不做**（roadmap） |
| 候选 12 | 锁文件合并冲突自动解决 | 需要 git 上下文与三方合并语义，超出"只读审计" | **不做**（需求原话保留作为动机证据） |

## 承诺-证据台账

| 承诺 | 证据 | 状态 |
|---|---|---|
| 范围展开不编造 | **19 条**语义实测台账（node-semver 7.8.5 / packaging 26.3；A1–A16 为 M0，A17–A19 为 M1 复核补录）；`tests/semver/interval.test.mjs` 逐条覆盖 A1–A19；`expandedRange` 差异测试；溯源门的 `PROV.COVERAGE` 断言"台账每条 A 编号都被向量引用或有显式豁免"（含幽灵锚点/僵尸登记检测） | ✅ 已验证 |
| 锁不一致给请求者路径 | 实测 `npm ci` 只报 `send@0.18.0 does not satisfy send@0.19.2`，无范围/来源；M2 每条 finding 强制带 `requesterPath`，`tests/checks/lock-manifest` 断言 | ✅ 已验证短板且已补位 |
| 重复版本不告警 | 实测双 `ms` 版本树 `npm ls --all` 退出码 0（A25：`npm install --offline` 真写出的 20 包树）；M4 给出三态判定 + 可机械校验的最小冲突集：`tests/proof/real-tree.test.mjs`（真实树确定性结论）、`tests/proof/m3-dedupe`（三态/降级/两态 reason）、`tests/rules/range-diff.test.mjs`（逐夹具复算 MUS 两条性质与 targets 完整性） | ✅ 已验证短板且已补位 |
| 去重只有布尔 | `pnpm dedupe --check` help 原文 + pnpm#16356（`dedupe` 后 `--check` 仍失败） | ✅ 已验证短板 |
| 同样字符不同含义 | npm vs Cargo 官方 reference 原文对照 | ✅ 已验证 |
| 交集层是空的 | `semver intersection` total_count=4，最高 9★ | ⬜ 软论据（403 限流已标注） |
| 需求真实 | HN 14 条原话 + pnpm issue 标题 + 下游 issue 1022 条规模 | ✅ |

## 里程碑

| 里程碑 | 内容 | 状态 | 完成条件（DoD） |
|---|---|---|---|
| M0 | 计划套件 + 方法论装订 + 部署骨架 | ✅ | `plan/00–06` 齐备；`AGENTS.md` + 布局门 + 脱敏门在 CI 有步骤；CLI 骨架 `--version`/`--help` 可跑；`npm test` 绿（本地等价校验，未接远端，CI 待首推验证） |
| M1 | 数据先行（向量集） | ✅ | 12 组目录齐备、端到端 12/12；每目录 `expected.json` 含 `mustContain`/`mustNotContain`/`exitCode`/`implementationVersions`/`sources`；**按 `data/README.md` §1.1 逐条复核完成**：台账 19 条实测（A1–A19）全部有向量引用或显式豁免（`PROV.COVERAGE` 门断言）；补齐正反例对 + **每向量输入绑定**断言；复核中修掉 R5 闭环单点误报与 4 条空心断言 |
| M2 | 范围语义（`range-lint` 实现 R1–R8） | ✅ | 向量全绿；`expandedRange` 全部来自库调用（`tests/rules/range-diff.test.mjs` 逐 finding 复算 12 组向量）；差分测试（工具 vs 直接用 semver 库）一致；R1–R8 正反例全族矩阵齐（R4/R7/R8 各补「同族多形态」反例矩阵）；走查中修掉 R3 的 `^0.0` 族崩溃与 R5 的等界开闭漏判，各配变异组（`H6`/`H7`） |
| M3 | 锁一致性（`lock-manifest-check` v1/v2/v3） | ✅ | 复现 `send` 场景并输出声明项/范围/锁中版本/请求者路径（`fixtures/vectors/M2-lock-manifest` 断言）；三种 lockfileVersion 各有夹具（v3 = M2 向量、v1/v2 = 新增 `M3-lockfile-v1`/`M3-lockfile-v2`，向量集 12 → 14 组）；退出码 3 三形态（结构混用 / 不支持版本 / JSON 语法错误）端到端覆盖于 `tests/exit-codes/lock-input.test.mjs`；**用真实 npm 11.12.1 写出的锁逐条复验四类 kind**，修掉三个实测缺陷（台账 A22–A24；变异组 `H9`–`H13`） |
| M4 | 收敛可行性（`dedupe-feasibility` 三态 + MUS） | ✅ | 20 包真实树（`fixtures/real-tree/`：`npm install --offline` 真写出的锁、`npm ls --all` 退出码 0）给出确定性结论＝`NOT_CONVERGIBLE` + 最小冲突集（`tests/proof/real-tree.test.mjs`）；MUS 可机械校验（无解 + 移除任一元素后有解，逐夹具差分复算；`M3-ms-two-targets` 钉目标完整性）；超限显式 `degraded`（删除法保证仍是无解极小集）；修掉两个实测缺陷（差分 MUS 面真空 / 降级返回可满足集合；变异组 `H14`–`H22`、`P5`） |
| M5 | 冲突解释与门禁（`conflict-explain` + `report-ci`） | ✅ | `minimalSet` 属性测试通过（含 `--max-requesters` 超限的降级路径：仍无解 + 极小）；退出码 0/1/2/3/4 全覆盖；**SARIF 过官方 schema 的离线副本**（`schema/sarif-2.1.0.json`，A26；`tools/check-report-schema.mjs` 真跑 16 个夹具）+ 三格式产物集合一致（期望值独立枚举）；零联网验收（`offline-smoke`）。走查中修掉报告层四个实测缺陷（`ruleId: "undefined"` / SARIF 丢 M3·M4 产物 / `summary.highest` 漏算 / text 降级打错字段；变异组 `H23`–`H26`、`P6`） |
| M6 | 发布（GitHub 公开仓库） | ✅ | **DoD = git tag + GitHub Release 附产物 + 发布留档三件套**；署名 `yuluo554`。tag `v1.0.0`（annotated）+ Release 两件附件（源码包 + `SHA256SUMS`）+ `plan/RELEASE-M6.md` 两栏与覆盖对账。**首推实测修掉 Node 20 的 `node --test "<glob>"` 缺陷**（glob 是 Node 21 才加的；改 `tools/run-tests.mjs`，变异组 `H27`）；附件与 tag 树逐 blob sha1 一致 132/132 |

## 仓库约定

- git 本地配置：`user.name=yuluo554`、`user.email=282769740+yuluo554@users.noreply.github.com`。
- 首提交信息：`离线版本约束审计器：模拟项目题定稿与项目计划启动`。
- 不写漂移硬数字：star/issue 数等一律注明检索式与窗口，且不得在代码或文档中作为"实时数字"引用。
- 数值口径（三态定义 / 最小冲突集 / 退出码 / 灰区开关）**只在 `data/README.md` 定义一次**，其它文档引用不复写。
