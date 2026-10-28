# HANDOFF-M6（M6 收尾交接单 · **收官棒**）→ 维护期

> **命名口径（本项目已定夺，勿改）**：文件名取 **`M<已完成的里程碑>`**。布局门按
> `plan/HANDOFF-M${k}.md`（k = 已 ✅ 的里程碑）取文件，改名会让 `LAYOUT.HANDOFFS` 报
> `plan/HANDOFF-M6.md(缺)`（变异组 `L5b` 钉住）。
>
> **这是最后一份交接单**：M6 之后没有 M7。所以「三、下一棒待办」写的是**维护期待办**，
> 不是新里程碑的 DoD。
>
> 接手者开工第一件事仍是跑门（§七），必须全绿。

## 一、当前进度（含证据）

M6「发布（tag + Release + 留档）」已完成。本棒做了三件事：**定版并首推到 GitHub**、
**修掉首推暴露的真缺陷**（Node 20 不认 `node --test "<glob>"`）、**打 tag + 建 Release + 三方复核**。

| 项 | 证据 |
|---|---|
| **定版 1.0.0** | `package.json` / `package-lock.json`（顶层 + `packages[""]`）/ `examples/report.json`·`report.sarif` 的 `tool.version` / `--version` 四处一致；`gen-examples --check` 复算通过 |
| **提交划分** | 工作树原本是 M1–M5 叠加态。按**面**切而非按里程碑（单文件内多里程碑判据交叠，按里程碑拆会产生不可构建的中间态）：① 实现+判据 ② 计划套件+交接单 ③ 定版 1.0.0 ④ 发布留档 ⑤ 首推缺陷修复 |
| **首推** | `gh repo create 10-27-versionaudit --private --source=. --remote=origin`（同时建好 remote）。run **40635987184** |
| **缺陷① Node 20 不认 glob** | `test (20)` 红：`Could not find '<repo>/tests/**/*.test.mjs'`。**glob 支持是 Node 21 才加的**；而 `node --test <目录>` 在 Node 22+ 已失效（目录被当测试文件，`✖ … 'test failed'`）——两种写法各在一个主版本上崩 |
| **缺陷② 变异门假绿（连带）** | `npm-test:` 组的"预期红"建立在"命令退出非 0"上 → 在 Node 20 上 glob 失败恒非 0，**所有这类组都会平凡变红（假绿）**。修法：每组先跑未变异的基线，基线非 0 记 `error` |
| **缺陷③ 嵌套 `NODE_TEST_CONTEXT` 空转** | runner 在 `node --test` 内部被调用时，继承的该变量让子进程 `skipping running files` **却退出 0** —— 第三个"看起来绿、其实没跑"的形态。已在 runner 里剥掉 |
| **修复与回归** | 新增 `tools/run-tests.mjs`（自己枚举 → 显式文件列表交给 `node --test`，18/20/22/24 通用）+ `tests/tools/run-tests.test.mjs` 4 条（用**树外哨兵文件**证明真执行）+ 变异组 **H27**。`npm test` 192 → **196**；变异 52 → **53 组** |
| **复推** | run **40637759120**：`gates` + `test 20/22/24` + `offline` **五格全绿** |
| **tag** | `git tag -a v1.0.0`（annotated）→ push。对象 `accc9ce6…`，指向 `f202400d…` |
| **tag run** | **40638198446**：六格全绿，`release-artifacts` 真跑了（`versionaudit-v1.0.0.tar.gz` 260284 字节 + `SHA256SUMS`） |
| **Release** | `v1.0.0` 非 draft / 非 prerelease，两件附件 state = `uploaded`。正文写复验命令与边界，**不写包内哈希** |
| **三方逐字节一致** | ① 匿名 `sha256sum -c` OK；② 下载件 = CI 构建件（`cmp`）；③ 下载件 = **从 tag 重打件**（`git archive --format=tar --prefix=versionaudit/ v1.0.0 \| gzip -9n`）—— 这条不依赖任何写死的值 |
| **blob 级同源** | 解包树 132 文件 vs `git ls-tree -r -z v1.0.0` 的 132 blob：**sha1 全等，extra 0 / missing 0 / 不一致 0**。一侧是真 blob，不是"两棵被同一 `core.autocrlf` 改写的树互比" |
| **发布包本体实测** | 真下载件 + 仓库外 + 无 `.git`：`npm install --offline` → `--version` = 1.0.0 → `npm test` **196 通过** → 七门 **7/7** → `gen-examples --check` 一致 → `offline-smoke` 网络尝试 **0** → README 8 条命令退出码逐条符合语义 |
| **切 public** | 先 private 跑绿再切 public（方法论默认路径）。切后用**匿名通道**复核（`curl` 不带凭据）：repo API 200、latest release 200、附件下载 + `sha256sum -c` OK |
| **门** | 七门全绿；`LAYOUT.RELEASE` 两栏 + 覆盖对账（33 条三态行）通过；`PROV.COVERAGE` 台账 **26 条** |
| **工作树状态** | M0–M6 全部已提交。tag 之后除文档面外还有**两处 `tools/` 判据修复**（`DOC_TOOLS` 正则误报 + `L10` 靶子随状态切换），均已如实登记在 `plan/RELEASE-M6.md` §二；交付面（`bin/` / `src/` / `package.json`）未动，tag 树自跑七门全绿 |

