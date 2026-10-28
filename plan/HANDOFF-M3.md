# HANDOFF-M3（M3 收尾交接单）→ 下一棒 M4

> **命名口径（本项目已定夺，勿改）**：文件名取 **`M<已完成的里程碑>`**，不是"下一棒"。
> 布局门按 `plan/HANDOFF-M${k}.md`（k = 已 ✅ 的里程碑）取文件，改名成 `HANDOFF-M4.md`
> 会让 `LAYOUT.HANDOFFS` 报 `plan/HANDOFF-M3.md(缺)`（有变异组 `L5b` 钉住）。
>
> **语义**：本文件是 **M3 的收尾记录**（M3 已达成的事实、K 口径、环境坑），
> 其中「三、下一棒待办」是给 M4 的行动清单。
>
> **编号错位提醒**：`plan/03` 的模块编号（"M3 `dedupe-feasibility`"）与 `plan/00` 的
> **里程碑编号**（M4 = `dedupe-feasibility`）**差一位**。看 `plan/03` 时认模块名那一节，
> 不要按里程碑号去对（M3 = `lock-manifest-check`，在 `plan/03` 里叫 "M2"）。
>
> 下一棒（M4）开工前：先跑 `node tools/check-sprint-layout.mjs` 与
> `node tools/check-desensitized.mjs`，两条门必须绿。

## 一、当前进度（含证据）

M3「锁一致性（`lock-manifest-check` v1/v2/v3）」已完成。**M3 做的是把四类 `kind` 的判据
从"骨架期假设"提到"用真实 npm 锁验过"**。走查中查出并修掉**三个实测缺陷**，
三个都**只有真实 npm 写出的锁才会暴露**（12 组手写向量全绿也没抓到）。

