# docs/limitations.md —— 灰区、未实测项与边界

> **默认档位是策略，不是事实。** 本节逐条列出"本工具不判定 / 默认不判 / 无法判"的东西。
> 报告里的 `policy` 字段会回显本次实际使用的档位表；`--severity-map` 可整表覆盖。

## 一、灰区（默认不判定，必须显式开启）

| 灰区 | 默认档 | 覆盖方式 | 为什么默认这样 |
|---|---|---|---|
| 哪些规则算 error/warning/info | `data/README.md` §7.3/§7.4 的默认表 | `--severity-map <file>` | 团队对"无上界有多严重"的容忍度不同；默认表只是本项目的策略 |
| "锁过期" vs "有意 override" | **不判定**，只报事实 | `--strict` | 从 lockfile 无法区分这两种意图；默认把判断权留给用户 |
| dedupe 目标：取最新 vs 取最小变更 | **全部列出，不选** | `--prefer=latest\|min-change` | 选哪个涉及变更风险偏好，工具不替用户决策 |
| 是否允许"无视 peer" | 不考虑无视 | `--ignore-peer` | peer 冲突降级是产品决策，不是技术事实 |
| R8 裸版本跨生态误用 | **默认关闭**（info） | `--enable-r8` | 无法从文件推断作者意图（`plan/01` §3.1） |
| lockfileVersion 1 的嵌套 `dependencies` 与 v2/v3 的 `packages` 混用 | **输入不可解析**（退出码 3） | 无 | 不做"尽量猜"：猜错的解析比报错危险得多 |

## 二、未实测项（显式标注，不得当作结论）

以下工具的**行为**只在文档层面引用，本机未安装（`command -v` 逐个确认为 MISSING，
见 `data/README.md` §0 与 §3.4）：

| 工具 | 状态 | 本文档的措辞边界 |
|---|---|---|
| `yarn constraints` | ⚠️ 未实测 | 只引官方文档原句"doesn't support transitive dependencies"，不推断其输出形态 |
| `uv lock --check` | ⚠️ 未实测 | 只引"查锁与声明一致性"，不描述退出码细节 |
| `go modules` | ⚠️ 未实测 | 只引官方"build list is not saved in a lock file" |
| `pipdeptree` | ⚠️ 未实测 | 只引"报冲突与循环"，不承诺其最小集能力 |
| `poetry check --lock` | ⚠️ 未实测 | 同上 |

**规则**：这些生态进入实现阶段前，`data/README.md` §8 的对应行必须从 ⚠️ 变为 ✅，
否则其向量不得入库。

## 三、已实测但形态受限

### 3.1 ERESOLVE 报文形态未经本机实测

用 `file:` 依赖构造 peer 场景时，`npm install` **未报 ERESOLVE（退出码 0）**，
只有 `npm ls --all` 报 `UNMET DEPENDENCY` / `missing: ... required by ...`（退出码 1）。

因此：

- 夹具提供 **UNMET 型**（有实测背书）与 **ERESOLVE 型**（只引文档/issue）两种期望。
- `docs/` 与代码注释中凡提到 ERESOLVE 的地方，都必须带"未实测"标注。

### 3.2 SARIF 校验：已用官方 schema 的离线副本（M5 关闭缺口，剩余边界如下）

**M0–M4 期**这条登记为"只做结构断言，未跑官方 schema 校验器"（在线校验器需联网，与零联网红线冲突）。

**M5 处置**：构建期**取一次**官方 schema 落进仓库（`schema/sarif-2.1.0.json`，OASIS 2.1.0，
`$id` / `sha256` / 关键字集全部实测记录在 `data/README.md` §1.1 **A26**），审计运行期仍然零联网。
校验器是**自研的 draft-07 子集**（`src/report/json-schema.mjs`，零依赖），
判据 `tools/check-report-schema.mjs` 对**全部 15 组向量 + 真实树**真跑：

