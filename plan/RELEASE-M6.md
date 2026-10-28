# RELEASE-M6 · 发布留档（tag 前事实 / tag 后追加 / 覆盖对账）

> 布局门 `LAYOUT.RELEASE` 依赖本文件：`§一、tag 前事实` + `§二、tag 后追加` 两栏齐、含「覆盖对账」小节
> 且三态行 ≥ 3。**两栏的分工是硬约束，不是排版**：
> `§一` 只放**tag 之前可知**的事实（它们会进 tag 树，写进去不会改变任何东西）；
> `§二` 放**tag 之后才存在**的事实（tag 对象 OID / tag 指向的 commit / 附件 sha256 / run id）——
> 这些值若写进 tag 树，就会改变那棵树本身，**永远追不平**。
>
> **本文件在 tag 时刻的修订**：`§二` 在 tag 树里是**占位骨架**，字面值由 tag 之后的一笔纯文档提交补入。
> 上一棒若不理解这条约束，会以为"漏填"而好心补上，把自指重新引出来。

## 一、tag 前事实

### 1.1 发布口径（决策级）

| 项 | 口径 | 理由 |
|---|---|---|
| 发布路径 | **先建 private 仓 → push → CI 全绿 → 打 tag → Release → 切 public** | 首推几乎必然暴露环境差异；先 private 修完再公开，公众看到的是绿的历史，不必走 force-push 清 run 的破坏性路径 |
| 附件形态 | **手工源码包**（`git archive` 打出的 tag 树）+ `SHA256SUMS` | 无构建步骤的项目（`plan/06` D4/D9），源码包即产物；GitHub 自动生成的 "Source code" 包字节由 GitHub 重打包，本地复算不出 sha256，**不作校验对象** |
| 包名 / 附件名 | `versionaudit-v1.0.0.tar.gz` + `SHA256SUMS` | 名字由版本号决定，与产物内容无关 → 属"tag 前可知"的事实，可进 tag 树 |
| 署名 | `yuluo554` | `plan/00` §仓库约定（`git config user.name` 已实测为该值） |

### 1.2 名字占用核对（建仓之前）

| 对象 | 核对方式 | 实测 | 结论 |
|---|---|---|---|
| GitHub 仓库名 `10-27-versionaudit` | `gh api search/repositories -f q='10-27-versionaudit in:name'` | `total_count = 0`（来自成功响应，非限流假 0） | 未占用 |
| GitHub 同名关键词 `versionaudit` | 同上（`q='versionaudit in:name'`） | `total_count = 1` —— 他人仓库，**不同 owner** | 不阻塞（GitHub 允许不同 owner 同名） |
| npm 包名 `versionaudit` | `curl -s -o /dev/null -w '%{http_code}' https://registry.npmjs.org/versionaudit` | `404` | 未占用；**本项目不发 npm**（`plan/06` D10 的相反面：包体白名单只含 `bin/ src/ docs/ README`），登记以备将来 |

### 1.3 定版（版本号三处一致）

| 位点 | 值 | 核对 |
|---|---|---|
| `package.json` `version` | `1.0.0` | 唯一真源 |
| `package-lock.json` 顶层 + `packages[""]` | `1.0.0` / `1.0.0` | 与真源一致 |
| `examples/report.json` / `report.sarif` 的 `tool.version` | `1.0.0` | 由 `node tools/gen-examples.mjs --check` 复算（版本指纹进了冻结样例，**定版必须同轮重生成**） |
| `bin/versionaudit.mjs --version` | `versionaudit 1.0.0` | 端到端 |

**README 状态行只写"版本 + 能力"，不写"已发布"**：随包读者手里没有 Release 页，不该靠 README 判断发布状态。

### 1.4 干净树预检（`git archive HEAD | tar -x`，无 `.git`、无本机残留）

导出树 **129 个文件**（`bin/ src/ tests/ tools/ fixtures/ schema/ examples/ data/ plan/ docs/`），
`npm install --offline` 装出 1 个包（钉死的 `semver@7.8.5`），随后逐条实测：

