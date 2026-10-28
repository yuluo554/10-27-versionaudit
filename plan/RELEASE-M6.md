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
| 测试 | `npm test` | **192 通过 / 0 失败** |
| 变异自证 | `node tools/verify-layout-mutations.mjs` | **52 组全部符合预期**（应红 50 / 阴性对照 1 / 跳过 1，跳过组的理由串已在输出里） |
| 零联网 | `node tools/offline-smoke.mjs` | 钩住 12 个入口 / 6 条命令 / **网络尝试 0 次** |
| 冻结样例 | `node tools/gen-examples.mjs --check` | 2 份逐字节一致（含官方 schema 校验） |
| README 命令逐条 | `--help` / `doctor` / `range-lint` / `lock-manifest` / `dedupe` / `conflict` / `audit` / `audit --format=sarif --out` | 退出码 `0 / 0 / 1 / 1 / 1 / 1 / 1 / 1` —— **全部符合 README 的退出码语义**（1 = 存在 error 级问题，不是失败） |

**为什么必须在无 `.git` 的导出树里跑**：源码包不含 `.git`，凡判据依赖 git 元数据的门会在用户手里崩。
本轮实测七门与 192 条测试在导出树里全绿，说明没有这类依赖（布局门开头的注释即为此写的：判据只落仓库内文件）。

### 1.5 已知未验证项（tag 前如实留 ⬜）

| 项 | 状态 | 说明 |
|---|---|---|
| CI 实跑 | ⬜ 待首推 | 本机无 Docker、也不走 Actions 的容器模型，`offline` job 的 `docker run --network none` 形态**只能靠首推证明** |
| 跨 Node 主版本矩阵 | ⬜ 待首推 | CI 配了 20/22/24；本机只有 v24.15.0 |
| GitHub Release 产物 | ⬜ 待 tag | 附件与 `SHA256SUMS` 只能在 tag 之后产生 |
| ERESOLVE 报文形态 | ⬜ 未实测 | 只引文档（`data/README.md` §3.5），不进判据 |
| 其他生态（yarn/uv/go/pipdeptree/poetry） | ⬜ 未实测 | `data/README.md` §8 规定补测后方可进向量 |

## 二、tag 后追加

> **本节在 tag 树内是占位骨架**。字面值（tag 对象 OID / 指向的 commit / 附件 sha256 / run id /
> 下载核对结果）由 tag 之后的一笔**纯文档提交**补入 —— 写进 tag 树会改变那棵树，
> 也就改变附件字节与这些值本身（不动点问题）。

| 项 | 值 | 取法（读者可自行复算） |
|---|---|---|
| tag 名 | `v1.0.0`（annotated） | 见 `§一 1.1` |
| tag 对象 OID | 待登记 | `git rev-parse v1.0.0` |
| tag 指向的 commit | 待登记 | `git rev-parse v1.0.0^{commit}` |
| tag push 那条 run | 待登记 | `gh run list --branch v1.0.0`（tag push 与 branch push 是两个独立事件） |
| 附件 `versionaudit-v1.0.0.tar.gz` | 待登记（sha256） | `sha256sum versionaudit-v1.0.0.tar.gz` |
| `SHA256SUMS` 自身 | 待登记 | **只写包内哈希，不写包外**（`plan/05` §发布节奏 第 5 条） |

### 2.1 tag 之后只允许文档面提交（可核对）

```
git diff --name-only v1.0.0..HEAD | grep -vE '^(plan/|README\.md|AGENTS\.md)'   # 空 = 交付面与 tag 一致
```

判据口诀：**发布后每落一笔提交，都要重证一次"代码面为空"**。tag 之后允许的提交只有
`plan/`、`README.md`、`AGENTS.md` 三个面（发布留档补齐、DoD 回填、未验证项回填）。

## 三、覆盖对账（阶段 7 出口门逐条）

> 三态：**已实现**（有可复跑的判据）/ **不适用 + 理由**（本项目形态不产生该风险）/
> **待首推**（只能在远端成立，本机无法证明）。逐条给，不留空。

