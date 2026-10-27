# data/README.md —— 依据查证记录与事实台账

本文件是**唯一事实源头**。题面、总览、代码、测试向量中的所有语义断言都必须能在此追溯到一条记录。凡本文件未记录的语义结论，一律视为"待查证"，不得写入代码或文档。

---

## 0. 检索口径与窗口（三态标注）

| 项 | 值 |
|---|---|
| 检索窗口 | **2026-10-27T10:56Z – 11:15Z**（末次检索 `2026-10-27T11:15:18Z`） |
| 检索手段 | `gh api` search（仓库/issue）、HN Algolia、官方文档 WebFetch、**本机实测** |
| 实测环境 | node **v24.15.0** / npm **11.12.1** / node-semver **7.8.5**（pnpm 10.34.5 内置）与 **7.7.4**（npm 11.12.1 内置，交叉校验一致）/ pnpm **10.34.5** / cargo **1.95.0** / rustc **1.95.0** / Python **3.12.10** + packaging **26.3** / git 2.54.0 |
| **本机缺失** | `yarn` / `uv` / `go` / `pipdeptree` / `poetry` / `pipx`（`command -v` 逐个确认 MISSING）→ 相关结论**只引官方文档并标注未实测** |
| 三态标记 | ✅ 本机实测或官方原文直引 ｜ ⬜ 软论据（计数类） ｜ ⚠️ 未实测/受限 |

### ⚠️ 403 限流说明（必须与结论一起引用）

检索期间出现**两次 HTTP 403**，报文分别为 `"You have exceeded a secondary rate limit"` 与 `"API rate limit exceeded"`。

**这是限流，不是 0 结果。** 因此：

- 任何 `total_count` 只能标注为"该窗口内一次检索的快照"，不得当作全站真实总量。
- 出现 403 的检索式不得被解读为"没有相关项目"；必须重新检索或标注未完成。
- 所有空白论据一律标 **⬜ 软论据**，不参与"已被占位"的硬判定。

---

## 1. semver 事实台账（✅ 本机实测）

> 核心纪律：**不编造 semver 规则**。下表每一条都是本机执行结果，不是记忆或推断。凡与下表冲突的"常识"，以下表为准。

### 1.1 npm（node-semver）

实现：`semver@7.8.5`（pnpm 10.34.5 内置副本）为主；`semver@7.7.4`（npm 11.12.1 内置）交叉校验，结论一致。

| # | 断言 | 实测命令要点 | 实测结果 | 状态 |
|---|---|---|---|---|
| A1 | `^0.2.3` 展开 | `validRange('^0.2.3')` | `>=0.2.3 <0.3.0-0` | ✅ |
| A2 | `^0.2.3` 满足性 | `satisfies('0.2.9','^0.2.3')` / `satisfies('0.3.0','^0.2.3')` | `true` / **`false`** | ✅ |
| A3 | `^0.0.3` 展开 | `validRange('^0.0.3')` | `>=0.0.3 <0.0.4-0` | ✅ |
| A4 | `^0.0.3` 只等于 0.0.3 | `satisfies('0.0.4','^0.0.3')` | **`false`** | ✅ |
| A5 | `~0.2.3` 展开 | `validRange('~0.2.3')` | `>=0.2.3 <0.3.0-0` | ✅ |
| A6 | `1.0`（两位）展开 | `validRange('1.0')` | `>=1.0.0 <1.1.0-0`（**不是** `<2.0.0`）；`satisfies('1.1.0','1.0')=false` | ✅ |
| A7 | `0.0`（两位）展开 | `validRange('0.0')` | `>=0.0.0 <0.1.0-0`（`satisfies('0.0.9','0.0')=true`、`satisfies('0.1.0','0.0')=false`） | ✅ **已校正** |
| A8 | 预发布不被无预发布的范围匹配 | `satisfies('1.0.0-beta','^1.0.0')` / `satisfies('1.5.0-beta','^1.0.0')` / `satisfies('1.0.0-beta','*')` | `false` / `false` / **`false`** | ✅ |
| A9 | 带预发布下界可匹配同三元组预发布 | `validRange('^1.2.3-beta')` / `satisfies('1.2.3-beta.2','^1.2.3-beta')` | `>=1.2.3-beta <2.0.0-0` / `true` | ✅ |
| A10 | build metadata 不参与比较 | `satisfies('1.0.0+build.1','1.0.0')` / `satisfies('1.0.0','1.0.0+build.1')` / `eq(...)` / `compare(...)` | `true` / `true` / `true` / `0` | ✅ |
| A11 | 空范围永不满足 | `validRange('>=1.0.0 <1.0.0')`；`satisfies('1.0.0',…)` / `satisfies('1.5.0',…)` | 展开保留原式；`false` / `false` | ✅ |
| A12 | 交集判定 | `intersects('^1.0.0','^2.0.0')` / `intersects('^1.0.0','^1.5.0')` | `false` / `true` | ✅ |
| A13 | `latest` 不是范围 | `validRange('latest')` | **`null`**（是 npm dist-tag，不是 semver range） | ✅ |
| A14 | `*` 与空串等价 | `validRange('*')` / `validRange('')` | `'*'` / `'*'` | ✅ |
| A15 | 裸三位版本是精确锁定 | `validRange('1.2.3')` | `'1.2.3'`（无 `<` 上界） | ✅ |
| A16 | `includePrerelease` 会放开预发布 | `satisfies('1.5.0-beta','^1.0.0',{includePrerelease:true})` | `true`（默认 `false`，见 A8） | ✅ |