| 项 | 状态 |
|---|---|
| 官方 schema 真校验（`additionalProperties:false` / `required` / `enum` / `const` / `$ref` …） | ✅ 已跑（16 个夹具） |
| 负例阳性对照（改坏 `version` / 删必填 / 非法 `level` / 加未知字段 / 删 `message`） | ✅ 逐条必红（`tests/report/report.test.mjs`） |
| **`format` 关键字**（`date-time` / `uri` / `uri-reference`） | ⚠️ **不校验**。draft-07 里 `format` 是 **annotation（默认不产生校验失败）**，实现 RFC 级校验会引入第二种编造。命中项由校验器**显式登记**为"未校验"并写进门的结论串，**不假装通过** |
| `$id` 身份 | ✅ 门断言 `$id` 必须是 OASIS 官方那份（变异组 `P6` 证伪） |

**为什么"自研校验器"不是退步**：旧写法的风险是"结构断言 ≠ schema 校验"却读起来像后者。
现在的形态是"官方 schema + 明确登记的不校验面"，两者都可核对。**仍未跑**的是 `format` 面
（例如 `<input>` 不是 legal URI reference 这件事，本工具不判——它对 SARIF 消费者无影响，
但如实登记在此）。

### 3.3 lockfileVersion 1 的真实样本较少

v1（npm 6）的锁在本机不常见。首期靠**手工构造**的 v1 夹具（`tests/checks/lock-manifest.test.mjs`
的 `lockV1` 用例）+ 对 npm 11 生成的 v2/v3 形态的对照来保证结构正确性。

v1 特有的语义差异（只有嵌套 `dependencies`、无 `packages`、`dev`/`optional` 信息不完整）
已在 `src/model/lock-v1.mjs` 的文件头注明；缺失字段**不推断**（不把"没写"猜成"不是 dev"）。

### 3.4 与真实 `npm ci` 的口径差异（M3 实测登记，不改判据）

M3 用**真实 npm 11.12.1 写出的锁**（`npm install --offline` 产物）逐条复验四类 `kind`，
发现三处本工具与 `npm ci` 判定不同。**都是有意的**，登记在此以免被当成"与 npm ci 完全一致"：

| 场景 | `npm ci` | 本工具 | 依据 |
|---|---|---|---|
| manifest **删除**某声明，锁仍保留 | PASS | 报 `manifest-changed-unsynced` + `lock-extra-undeclared` | 有意的补位：`npm ci` 只验"锁能否满足 manifest"，不验"锁是否多余"（`plan/00` D1 价值点） |
| manifest 把某声明**范围字符串改了**，但锁中版本仍满足新范围（如 `7.8.5` → `^7.0.0`） | PASS（`npm ci` 只判"解析结果是否满足"，不判声明是否重写过） | 报 `manifest-changed-unsynced`（**声明字面不一致**是事实） | `plan/03` M2 把该 kind 定义为"`packages[""]` 的声明键与 manifest 不一致"——**字面**不一致即报。这是有意的更严口径：锁记录的声明已陈旧，`npm install` 会重写它 |
| manifest 增减/修改 **devDependencies** | PASS（锁能装即可） | 不比对 dev（只按 `dependencies` / `optionalDependencies` 比根声明） | A24 实测；比对 dev 会制造 `npm ci` 不会有的失败 |
| 锁条目**无 `version`**（link / optional 占位） | PASS | **不报 error**，写 `degraded` 说明"无法判定" | A23 实测；`satisfies(null,·)` 恒 false，直接判"不满足"是把"无法判定"说成"判定为错" |

**仍有一套更严的地方**（不是差异，是本项目的判据）：`lock-extra-undeclared` 与
`missing-from-lock` 在 `npm ci` 里没有对应能力，属新增判据。两条判据的**行为边界**：
- 跳过树外路径（不以 `node_modules/` 开头）与 `link: true` 条目（A24 实测的真实 `file:` 锁形态）；
- `optional` 声明缺失不报 `missing-from-lock`。

### 3.5 lockfileVersion 1 无法表达根声明（结构性局限）

