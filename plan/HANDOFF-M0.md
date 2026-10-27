# HANDOFF-M0 → M1（数据先行）

> 本文件是 **M0 收尾**的交接单。下一棒（M1）开工前：先跑 `node tools/check-sprint-layout.mjs`
> 与 `node tools/check-desensitized.mjs`，两条门必须绿。

## 一、当前进度（含证据）

M0「计划套件 + 方法论装订 + 部署骨架」已完成。可指认的证据：

| 项 | 证据 |
|---|---|
| 计划套件 | `plan/00`–`06` 七份在位，各含必需小节（`LAYOUT.SECTIONS` 8 份齐备） |
| 方法论装订 | `AGENTS.md` + `tools/check-sprint-layout.mjs` + `plan/00` 顶部装订行；`LAYOUT.BINDING` PASS |
| 布局门 | 10 条判据全绿；**13 组变异验证**全符合预期（11 应红 + 1 阴性对照 + 1 显式 SKIP） |
| 骨架 | `bin/versionaudit.mjs` 可 `--version` / `--help`；`src/` 分层就位（cli/model/semver/rules/checks/mus/report/policy） |
| 已实现能力 | M1 规则 R1–R7（R8 默认关闭）、M2 四类 kind、M3 三态 + MUS、M4 peer/version 冲突 + 最小集、三格式报告 |
| 测试 | `npm test` 全绿（interval 19 + rules 20 + M2 13 + M3 7 + M4 6 + exit 11 + inconsistency 5 + determinism 6） |
| 零联网 | `node tools/offline-smoke.mjs`：钩住 12 个入口，6 条命令全通，网络尝试 0 次 |
| 确定性 | text/json/sarif 三格式双跑 `Buffer.compare === 0` |
| 向量 | `fixtures/vectors/` **12 组全部落位**，`node tools/check-vectors.mjs` 端到端 12/12、退出码全对 |
| 样例 | `examples/report.json` / `report.sarif` 冻结，`--check` 逐字节一致 |
| 门 | 布局 13 组变异全符合预期；脱敏 / 范围 / 溯源 / workflow 四门全绿 |

## 二、当前事实·状态不变量（下一棒动手前必须知道）

1. **`semver` 版本钉死 `7.8.5`，不写 `^`**。语义结论必须能追溯到这个版本（`data/README.md` §1.1）。
   升版本 = 重跑全部向量 + 在台账留痕，不是改一行 `package.json`。
2. **`data/README.md` A7 已二次校正**：`validRange('0.0')` 实测为 `<0.1.0-0`（**没有** `>=0.0.0` 下界）。
   写向量期望值时按**实测字符串**，不要照旧记忆补 `>=0.0.0`。
3. **`expandedRange` 只能来自 `adapter.validRange` 实调**。任何手写近似都会被
   `tests/rules/range-lint.test.mjs` 最后一条测试抓到。
4. **契约冻结 K1–K10 在 `plan/03`**，动了会打挂测试。尤其：序列化唯一入口、退出码优先级
   唯一实现、MUS 唯一实现（M3/M4 共用）、`semver` 只准从 adapter import。
5. **布局门只扫「里程碑 + 状态」那张表**（`statusTableRows`）。同一文件里「每周可演示口径」表
   的行也以 `| M1 |` 开头，**不是**状态行；新增表格时别让它同时含这两个表头词，否则会被误采。
6. **变异验证复制整个仓库（含 `node_modules`）**。少了它，`LAYOUT.SKELETON` 会让每一组变异都红，
   阴性对照因此假红（M0 实测踩过一次）。
7. **`fixtures/vectors` 的 12 组目录名是硬约定**（`tools/check-vectors.mjs` 的 `REQUIRED_VECTORS`）。
   改名 = 同时改 `plan/01` §8、`plan/04` §二、该工具的清单。
8. **`.gitignore` 已声明 EXCLUDED 面**：`fixtures/**/out/`、`fixtures/**/actual*.json`。
   向量目录里**不要**放 `actual.json`（会被忽略，且掩盖真实差异）。

## 三、下一棒待办（M1 数据先行）

> **12 组向量目录已在 M0 落位并端到端跑通**（`tools/check-vectors.mjs` = 12/12，退出码全对）。
> M1 的剩余工作不是"建目录"，而是**质量复核**：

1. 按 `data/README.md` §1.1 的 **A1–A16 逐条**核对：每条实测语义至少要有一个向量断言覆盖它
   （现有 12 组覆盖了 A1/A3/A4/A8/A9/A10/A11/A12/A13/A14/A15；**A2 / A5 / A6 / A7 / A16 尚无独立断言**）。
2. 补齐**正反例成对**：每个 R 规则除了"该报"，还要有"不该报"的向量或 `mustNotContain` 断言
   （R1–R8 的 `mustNotContain` 已就位，但 R2/R3/R5 缺"同类但不该报"的输入）。
