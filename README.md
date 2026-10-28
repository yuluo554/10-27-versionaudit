# versionaudit

离线版本约束审计器 —— 把 npm 的版本范围当一等公民，给出**范围语义风险**、**锁与 manifest 的双向不一致
（带请求者路径）**、以及**重复版本收敛可行性的证明与最小冲突集**。

纯本地 CLI：只读 `package.json` / `package-lock.json`，**零联网、零写入、零 registry 访问**。

> 定位是**诊断质量**，不是"能不能检测"。`npm ci` 已经能判定不同步，`pnpm dedupe --check` 已经能判定
> "要不要去重"——它们给布尔，本工具补的是**证明与最小解释**。

## 状态

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 计划套件 + 方法论装订 + 部署骨架 | ✅ |
| M1 | 数据先行（12 组差分向量） | ✅ 12 组端到端跑通；台账 A1–A19 逐条复核完成（覆盖率由 `PROV.COVERAGE` 门断言） |
| M2 | `range-lint`（R1–R8） | ✅ R1–R8 全族正反例矩阵；`expandedRange` 逐 finding 由 `validRange` 复算（12 组向量差分）；走查中修掉 R3 `^0.0` 族崩溃与 R5 等界开闭漏判 |
| M3 | `lock-manifest-check`（v1/v2/v3） | ✅ 四类 kind 逐条与 `plan/03` 对齐；v1/v2/v3 各有夹具（向量集 12 → 14 组）；退出码 3 三形态端到端；用真实 npm 11.12.1 锁复验时修掉三个实测缺陷（A22–A24） |
| M4 | `dedupe-feasibility`（三态 + MUS） | ✅ 20 包真实树（`fixtures/real-tree/`，`npm ls --all` 退出码 0）给出确定性结论＝不可收敛 + 最小冲突集；MUS 可机械校验（无解 + 移除任一元素后有解，逐夹具差分复算）；超限 `degraded` 仍是无解极小集；向量集 14 → 15 组 |
| M5 | `conflict-explain` + `report-ci` | ✅ `minimalSet` 属性测试（含 `--max-requesters` 超限降级路径）；退出码 0/1/2/3/4 全覆盖；SARIF 过**官方 schema 离线副本**（A26）+ 三格式产物集合一致 + `--out` 原子写；走查中修掉报告层四个实测缺陷（A26 / §5.0.5） |
| M6 | 发布 | ⬜ |

版本 `0.1.0`（M0 骨架）。能力面随里程碑推进，见 `plan/05-里程碑与发布.md`。

## 用法（骨架期）

```bash
npm install            # 仅安装一个钉死版本的 semver（7.8.5）
npx versionaudit --help
npx versionaudit --version
npx versionaudit doctor .            # 输入可读性诊断（不联网）
npx versionaudit range-lint <dir>    # M2 起
npx versionaudit lock-manifest <dir> # M3 起
npx versionaudit dedupe <dir>        # M4 起
npx versionaudit conflict <dir>      # M5 起
npx versionaudit audit <dir>         # 一次跑完，M5 起
```

### 灰区开关（默认档是**策略**，不是事实）

| 开关 | 默认 | 语义 |
|---|---|---|
| `--format` | `text` | `text` / `json` / `sarif` |
| `--out <file>` | 无 | 显式给出才写文件（原子写）；否则只打 stdout |
| `--fail-on` | `error` | `error` / `warning` / `never` |
| `--severity-map <file>` | 内置表 | JSON 覆盖档位；报告回显实际使用表 |
| `--strict` | off | 把"锁中版本 ≠ 声明下界"视为 `lock-outdated` |
| `--prefer` | 全列 | `latest` / `min-change`，只改排序与标注，不改可行性 |
| `--ignore-peer` | off | peer 冲突降为 `info` |
| `--max-requesters` | `12` | 超限降级为近似并显式写 `degraded: true` |
| `--verbose-paths` | off | 允许输出绝对路径（默认全部相对） |

### 退出码

| 码 | 语义 |
|---|---|
| 0 | 无问题 |
| 1 | 存在 `error` 级问题（默认：R5 空交集、M2 `manifest-not-satisfied`、M3 `NOT_CONVERGIBLE`、M4 冲突） |
| 2 | 仅 `warning` 且 `--fail-on=warning` |
| 3 | 输入不可解析（JSON 语法、缺字段、`lockfileVersion` 不支持、v1/v2/v3 结构混用） |
| 4 | 内部不一致：工具结论与 `semver` 库差分不一致（"不编造语义"的自证出口） |