## 二、当前事实·状态不变量（维护期动手前必须知道）

1. **`npm test` 只能走 `tools/run-tests.mjs`**（`package.json` 已指向它）。`node --test "<glob>"`
   在 Node 20 上 `Could not find …`；`node --test <目录>` 在 Node 22+ 恒红。两者都**别写回去**。
2. **runner 剥 `NODE_TEST_CONTEXT` 是必需的**，不是洁癖：不剥就会"跳过所有文件但退出 0"。
   同一族的三种空转形态（glob 不识别 / 目录当文件 / 嵌套递归跳过）都表现为"绿但没跑"。
3. **空匹配必须非 0**（`files=0 → exit 2`）。变异组 `H27` 钉住这条；runner 的机读串
   `run-tests: files=N exit=K` 是给需要"真扫到了几个"的调用方用的。
4. **`npm-test:` 变异组必须先过基线预检**：基线自己就红时，任何变异都"变红"，什么都没证明。
5. **tag 树里的 `plan/RELEASE-M6.md` §二是"待登记"骨架**，字面值在 tag 之后。这不是漏填 ——
   写进 tag 树会改变那棵树，进而改变附件字节与那些值本身（不动点问题）。**别去"好心补上"再重打 tag**。
6. **附件口径 = 手工源码包**。GitHub 自动生成的 "Source code (zip/tar.gz)" 字节由 GitHub 重打包，
   与 `SHA256SUMS` 无对应关系，**不做校验对象**（README 与 Release 正文都写了）。
7. **`SHA256SUMS` 只写包内哈希**，且它是 `<hash>␠␠<name>` 双空格形态（`sha256sum -c` 直接吃）。
8. **tag 之后只允许文档面提交**（本轮是**近似**，如实登记）：本轮另有两处 `tools/` 门判据修复
   —— `DOC_TOOLS` 正则把 `tests/tools/x.test.mjs` 误当 tools 脚本；`L10` 靶子要随 M6 状态切换
   （M6 已 ✅ 后"把它翻 ✅"是 no-op，被 no-op 守卫抓成 `error`）。两处都**只在 M6 翻 ✅ 后才暴露**。
   交付面 `bin/` / `src/` / `package.json` 未动，且 `git archive v1.0.0` 导出树里用旧版门自跑
   七门全绿。**别为了凑"纯净"去重打 tag**（会作废已发附件与 `SHA256SUMS`）。核对面 =
   `git diff --name-only v1.0.0..HEAD -- bin src package.json` 必须为空。
9. **M1–M5 已冻结的判据别动**：R3 只看展开字符串、R5 端点开闭、R8 默认关闭、M3 的逐类键比对/
   无版本降级/跳树外与 link、M4 的删除法降级与 `reason` 固定串、M5 的三格式一致与 schema 身份。
   确需动 → 同步 `plan/03` + `data/README.md`（含 §7.3 表）+ 夹具 + 变异组，并在留档里留痕。
10. **台账 26 条**（A1–A26）：新增 A 必须同时给它"谁验它"（向量 `sources` 引用或 `A_EXEMPT`
    带 `why` + 活测试），`PROV.COVERAGE` 会红。
11. `semver` 仍钉死 `7.8.5`；向量与真实树 `expected.json` 的 `implementationVersions` 必须一致。
12. **退出码 3 的输入形态不做成向量**（那类输入不产生 JSON 报告），落在 `tests/exit-codes`。
13. **`schema/sarif-2.1.0.json` 一个字节都不许改**（`sha256` 记在 A26，变异组 `P6` 钉 `$id`）。
14. **夹具的 `dependencies` 字段是被审计的输入本身**，不许删也不许"固定掉"；风险处置是
    "仓库根不会把它挂进依赖树"（`tools/check-vectors.mjs` 的夹具卫生判据），不是"夹具里不许有浮动版本"。