**A7 校正留痕**：初稿把 npm `0.0` 记为 `>=0.0.0 <0.0.1-0`，实测为 `>=0.0.0 <0.1.0-0`（7.7.4 与 7.8.5 一致），与 node-semver README `^0.0` 条目 `>=0.0.0 <0.1.0-0` 相符。故该行**不构成** npm/Cargo 差异；Cargo 的 `0.0 := >=0.0.0, <0.1.0` 实为上界相同的另一种写法。**语义断言与实测冲突时，一律以实测为准并在本表留痕。**

### 1.2 Python（packaging 26.3，Python 3.12.10）

仅用于证明"其它生态必须单独实现"，**首期不实现**。

| # | 断言 | 实测 | 状态 |
|---|---|---|---|
| P1 | `~=1.4.2` 的边界 | `contains('1.4.2')=True`、`contains('1.4.9')=True`、`contains('1.5.0')=False`、`contains('1.4.1')=False` | ✅ |
| P2 | `~=1.4` 的边界 | `contains('1.9.9')=True`、`contains('2.0')=False`、`contains('1.3.9')=False` | ✅ |
| P3 | `~=1` 非法 | `SpecifierSet('~=1')` → `InvalidSpecifier: Invalid specifier: '~=1'` | ✅ |
| P4 | `==1.0` 视同 `==1.0.0` | `Version('1.0') == Version('1.0.0')` → `True` | ✅ |
| P5 | `1.0.0rc1 < 1.0.0` | `Version('1.0.0rc1') < Version('1.0.0')` → `True` | ✅ |
| P6 | `>=1.0` 不匹配 `1.0.0b1`（**排序原因**） | `contains('1.0.0b1')=False`，`prereleases=True` 仍为 `False` | ✅ **已校正** |
| P7 | `>=1.0` 匹配 `1.1.0b1` 的状态依赖默认值 | `prereleases=None` → `True`；`prereleases=False` → `False`；`prereleases=True` → `True` | ✅ **已校正** |
| P8 | 预发布默认值随版本变更 | `packaging` 26.0 起 `prereleases=None` 会匹配预发布（源码 docstring：*"With ``prereleases=None``, a prerelease now matches. … Earlier versions rejected it."*） | ✅ 源码原文 |

**P6/P7 校正留痕**：初稿写作"Python `>=1.0` 默认不匹配 `1.0.0b1`（需 `prereleases=True`）"。实测：`1.0.0b1` 在 `prereleases=False/True` 下**都是 False**——原因是 PEP 440 排序里 `1.0.0b1 < 1.0`，属于**下界不满足**，不是预发布过滤；而 `1.1.0b1` 在 `prereleases=None`（26.3 默认）下为 **True**。三态含义完全不同，必须分开写在向量里。

---

## 2. 跨生态同形异义表（✅ 官方原文 + 本机实测）

> **同一串字符在不同生态 = 不同含义**。这是本项目最硬的差异化事实，也是"不许复用一套解析器"的依据。