| # | 出口门条目 | 态 | 落点 / 理由 |
|---|---|---|---|
| 1 | 发布物本体复核（真下载 + 中立目录） | 待首推 | tag 后从 Release 真下载 → `sha256sum -c` → 解包树 vs `git archive v1.0.0` 共有文件逐字节比 |
| 2 | 名字占用核对在建仓之前 | 已实现 | `§一 1.2`（三条实测 + 未占用结论） |
| 3 | 入仓工具在无 `.git` 树里也要能跑 | 已实现 | `§一 1.4`：`git archive` 导出树（129 文件 / 无 `.git`）里七门 + 192 测试 + 52 变异全绿 |
| 4 | 无网络 job 用嵌套 `docker run --network none` | 已实现（形态）| `.github/workflows/ci.yml` 的 `offline` job 是普通 runner + 嵌套 `docker run`，**不用** `container.options: --network none`（后者与 Actions 的 job 容器模型互斥）；实跑待首推。**本机无 docker**（`docker --version` → `command not found`），这一条**结构上无法在本机证明**，只有远端可证 |
| 5 | 首推配置面（`src` 布局 / 编码 / 零依赖断言） | 不适用 + 理由 | 本项目无 `src` 布局导入问题（`bin/` 直接 import 相对路径）、无 Python 控制台编码面、`semver` 是唯一运行时依赖且由 `package-lock.json` 钉死；Node 侧对应的"配置面"风险是 `npm install` 失败，已由 `offline` job 的构建期安装覆盖 |
| 6 | 发布包实测 = README 每条命令在解包树里真敲 | 已实现 | `§一 1.4` 末行：8 条命令逐条实测，退出码与 README 语义逐条对上 |
| 7 | 干净环境验证要连"真实输入"一起验 | 已适用 + 已实现 | 本项目的"真实输入"就是入仓夹具本身（`fixtures/real-tree/` 是 `npm install --offline` 真写出的 20 包锁），无外部下载件、无 `.gitignore` 封存的缓存目录 → "干净环境"与"仓库树"输入集合相同 |
| 8 | 干净环境第一分支 = 无本地数据缓存 | 不适用 + 理由 | 审计输入全部入仓（`fixtures/` 49 份文件），无 `data/_downloads` 一类被 gitignore 的缓存；不存在"有缓存走 A、无缓存走 B"的分支 |
| 9 | tag 树内留档 vs tag 自身事实（自指） | 已实现 | 本文件两栏结构本身即处置：`§二` 是占位骨架，字面值走 tag 后纯文档提交 |
| 10 | 附件与 tag 树逐字节同源 | 已实现（判据）+ 待首推（实跑）| CI 用 `git archive "${GITHUB_REF_NAME}"` 生成附件（不从工作树打包）；复验：解包树 vs `git archive v1.0.0` 共有文件逐字节 + 两侧独有集合逐项点名。**不用 `diff -r` 零差异**（两棵树不同构：GitHub 包多一层容器目录） |
| 11 | 内容寻址随包数据的行尾归一 | 不适用 + 理由 | 本项目的冻结产物（`examples/`、`fixtures/**/expected.json`）靠**逐字节比对**守，不靠摘要；`.gitattributes` 已把 `* text=auto eol=lf` 与 `examples/*.json`/`expected.json`/`package-lock.json` 钉成 LF，Windows 检出不会把 CRLF 带进产物 |
| 12 | 源码包要自足 | 已实现 | `§一 1.4`：导出树里 `npm install` + 七门 + 192 测试全绿；`files` 白名单不含 `fixtures/`（`plan/06` D10）但那是 **npm 包**口径，源码包是全树 |
| 13 | 构建排在交付面定稿之后 | 已实现 | 顺序实测为：定版（版本三处 + 样例重生成）→ 提交 → 干净树预检 → 才打 tag。无构建步骤，`git archive` 直接取 tag 树 |
| 14 | README 提到的附件名必须真在 Release 里 | 已实现（写法）+ 待首推（核对） | README「下载即用」写的名字 = `versionaudit-v1.0.0.tar.gz` / `SHA256SUMS`，与 CI 产出路径一致；tag 后按 `gh release view --json assets` 核对 |
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
| 25 | annotated tag 两端一致 | 待首推 | tag 只打一次、不移动；`git rev-parse v1.0.0` / `^{commit}` 记入 `§二` |
| 26 | tag 之后只允许文档面提交 | 已实现 | `§二 2.1` 的可核对命令；本轮收尾提交面 = `plan/` + `README.md` + `AGENTS.md` |
| 27 | push 数 = run 数对账 | 待首推 | 口径 = **每个 main 分支提交都有对应的绿 run** + tag push 独立一条 run；本轮实测值记入 `§二` |
| 28 | 四矩阵同点全红 = CI 接线缺陷 | 待首推 | Node 20/22/24 三格；若同点全红先查接线不查逻辑 |
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