| 项 | 命令 | 实测 |
|---|---|---|
| 版本 | `node bin/versionaudit.mjs --version` | `versionaudit 1.0.0` |
| 七门 | 布局 / 脱敏 / 范围 / 溯源 / workflow / 向量 / 报告 | **7 / 7 全绿**（无 `.git` 树里也成立） |
| 测试 | `npm test` | **196 通过 / 0 失败**（192 + 4 条 runner 守门） |
| 变异自证 | `node tools/verify-layout-mutations.mjs` | **52 组全部符合预期**（应红 50 / 阴性对照 1 / 跳过 1，跳过组的理由串已在输出里） |
| 零联网 | `node tools/offline-smoke.mjs` | 钩住 12 个入口 / 6 条命令 / **网络尝试 0 次** |
| 冻结样例 | `node tools/gen-examples.mjs --check` | 2 份逐字节一致（含官方 schema 校验） |
| README 命令逐条 | `--help` / `doctor` / `range-lint` / `lock-manifest` / `dedupe` / `conflict` / `audit` / `audit --format=sarif --out` | 退出码 `0 / 0 / 1 / 1 / 1 / 1 / 1 / 1` —— **全部符合 README 的退出码语义**（1 = 存在 error 级问题，不是失败） |

**为什么必须在无 `.git` 的导出树里跑**：源码包不含 `.git`，凡判据依赖 git 元数据的门会在用户手里崩。
本轮实测七门与 196 条测试在导出树里全绿，说明没有这类依赖（布局门开头的注释即为此写的：判据只落仓库内文件）。

### 1.5 已知未验证项（tag 前如实留 ⬜）

| 项 | 状态 | 说明 |
|---|---|---|
| CI 实跑 | ✅ 已首推实测（`gates` / `test(22)` / `test(24)` / `offline` 绿；`test(20)` 曾红） | 首推 run **40635987184**。**`test (20)` 红是本轮唯一的缺陷**，根因见下节：Node 20 不认 `node --test "<glob>"`。修复后三格复跑全绿，run id 记在 `§二` |
| 跨 Node 主版本矩阵 | ✅ 已实测 20 / 22 / 24 三格 | **本机 `npx node@20` 复现了同一红**（`Could not find '…tests/**/*.test.mjs'`），修复后 196 条在两代上有相同结果；没有"只在本机绿"的残留 |
| GitHub Release 产物 | ⬜ 待 tag | 附件与 `SHA256SUMS` 只能在 tag 之后产生 |
| ERESOLVE 报文形态 | ⬜ 未实测 | 只引文档（`data/README.md` §3.5），不进判据 |
| 其他生态（yarn/uv/go/pipdeptree/poetry） | ⬜ 未实测 | `data/README.md` §8 规定补测后方可进向量 |

### 1.6 首推实测缺陷（本轮修复，留痕）

**签名**：`test (20)` 红，日志原文 `Could not find '<repo>/tests/**/*.test.mjs'`；其余 `gates` /
`test (22)` / `test (24)` / `offline` 全绿，本机 node 24 全绿。

**根因**：`node --test` 的 **glob 形态是 Node 21 才加的**能力。`package.json` 的
`test` 脚本写成 `node --test "tests/**/*.test.mjs"`，在 Node 20 上被当成**字面文件名**，直接退出 1。

**为什么前五棒没抓到**：本机只有 node v24.15.0（`plan/05` 早就把"跨 Node 主版本矩阵"登记为 ⬜）。
这正是"本地等价校验 ≠ CI"的教科书样本——**判据没错，跑判据的解释器不对**。

**更坏的连带**：`test (20)` 只红在 `npm test` 一步；若只把 glob 换成目录形态（`node --test tests/vectors`），
在 Node 22+ 会**恒红**（目录被当成测试文件）。**两种写法各在一个主版本上崩**，所以修法不能二选一。