| 写法 | npm（node-semver，实测 A1–A15） | Cargo（官方 reference 原文） |
|---|---|---|
| 裸 `1.2.3` | **精确锁定** `1.2.3`（A15） | `>=1.2.3, <2.0.0` |
| `0.2.3` | 精确 `0.2.3` | `>=0.2.3, <0.3.0` |
| `0.0.3` | 精确 `0.0.3` | `>=0.0.3, <0.0.4` |
| `0.0` | `>=0.0.0 <0.1.0-0`（A7） | `>=0.0.0, <0.1.0` |
| `1` | `>=1.0.0 <2.0.0-0`（实测） | `>=1.0.0, <2.0.0` |
| 兼容性定义 | 严格 SemVer：pre-1.0.0 一律不兼容 | 原文见下 |

**关于 `-0` 后缀**：npm 展开的上界一律带 `-0`（如 `0.1.0-0`、`2.0.0-0`），作用是**把该上界的预发布也排除在外**（配合 A8）。Cargo 文档的表里不写 `-0`。这一处差异是**边界写法差异**，不是"不同含义"；真正改变含义的是第一行（裸版本精确 vs caret）。两者必须分开陈述，不得混为一谈。

Cargo 官方 `specifying-dependencies` 页原句（WebFetch 直引）：

> `1.2.3 := >=1.2.3, <2.0.0`
> `1.2 := >=1.2.0, <2.0.0`
> `1 := >=1.0.0, <2.0.0`
> `0.2.3 := >=0.2.3, <0.3.0`
> `0.2 := >=0.2.0, <0.3.0`
> `0.0.3 := >=0.0.3, <0.0.4`
> `0.0 := >=0.0.0, <0.1.0`
> `0 := >=0.0.0, <1.0.0`

> *"Versions are considered compatible if their **left-most non-zero** major/minor/patch component is the same. This is **different from SemVer** which considers all pre-1.0.0 packages to be incompatible."*

> *"Caret requirements are the default version requirement strategy."* / *"Leaving off the caret is a simplified equivalent syntax to using caret requirements."* / *"log = \"^1.2.3\" is exactly equivalent to log = \"1.2.3\"."*

Cargo 明确写出空交集是真实故障：

> *"All requirements must be satisfied, so non-overlapping requirements like `<1.2, ^1.2.2` result in no matching versions."*

Go（官方文档，未实测）：

> *"the build list is not saved in a 'lock' file"* —— 无锁一致性可言，冲突直接报错。

---

## 3. 内置命令盲区台账（✅ 本机实测 + 官方文档）

### 3.1 `npm ls` 不告警重复版本

**场景 B（合法重复）**：`fixture2` → `debug@2.6.9`(→`ms@2.0.0`) 与 `send@0.18.0`(→`ms@2.1.3`)，两个 `ms` 版本都满足各自请求者。

```
$ npm ls --all
fixture2@1.0.0
├─┬ debug@2.6.9
│ └── ms@2.0.0
└─┬ send@0.18.0
  └── ms@2.1.3
EXIT=0
```

→ **退出码 0，无任何重复版本提示。** 这正是 M3 要补的位置。

**场景 A（不满足）**：`send@0.18.0` 声明 `ms@2.0.0`，但树里是 `ms@2.1.3`。

```
$ npm ls --all
fixture@1.0.0
├── ms@2.0.0 extraneous
└─┬ send@0.18.0
  └── ms@2.1.3 invalid: "2.0.0" from node_modules/send
EXIT=1   # npm error code ELSPROBLEMS
```

→ 能报"不满足"，但**不报重复版本、不做收敛判定**。

### 3.2 `npm ci` 不报来源声明

manifest 声明 `send: "^0.19.2"`，锁里是 `0.18.0`：

```
$ npm ci
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.
npm error Invalid: lock file's send@0.18.0 does not satisfy send@0.19.2
npm error Missing: debug@2.6.9 from lock file
...
EXIT=1
```

→ 报文出现的是**目标版本 `0.19.2`**，不是声明范围 `^0.19.2`；也**没有**"这条声明来自哪个请求者"的路径。M2 的 `declaredRange` + `requesterPath` 即补此处。

### 3.3 `pnpm dedupe --check` 只有布尔

`pnpm dedupe --help`（本机 10.34.5）原文：

> `--check` — Check if running dedupe would result in changes without installing packages or editing the lockfile. **Exits with a non-zero status code if changes are possible.**

> `pnpm dedupe` — *"Perform an install removing older dependencies in the lockfile if a newer version can be used."*