| 项 | 证据 |
|---|---|
| 四类 `kind` 逐条核对 | `src/checks/lock-manifest.mjs` 与 `plan/03` M2 表格、`data/README.md` §7.3 默认级别表现在**逐字一致**（`manifest-not-satisfied`/`missing-from-lock`/`manifest-changed-unsynced` = error；`lock-extra-undeclared`/`lock-outdated` = warning） |
| **真实锁复验手段** | `npm install --offline` 真写锁 → 喂给 `node bin/versionaudit.mjs lock-manifest <dir> --format=json`，与 `npm ci` 的判定逐场景对照（本机 npm 11.12.1，零联网） |
| 复核缺陷 ①（**误报**） | 旧实现按"npm 把 `optionalDependencies` 并进根 `dependencies`"的假设比对根声明。真实锁是**四类键各写各的**，于是任何带 optional 依赖的锁都误报 `manifest-changed-unsynced` + `manifest-not-satisfied`（**工具退出码 1 而 `npm ci` 退出码 0**）。修复：逐类键比对（台账 A22；变异组 `H9`） |
| 复核缺陷 ②（**编造语义**） | 锁条目**可以没有 `version`**（`file:` 的 link 条目 `{"resolved":"../lib","link":true}`、没装上的 optional `{"optional":true}`）。`satisfies(null,range)` 恒 `false`，旧实现据此报 `manifest-not-satisfied`（error）。真实 `npm ci` 对两者都 PASS。修复：无版本 → **降级**（写进报告 `degraded` 数组，K8 不静默近似）（A23；变异组 `H10`） |
| 复核缺陷 ③（**误报**） | 真实 `file:` 锁含树外条目 `"../lib"`，旧实现喂给 `nameFromPath` 解析出 `".."`，报 `lock-extra-undeclared("..")`。修复：跳过树外路径（不以 `node_modules/` 开头）与 `link: true` 条目（A24；变异组 `H11`） |
| 复核缺陷 ④（**报文不可行动**） | `InputError.detail`（支持面 `1 / 2 / 3`、结构混用的处置建议、JSON 解析器原文）**从未输出**——用户只看到"不支持的 lockfileVersion 9"。修复：`bin/versionaudit.mjs` catch 里补打 `detail`（变异组 `H13`） |
| 台账 | `data/README.md` §1.1 现 **24 条**（A1–A24）。A22 = 真实 npm 根条目四类键各写各的；A23 = 锁条目可无 `version`（两类形态）；A24 = `npm ci` 同步判据是单向的。三条均有留痕段落 |
| 口径同步 | `plan/03` M2 四类 `kind` 表更新为实现口径 + 新增"与真实 `npm ci` 的三处已实测差异"；`plan/02` §三 LockIR 补 `devDeps`/`rootDevDeps`/`link`；`docs/limitations.md` 新增 §3.4（与 npm ci 的口径差异表）与 §3.5（v1 无根声明基线） |
| 全帧差分扩面 | `tests/rules/range-diff.test.mjs` 新增第三条断言：对每条 M3 finding 用**原始 JSON 自己复算**（**不复用 `src/model/*`**——复用被测解析器会让"解析错"与"判据错"一起错）。覆盖 `manifest-changed-unsynced`（同类键一致就不得报，钉 A22）、`missing-from-lock`（锁里确实无该路径、optional 不报）、`lock-extra-undeclared`（不得是树外路径解析出的怪名） |
| 差分新增守卫 | 同文件：`manifest-not-satisfied` 的 `lockedVersion` **不得为 `null`**（钉 A23，变异组 `H10`） |
| 向量集 12 → 14 组 | 新增 `M3-lockfile-v1`（v1 嵌套 `dependencies`；覆盖 `missing-from-lock` + 传递请求者链 + v1 不产生 `manifest-changed-unsynced`，后者依据 `docs/limitations.md` §3.5）与 `M3-lockfile-v2`（v2 双视图 + **真实 npm 形态**：根 optional 一致、树外 `../lib`、link 条目、无版本 optional 占位；A22/A23/A24 三条都在此被钉住）。白名单 + `plan/01` §8 + `plan/04` §二 三处同步 |
| 退出码 3 端到端 | 新增 `tests/exit-codes/lock-input.test.mjs`：**真 spawn CLI**，9 条用例覆盖三形态（v1/v2/v3 结构混用 3 条、不支持/非整数 `lockfileVersion` 2 条、JSON 语法错误 2 条）+ 优先级 `3 > 1` + 阴性对照（干净输入必须 0 且产出可解析 JSON）。**退出码 3 不做成向量**（理由见下 §二.6） |
| 测试 | `npm test` **157 通过**（M2 末 128，+29 = 差分扩面 +18【差分测试 25 → 43：新增 M3 复算面 ×14 + 两个新向量各 2 条既有面】+ 退出码 3 用例 +9 + 向量跑者 +2） |
| 门 | 五门 + 向量门全绿（向量门 14/14 端到端退出码全对；`PROV.COVERAGE` 24 条：23 引用 + `A16` 豁免）；`node tools/gen-examples.mjs --check` 逐字节一致；`node tools/offline-smoke.mjs` 零联网（12 入网点、6 条命令、网络尝试 0） |
| 变异验证 | **37 组全部符合预期**：14 布局门 `L*` + 8 向量门/夹具卫生门 `V*`/`H4`/`H5` + 4 溯源覆盖门 `P*` + 11 断言纪律 `H1`–`H3`、`H6`–`H13`。**M3 新增 5 组**（`H9` 根声明跨类合并 / `H10` 无版本被判不满足 / `H11` 树外路径当包名 / `H12` 结构混用放行 / `H13` detail 丢失） |
| 工作树状态 | **M0–M3 的改动仍未提交**（M1/M2 收尾也未 commit）。M4 开工前先 `git status` 认账，别把上一棒的改动当成自己的 |

## 二、当前事实·状态不变量（下一棒动手前必须知道）

1. **根声明比对是逐类键的**：`dependencies↔dependencies`、`optionalDependencies↔optionalDependencies`，
   **不跨类合并**。改回"合并"会让任何带 optional 的真实锁被误报（变异组 `H9` 会红）。