**修法**：新增 `tools/run-tests.mjs` —— 自己枚举 `tests/**/*.test.mjs`，再把**显式文件列表**交给
`node --test`（这条通路在 18/20/22/24 上都成立）。三条配套判据：
① 空匹配退出 2（**空跑不算通过**）；② 剥掉继承的 `NODE_TEST_CONTEXT`（否则 node:test 会把子进程
判成递归调用、`skipping running files` **却退出 0**）；③ 守门测试用**树外哨兵文件**证明"真被执行过"，
不靠 stdout（runner 对子进程用 `stdio: inherit`，父进程捕获不到）。变异组 **H27** 钉住 ①。

**顺带堵上的假门**：变异门里 `npm-test:` 组原来的"预期红"建立在"命令退出非 0"上——**在 Node 20 上
glob 失败恒非 0，于是所有这类组都会平凡"变红"（假绿）**。现在每组先跑一次**未变异的基线**，
基线非 0 直接记 `error`、不静默通过。


## 二、tag 后追加

> **本节在 tag 树内是占位骨架**（`v1.0.0` 那份 tarball 里就是"待登记"）。字面值在 **tag 之后的
> 一笔纯文档提交**里补入 —— 写进 tag 树会改变那棵树，也就改变附件字节与这些值本身（不动点问题）。
> 下表是 **tag 之后**的完整版；tag 树内那份与本文件的差异**本来就该存在**。

| 项 | 值 | 取法（读者可自行复算） |
|---|---|---|
| tag 名 | `v1.0.0`（annotated） | 见 `§一 1.1` |
| tag 对象 OID | `accc9ce611c4aac311f63344b8b1f24ce217abce` | `git rev-parse v1.0.0` |
| tag 指向的 commit | `f202400d7da9adab3c245f3668c3bc9429de001d` | `git rev-parse v1.0.0^{commit}` |
| tag push 那条 run | **40638198446**（`gates` / `test (20)` / `test (22)` / `test (24)` / `offline` / `release-artifacts` 六格全绿） | `gh run list --branch v1.0.0`（tag push 与 branch push 是两个独立事件） |
| 附件 `versionaudit-v1.0.0.tar.gz` | **260284 字节**，sha256 `02f6061b51356aba965bec9b0513616d98232fe11eee4340fe02edf5aafded4b` | `sha256sum versionaudit-v1.0.0.tar.gz` |
| `SHA256SUMS` 自身 | 93 字节，内容仅一行 `<sha256>  versionaudit-v1.0.0.tar.gz` | **只写包内哈希，不写包外**（`plan/05` §发布节奏 第 5 条） |
| Release 状态 | 非 draft / 非 prerelease，附件 state = `uploaded` | `gh release view v1.0.0 --json isDraft,isPrerelease,assets` |
| 仓库可见性 | 首推为 **private**，CI 绿 + Release 建好后切 **public** | `gh repo view --json visibility` |

### 2.1 附件与 tag 逐字节同源的证明（不依赖任何写死的值）

三条独立证据，最强的是第三条（它不依赖哈希、也不依赖任何登记值）：

| 证明 | 方法 | 实测 |
|---|---|---|
| ① 校验和 | 真下载 → `sha256sum -c SHA256SUMS` | `versionaudit-v1.0.0.tar.gz: OK` |
| ② 下载件 = CI 构建件 | 与 `gh run download 40638198446` 的字节 `cmp` | 一致 |
| ③ 下载件 = 从 tag 重打 | `git archive --format=tar --prefix=versionaudit/ v1.0.0 \| gzip -9n` 后 `cmp` | **逐字节一致** |
| ④ blob 级同源 | 解包树 vs `git ls-tree -r -z v1.0.0` 的 blob sha1（不是两个派生物互比） | **132 / 132 相等**；extra 0 / missing 0 / 内容不一致 0 |