v1 锁没有 `packages[""]`，根声明只能由 manifest 提供。因此对 v1 输入：
- `manifest-changed-unsynced` **不产生**（没有可比对的锁侧基线，`rootManifestDeps` 为 `{}`）；
- `missing-from-lock` / `manifest-not-satisfied` **照常产生**（依赖锁中 `dependencies` 的嵌套形态）。

这是 v1 格式本身的局限，不是实现缺口；**不得**用 manifest 自己和自己比来"补齐"这条判据
（那会恒为一致，等于假判据）。

## 四、明确的非目标（做了什么不做的切割）

| 不做 | 理由 |
|---|---|
| SBOM 生成（SPDX / CycloneDX） | 已有 syft / cdxgen / trivy / sbom-tool 占据；本项目不产出文档格式 |
| **许可证合规判定** | 本系列另一道题的范围。本项目**全篇不读 `license` 字段、不做 SPDX 识别、不做合规判定**。`tools/check-scope.mjs` 把这条做成了可跑红的门 |
| CVE 漏洞扫描 | 必须联网查漏洞库，与零联网红线冲突 |
| 未使用依赖清理 | 需要静态分析源码 import，属另一类问题 |
| 自动升级 Bot | 必须联网查新版本 |
| 版本求解器（回溯/搜索） | 求解需 registry 元数据（联网）。本工具只做**对已锁定树的可满足性判定** |
| monorepo 版本一致性 | 首期只处理单包；workspace 列为 roadmap |
| pnpm / Yarn / Python / Cargo / Go 支持 | 首期**仅 npm**。其余生态必须按其自身规范**独立实现**（`data/README.md` §2 的同形异义表就是反例证据：裸 `1.2.3` 在 npm 是精确锁定、在 Cargo 是 caret） |

## 五、实现层面的已知限制

| 限制 | 影响 | 是否计划修复 |
|---|---|---|
| `overrides` / `resolutions` 只作为声明参与 R 规则，不计算其"实际解析结果" | 无法回答"某条 override 是否生效" | 二期（需要完整 npm 解析器） |
| `subset()`（R6 用）是库能力，未独立实现 | 预发布边界上的包含判定依赖库行为 | 不计划（已有差分覆盖） |
| MUS 超 `--max-requesters`（默认 12）时降级为**删除法** | 结果**仍是无解 + 极小**（移除任一元素后有解），但**不保证基数最小**、**不列全部平局集** | 设计如此；`degraded: true` + `reason: "requesters > max"` 显式声明（见 §5.0.4） |
| 区间代数不处理 `>x` 的"后继版本" | `>1.2.3` 记作开区间，不换算成 `>=1.2.4` | 设计如此（换算会改变预发布语义） |
| `resolved` 字段只作字符串留档 | 不校验 URL、不解析主机、不检查 integrity | 设计如此（零联网红线 + 安全向工具已覆盖） |
| 报告不含时间戳 | 无法从报告本身判断"何时跑的" | 设计如此（确定性要求）；需要时由 CI 记录 |
| 无 `--include-prerelease` 开关（台账 A16 对应能力） | 不做"放开预发布后是否可达"的放宽判定 | 设计如此（零联网审计不做放宽判据）；台账 A16 列为显式豁免并挂活测试锚点 |

### 5.0 已修缺陷留痕：R5 在闭环单点上曾误报（M1 复核发现）

**症状**：`>=1.0.0 <=1.0.0` 被判为空交集（R5，error 级）。

**事实**：该范围是**非空单点**——`satisfies('1.0.0','>=1.0.0 <=1.0.0')` 实测为 `true`，
`minVersion` 为 `1.0.0`（台账 A18；`semver` 7.8.5 与 npm 内置 7.7.4 双副本一致）。

**根因**：`src/semver/interval.mjs` 的 `branchIsEmpty` 把"`lo == hi` 且非精确版本"一律判空，
没区分端点开闭性——`<=`（闭）与 `<`（开）在上界同值时语义完全不同。

**修复**：`lo == hi` 时看端点开闭（任一侧开 → 空；两侧都闭 → 非空单点）。