## 三、下一棒（维护期）待办

> 已经没有新里程碑了。下面按"该不该做"排序，**没做的不算欠账，做了要留痕**。

1. **别为了让 CI 变绿去放宽判据**。首推那条教训是"跑判据的解释器不对"，不是"判据太严"。
2. **发补丁版的正规路径**（真发现缺陷时）：**不重写已发布的 tag**。改代码 → 全量门绿 → 版本
   `1.0.1` → `plan/RELEASE-M6.md` 追加一节或新开 `plan/RELEASE-M6.1.md` → 新 tag + 新 Release。
   重写 tag 会让已发出的附件与 `SHA256SUMS` 一起作废，且没有任何好处。
3. **`format` 关键字（`uri-reference` / `date-time` / `uri`）仍登记为未校验**（`docs/limitations.md` §3.2）。
   要动先想清楚：自写 URI 校验会把"未校验"换成"编造的校验"，比不校验更坏。
4. **跨生态（yarn / uv / go / pipdeptree / poetry）未实测**。`data/README.md` §8 的规矩是
   **先实测再进向量**；同形异义表（§2）说明不能复用 npm 语义。
5. **ERESOLVE 报文形态只引文档**（`data/README.md` §3.5），未实测。要做就先真跑一次留下原文。
6. **`package.json` 的 `private: false` + `files` 白名单**意味着这个包**技术上可发 npm**，但本项目
   没发（`plan/06` D10）。要发 npm 是新决策面：先核名字占用（当前 `404`，未占用）、
   定发布范围、补 `LICENSE` 文件（现在只有 `"license": "MIT"` 字段与 README 的"许可"一节）。
7. **`--prefer` / `--strict` / `--max-requesters` 的默认档是策略不是事实**，改动任何一个都要
   同步 `data/README.md` §7.3 与 `docs/limitations.md`，并重跑报告面（`policy` 字段会进产物）。
8. 收尾时的三处状态副本（`plan/00` / `plan/05` / `README`）必须逐处一致 —— `LAYOUT.STATUS` 会断言。

## 四、既定口径清单（K 编号，动了会打挂测试）

> K1–K12 见 `plan/HANDOFF-M1.md` §四与 `plan/03` 契约冻结表；K13–K15 见 `HANDOFF-M2` §四；
> K16–K20 见 `HANDOFF-M3` §四；K21–K24 见 `HANDOFF-M4` §四；K25/K26 见 `HANDOFF-M5` §四。**M6 新增**：

| 编号 | 口径 | 落点 |
|---|---|---|
| **K27（M6 新增）** | **测试跑法跨 Node 主版本可移植**：只用 `npm test` / `tools/run-tests.mjs`；空匹配退出 2；剥掉 `NODE_TEST_CONTEXT`；`npm-test:` 变异组必须过基线预检 | `tools/run-tests.mjs` + `tests/tools/run-tests.test.mjs` + `tools/verify-layout-mutations.mjs`（变异 `H27`） |
| **K28（M6 新增）** | **发布面口径**：附件 = `git archive <tag>` 的源码包（不用 GitHub 自动 Source code 包）；`SHA256SUMS` 只写包内哈希；tag 树留档的 §二 只放占位骨架、字面值走 tag 后纯文档提交；tag 之后只允许 `plan/` + `README.md` + `AGENTS.md` | `plan/RELEASE-M6.md` §一/§二 + `.github/workflows/ci.yml` 的 `release-artifacts` |

## 五、本机环境坑（只写实测过的）

1. **本机只有 node v24.15.0**，CI 是 20/22/24。要复现低版本：`npx -y node@20 …`（本机实测可用，
   首推那条缺陷就是靠它在本机复现的）。
2. **本机没有 docker**（`docker --version` → `command not found`）。`offline` job 的
   `docker run --network none` 形态**只能靠远端证明**，别在本机假装验过。
3. **Bash 工具里写含反引号的 JS 字符串会被 shell 当命令替换**（本轮踩过一次，把表格单元格吃空）。
   源码/文档用 **Write/Edit**，别用 `node -e "…`反引号…"`。
4. **`gh` 是原生程序，路径要 Windows 形态**（`C:/…`），`/tmp/...` 不认。
5. **`gh release create` 的 `--notes-file` 与附件路径都用绝对 Windows 路径**；正文写完别把
   notes 文件留在仓库里（本轮写到 `.github/` 又移出去 —— 直接写树外更省事）。