→ 只有"有变更可能"，没有"收敛到哪个版本""受影响请求者是谁""能不能收敛"。

上游自身的不收敛（issue 标题原文）：

- pnpm/pnpm#16356：*"`pnpm dedupe` is not idempotent — `dedupe --check` fails right after `dedupe`"*
- pnpm/pnpm#17208：*"`pnpm dedupe` never revalidates cached registry metadata for locked versions, so it cannot apply what `dedupe --check` reports in CI"*
- 检索式 `dedupe in:title repo:pnpm/pnpm type:issue`，total=66（⚠️ 窗口内快照）

### 3.4 其它生态（⚠️ 均未实测，只引文档）

| 工具 | 文档原文 / 行为 | 缺口 |
|---|---|---|
| `yarn constraints` | *"It currently doesn't support ... Transitive dependencies"* | 只做"声明 vs 现实"字符串比对，不做可满足性检查 |
| `cargo tree -d` / `cargo-deny bans` | 目的自述 *"draw your attention to duplicates"* | 不承诺给方案 |
| Go modules | 官方：build list 不存入 lock 文件 | 无锁一致性概念 |
| `pipdeptree` | 报冲突与循环 | 不给最小冲突集 |
| `poetry check --lock` / `uv lock --check` | 查锁与声明一致性 | 只给一致/不一致 |

### 3.5 peer 场景的实测形态（重要，勿过度引用）

用 `file:` 依赖构造 `widget`(peer `react@^17.0.0`) + 根装 `react@18.2.0`：

- `npm install` **退出码 0，未报 ERESOLVE**。
- `npm ls --all` 报：`UNMET DEPENDENCY react@^17.0.0` / `npm error missing: react@^17.0.0, required by widget@1.0.0`，**退出码 1**。

→ **ERESOLVE 的报文形态不由本次实测背书**（`file:` 依赖绕过了 registry 解析）。夹具须同时提供 "UNMET 型"（有实测）与 "ERESOLVE 型"（引文档/issue）两种期望，并在向量中标注来源。

### 3.6 地基库已有、审计器缺位

`npm/node-semver` 5475★、`composer/semver` 3304★、`hashicorp/go-version` 1776★、`phar-io/version` 7464★ —— 全是**库**（原子能力），不是审计器。

### 3.7 安全向已占位（说明"版本解析方向"才是空的）

`lockfile-lint` 870★、`locklens` 78★、`provenance-action` 308★、`cve-lite-cli` 774★ 全部聚焦 resolved URL / integrity / provenance / CVE，**不做范围语义、不做收敛证明**。

---

## 4. 空白检索记录（⬜ 软论据）

窗口 2026-10-27T10:56Z–11:15Z；`gh api` `search/repositories`，`in:name,description`。

| 检索式 | total_count | 头部（★） |
|---|---|---|
| `lockfile lint` | 15 | lirantal/lockfile-lint 870；snyk-labs/lockfile-lint 1 |
| `npm lockfile` | 240 | lockfile-lint 870；provenance-action 308；npm/lockfile 257；BARMPlus/locklens 78 |
| `lockfile verify` | 49 | gh-actions-lock 251 |
| `lockfile analyzer` | 9 | lockfile-analyzer 7；JSLEEKR/lockcheck 0 |
| `semver linter` | 19 | node-module-boilerplate 7；carl0s-sa/semver-linter 1 |
| `semver range` | 168 | mark-kubacki/semver 37；depbeat/dependency-land 34 |
| `semver intersection` | **4** | snyamathi/semver-intersect 9；sounisi5011/semver-range-intersect 3 |
| `package.json lint` | 59 | npm-package-json-lint 257；packlint 38 |
| `eslint plugin dependency` | 52 | eslint-plugin-depend 495；eslint-plugin-node-dependencies 25 |
| `dedupe dependencies` | 78 | yarn-plugin-dedupe 16；dynamic-dedupe 11 |
| `npm dedupe` | 33 | npm-semver-dedupe 15 |
| `monorepo version consistency` | **3** | check-dependency-version-consistency 80；monorepo-dep-auditor 0 |
| `dependency conflict` | 634 | pipenv-setup 111；maven-dependency-versions-check-plugin 82；pip-conflict-checker 76 |
| `version solver` | 2742 | pubgrub 812 |
| `pubgrub` | 55 | pubgrub 812；pipgrip 212；pub_grub 153 |
| `dependency resolution` | 1091 | Molinillo 420；npm-force-resolutions 566 |
| `package.json analyzer` | **22** | 全部 ≤7★ |
| `golang modules dependencies` | 37 | depsdev 72★（走 deps.dev API = 联网） |