**为什么不是小事**：这是**假阳性**——把完全正常的声明报成"永不满足"的 error，
并让退出码从 0 变 1，直接打挂用户的 CI。

**防复发（三层）**：① 台账补 A18；② `tests/semver/interval.test.mjs` 加 A17/A18/A19 回归测试；
③ 向量 `R5-empty-intersection` 增加 `range-incl-single` 与 `range-narrow` 两个**反例输入**，
断言它们**不得**出现 R5。变异组 `H3` 把修复改回去必须变红（已实证）。

### 5.0.1 两条断言纪律（都是 M1 复核实测出来的）
1. **负断言必须绑定输入**：只断言"不该出现 X"的向量，在**输入被删掉后会真空变绿**
   （包都不在夹具里，当然不会报）。实测：删掉 R5 夹具里的反例包，全部断言仍通过、门仍绿。
   现在 `tools/check-vectors.mjs` 强制每条向量的 `mustContain` 至少含一条 `input.*` 断言
   （变异组 `V6` 证伪；变异组 `H2` 证伪"删反例输入必须变红"）。
2. **断言必须指向标量字段**：`{path:"findings", value:"R5"}` 解析出的是**整个数组**，
   与字符串比恒为 false——放在 `mustNotContain` 里**永远不会失败**。
   M0 期有 4 条这样的"空心断言"（M2 与 R1 各 2 条）。现在向量跑者遇到这种形态**直接报错**
   （变异组 `H1` 证伪）。

### 5.0.2 已修缺陷留痕：R3 在 `^0.0` 一族上崩溃（M2 走查发现）

**症状**：声明 `"^0.0"`（或 `~0.0` / `^0.0.0` / `~0.0.0` / `^0.0.x` …）时，**整次审计以退出码 3 终止**，
stdout 0 字节，stderr 只有 `TypeError: symbol is not iterable`。

**事实**：这些范围的展开**没有下界**——`validRange('^0.0') = '<0.1.0-0'`（台账 A20）。
区间代数内部用 `Symbol` 表示 `-∞`，而 `checkR3` 旧实现无条件 `const [maj, min] = b.lo.v`
拆下界，于是拆一个 `Symbol` 就抛 `TypeError`。

**为什么不是小事**：这是**合法输入被误判为"输入不可解析"**（退出码 3 的语义），
比误报更难排查——用户看不到任何 finding，只看到进程崩了。

**修复**：`checkR3` **只看上界**（下界缺省不影响"上界被收窄到 0.x 小步进"这一事实）。
`^0` / `~0` / `^0.x` / `~0.x` 上界为 `<1.0.0-0`（整个 0.x 可取），仍不报 R3。

**防复发（三层）**：① 台账补 A20；② 向量 `R3-caret-zero` 扩成全族矩阵，8 个正例 + 6 个反例
（`^0` / `~0` / `^0.x` / `~0.x` 必须**不**报）；③ 变异组 `H6` 把"只看上界"改回"拆下界"必须变红。

### 5.0.3 已修缺陷留痕：R5 漏判"精确比较器 + 排除侧"（M2 走查发现）

**症状**：`1.0.0 <1.0.0`、`1.0.0 >1.0.0`、`>1.0.0 1.0.0` 三个范围**永不满足**
（`satisfies('1.0.0', …)` 均为 `false`），但不报 R5。

**根因**：两处叠加。① 区间代数里"精确比较器"带 `exact` 特权字段；② `branchIsEmpty` 用
`!branch.exact &&` 把它放行——等值点只要沾了精确比较器就不判空。此外 `normalizeRange` 合并
等界端点时，后一条比较器会**覆盖**前一条的开闭标记（`>1.0.0 1.0.0` 里"排除"被抹掉）。

**修复**：删掉 `exact` 特权字段（精确比较器退化为单点闭区间的普通端点）；
`branchIsEmpty` 的等值点判空**只看两侧开闭**；合并改为"等界 → 开闭标记 OR"。