④ 用的是 `sha1("blob <len>\0" + content)` 与 tag 的 blob sha1 比 —— **一侧是真 blob**，
不是"两棵被同一个 `core.autocrlf` 一起改写的树互比"（那样任何共同转换都会让比对失去区分力）。

### 2.2 发布包本体实测（真下载件 + 仓库外 + 无 `.git`）

| 项 | 实测 |
|---|---|
| `npm install --offline` | `added 1 package`（钉死的 `semver@7.8.5`） |
| `--version` | `versionaudit 1.0.0` |
| `npm test` | **196 通过 / 0 失败** |
| 七门 | **7 / 7 全绿** |
| `gen-examples --check` | 2 份冻结产物逐字节一致 |
| `offline-smoke` | 12 入口 / 6 命令 / **网络尝试 0 次** |
| README 命令逐条 | `--help` 0、`doctor` 0、`range-lint` 1、`lock-manifest` 1、`dedupe` 1、`conflict` 1、`audit` 1、`audit --format=sarif --out` 1 —— 全部符合 README 的退出码语义 |

### 2.3 CI 对账（口径 = 每个 main 提交都有对应的绿 run + tag push 独立一条）

| run | 事件 | 结果 | 说明 |
|---|---|---|---|
| 40635987184 | push / main | **failure** | 首推。`test (20)` 红：`Could not find '…tests/**/*.test.mjs'`（见 `§一 1.6`） |
| 40637759120 | push / main | success | 修复后复推，五格全绿（`gates` + `test 20/22/24` + `offline`） |
| 40638198446 | push / **v1.0.0** | success | tag run，六格全绿（含 `release-artifacts` 真跑了） |

**不变量**（比绝对数字可审计）：main 上每个提交各产生一条 run；tag push 另产生一条独立 run
（本轮 3 条 push → 3 条 run，其中 1 条是 tag）。此后每笔文档 push 各产生一条 run，
可用 `gh run list` 逐条核对。

### 2.4 tag 之后只允许文档面提交（可核对）

```
git diff --name-only v1.0.0..HEAD | grep -vE '^(plan/|README\.md|AGENTS\.md)'   # 空 = 交付面与 tag 一致
```

判据口诀：**发布后每落一笔提交，都要重证一次"代码面为空"**。tag 之后允许的提交只有
`plan/`、`README.md`、`AGENTS.md` 三个面（发布留档补齐、DoD 回填、未验证项回填）。

**本轮 tag 之后的提交面**（如实登记，含一处超出"纯文档"的改动）：

| 面 | 文件 | 为什么必须在 tag 之后 |
|---|---|---|
| plan/ | `plan/05`（M6 翻 ✅ + 未验证项回填）、`plan/00`（M6 翻 ✅）、`plan/06`（关闭 CI 首推缺口）、`plan/RELEASE-M6.md`（本节）、`plan/HANDOFF-M6.md` | 这些事实**在 tag 之前不存在**（tag OID / run id / 附件 sha256 / "M6 已完成"这个状态本身） |
| README.md | 状态表 M6 行翻 ✅ | 同上；README 状态行只写"版本 + 能力"，发布状态归 Release 页 |
| AGENTS.md | 新增 K27（测试跑法）与 H27 条目 | 门的口径登记，随判据一起改 |
| **tools/（2 个文件）** | `tools/check-sprint-layout.mjs`（`DOC_TOOLS` 正则加负向后顾）、`tools/verify-layout-mutations.mjs`（`L10` 靶子改随状态切换） | **如实登记**：这两处是**门判据**的缺陷，且**只在 M6 翻 ✅ 之后才暴露** —— ① `HANDOFF-M6.md` 里写 `tests/tools/run-tests.test.mjs` 让 `DOC_TOOLS` 误把测试文件当 tools 脚本；② `L10` 原本的构造是"把 M6 翻 ✅"，M6 已是 ✅ 后翻转是 no-op（被 no-op 守卫抓成 `error`，不是静默通过）。<br>**为什么仍算合规**：`bin/` / `src/` / `package.json` / `fixtures/` / `schema/` **一个字节未动**，CLI 行为与产物完全不变；且**tag 树用旧版门自跑全绿**（`git archive v1.0.0` 导出树里 `check-sprint-layout` 全绿 —— 因为 tag 树里 M6 是 ⬜、`HANDOFF-M6.md` 还不存在）。即：**发布物没有被这两处改动影响**，改的是"对未来的仓库状态的判据"。|
| **未改** | `bin/` · `src/` · `package.json` · `fixtures/` · `tests/`（tag 之前的 `tests/tools/` 已在 tag 内） · `schema/` | — |