issue 规模（⬜ 软论据）：

| 检索式 | total_count |
|---|---|
| `duplicate versions in:title type:issue` | 1022 |
| `"unable to resolve dependency tree"` | 6935 |
| `ERESOLVE in:title` | 627 |
| `lockfile conflict`（HN，nbHits） | 80 |
| `yarn resolutions`（HN，nbHits） | 543 |
| `npm dedupe`（HN，nbHits） | 116 |
| `pip dependency conflict resolution`（HN，nbHits） | 13 |
| `dedupe in:title repo:pnpm/pnpm type:issue` | 66 |

> ⚠️ 以上计数含两次 403 限流影响，只能作方向性参考。**禁止**在代码或 README 中把它们当实时数字复述；引用时必须带检索式与窗口。

---

## 5. 数据源可获取性

| 数据源 | 可得性 | 说明 |
|---|---|---|
| `package.json` | 本地文件 | 无需网络 |
| `package-lock.json` v1/v2/v3 | 本地文件 | v1 只有嵌套 `dependencies`；v2 同时有 `packages` 与 `dependencies`；v3 只有 `packages`。**混用即报输入错误（退出码 3）** |
| node-semver | 本地库 | 本机从 pnpm/npm 内置副本加载；项目自用需在 `package.json` 声明依赖（需一次联网安装，之后审计运行零联网） |
| registry / dist-tag / CVE 库 | **不可达（设计如此）** | 零联网红线；因此**不做版本搜索、不做"最新版本"建议** |
| yarn / uv / go / pipdeptree / poetry | **本机缺失** | roadmap 前必须补测 |

**零外部依赖原则**：审计运行期不发起任何网络请求；不解析 `resolved` URL 的主机名做任何判断（仅作字符串留档）。

---

## 6. 合成数据纪律

1. **测试向量 = 构造的最小 manifest/lock 对**，不是真实项目快照（避免泄露与体积）。
2. **假包名白名单**：允许使用真实包名（`send` / `ms` / `debug` / `react` / `widget`）仅限**复现实测场景**的最小用例；其余一律用 `@fixture/*` 前缀的假名。
3. 每个向量目录必须自包含（`input/package.json` + `input/package-lock.json`），不依赖 `node_modules`。
4. `fixtures/real-tree/` 只保留**版本范围拓扑与请求者关系**，包名可替换为白名单假名，但**不得改动版本号与范围字符串**（否则背书失效）。须附 `SOURCE.md` 说明哪几条实测断言由它背书。
5. 生成的报告样例必须脱敏：无绝对路径、无主机名、无时间戳。

---

## 7. 数值口径（一处定义，全局引用）

> 本节是**唯一定义处**。题面、总览、代码注释、评分表一律引用此处，不复写。

### 7.1 三态判定（M3 `dedupe-feasibility`）

设包 `P` 在锁中存在版本集合 `V = {v1..vn}`，请求者集合 `R = {r1..rm}`，每个 `ri` 声明范围 `Si`。

| 状态 | 形式定义 | 输出 |
|---|---|---|
| `CONVERGIBLE` | `∃ v ∈ V : ∀ r ∈ R, satisfies(v, S_r)` | 全部满足条件的 `v`（按 semver 升序）+ 每个 `r` 的满足证明 |
| `NOT_CONVERGIBLE` | `¬∃ v ∈ V : ∀ r ∈ R, satisfies(v, S_r)` | **最小冲突集**（见 7.2） |
| `REQUIRES_OVERRIDE` | 情况同上，但存在 `R` 的真子集 `R'` 使 `∃ v` 满足 `R'`，即冲突由少数请求者造成；放宽 `R \ R'` 中的声明即可收敛 | 需放宽的声明列表（建议性质，非事实） |

判定顺序：先判 `CONVERGIBLE`（只需一次全量求交）；不成立时求 MUS；若 MUS 严格小于 `R` 则归 `REQUIRES_OVERRIDE`，等于 `R` 则归 `NOT_CONVERGIBLE`。