**防复发（三层）**：① 台账补 A21；② 向量 `R5-empty-intersection` 加三个空形态（必须报）
+ `range-exact-plain` / `range-closed-open-guard` 两个反例（必须**不**报）；
③ 变异组 `H7` 把 `exact` 逃生口加回去必须变红。

### 5.0.4 已修缺陷留痕：MUS 差分复算真空 + 超限降级把"可满足集"报成"冲突集"（M4 走查发现）

**症状一（判据真空）**：`tests/rules/range-diff.test.mjs` 的 dedupe 分支读
`item.minimalConflictSet?.lockedVersions` 与 `.ranges` —— 而报告里的 `minimalConflictSet` 是
**数组**（元素 `{requester, range, requesterPath}`），这两个字段**不存在**。`?? []` 让循环体
一次也不执行：**这条"最小冲突集由库复算"的判据从来没核过任何东西**。判据本身的措辞也不对
（"集合内每个范围都不满足任一锁定版本"不是 MUS 的定义——MUS 是"没有任何锁定版本**同时满足全部**"）。

**症状二（编造冲突）**：`--max-requesters` 超限时，旧实现直接取"候选最少的 2 条请求者"当
`minimalConflictSet`。那 2 条**可能可满足**——实测：12 条精确钉 `1.0.0` + 1 条 `^1.5.0` 的 13 请求者
场景，返回的冲突集是两条 `1.0.0`，而锁定版本里就有 `1.0.0`，集合**有解**。这不是"不够小"，
是"根本不是冲突"；`degraded: true` 只声明了"非最小"，没声明"可能不是冲突"。

**为什么不是小事**：① 让"可机械校验"这句承诺在最贵的一栏（B 栏 20 分）上落空——判据在、门在、
测试在，但什么都没核；② 把可满足的集合当冲突集输出是**编造语义**，而且比误报更难发现
（它看起来"很有论证"）。

**修复**：① 差分测试改读实际形状，并用库复算 `data/README.md` §7.2 的两条性质
（无解 + 移除任一元素后有解），加**阳性对照**（`musChecked > 0`）让它再也不能静默空转；
② 超限降级改走**删除法**：从已知无解的全量 `R` 出发逐个尝试移除，只有仍无解才真的移除——
结果**仍是无解 + 极小的真 MUS**，降级的只是"基数最小 / 平局全列"，`reason` 固定为
`requesters > max`。

**防复发（三层）**：① `data/README.md` §7.2 写明降级的准确边界（降级不许动"是不是真冲突"）；
② 测试面：`tests/proof/m3-dedupe.test.mjs`（超限结果也必须满足 MUS 两条性质 + `reason` 固定串）、
`tests/rules/range-diff.test.mjs` 的阳性对照；③ 变异组 `H14`（差分改回真空形态）、`H18`
（降级改回旧贪心）必须变红。

### 5.0.5 已修缺陷留痕：报告面四处实测缺陷（M5 走查发现）

M4 收尾后，`plan/HANDOFF-M4.md` §三 把"三格式同一报告内容一致"与"SARIF schema 校验"列为 M5 待办。
走查这四条 DoD 时，**在既有实现里实测到四个缺陷**，全部已修 + 各配变异组：

**① `ruleId` 退化成字面量 `"undefined"`**（`H23`）
`src/report/sarif.mjs` 写 `ruleId: String(f.rule)`，而 **M2 的 finding 只有 `kind` 没有 `rule`**
（`plan/03` M2 的字段表就没有 `rule`）。于是每条 `manifest-not-satisfied` / `missing-from-lock` /
`lock-extra-undeclared` 在 SARIF 里的 `ruleId` 都是字符串 `"undefined"`——
**冻结样例 `examples/report.sarif` 里就有**（`rules[]` 里还真有一个 `id: "undefined"` 的空壳）。
为什么没人发现：**官方 schema 抓不到它**（`"undefined"` 是合法字符串）。
修复：`f.rule ?? f.kind` + 两者都缺时直接抛错（不许生成无名结果）。

