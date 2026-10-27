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

### 3.2 SARIF 只做结构断言，未跑官方 schema 校验器

jsonschema store 的校验器需要联网；本项目零联网红线，因此 SARIF 2.1.0 的合法性由
`tests/report/sarif` 的结构断言保证（`version` / `$schema` / `runs[0].tool.driver` 必填项 /
`results[].level` 映射 / `artifactLocation.uri` 为相对路径）。

**这是能力缺口**：结构断言不等于完整 schema 校验。后续可用离线 JSON Schema 副本补强。

### 3.3 lockfileVersion 1 的真实样本较少

v1（npm 6）的锁在本机不常见。首期靠**手工构造**的 v1 夹具（`tests/checks/lock-manifest.test.mjs`
的 `lockV1` 用例）+ 对 npm 11 生成的 v2/v3 形态的对照来保证结构正确性。

v1 特有的语义差异（只有嵌套 `dependencies`、无 `packages`、`dev`/`optional` 信息不完整）
已在 `src/model/lock-v1.mjs` 的文件头注明；缺失字段**不推断**（不把"没写"猜成"不是 dev"）。

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
| MUS 超 `--max-requesters`（默认 12）时降级为贪心近似 | 结果不保证最小 | 设计如此；`degraded: true` 显式声明 |
| 区间代数不处理 `>x` 的"后继版本" | `>1.2.3` 记作开区间，不换算成 `>=1.2.4` | 设计如此（换算会改变预发布语义） |
| `resolved` 字段只作字符串留档 | 不校验 URL、不解析主机、不检查 integrity | 设计如此（零联网红线 + 安全向工具已覆盖） |
| 报告不含时间戳 | 无法从报告本身判断"何时跑的" | 设计如此（确定性要求）；需要时由 CI 记录 |

### 5.1 测试夹具里的浮动版本是**被测对象**，不是依赖风险

`fixtures/vectors/R2-wildcard-latest/input/package.json` 里写着 `"wild": "*"` 与
`"tagged": "latest"`。安全扫描器会把这两行报成"浮动版本可能引入未审核代码"——**这是误报**，
依据三条：

1. **它们是被审计的输入样本**，不是任何项目的依赖表。R2 规则的全部意义就是检出
   `*` / `latest` 这类声明；改成固定版本等于删掉该规则的唯一正例，向量失效。
2. **它们不会被安装**。仓库根 `package.json` 没有 `workspaces`，`npm install` 只处理根目录，
   从不进入 `fixtures/`；12 份夹具全部 `private: true`，且无 `install`/`postinstall` 钩子。
3. **这两条不是建议**，而是 `tools/check-vectors.mjs` 的「夹具卫生」判据，配 3 组变异
   （去掉 `private` / 加 `postinstall` / 把 `fixtures` 收进 `workspaces`）——任一发生即变红。

风险的正确处置是**保证夹具不参与安装**，而不是**删掉被审计的样本**。

## 六、确定性承诺的边界
- 同一输入、同一 `semver` 版本、同一 Node 主版本 → 逐字节相同（`tests/determinism` 断言）。
- **换 `semver` 版本可能改变结论**（预发布默认语义在别的生态已经变过——`data/README.md`
  ¶P8 记录了 packaging 26.0 的变更）。因此 `semver` 在 `package.json` 里**钉死不写 `^`**，
  且每条向量的 `expected.json` 都带 `implementationVersions`；版本漂移会让向量测试直接失败
  （而不是静默产出新结论）。
- **跨 Node 主版本**：排序/序列化不依赖 Node 特性，`engines` 声明 `>=20`。首期未在多个
  Node 版本上实测矩阵（CI 待首推验证）。
