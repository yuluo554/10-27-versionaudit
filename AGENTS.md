# AGENTS.md

本仓库遵循 **`ai-tool-project-sprint`** 方法论（装订日期：2026-10-27）。

## 任何新对话的第一件事

```bash
node tools/check-sprint-layout.mjs     # 布局门（方法论装订）
node tools/check-desensitized.mjs      # 脱敏门
node tools/check-scope.mjs             # 范围门（无许可证判定能力）
node tools/check-provenance.mjs        # 溯源门（每条断言有台账锚点）
node tools/check-workflows.mjs         # workflow 门（推送前抓 jobs=0 形态）
node tools/check-report-schema.mjs     # 报告门（SARIF 过官方 schema / 三格式一致 / --out 原子写）
```

- **六条门**必须绿；红了先修再干活（把"修门"记进当前 HANDOFF 待办）。
- 全套：`npm run gate:all`。
- 续接对话：读 `plan/HANDOFF-M<k>.md`（第 k 棒开工用的交接单），**先跑上面的门**。
- 接手对话（无 HANDOFF）：先读 `plan/00`、`plan/05`、`plan/06` 与各 HANDOFF，重建
  "当前状态 + K 口径清单"再动手。
- **门不存在 = 本项目没装订** → 先补装订，再做别的。
- **跑测试只用 `npm test`**（转发 `tools/run-tests.mjs`）：`node --test "<glob>"` 是 Node 21+
  才有的能力（Node 20 上 `Could not find …`），而 `node --test <目录>` 在 Node 22+ 已失效。
  两种写法各在一个主版本上崩，见 §断言纪律 4。

## 强制布局（布局门逐条断言，改动前先看这里）

| 项 | 位置 | 判据 |
| --- | --- | --- |
| 计划套件 | `plan/00–06` + `data/README.md` | 存在且各含必需小节（标题关键词） |
| 数据台账 | `data/README.md` | 依据查证记录 + 数值口径（唯一定义处）在位 |
| 交接单 | `plan/HANDOFF-M<k>.md` | 每个 ✅ 里程碑一份，七节齐（含"当前事实·状态不变量"）；M0 已有 `HANDOFF-M0.md`。**命名取 `M<已完成的里程碑>`，不是"下一棒"**——见下条 |

### 交接单命名口径（本项目已定夺，勿改）

`ai-tool-project-sprint` 内部有两套矛盾写法：`HANDOFF-M<next>`（下一棒）与 `HANDOFF-M<k>`（同号）。
**本项目取"同号"**，依据是只有它被实现成了可跑判据——模板
`references/templates/check-sprint-layout.mjs:200`：

```js
for (const k of done) {          // done = 已 ✅ 的里程碑
  const rel = `plan/HANDOFF-M${k}.md`;
```

实测：把 `HANDOFF-M0.md` 改名成 `HANDOFF-M1.md` → `LAYOUT.HANDOFFS plan/HANDOFF-M0.md(缺)` 报红。
所以 **M0 收尾写 `HANDOFF-M0.md`，M1 收尾写 `HANDOFF-M1.md`**（后者同时承载 M2 的待办）。
| 里程碑状态副本 | `plan/00` 里程碑表 + `plan/00` 承诺-证据台账 + `plan/05` 状态表 + `README` 状态表 | **逐处一致**；只认表格行（`\| M<k> \| …`），散文状态行不参与判定 |
| 骨架产物 | `bin/versionaudit.mjs`、`src/`、`package.json` | 存在；CLI 可 `--help` / `--version` |
| 发布留档 | `plan/RELEASE-M6.md`（两栏）或 `plan/WRAPUP-M6.md` | M6 未 ✅ 时本项报 PASS 并写明"尚不适用" |
| 发布门覆盖对账 | `plan/RELEASE-M6.md` §覆盖对账 | 阶段 7 出口门逐条：实现 / 不适用+理由 / 待首推 |

## 布局门的变异验证

门本身也要被证伪：`node tools/verify-layout-mutations.mjs` 逐组改坏仓库副本再复跑，
**任何一组不变红 = 门有假判据**。收尾棒必须全组通过（含阴性对照）。当前 **54 组**：
14 组布局门（L*）+ 8 组向量门/夹具卫生门（V* / H4–H5）+ 7 组溯源覆盖门/报告门（P*）+ 25 组断言纪律（H1–H3、H6–H27），
全部在临时副本里跑，不碰工作区。