优先级 `3 > 4 > 1 > 2 > 0`。完整口径（三态定义、MUS、灰区默认值）只在
[`data/README.md`](./data/README.md) §7 定义一次。

## 规则表（M2 起生效）

| 规则 | 内容 | 默认级别 |
|---|---|---|
| R1 | `>=x` 无上界 | warning |
| R2 | `*` / `latest` / 空串 / `x`（`latest` 判为**非范围**） | warning |
| R3 | `^0.x` / `^0.0.x` 语义收窄 | info |
| R4 | 预发布可达性（区分"范围不可达"与"目标不在候选集"） | warning |
| R5 | 空交集 | **error** |
| R6 | `\|\|` 分支冗余 / 被包含 | warning |
| R7 | build metadata 造成假精度 | info |
| R8 | 裸版本跨生态误用（默认关闭） | info |

## 零联网怎么证明

```bash
node tools/offline-smoke.mjs      # 进程内把 dns/net/tls/http 钩子改成抛错后跑全流程
```

CI 里另有 `docker run --network none` 的独立 job（构建期可联网、**运行期完全无网络**）。

## 三种输出格式

```bash
npx versionaudit audit <dir>                          # text（默认）
npx versionaudit audit <dir> --format=json            # 稳定 schema + policy 回显
npx versionaudit audit <dir> --format=sarif --out r.sarif   # SARIF 2.1.0
```

**三格式报同一批产物**：`findings`（M1/M2）、`dedupe`（M3）、`conflicts`（M4）三类都进
SARIF；真实树这种"error 全在 dedupe/conflicts 里、`findings` 为空"的输入是这条的试金石。

SARIF 合规由 **官方 schema 的离线副本**真校验（`schema/sarif-2.1.0.json`，OASIS 2.1.0；
来源与 `sha256` 见 [`data/README.md`](./data/README.md) §1.1 A26），不是手写字段断言：

```bash
node tools/check-report-schema.mjs   # 报告门：schema / 三格式一致 / --out 原子写（跑全部夹具）
```

已知边界：schema 里的 `format`（`uri-reference`/`date-time`）按 draft-07 annotation 语义
**未校验**，由校验器显式登记（见 [`docs/limitations.md`](./docs/limitations.md) §3.2）。

## 文档

| 文件 | 内容 |
|---|---|
| [`plan/00-README总览.md`](./plan/00-README总览.md) | 决策记录、弃选项、承诺-证据台账、里程碑 |
| [`plan/01-题目文档.md`](./plan/01-题目文档.md) | 项目题面（定位、任务要求、评分、边界） |
| [`plan/02-架构与技术选型.md`](./plan/02-架构与技术选型.md) | 分层、IR、区间代数与 semver 的分工 |
| [`plan/03-模块详设.md`](./plan/03-模块详设.md) | M1–M5 的输入输出与判定口径、契约冻结 K1–K10 + K25/K26 |
| [`plan/04-数据计划.md`](./plan/04-数据计划.md) | 向量集、真值纪律、冻结与再生成 |
| [`plan/05-里程碑与发布.md`](./plan/05-里程碑与发布.md) | DoD、每周可演示、已知未验证项 |
| [`plan/06-交付对标与决策.md`](./plan/06-交付对标与决策.md) | 评分对标、交付材料、决策记录、风险登记 |
| [`data/README.md`](./data/README.md) | 事实台账（semver 实测、跨生态同形异义、内置命令盲区、数值口径唯一定义处） |
| [`docs/method.md`](./docs/method.md) | 区间代数与 MUS 的算法说明与可校验性论证 |
| [`docs/limitations.md`](./docs/limitations.md) | 灰区、未实测项、边界与非目标 |

## 开发

```bash
node tools/check-sprint-layout.mjs   # 布局门（方法论装订）
node tools/check-desensitized.mjs    # 脱敏门
node tools/check-report-schema.mjs   # 报告门（SARIF schema / 三格式一致 / --out 原子写）
npm test                             # node:test 全量（192 条）
npm run gate:all                     # 全部门 + 测试 + 离线冒烟
node tools/verify-layout-mutations.mjs   # 门的自证（52 组变异，每组都必须变红）
```

## 边界（节选，全文见 `docs/limitations.md`）

不做 SBOM、不做许可证合规、不做 CVE 扫描、不做未使用依赖清理、不做自动升级、不实现求解器、
不做 monorepo 版本一致性；首期**仅 npm**（其他生态必须按其自身规范独立实现，见
`data/README.md` §2 的同形异义表）。

## 许可

本项目仅作工程实践与公开演示。仓库不涉及许可证合规判定功能（见"边界"）。