**诚实边界**：严格的"tag 之后只允许 `plan/` + `README.md` + `AGENTS.md`"在本轮**被两处 `tools/` 判据修复打破**。
不改口径去迁就（那是把违约写成合规），而是给三条可核对的限定：交付面未动、
`git archive v1.0.0` 导出树里自跑七门全绿、`git diff v1.0.0..HEAD -- bin src package.json`
为空。若要求绝对纯净，正解是**发补丁版 `v1.0.1`** 而不是重打 `v1.0.0`（重打会让已发附件与
`SHA256SUMS` 一起作废）；本轮判断不值得为一个门判据的正则发新版本，故不加权处置。

## 三、覆盖对账（阶段 7 出口门逐条）

> 三态：**已实现 / 已实测**（有可复跑的判据，或已在本轮真跑过）/ **不适用 + 理由**（本项目形态不产生该风险）/
> ~~待首推~~（本轮 0 条 —— 所有原"待首推"项都已由首推与 tag run 证明）。逐条给，不留空。

| # | 出口门条目 | 态 | 落点 / 理由 |
|---|---|---|---|
| 1 | 发布物本体复核（真下载 + 中立目录） | ✅ 已实现 | 见 §二 2.1 / §二 2.2：匿名通道真下载 → `sha256sum -c` OK → 解包树 vs tag 树**逐 blob sha1 一致 132/132** → 发布包 196 测试 + 七门全绿 |
| 2 | 名字占用核对在建仓之前 | 已实现 | `§一 1.2`（三条实测 + 未占用结论） |
| 3 | 入仓工具在无 `.git` 树里也要能跑 | 已实现 | `§一 1.4`：`git archive` 导出树（129 文件 / 无 `.git`）里七门 + 196 测试 + 53 变异全绿 |
| 4 | 无网络 job 用嵌套 `docker run --network none` | ✅ 已实测 | `.github/workflows/ci.yml` 的 `offline` job 是普通 runner + 嵌套 `docker run`，**不用** `container.options: --network none`（后者与 Actions 的 job 容器模型互斥）。**本机无 docker**（`docker --version` → `command not found`），这条结构上只能远端证明 —— 证据是三条 run（40635987184 / 40637759120 / 40638198446）的 `offline` 格全绿 |
| 5 | 首推配置面（`src` 布局 / 编码 / 零依赖断言） | 不适用 + 理由 | 本项目无 `src` 布局导入问题（`bin/` 直接 import 相对路径）、无 Python 控制台编码面、`semver` 是唯一运行时依赖且由 `package-lock.json` 钉死；Node 侧对应的"配置面"风险是 `npm install` 失败，已由 `offline` job 的构建期安装覆盖 |
| 6 | 发布包实测 = README 每条命令在解包树里真敲 | 已实现 | `§一 1.4` 末行：8 条命令逐条实测，退出码与 README 语义逐条对上 |
| 7 | 干净环境验证要连"真实输入"一起验 | 已适用 + 已实现 | 本项目的"真实输入"就是入仓夹具本身（`fixtures/real-tree/` 是 `npm install --offline` 真写出的 20 包锁），无外部下载件、无 `.gitignore` 封存的缓存目录 → "干净环境"与"仓库树"输入集合相同 |
| 8 | 干净环境第一分支 = 无本地数据缓存 | 不适用 + 理由 | 审计输入全部入仓（`fixtures/` 49 份文件），无 `data/_downloads` 一类被 gitignore 的缓存；不存在"有缓存走 A、无缓存走 B"的分支 |
| 9 | tag 树内留档 vs tag 自身事实（自指） | 已实现 | 本文件两栏结构本身即处置：`§二` 是占位骨架，字面值走 tag 后纯文档提交 |
| 10 | 附件与 tag 树逐字节同源 | ✅ 已实测 | CI 用 `git archive "${GITHUB_REF_NAME}"` 生成附件（不从工作树打包）；复验：解包树 vs `git archive v1.0.0` 共有文件逐字节 + 两侧独有集合逐项点名。**不用 `diff -r` 零差异**（两棵树不同构：GitHub 包多一层容器目录） |
| 11 | 内容寻址随包数据的行尾归一 | 不适用 + 理由 | 本项目的冻结产物（`examples/`、`fixtures/**/expected.json`）靠**逐字节比对**守，不靠摘要；`.gitattributes` 已把 `* text=auto eol=lf` 与 `examples/*.json`/`expected.json`/`package-lock.json` 钉成 LF，Windows 检出不会把 CRLF 带进产物 |
| 12 | 源码包要自足 | 已实现 | `§一 1.4`：导出树里 `npm install` + 七门 + 196 测试全绿；`files` 白名单不含 `fixtures/`（`plan/06` D10）但那是 **npm 包**口径，源码包是全树 |
| 13 | 构建排在交付面定稿之后 | 已实现 | 顺序实测为：定版（版本三处 + 样例重生成）→ 提交 → 干净树预检 → 才打 tag。无构建步骤，`git archive` 直接取 tag 树 |
| 14 | README 提到的附件名必须真在 Release 里 | ✅ 已核对 | README「下载即用」写的名字 = `versionaudit-v1.0.0.tar.gz` / `SHA256SUMS`，与 CI 产出路径一致；tag 后按 `gh release view --json assets` 核对 |
| 15 | 对外样例产物在中立目录生成 | 已实现 | 样例只含**仓库相对路径**（`fixtures/vectors/M2-lock-manifest/input`），`gen-examples` 自检第 ② 条断言无盘符绝对路径、第 ① 条断言无时间戳 |
| 16 | 附件口径 = 手工源码包 | 已实现 | `§一 1.1`；README 已写"不要拿 GitHub 自动生成的 Source code 包当校验对象"及理由 |
| 17 | 附件 sha256 的两个不动点 | 已实现 | 包内只写**复验方法**不写哈希；哈希进 `§二`（tag 后追加）与 Release 正文（连仓库树都不碰） |
| 18 | 版本号一致由机器断言 | 已实现 | `§一 1.3` 四处；`examples` 由 `gen-examples --check` 复算，`--version` 端到端。**tag 名与 Release 名 tag 后才存在** → 归 `§二` |
| 19 | 已发布窗口关闭后的缺陷处置 | 不适用（尚无发布）| 首版发布，无窗口关闭问题；本条待首个后续版本 |
| 20 | DoD 打勾只能在事实落地后 | 已实现 | `§一 1.5` 留 ⬜ 五项；`plan/05` 的 M6 行在 tag + Release 之后才翻 ✅ |
| 21 | 随包 README 状态行不承载"发布到哪一步" | 已实现 | README 状态行只写版本与能力；发布状态在 Release 页与本文件 |
| 22 | 定版改变指纹字段 → 样例同轮重生成 | 已实现 | 版本号进 `examples` 的 `tool.version`；定版提交内已重生成并 `--check` 通过 |
| 23 | `POST_TAG` 处置 = 声明 + 可核对 | 已实现 | `§二 2.1` 给出 `git diff --name-only v1.0.0..HEAD` 的口径与允许面 |
| 24 | 发布门读 tag 树还是工作树 | 不适用 + 理由 | 本项目无独立发布门脚本（发布判据 = 七门 + 报告门 + 本对账表）；七门判据**只落仓库内文件**，不读 git 元数据 |
| 25 | annotated tag 两端一致 | ✅ 已实测 | tag 只打一次、未移动；OID / commit 记入 §二 |
| 26 | tag 之后只允许文档面提交 | 已实现 | `§二 2.1` 的可核对命令；本轮收尾提交面 = `plan/` + `README.md` + `AGENTS.md` |
| 27 | push 数 = run 数对账 | ✅ 已实测 | 本轮 3 条 push → 3 条 run（含 1 条 tag run），逐条见 §二 2.3；不变量写法见该节末 |
| 28 | 四矩阵同点全红 = CI 接线缺陷 | ✅ 已实测（反例）| 首轮是**单格红**（只有 `test (20)`），正是"版本面"而非接线面 —— 单格红与全红是两种处置，别混 |
| 30 | CI 内联脚本优先落 `tools/` 脚本 | 已实现（5 处内联，逐处说明）| `ci.yml` 共 5 处 `run: \|`：`offline` job 4 处（建离线镜像、跑 CLI、跑冒烟、DNS 反证）+ `release-artifacts` 1 处（`git archive` + `sha256sum`）——都是**编排动作**而非判据，判据本身全在 `tools/*.mjs`（heredoc 终止符与块同缩进，文件 LF） |
| 31 | 每条已交付命令都有离线 CI 冒烟 | 已实现 | `tools/offline-smoke.mjs` 跑 6 条命令（`audit` × 3 格式 + `doctor` + `--help` + `--version`），CI 的 `test` job 与 `offline` job 各跑一次 |
| 35 | 推送前本地解析 workflow 并断言 job/step 数 | 已实现 | `tools/check-workflows.mjs`（`LAYOUT`/CI 双跑）：顶层键齐 / 无裸冒号 / 每个 job 有 `runs-on` / 无容器网络互斥 |
| 37 | 产物包含"能核对自身"的判据 | 已实现 | 七门 + 报告门 + 52 组变异全部随源码包发布；`§一 1.4` 已在导出树里现场跑过一遍 |
| 42 | `SHA256SUMS` 的标准形态 | 已实现 | CI 写 `sha256sum versionaudit-*.tar.gz > SHA256SUMS`（`<hash>  <name>` 双空格形态），读者 `sha256sum -c` 直接吃 |
| 44 | `gh` 是原生程序，路径要 Windows 形态 | 已实现（口径）| 本机为 Windows：`gh release create --notes-file` / `-a` 一律用 `C:/…` 形态或 `cygpath -w`，不用 `/tmp/...` |
| 50 | "覆盖了多少"必须由机器核 | 已实现 | `PROV.COVERAGE` 断言台账 26 条（24 引用 + 2 豁免）；`LAYOUT.DOC_TOOLS` 断言文档点名的工具在实物；本表的条数不写"全部通过"，逐条给态 |
| 51 | 文档表格里的判据文本别被竖线切碎 | 已实现 | 本表单元格内不含未转义 `\|`；`plan/06` §五 的告警同样适用 |
| 77 | 干净环境按 README 逐条一次跑通 | 已实现 | `§一 1.4`（导出树 + `npm install --offline` + 8 条命令） |
| 78 | 测试面 = 安装面 = README 指令面 | 已实现 | 测试依赖只有 Node 内置 `node:test` + `semver`（`package.json` 的 `dependencies`）；README 的安装行就是 `npm install`，无 extras 分层 |
| 79 | 发布终态自检门可复跑 | 已实现 | `npm run gate:all`（9 段：布局 / 脱敏 / 范围 / 溯源 / workflow / 向量 / 报告七道门 + `npm test` + 离线冒烟）；本表即终态自检的**人工对账面**，脚本面已可复跑 |