**② SARIF 丢掉了 M3 / M4 的全部产物**（`H24`）
`renderSarif` 只遍历 `report.findings`。真实树上实测：JSON 报 `2` 条 error
（`ms` 的 `NOT_CONVERGIBLE` + `version-conflict`），**SARIF 报 0 条**——
`--format=sarif` 的用户会以为"没问题"，而退出码是 1。这是**三格式内容不一致**的最坏形态。
修复：findings / dedupe / conflicts 三类都进 SARIF（统一由 `collectEntries()` 枚举）。

**③ `summary.highest` 只扫 findings**（`H25`）
真实树上实测 `summary.error = 2` 而 `summary.highest = null` —— **自相矛盾**：
有 2 个 error 级产物，最高级别却是"没有"。
修复：`highest` 覆盖三类产物。

**④ text 的降级行打错字段**（`H26`）
`src/report/text.mjs` 打的是 `item.reason`（**两态 reason**：`empty-intersection` /
`no-locked-candidate`），而 `degradeReason`（`requesters > max`）才是降级原因。
实测报文：`⚠ 已降级：empty-intersection` —— 把降级原因说成了跟降级无关的词。
修复：打 `item.degradeReason ?? "degraded"`。

**为什么这四个能活到 M5**：它们全在**报告层**，而 M0–M4 的判据面压在**语义层**
（`expandedRange` 复算、MUS 两条性质、三态判定、退出码）。
语义层每条都有差分复算与变异组；报告层只有"字段存在"级断言，且 `gen-examples --check`
是**自比对**（生成器与它自己的冻结产物）——生成器错了，两边一起错，照样绿。

**防复发（三层）**：
① `schema/sarif-2.1.0.json`（官方副本，A26）+ `tools/check-report-schema.mjs`
（schema 真校验 / 三格式一致性 / `--out` 原子写，跑全部 16 个夹具）；
② `tests/report/report.test.mjs`（含**独立枚举**的期望值、负例阳性对照、
`summary.highest` 三类覆盖、降级报文三格式可见）；
③ 变异组 `H23`–`H26` + `P6` —— 四条修复与 schema 身份各一条，改回去必红。

**一个这次踩到的假门教训（写下来防复发）**：三格式一致性判据的第一版用
`collectEntries()`（**被测实现自己**）求"JSON 侧期望值"，再与 SARIF 侧比对。
H24 变异（把 dedupe/conflicts 段关掉）**假绿**——因为两侧同时少了同样的东西。
期望值必须**独立枚举**（现在 `expectedEntries()` 在门里自己写一遍）。

### 5.1 R5 只判"端点几何"，不判"离散版本域"（已知边界，不做）
区间代数把范围映射成 `[lo, hi)` 几何区间。**几何非空 ≠ 实际有解**，至少两类情况：

| 形态 | 几何 | 实际 | 本工具 |
|---|---|---|---|
| `>1.0.0 <1.0.1`、`>1.2.3 <1.2.4` | 开区间非空 | **无解**（版本是离散的，中间没有可取值） | **不报 R5** |
| `<0.0.0`、`>=0.0.0 <0.0.0` | 非空 / 端点邻接 | **无解**（`0.0.0` 之前无版本；`0.0.0` 自身被预发布规则排除） | **不报 R5** |
| `>=1.0.0 <1.0.0` 等**端点直接冲突** | 空 | 无解 | **报 R5** ✅ |

前两类**不做**，理由是 `plan/03` M1 R5 的定义就是"分支求交为空，或 `>=a <b` 且 `a>=b`"——
再加"离散后继"判定要自己发明版本域语义（`>x` 的后继到底是不是 `x.patch+1`？预发布怎么算？），
那正是 `plan/00` D2 明令禁止的"手写近似展开"。

**为什么不用库顶替**：实测两个候选替身都**不可靠**——
- `minVersion(R) === null` 判空：对 `>=1.0.0 <1.0.0 || ^2.0.0`（可满足）返回 `null` → **假空**。
- `subset(R, '<0.0.0-0')` 判空：在 1316 条语料上与暴力见证 **43 条不一致**。

用它们不是"更准确"，而是**把一种编造换成另一种编造**。宁可如实登记能力边界。