2. **`lockedVersion === null` 时必须降级，不得判"不满足"**：真实 npm 锁有 link 条目与
   optional 占位条目两类无版本形态。`satisfies(null, ·)` 恒 `false`（实测），拿它判错
   等于把"无法判定"说成"判定为错"。降级文案进报告 `degraded`（K8）。（变异组 `H10`）
3. **`lock-extra-undeclared` 跳过树外路径与 `link: true` 条目**。真实 `file:` 锁含 `"../lib"`
   这种不以 `node_modules/` 开头的条目，喂给 `nameFromPath` 会得到 `".."`。（变异组 `H11`）
4. **`devDependencies` 不参与根声明比对**（有意的）：实测 `npm ci` 在 manifest 增减/改 dev 依赖时
   **均 PASS**（只要锁能满足），比对 dev 会制造 `npm ci` 不会有的失败。依据 A24 + `docs/limitations.md` §3.4。
5. **`manifest-changed-unsynced` 两方向都报**（`npm ci` 只在"manifest 新增而锁没有"时报）——删除方向
   是本工具的**有意补位**（`plan/00` D1 价值点：npm ci 的盲区）。差异已登记在 `docs/limitations.md` §3.4，
   **不要**为了"跟 npm ci 一致"而把删除方向静默掉。
6. **退出码 3 的输入形态不进 `fixtures/vectors/`**（M3 定夺，勿改）：这类输入不产生 JSON 报告，
   而向量集的两条不变量（`mustContain` 含 `input.*` 绑定、`tests/vectors` 无条件 `JSON.parse(stdout)`）
   都要求有报告。塞进去只能给"输入绑定"开洞（那正是变异组 `V6` 守的东西）。
   落点是 `tests/exit-codes/lock-input.test.mjs`（真 spawn 进程，断言退出码 + stderr 报文）。
7. **`InputError.detail` 必须打给用户**：`bin/versionaudit.mjs` catch 里 message + detail 两行都要。
   `detail` 是"可行动的那一半"（支持面 / 处置建议 / JSON 解析器原文）。（变异组 `H13`）
8. **v1 输入不产生 `manifest-changed-unsynced`**：v1 没有 `packages[""]`，`rootManifestDeps` 为 `{}`，
   没有可比对的锁侧基线。**不得**用 manifest 自己和自己比来"补齐"（那恒为一致 = 假判据）。
   依据 `docs/limitations.md` §3.5。
9. **全帧差分对 M3 的复算不复用 `src/model/*`**：测试自己读 `input/*.json`。
   复用被测解析器会让"解析错了"与"判据错了"一起错，差分失去意义。
10. **每个向量的 `mustContain` 必须含 `input.*` 绑定**（`tools/check-vectors.mjs` 强制，变异 `V6`）；
    **`sources` 引用的 A 编号必须真实存在**，且 §1.1 每条 A 都必须被引用或被 `A_EXEMPT` 豁免
    （现在 §1.1 是 24 条：23 引用 + `A16` 豁免）。新增 A 必须同时给它"谁验它"。
11. **`fixtures/vectors/` 现在恰好 14 组**，目录名在 `tools/check-vectors.mjs` 的 `REQUIRED_VECTORS`
    白名单里，"多（未声明）"会红。M4 若要新增向量目录，必须同步白名单 + `plan/01` §8 + `plan/04` §二
    （三处都写了 14 组的确切清单）；更省事的做法是把 M4 的输入并进现有 `M4-peer-minimal-set` 向量。
12. `semver` 仍钉死 `7.8.5`；向量 `implementationVersions.semver` 必须一致，否则差分测试报版本漂移。
13. **锁 IR 多了字段**：`buildPackageEntry` 现在产出 `devDeps`/`peerDeps`/`optionalDeps`/`link`；
   三份解析器的根级新增 `rootDevDeps`（v1 无，空对象）。M4 若用 `rootPeerDeps`/`rootOptionalDeps`，
    注意它们**只对根条目有意义**（npm 只把这三类键写在根上）。