**D7 修复新增 `PROV.REVIEW` 与 `P7`**：溯源门的"复核锚"判据（`data/README.md` §0 与
`fixtures/real-tree/SOURCE.md` §六 的 `review_interval` / `next_review`）必须有变异组证伪，
否则它就是"声明了但没人读"的下一处。P7 把**两处**锚同时改到过去（只改一处会被"两处不一致"
那条旁证吞掉，那样证明不了过期判据会咬）。

**`npm-test:` 组必须先过"基线预检"**（M6 首推实测）：这类组用变异让测试变红，但如果
**未变异时命令本来就没跑起来**（如 Node 20 不认 glob），任何变异都会"变红"——那什么都没证明。
现在先在未变异副本上跑一次，`exit !== 0` 直接把这组记 `error`，不静默通过。

**M2 新增 3 组（H6–H8）对应两条实测缺陷 + 一条新判据**：H6 把 `checkR3` 改回"拆下界"
（`^0.0` 一族崩溃，退出码 3）；H7 把 `exact` 逃生口整套加回（R5 漏判 `1.0.0 <1.0.0`）；
H8 把全帧差分测试改成空转（判据退化必须变红）。三条修复的台账锚点见 `data/README.md` A20/A21。

**M3 新增 5 组（H9–H13）对应三个实测缺陷 + 两条新判据**：H9 把根声明比对改回"跨类合并"
（optional 并进 dependencies → 带 optional 的真实锁全被误报）；H10 删掉"无版本条目降级"守卫
（`satisfies(null,·)=false` 会使 link/optional 占位被误判"不满足"）；H11 删掉
`lock-extra-undeclared` 对树外路径/`link` 条目的跳过（`"../lib"` 被解析成包名 `".."`）；
H12 让结构混用不再抛（退出码 3 的唯一执行点）；H13 让 CLI 只打 message 不打 `detail`
（支持面/处置建议丢失，报文不可行动）。H9–H11 的台账锚点见 A22–A24。

**M3 的三条缺陷只有真实 npm 锁才暴露**：手写夹具沿用了"npm 把 optional 并进根 dependencies"
的错误假设，12 组向量全绿也没抓到。检验手段是 `npm install --offline` 真写出锁再喂给工具，
并把该形态固化成 `fixtures/vectors/M3-lockfile-v2`。

**M4 新增 10 组（H14–H22、P5）对应两个实测缺陷 + 三处新判据面**：
H14 把差分测试的 dedupe MUS 复算改回"读不存在的字段"（**真空判据**：原实现读
`minimalConflictSet.lockedVersions`，而它是数组 → 循环体一次都不执行，这条"最小冲突集由库复算"
从未核过任何东西）；H18 把超限降级改回"取候选最少的 2 条"（实测会返回**可满足**的集合，
却叫它 `minimalConflictSet` —— 编造冲突）；H15 让 MUS 退化成全量请求者（非极小）；
H16/H17 分别压平真实树的双版本拓扑、删掉真实树的 `expected.json`；
H19 让 dedupe 只考虑最后一个候选版本（targets 不完整）；H20 合并 `reason` 两态；
H21 让 `--prefer` 改可行性；H22 去掉 `suggestion.nature`；P5 把真实树的 A25 引用剥掉。
两个缺陷的留痕见 `docs/limitations.md` §5.0.4。

**M5 新增 5 组（H23–H26、P6）对应报告层四个实测缺陷 + 一条新判据面**：
H23 把 SARIF 的 `ruleId` 改回 `String(f.rule)`（M2 finding 只有 `kind` → 字面量 `"undefined"`，
**官方 schema 抓不到**）；H24 让 SARIF 只输出 findings（真实树 JSON 报 2 条 error 而 SARIF 报 0 条）；
H25 让 `summary.highest` 只看 findings（真实树曾给出 `error: 2` 而 `highest: null`）；
H26 让 text 的降级行回退到两态 `reason`（降级原因被说成 `empty-intersection`）；
P6 换掉 schema 副本的 `$id`（身份判据）。四条缺陷的留痕见 `docs/limitations.md` §5.0.5。
**M5 的假门教训**：三格式一致性判据的第一版用被测的 `collectEntries()` 求期望值，
H24 变异**假绿**（两侧同时少了同样的东西）—— 期望值必须**独立枚举**。