**变异守护**：`tools/check-vectors.mjs` 的 R5 向量只断言"端点冲突必须报 + 闭环/窄区间必须不报"，
不假装覆盖离散域（`tests/rules/range-diff.test.mjs` 对全部向量做 `validRange` 复算，
但对 R5 的空判定**只做端点几何层面的一致性**，不做离散域断言）。

### 5.2 测试夹具里的浮动版本是**被测对象**，不是依赖风险

`fixtures/vectors/R2-wildcard-latest/input/package.json` 里写着 `"wild": "*"`、
`"tagged": "latest"`、`"x-range": "x"`。安全扫描器会把这几行报成"浮动版本可能引入未审核代码"
——**这是误报**，依据三条：

1. **它们是被审计的输入样本**，不是任何项目的依赖表。R2 规则的全部意义就是检出
   `*` / `latest` / `x` 这类声明；改成固定版本等于删掉该规则的唯一正例，向量失效。
   （同样地，夹具的 `dependencies` 字段是审计器的**输入本身**，删掉它等于删掉被测对象。）
2. **它们不会被安装**。这条不是断言而是**判据**——`tools/check-vectors.mjs` 的「夹具卫生」
   逐条断言五条通路全部关闭：
   | # | 判据 | 为什么 |
   |---|---|---|
   | 1 | 每份夹具 `private: true` | 语义上明确"非发布物" |
   | 2 | 夹具无 `install`/`preinstall`/`postinstall`/`prepublish` 钩子 | 不会有安装期代码执行 |
   | 3 | 夹具自身无 `workspaces` 字段 | 夹具不冒充工作区根 |
   | 4 | 根 `package.json` 的 `workspaces` 未收编 `fixtures/**` | `npm install` 只在根工作区解析，不进 `fixtures/` |
   | 5 | 根 `package.json` 的任何依赖区段都无 `file:` / `link:` 指向 `fixtures/**` | 没有第二条把夹具挂进依赖树的通路 |
3. **这些判据都被证伪过**：变异组 `V1`（去 `private`）/ `V2`（加 `postinstall`）/
   `V3`(根 `workspaces` 收编 fixtures) / `H4`（根用 `file:` 依赖指向夹具）/
   `H5`（给夹具加 `workspaces`）——任一发生即向量门变红，全部实跑验证。

风险的正确处置是**保证夹具不参与安装**，而不是**删掉被审计的样本**。

## 六、确定性承诺的边界
- 同一输入、同一 `semver` 版本、同一 Node 主版本 → 逐字节相同（`tests/determinism` 断言）。
- **换 `semver` 版本可能改变结论**（预发布默认语义在别的生态已经变过——`data/README.md`
  ¶P8 记录了 packaging 26.0 的变更）。因此 `semver` 在 `package.json` 里**钉死不写 `^`**，
  且每条向量的 `expected.json` 都带 `implementationVersions`；版本漂移会让向量测试直接失败
  （而不是静默产出新结论）。
- **跨 Node 主版本**：排序/序列化不依赖 Node 特性，`engines` 声明 `>=20`。
  **CI 矩阵已实测 Node 20 / 22 / 24 三格全绿**（见 `plan/RELEASE-M6.md` §二 的 run 记录；
  该矩阵在 `.github/workflows/ci.yml` 的 `test` job 里按 `node: ["20","22","24"]` 展开）。
  入口另有**运行时下限检查**：`src/policy/node-floor.mjs` 的 `MIN_NODE_MAJOR`（= `engines.node`
  的数值）由 `bin/versionaudit.mjs` 在解析参数**之前**校验；不满足时打一行
  `versionaudit: requires Node >= 20 (running <实际版本>)` 并以退出码 **5**（环境档，
  见 `src/cli/exit.mjs`）退出 —— 不会退化成 `ERR_UNKNOWN_FILE_EXTENSION` 之类的间接错误。
  每份向量的 `expected.json` 也声明了 `implementationVersions.node`，向量测试会断言当前解释器
  满足该范围（声明与消费同源，不再是装饰）。