## 三、下一棒待办（M4 `dedupe-feasibility` 三态 + MUS）

> DoD（`plan/00` / `plan/05` M4 行）：**20 包真实树**给出确定性结论；MUS 可机械校验
> （移除任一元素冲突消失）；超限显式 `degraded`。模块口径在 `plan/03` 的
> **M3 `dedupe-feasibility`** 一节（三态判定顺序 + MUS + 诚实性约束）。

1. **落 `fixtures/real-tree/`（20 包真实树）**：`fixtures/real-tree/SOURCE.md` 已在位
   （M0 骨架），但 `input/` 还没有。摘录时**保留拓扑**（重复版本的请求者关系不能压平），
   并在 `SOURCE.md` 写明来源与摘录口径（零联网：不得查 registry）。
2. **三态判定用真实候选版本实算**（`data/README.md` §7.1）：`CONVERGIBLE` **必须**用实际
   候选验证，不能只靠区间非空（预发布可达性 A8/A9 不是纯区间性质）。区间非空但无候选
   → `reason: "no-locked-candidate"`，**不许**与 `reason: "empty-intersection"` 合并陈述。
3. **MUS 可机械校验**：`M ⊆ R` 最小冲突集必须满足"去掉任一元素后冲突消失"（property test）。
   现有 `tests/proof/m4-minimality.test.mjs` 是骨架，M4 要补成真断言。参照 `plan/03` M3 的
   `minimalConflictSet` 形态（`ranges` + `lockedVersions`）——**差分测试已在复算这一面**
   （`tests/rules/range-diff.test.mjs` 的 dedupe 分支：集合内每个范围都不满足任一所列锁定版本）。
4. **超限降级**：`--max-requesters` 默认 12，超限必须 `degraded: true` + `reason: "requesters > max"`
   + 贪心近似，**不得静默冒充最小集**。M3 已把 `degraded` 接进报告（`src/cli/main.mjs` 的
   `degradations` 数组）——M4 可复用同一通路，不要另开字段。
5. **`--prefer` 只改标注不改可行性**：`latest|min-change` 只影响 `CONVERGIBLE` 时的排序与标注。
6. **`REQUIRES_OVERRIDE` 的 `suggestion` 必须带 `"nature": "suggestion"`**（不是事实）。
7. **不要顺手做 M5 的事**：`conflict-explain` 的 SARIF 结构校验、`report-ci` 的三格式
   与官方 schema 校验器属 M5。M4 只碰收敛可行性、MUS、真实树。
8. **别动 M1–M3 已冻结的判据**（R3 只看上界、R5 端点开闭、R8 默认关闭、M3 的逐类键比对/
   无版本降级/跳树外与 link）。若确需动，必须同步 `plan/03` + `data/README.md`（含 §7.3 表）
   + 相关向量 + 变异组，并在本类交接单留痕。
9. 收尾时：三处状态副本翻 ✅（`plan/00` 里程碑表 / `plan/05` 状态表 / `README` 状态表），
   写 `plan/HANDOFF-M4.md`（七节齐）。

## 四、既定口径清单（K 编号，动了会打挂测试）

> K1–K12 见 `plan/HANDOFF-M1.md` §四与 `plan/03` 契约冻结表；K13–K15 见 `plan/HANDOFF-M2.md` §四。M3 新增：