3. 检查 `mustContain` 是否**精确到字段路径**（现有 12 份都是路径级，保持这个标准）。
4. 复核后把 M1 在 `plan/00` 里程碑表 / `plan/00` 台账（若有）/ `plan/05` 状态表 / `README`
   四处同步翻 ✅，并写 `plan/HANDOFF-M1.md`。
5. `fixtures/real-tree/` 的导出属 **M4**，不要在 M1 顺手做（`SOURCE.md` 已写清落位要求）。

## 四、既定口径清单（K 编号，动了会打挂测试）

| 编号 | 口径 | 落点 |
|---|---|---|
| K1 | 序列化唯一入口 | `src/report/serialize.mjs` |
| K2 | 退出码优先级 `3 > 4 > 1 > 2 > 0` 唯一实现 | `src/cli/exit.mjs` |
| K3 | 三态判定顺序（CONVERGIBLE → MUS → 分类） | `src/checks/dedupe.mjs` |
| K4 | MUS 唯一实现，M3/M4 共用 | `src/mus/minimal-set.mjs` |
| K5 | `semver` 只准从 adapter import | `src/semver/adapter.mjs` |
| K6 | 默认档位表唯一副本 + 报告必须回显 `policy` | `src/policy/severity.mjs` |
| K7 | IR 形态（三份 lock 解析器产出同形） | `plan/02` §三 |
| K8 | 降级必须带 `degraded: true` + `reason` | `src/checks/*` |
| K9 | 实现版本标签只从 adapter 取 | `src/semver/adapter.mjs` |
| K10 | 报告字段顺序由 schema 表驱动 | `src/report/schema.mjs` |

## 五、本机环境坑（只写实测过的）

1. **Windows 上 `execFileSync` 在子进程退出码非 0 时会抛错**（即使 `encoding` 指定了）。
   断言"有 findings 时退出码为 1 且 stdout 完整"必须 `try/catch` 取 `error.stdout`
   （`tests/determinism` 已按此写）。
2. **盘符绝对路径正则 `[A-Za-z]:[\\/]` 会误伤 JSON 里的 `https://`**（`s:/` 命中）。
   判据要加"盘符前不是字母数字"+"盘符后有非分隔符"（`tests/determinism` / `gen-examples` 都用了收窄版）。
3. **`cmd` 里 `node -e` 的多行脚本要用 `--input-type=module` 才能 `await import`**。
4. **Bash 工具不能直接写仓库内源码/配置**（会被安全钩子拦截）——用 Write/Edit 工具落盘。
5. **`git status` 里 `.mimosa/` 是工具状态目录**，已在脱敏门 `SKIP_DIRS` 里；不要提交它。

## 六、DoD 逐项 checklist（M0）

- [x] `plan/00`–`06` 七份齐备且含必需小节
- [x] `AGENTS.md`（强制布局清单 + 门命令 + 环境事实）
- [x] `tools/check-sprint-layout.mjs` 10 条判据，CI 有步骤
- [x] 布局门变异验证 13 组全部符合预期
- [x] `tools/check-desensitized.mjs` 四条规则 + 自豁免
- [x] `bin/versionaudit.mjs` 可 `--version` / `--help`
- [x] `npm test` 全绿（本地等价校验，未接远端，CI 待首推验证）
- [x] 零联网冒烟通过（12 个入口钩住，0 次网络尝试）
- [x] 三格式输出双跑逐字节一致
- [x] 退出码 0/1/2/3/4 全覆盖（4 有故障注入的证伪测试）
- [x] `fixtures/vectors/` 12 组全落位，端到端 12/12 退出码全对
- [x] `examples/` 两份冻结样例，`--check` 逐字节一致
- [x] 脱敏 / 范围 / 溯源 / workflow 四门全绿
- [x] 发布留档：不适用（M6 未 ✅，`LAYOUT.RELEASE` 报 PASS 并写明原因）

## 七、关键命令速查

```bash
# 门（新对话第一件事）
node tools/check-sprint-layout.mjs
node tools/check-desensitized.mjs
node tools/check-scope.mjs

# 门的自证
node tools/verify-layout-mutations.mjs          # 13 组变异
node tools/verify-layout-mutations.mjs --only L4  # 单组

# 测试与冒烟
npm test
node tools/offline-smoke.mjs
node tools/check-vectors.mjs      # M1 起：12 组向量 + 端到端退出码

# 样例（M5 起）
node tools/gen-examples.mjs
node tools/gen-examples.mjs --check

# CLI
node bin/versionaudit.mjs --help
node bin/versionaudit.mjs audit fixtures/vectors/M2-lock-manifest/input
node bin/versionaudit.mjs audit <dir> --format=json --out report.json
```