**M6 新增 1 组（H27）对应首推实测缺陷（本机 node 24 全绿、CI `test (20)` 红）**：
`node --test "<glob>"` 的 glob 支持是 **Node 21** 才加的（Node 20 上 `Could not find …` 退出 1），
而 `node --test <目录>` 在 **Node 22+** 已失效（目录被当成测试文件，`✖ … 'test failed'`）。
两种写法各在一个主版本上崩 ⇒ 新增 `tools/run-tests.mjs` 自己枚举文件、再交给 `node --test`。
H27 让 runner 的空匹配返回 0（空跑当成通过）→ 守门测试必须变红。
**同族第三形态（同一轮实测）**：runner 在 `node --test` 内部被调用时，继承的 `NODE_TEST_CONTEXT`
会让子进程 `skipping running files` **但退出 0** —— 又一个"看起来绿、其实一个都没跑"，
已在 runner 里剥掉该变量并用哨兵文件钉住。

`group.gate` 的两种形态：直接给脚本路径（如 `"tools/check-provenance.mjs"`）；或给
`"npm-test:tests/<目录>/<glob>.test.mjs"` → 走 `tools/run-tests.mjs` 跑该 glob
（**不要**写 `node --test <glob>` 或 `node --test <目录>`，两者各在一个 Node 主版本上崩）。

## 断言纪律（M1 复核实测出来的，改动向量前先看这里）

1. **每条向量的 `mustContain` 必须含至少一条 `input.*` 断言**（如 `input.declarations`）。
   `mustNotContain`（"同类但不该报"）在**输入被删掉后会真空变绿**——包都不在夹具里，
   当然不会报。实测：把 R5 夹具的反例包删掉，全部断言仍通过。变异组 `V6`/`H2` 证伪。
2. **断言必须指向标量字段**。`{path:"findings", value:"R5"}` 解析出的是整个数组，
   与字符串比恒为 false —— 放在 `mustNotContain` 里**永远不会失败**。M0 期有 4 条这种
   "空心断言"。禁某规则出现在某包上的正解：
   `{"path":"findings[?package=p&rule=R5]", "present": true}`。变异组 `H1` 证伪。
3. **`sources` 引用的 `A<n>` 必须真实存在于 `data/README.md` §1.1**（幽灵锚点会被
   `PROV.COVERAGE` 抓，变异组 `P4` 证伪）；反之，**§1.1 的每条 A 编号都必须被某个向量引用，
   或被 `tools/check-provenance.mjs` 的 `A_EXEMPT` 显式豁免**（豁免必须给 `why` + 活测试
   `test` 锚点，僵尸登记会变红，变异组 `P1`–`P3` 证伪）。M0 期 12 组向量漏了 A2/A5/A6/A7
   而四条门全绿——"覆盖了多少"必须由机器核。

## 环境事实与禁忌（只写实测过的）

- 本机：node v24.15.0 / npm 11.12.1；`semver@7.8.5` 为钉死的唯一运行时依赖（实测
  `npm view semver version` = 7.8.5，与 `data/README.md` §1.1 的实现版本一致）。
- 审计运行期**零网络**：不查 registry、不解析 `resolved` URL 主机、不读 dist-tag。
  验收用 `node tools/offline-smoke.mjs`（进程内 DNS/net 钩子全部抛错）+ CI 的 `--network none` 容器。
- 输出确定性：同输入两次运行逐字节一致（`tests/determinism`）；JSON 键序固定、数组稳定排序、
  不含时间戳/主机名/绝对路径（除 `--verbose-paths`）。
- **夹具（`fixtures/*/input/`）是只读审计输入，不是依赖表**：全部 `private: true`、
  无 `install`/`postinstall` 钩子、无 `workspaces` 字段、根 `package.json` 无 `workspaces`
  收编它们、也**无 `file:`/`link:` 依赖指向 `fixtures/**`**。
  这五条由 `tools/check-vectors.mjs` 的「夹具卫生」判据断言（5 组变异 V1–V3 + H4–H5 证伪）。
  **不要"为了安全"把 R2 向量里的 `*` / `latest` / `x` 改成固定版本** ——那是该规则的被测对象
  本身，固定掉等于删掉唯一正例；风险处置落在"它不会被安装"，不是"它不能写浮动版本"。
  （安全扫描器每轮都会把 `tagged: latest` / `x-range: x` 报成"浮动版本风险"——**已知误报**，
  依据见 `docs/limitations.md` §5.1。）