| 编号 | 口径 | 落点 |
|---|---|---|
| **K16（M3 新增）** | **根声明逐类键比对**：`dependencies↔dependencies`、`optionalDependencies↔optionalDependencies`，**不跨类合并**；`devDependencies` 不参与（`npm ci` 对 dev 增减均 PASS） | `src/checks/lock-manifest.mjs`（A22/A24；变异 `H9`） |
| **K17（M3 新增）** | **无版本条目不得判"不满足"**：`lockedVersion === null`（link / optional 占位）→ 走 `degraded`，不进 `manifest-not-satisfied` | `src/checks/lock-manifest.mjs`（A23；变异 `H10`）；差分测试亦断言此项 |
| **K18（M3 新增）** | **`lock-extra-undeclared` 跳过树外路径与 `link: true` 条目**（不以 `node_modules/` 开头的路径是链接目标体，不是被安装的包） | `src/checks/lock-manifest.mjs`（A24；变异 `H11`） |
| **K19（M3 新增）** | **退出码 3 的输入形态不做成向量**；落 `tests/exit-codes/lock-input.test.mjs`（不产生 JSON 报告 ⇒ 与"`input.*` 绑定"不变量冲突） | 本交接单 §二.6；`plan/01` §8 说明；`tools/check-vectors.mjs` 白名单注释 |
| **K20（M3 新增）** | **`InputError.detail` 必须输出**（支持面 / 处置建议 / 解析器原文）：报文要能行动，不能停在"是什么" | `bin/versionaudit.mjs`（变异 `H13`） |

## 五、本机环境坑（只写实测过的）

1. **`execFileSync` 在子进程退出码非 0 时会抛**（即使指定 `encoding`）。断言"退出码 ≠ 0 且 stdout/stderr
   有内容"必须 `try/catch` 取 `error.status` / `error.stdout` / `error.stderr`
   （`tests/exit-codes/lock-input.test.mjs` 与 `tests/rules/range-diff.test.mjs` 都是这么写的）。
2. **盘符绝对路径正则 `[A-Za-z]:[\\/]` 会误伤 `https://`**（`s:/` 命中）。要加"盘符前不是字母数字"。
3. **`node --test <目录>` 恒红**（目录被当成测试文件）。用 glob：`node --test "tests/**/*.test.mjs"`。
4. **Bash 工具不能直接写文件**（heredoc / `>` 重定向都会被安全钩子拦）。源码/夹具/文档用
   **Write/Edit 工具**落盘；`node --input-type=module -e` 里用 `fs.writeFileSync` 写**临时目录**
   （`os.tmpdir()`）没问题，写仓库文件也会被拦。
5. **`node --input-type=module` 里没有 `require`**。读文件用 `import { readFileSync } from "node:fs"`。
6. **npm 内置 semver 副本路径**：`C:/Program Files/nodejs/node_modules/npm/node_modules/semver`
   （`createRequire('file:///D:/')` + 绝对路径可加载；`npm root -g` 那条路不通）。
7. **`git status` 里 `.mimosa/` 是工具状态目录**，已在脱敏门 `SKIP_DIRS`；不要提交它。
8. **`npm install --offline` 可生成真实锁**（本机 `~/.npm` 缓存有 semver 等包），
   是 M3 抓三个缺陷的关键手段。**但缓存里没有的包会 `ENOTCACHED`** ——
   挑缓存在过的包（`semver`、`is-number`）或 `file:` 本地依赖做探针。
   生成探针时 `--audit=false --fund=false` 可避免联网审计。
9. **npm 11 写锁的根条目形状与旧文档不符**（这是 M3 三个缺陷的根源）：
   - 四类键**各写各的**，不合并（`{"dependencies":…,"devDependencies":…,"optionalDependencies":…}`）；
   - `file:` 依赖会写**两条**：树外体 `"../lib": {"version":"1.0.0"}` + 链接 `"node_modules/lib": {"resolved":"../lib","link":true}`；
   - 没装上的 optional 写 `{"optional": true}`（**无 version**）。
   **凡改 M2/M3 判据，先拿真实锁复验一遍**（手写夹具会沿用错误假设）。
10. **`git status` 显示 M0–M3 大量改动未提交**（含本轮）。开工前先认账。

## 六、DoD 逐项 checklist（M3）