**区间代数口径**：每个范围规范化为半开区间集合 `{[lo, hi)}`（`hi` 可为 `+∞`；`-0` 上界表示"排除该预发布基线"）。求交非空 ⇔ 存在 `v` 使 `satisfies(v, 全部)`。`CONVERGIBLE` 的判定**必须**用实际候选版本验证（不能只靠区间非空），因为预发布可达性规则（A8/A9）不是纯区间性质。

### 7.2 最小冲突集（MUS）

`M ⊆ R` 是**最小冲突集** ⇔ ①`∀ v ∈ V` 存在 `r ∈ M` 使 `satisfies(v, S_r) = false`（即 `M` 无解）；②`∀ M' ⊊ M`，`M'` 有解（即极大性/极小性）。

- 求法：按基数 `k = 2, 3, …` 升序遍历子集，首个无解子集即最小（请求者数通常 < 20）。
- 上限 `--max-requesters`（默认 12）；超限**必须**在输出中写 `"degraded": true, "reason": "requesters > max"`，并降级为"贪心近似"，**不得静默冒充最小集**。
- 平局：多个同基数 MUS 时按请求者路径字典序排序，全部返回（不随机选一个）。

### 7.3 退出码

| 码 | 语义 | 判定条件 |
|---|---|---|
| 0 | 无问题 | 无任何 `error`/`warning` 级发现 |
| 1 | 存在 `error` 级问题 | 默认集合：R5 空交集、M2 `manifest-not-satisfied`、M3 `NOT_CONVERGIBLE`、M4 冲突；`--severity-map` 可改 |
| 2 | 仅 `warning` 且 `--fail-on=warning` | 无 `error`，有 `warning` |
| 3 | 输入不可解析 | JSON 语法错误、缺必需字段、`lockfileVersion` 不支持、v1/v2/v3 结构混用 |
| 4 | 内部不一致 | 工具结论与 `semver` 库差分不一致（自证"不编造语义"） |

优先级：`3 > 4 > 1 > 2 > 0`（严重者覆盖轻者；同一进程只返回一个码）。

### 7.4 灰区配置项

| 开关 | 默认 | 类型 | 说明 |
|---|---|---|---|
| `--severity-map` | 内置表 | JSON 文件 | 默认表是**策略**；报告须回显实际使用表 |
| `--strict` | off | bool | 开启后 "锁中版本 ≠ 声明下界" 视为 `lock-outdated` |
| `--prefer` | 无（全列） | `latest\|min-change` | 只影响 `CONVERGIBLE` 时**排序与标注**，不改变可行性判定 |
| `--ignore-peer` | off | bool | 开启后 peer 冲突降为 `info` |
| `--max-requesters` | 12 | int | 超限降级，输出 `degraded: true` |
| `--fail-on` | `error` | `error\|warning\|never` | 与退出码 1/2 联动 |
| `--format` | `text` | `text\|json\|sarif` | `json` 含 `schemaVersion` |
| `--verbose-paths` | off | bool | 只有开启时才输出绝对路径（默认输出相对路径以保证确定性） |

### 7.5 确定性口径

- JSON 键序：按 schema 固定顺序输出（不依赖 `Object.keys` 顺序）。
- 数组：按 `(package, requesterPath.join('/'), lockedVersion)` 稳定排序。
- 不含时间戳、主机名、绝对路径（除非 `--verbose-paths`）、随机 ID。
- 同一输入两次运行输出**逐字节相同**；CI 用 `diff` 断言。

---

## 8. 待补测清单（roadmap 前置条件）

| 生态 | 工具 | 需补测内容 | 状态 |
|---|---|---|---|
| pnpm | 已装 10.34.5 | `--frozen-lockfile` 退出码、`dedupe --check` 在真实 lock 上的输出形态 | ⚠️ 部分（仅 help 与 issue） |
| Python | 已装 3.12.10 + packaging 26.3 | `pipdeptree` 冲突报文、`poetry check --lock`、`uv lock --check` | ⚠️ 未装 pipdeptree/poetry/uv |
| Cargo | 已装 1.95.0 | `cargo tree -d` 实际输出、`cargo-deny bans` | ⚠️ 仅文档 |
| Go | **未装** | MVS 冲突报文、无锁一致性形态 | ⚠️ 仅文档 |
| Yarn | **未装** | `yarn constraints` 传递依赖限制的实际表现 | ⚠️ 仅文档 |

**规则**：任何生态进入实现阶段前，上表对应行必须从 ⚠️ 变为 ✅，否则该生态的向量不得入库。