- **夹具的 `dependencies` 字段是被审计的输入本身，不许删也不许"固定掉"**。
  判据要写成"仓库根不会把它挂进依赖树"，而不是"夹具里不许有浮动版本"——
  后者会把 12 组向量的被测对象一起删掉（M1 期实测踩过：加了这条判据 12 组全红）。
- 禁止：把"未执行"写成已完成；在 tag 之后改交付面（`bin/`、`src/`、`package.json`）；
  跨生态复用 npm 范围语义（Cargo `1.2.3` 是 caret，npm 是精确锁定）。
- **区间代数判空的唯一正确口径**：`lo == hi` 时**看端点开闭性**——`<`（开）为空、
  `<=`（闭）为**非空单点**（`data/README.md` A18 实测；闭环单点 `>=1.0.0 <=1.0.0`
  可满足，M1 期曾误报成 R5，变异组 `H3` 钉住）。**精确比较器没有"非空"特权**：
  `1.0.0 <1.0.0` / `1.0.0 >1.0.0` / `>1.0.0 1.0.0` 三个都为空（A21；M2 期删掉的
  `exact` 逃生口，变异组 `H7` 钉住）。另：**判空只看端点几何**，不覆盖离散版本域
  （`>1.0.0 <1.0.1`）与预发布可达性（A8）——那是已登记的能力边界
  （`docs/limitations.md` §5.1），**不要用 `minVersion`/`subset` 去顶替**（两者实测都不可靠）。
- **规则判据只能看展开字符串**：R3 曾因从区间代数内部结构拆下界而在 `^0.0` 一族上抛
  `TypeError`（合法输入被判"输入不可解析"，退出码 3）。凡"以展开结果证明"的规则，
  **判据只读 `validRange` 的输出**（浮点/符号端点一概不碰），变异组 `H6` 钉住。
- **真实 npm 锁是唯一可信的锁形态样本**（M3 实测，A22–A24）。三条会绊倒人的事实，
  改 M2/M3 判据前先看：
  1. **根条目四类键各写各的**：`packages[""]` 是
     `{"dependencies":{…},"devDependencies":{…},"optionalDependencies":{…},"peerDependencies":{…}}`，
     **dev/optional 不会并进 `dependencies`**。按"合并"口径比对根声明 → 任何带 optional
     的真实锁都被误报（A22，变异组 `H9` 钉住）。
  2. **锁条目可以没有 `version`**：`file:` 依赖写 `{"resolved":"../lib","link":true}`（版本在
     链接目标里），没装上的 optional 写 `{"optional":true}`。`satisfies(null,range)` **恒 false**
     —— 拿它判"不满足"是把"无法判定"说成"判定为错"；正确出口是 `degraded`（K8；A23，
     变异组 `H10` 钉住）。真实 `npm ci` 对两者都 PASS。
  3. **锁里会有树外路径条目**（`"../lib"`，不以 `node_modules/` 开头）。喂给 `nameFromPath`
     会解析出 `".."` 这种怪名。`lock-extra-undeclared` 必须跳过树外路径与 `link: true`
     条目（A24，变异组 `H11` 钉住）。
  **复现手段**（本机可跑，不需要网络）：`npm install --offline` 真写一份锁，
  再 `node bin/versionaudit.mjs lock-manifest <dir> --format=json` —— 手写夹具会沿用错误假设，
  12 组向量全绿也抓不到（M3 期就是这样漏了三个缺陷）。
- **MUS 的降级只降"基数最小 / 平局全列"**（M4 实测）：超限（`--max-requesters`，默认 12）走
  **删除法**（从已知无解的全量逐个移除，只有仍无解才移除），结果**仍是无解 + 极小的真 MUS**；
  降级**不许**动"是不是真冲突"——旧实现取"候选最少的 2 条"，实测会返回**可满足**的集合却叫它
  `minimalConflictSet`（`docs/limitations.md` §5.0.4；变异组 `H14`/`H18`）。
  `reason` 固定是 `requesters > max`（`data/README.md` §7.2 的口径串，别改成自撰文案）。