- [x] 四类 `kind` 实现判据与 `plan/03` M2、`data/README.md` §7.3 **逐字一致**（默认级别同表）
- [x] `send@0.18.0` vs `^0.19.2` 场景输出**声明项 + 范围 + 锁中版本 + 请求者路径**（`fixtures/vectors/M2-lock-manifest`）
- [x] **三种 lockfileVersion 各有夹具**：v3 = `M2-lock-manifest`；v1 = `M3-lockfile-v1`；v2 = `M3-lockfile-v2`
- [x] **混用/不支持/JSON 语法错误 → 退出码 3** 端到端覆盖（`tests/exit-codes/lock-input.test.mjs`，9 条含优先级 `3 > 1`）
- [x] 差分扩到 M3 三面（`tests/rules/range-diff.test.mjs`，**用原始 JSON 独立复算**，不复用 `src/model/*`）
- [x] 复核缺陷 ①（根声明跨类合并误报）已修 + 台账 A22 + 留痕 + 变异组 `H9`
- [x] 复核缺陷 ②（无版本条目被判不满足）已修 + 台账 A23 + 留痕 + 变异组 `H10`
- [x] 复核缺陷 ③（树外路径当包名）已修 + 台账 A24 + 留痕 + 变异组 `H11`
- [x] 复核缺陷 ④（`detail` 未输出，报文不可行动）已修 + 变异组 `H13`
- [x] `npm test` **148 通过**；五门 + 向量门 14/14 全绿；`PROV.COVERAGE` 24 条（23 引用 + `A16` 豁免）
- [x] 变异验证 **37 组全部符合预期**（M3 新增 `H9`–`H13`）
- [x] 样例 `--check` 逐字节一致；`offline-smoke` 零联网（12 入网点、6 命令、网络尝试 0）
- [x] 向量清单三处同步（白名单 + `plan/01` §8 + `plan/04` §二，均写 14 组）
- [x] M3 三处状态副本同步 ✅（`layout/STATUS` 断言一致）
- [x] 本交接单（七节齐）

## 七、关键命令速查

```bash
# 门（新对话第一件事）
node tools/check-sprint-layout.mjs
node tools/check-desensitized.mjs
node tools/check-scope.mjs
node tools/check-provenance.mjs     # 含 PROV.COVERAGE（台账覆盖，现 24 条）
node tools/check-workflows.mjs

# 门的自证
node tools/verify-layout-mutations.mjs                # 全 37 组
node tools/verify-layout-mutations.mjs --only H9      # 根声明跨类合并回归
node tools/verify-layout-mutations.mjs --only H10     # 无版本条目判不满足回归
node tools/verify-layout-mutations.mjs --only H11     # 树外路径当包名回归
node tools/verify-layout-mutations.mjs --only H12     # 结构混用放行回归
node tools/verify-layout-mutations.mjs --only H13     # InputError.detail 丢失回归

# 测试与冒烟
npm test                            # 148 条（glob 形态；目录形态恒红）
node --test "tests/rules/range-diff.test.mjs"      # 全帧差分（14 组向量 ×3 面）
node --test "tests/exit-codes/lock-input.test.mjs" # 退出码 3 三形态
node tools/check-vectors.mjs        # 14 组向量 + 输入绑定 + 端到端退出码
node tools/offline-smoke.mjs

# 样例
node tools/gen-examples.mjs                 # 仅在"输出确实变了"时重生成
node tools/gen-examples.mjs --check

# CLI（M3 的三个真实锁场景）
node bin/versionaudit.mjs lock-manifest fixtures/vectors/M3-lockfile-v1/input --format=json
node bin/versionaudit.mjs lock-manifest fixtures/vectors/M3-lockfile-v2/input --format=json
node bin/versionaudit.mjs audit fixtures/vectors/M2-lock-manifest/input --format=json

# 真实锁复验（M3 抓缺陷的手段；需 ~/.npm 缓存有该包）
# node --input-type=module -e '...' 里：npm install --offline → 再跑 lock-manifest
```