6. **切 public 之后匿名通道可能短暂 404**（缓存/传播）。实测第一次 `curl` 拿到 `Not Found`，
   几秒后重试即 200 —— 别立刻判定"发布坏了"。
7. **`execFileSync` 成功时只回 stdout**。要断言 stderr（如 runner 的机读串）必须用 `spawnSync`。
8. **`node --test` 的三种"绿但没跑"**：glob 不识别（Node 20）、目录当测试文件（Node 22+）、
   嵌套 `NODE_TEST_CONTEXT` 导致 `skipping running files`。三者都退出 0 或"看起来正常"，
   唯一的通用防线是**让被测对象自己报"我跑了几个"**（runner 的机读串 + 哨兵文件）。
9. **`git archive` 出来的树没有 `.git`**，且 129 文件（不含 `node_modules`）。七门与 196 测试
   在这个树里全绿 —— 有判据依赖 git 元数据就会当场暴露。

## 六、DoD 逐项 checklist（M6）

- [x] 定版 `1.0.0` 四处一致 + 样例同轮重生成（`gen-examples --check` 逐字节）
- [x] 私仓首推 → CI 首跑（run 40635987184，抓出 Node 20 glob 缺陷）
- [x] 缺陷修复 + 回归（`tools/run-tests.mjs`、4 条守门测试、变异组 H27、变异门基线预检）
- [x] 复推五格全绿（run 40637759120）
- [x] `git tag -a v1.0.0` + tag run 六格全绿（run 40638198446，含 `release-artifacts`）
- [x] GitHub Release：两件附件 + 复验命令正文 + 非 draft / 非 prerelease
- [x] **真下载复核**：匿名 `sha256sum -c` OK；下载件 = CI 构建件 = 从 tag 重打件
- [x] **附件与 tag 树逐 blob sha1 一致**（132/132，extra 0 / missing 0）
- [x] **发布包本体实测**（仓库外 + 无 `.git`）：196 测试 + 七门 + 样例 + 离线冒烟 + README 8 条命令
- [x] 切 public + 匿名通道复核（API 200 / latest 200 / 附件可下）
- [x] `plan/RELEASE-M6.md` 两栏 + 覆盖对账（`LAYOUT.RELEASE` 断言通过）
- [x] `plan/05` 已知未验证项回填（CI 实跑 / Node 矩阵 / Release 产物 → ✅）
- [x] `plan/06` 关闭 CI 首推缺口（表格只留仍开放项）
- [x] 三处状态副本 M6 翻 ✅（`LAYOUT.STATUS` 断言一致）
- [x] 本交接单（七节齐，收官形态）
- [x] tag 之后提交面复核：`git diff --name-only v1.0.0..HEAD -- bin src package.json` 为空；
      两处 `tools/` 门判据修复已如实登记（`plan/RELEASE-M6.md` §二）

## 七、关键命令速查

```bash
# 门（新对话第一件事）
node tools/check-sprint-layout.mjs
node tools/check-desensitized.mjs
node tools/check-scope.mjs
node tools/check-provenance.mjs       # 含 PROV.COVERAGE（台账 26 条）
node tools/check-workflows.mjs
node tools/check-vectors.mjs          # 15 组向量 + 真实树夹具
node tools/check-report-schema.mjs    # SARIF schema / 三格式一致 / --out 原子写

# 测试（只走 runner；别写 node --test "<glob>" 或 node --test <目录>）
npm test                                   # 196 条，Node 20/22/24 一致
node tools/run-tests.mjs "tests/report/*.test.mjs"
npx -y node@20 npm test                    # 复现低版本（本机只有 node 24）

# 门的自证（53 组）
node tools/verify-layout-mutations.mjs
node tools/verify-layout-mutations.mjs --only H27   # 空跑不算通过

# 离线
node tools/offline-smoke.mjs

# 样例
node tools/gen-examples.mjs --check

# 全量
npm run gate:all

# 发布面复核（已发布，随时可重跑）
gh release view v1.0.0 --repo yuluo554/10-27-versionaudit --json isDraft,isPrerelease,assets
git archive --format=tar --prefix=versionaudit/ v1.0.0 | gzip -9n > /tmp/rebuilt.tar.gz
cmp /tmp/rebuilt.tar.gz <下载件>            # 逐字节，不依赖任何写死的值

# tag 之后"代码面为空"的复证（发布后每笔提交都要跑）
git diff --name-only v1.0.0..HEAD | grep -vE '^(plan/|README\.md|AGENTS\.md)'   # 空 = 一致
```