- **真实树夹具（`fixtures/real-tree/`）是拓扑冻结的真实 npm 锁**：`npm install --offline`
  真写出、`npm ls --all` 退出码 0（A25）；包名按 §6.2 白名单替换、`resolved`/`integrity`/
  `license`/`engines` 删除；**版本号与范围字符串禁改**（改了背书就失效）。判据在
  `tools/check-vectors.mjs` 的「真实树夹具」段（四个文件齐 / `expected.json` 同形 +
  `input.*` 绑定 / **同名包两个版本还在** / 端到端退出码），变异组 `H16`/`H17` 证伪。
  **差分测试把真实树也当夹具跑**（`tests/rules/range-diff.test.mjs`），别把它从夹具清单里摘掉。
- **本机 npm 缓存不在 `~/.npm/_cacache`**（`npm config get cache` 指向仓库外的目录）。
  `npm install --offline` 只读该缓存：M3/M4 的真实锁与真实树都是这样造的（本机 registry 配的是
  npmmirror 镜像，`--offline` 下不联网）。缓存里没有的包会 `ENOTCACHED` —— 挑缓存里有的
  （`semver` / `debug` / `send` / `ms` / `bytes`）或用 `file:` 本地依赖做探针。
- **`InputError.detail` 必须打给用户**：`bin/versionaudit.mjs` 的 catch 里除了 `message`
  还要打 `detail`（支持面 `1 / 2 / 3`、结构混用的处置建议、JSON 解析器原文）。
  只打 message 会让报文停在"说了是什么、没说怎么办"（变异组 `H13` 钉住）。
- **报告层的四类事实（M5 实测，改 `src/report/*` 前先看）**：
  1. **M2 finding 只有 `kind` 没有 `rule`** —— SARIF 的 `ruleId` 必须 `f.rule ?? f.kind`。
     写成 `String(f.rule)` 会产出字面量 `"undefined"`，而**官方 schema 抓不到**它
     （`"undefined"` 是合法字符串；变异组 `H23` 钉住）。
  2. **SARIF 必须报 findings + dedupe + conflicts 三类**。真实树的 error **全在**
     dedupe/conflicts 里（`findings` 为空），只出 findings 会让 SARIF 报 0 条而退出码是 1
     （变异组 `H24` 钉住）。
  3. **`summary.highest` 覆盖三类产物**（不只是 findings）。真实树是回归夹具
     （曾给出 `error: 2` 而 `highest: null`；变异组 `H25` 钉住）。
  4. **text 的降级行打 `degradeReason`**（`requesters > max`），不是两态 `reason`
     （`empty-intersection` / `no-locked-candidate`）——两个字段语义不同（变异组 `H26` 钉住）。
- **SARIF 用官方 schema 的离线副本校验**：`schema/sarif-2.1.0.json`（A26，`sha256` 记在台账）。
  校验器 `src/report/json-schema.mjs` 是**零依赖 draft-07 子集**：`format` 按 annotation 语义
  **登记为未校验、不假装通过**；**未识别关键字报错**而不是静默跳过。
  **不要改这个 schema 文件的任何字节**（改了 `sha256` 对不上，门断言的 `$id` 也会红，变异组 `P6`）。
- **一致性判据的期望值必须独立枚举**（M5 的假门教训）：第一版用被测的 `collectEntries()`
  求 JSON 侧期望值再与 SARIF 侧比，变异 `H24` **假绿**（两侧同时少了同样的东西）。
  现在门里自己写一遍 `expectedEntries()`；同理，**`gen-examples --check` 是自比对**——
  生成器坏了两边一起坏，所以样例的自检必须挂真校验（现在是 6 条，含官方 schema）。
- **`--out` 的失败路径判据要跨平台确定**：Windows 上 `chmod 0o555` 对目录基本无效，
  靠它构造"不可写"会让判据**真空**。正解是把 `--out` 的父路径占成一个**普通文件**
  （`mkdirSync` 必然失败）。另外 `--out` 时 stdout 本就为空 ——
  "空 stdout 重试守卫"必须带 `allowEmpty`，否则原子写那条判据恒红。
- **退出码 3 的输入形态不做成向量**：那类输入**不产生 JSON 报告**，而向量集的两条不变量
  （`mustContain` 含 `input.*` 绑定、`tests/vectors` 无条件 `JSON.parse(stdout)`）都要求有报告。
  它们落在 `tests/exit-codes/lock-input.test.mjs`。**不要**为了把退出码 3 塞进
  `fixtures/vectors/` 而给"输入绑定"开洞 —— 那正是变异组 `V6` 守的东西。
