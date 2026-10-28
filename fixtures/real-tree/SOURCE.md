# fixtures/real-tree —— 真实树摘录（M4 落位）

> 状态：**已落位**（里程碑 M4）。**拓扑冻结**：版本号与范围字符串禁改（改了背书即失效）。

## 一、来源（怎么来的、零联网）

- 本机 `npm 11.12.1` 在一个临时探针目录里执行
  `npm install --offline --no-audit --no-fund`，由 npm **真写出** `package-lock.json`
  （`lockfileVersion: 3`）。`--offline` 只读本机 npm 缓存，**没有访问 registry**。
- 探针工程的直接依赖（`private: true`）：`bytes@3.1.2`、`debug@2.6.9`、`send@0.18.0`。
  选这三条的判据是：`debug@2.6.9` 精确依赖 `ms@2.0.0`、`send@0.18.0` 精确依赖 `ms@2.1.3`
  ——正是 `data/README.md` §3.1 场景 B 的实测形态；`bytes` 是无依赖叶子包，把规模补到 `plan/01` §3.3
  要求的 20 个已安装包。
- 规模：**20 个已安装包**（+ 根条目 = 21 条锁条目）。两个 `ms` 版本分别落在
  `node_modules/ms@2.0.0`（顶层，被 `debug` 请求）与 `node_modules/send/node_modules/ms@2.1.3`
  （嵌套，被 `send` 请求）——**请求者关系与路径层级按 npm 的实际 hoisting 保留，未压平**。
- `npm ls --all` 实测**退出码 0**（合法重复版本，npm 不告警）。生成时原样记录：

```
$ npm ls --all
audit-probe@1.0.0 <本机探针目录，已脱敏>
├── bytes@3.1.2
├─┬ debug@2.6.9
│ └── ms@2.0.0
└─┬ send@0.18.0
  ├── debug@2.6.9 deduped
  ├── depd@2.0.0
  ├── destroy@1.2.0
  ├── encodeurl@1.0.2
  ├── escape-html@1.0.3
  ├── etag@1.8.1
  ├── fresh@0.5.2
  ├─┬ http-errors@2.0.0
  │ ├── depd@2.0.0 deduped
  │ ├── inherits@2.0.4
  │ ├── setprototypeof@1.2.0
  │ ├── statuses@2.0.1 deduped
  │ └── toidentifier@1.0.1
  ├── mime@1.6.0
  ├── ms@2.1.3
  ├─┬ on-finished@2.4.1
  │ └── ee-first@1.1.1
  ├── range-parser@1.2.1
  └── statuses@2.0.1
EXIT=0
```

> **口径边界**：`npm ls` 的退出码是在**未改名的探针树**上测的；本目录的 `input/` 已按
> §三 改了包名，因此 `npm ls` 不能在本目录复跑（改名后的包不在 registry 上）。
> 「20 包 / 双 ms / `npm ls` 退出码 0」这三条实测断言由 `data/README.md` §1.1 A25 登记。

## 二、背书的断言（本树支撑哪几条验收）

1. **`plan/01` §3.3 的验收**：20 包真实树上必须给出确定性结论。本树上的结论是
   **`NOT_CONVERGIBLE` + 最小冲突集**——`debug@2.6.9` 钉 `ms` 为 `2.0.0`、`send@0.18.0` 钉 `ms`
   为 `2.1.3`，两个精确锁定没有共同解；最小冲突集就是这两条声明（`reason: empty-intersection`）。
   断言落点：`tests/proof/real-tree.test.mjs`（结论 + 请求者路径 + MUS 机械校验）、
   `tests/vectors/vectors.test.mjs`（本目录 `expected.json` 的逐条断言）、
   `tests/rules/range-diff.test.mjs`（全帧差分：每条产物的证明由 `semver` 库复算）。
2. **`data/README.md` §3.1 场景 B**：`ms@2.0.0` 与 `ms@2.1.3` 并存、`npm ls --all` 退出码 0
   （实测见上；台账锚点 A25）。
3. **`plan/05` M4 DoD「MUS 可机械校验」**：本树的最小冲突集满足
   「移除任一元素后冲突消失」，由属性测试用 `satisfies` 直接复算（不复用 `src/model/*`）。
4. **M2 零误报**：本树的 `findings` 为**空**（每一条声明都由其解析到的锁定版本满足），
   即真实 npm 写出的合法树不会被本工具当成"锁与声明不一致"。

## 三、替换清单（换了什么、删了什么）

- **包名**（`data/README.md` §6.2 的假包名白名单：真实包名只保留
  `send` / `ms` / `debug` / `react` / `widget`）：其余 16 个真实包名替换为 `@fixture/*` 假名——

  | 原包名 | 本夹具用名 | | 原包名 | 本夹具用名 |
  |---|---|---|---|---|
  | `bytes` | `@fixture/bytes` | | `inherits` | `@fixture/inherits` |
  | `depd` | `@fixture/depd` | | `mime` | `@fixture/mime` |
  | `destroy` | `@fixture/destroy` | | `on-finished` | `@fixture/on-finished` |
  | `ee-first` | `@fixture/ee-first` | | `range-parser` | `@fixture/range-parser` |
  | `encodeurl` | `@fixture/encodeurl` | | `setprototypeof` | `@fixture/setprototypeof` |
  | `escape-html` | `@fixture/escape-html` | | `statuses` | `@fixture/statuses` |
  | `etag` | `@fixture/etag` | | `toidentifier` | `@fixture/toidentifier` |
  | `fresh` | `@fixture/fresh` | | | |
  | `http-errors` | `@fixture/http-errors` | | | |

  替换**只动包名**：版本号、范围字符串（含 `~1.0.2` 这类部分范围）、lock 路径层级
  （顶层 / `send/node_modules/` 嵌套）全部逐字未改。
- **删除的字段**：每条目的 `resolved` / `integrity` / `license` / `engines`
  （工具一律不读；`resolved` 里是本机 registry 镜像，保留只会给脱敏扫描添噪声）。
  根条目的 `name` 从探针名改为 `fixture-real-tree`。
- **未改**：`lockfileVersion: 3`、`requires: true`、`packages` 的键集合与嵌套结构。

## 四、复现命令

```bash
node bin/versionaudit.mjs dedupe fixtures/real-tree/input --format=json
node bin/versionaudit.mjs audit  fixtures/real-tree/input --format=json
node --test tests/proof/real-tree.test.mjs
node --test tests/rules/range-diff.test.mjs
```

## 五、再次导出的口径（要更新夹具时照做）

1. 在**临时目录**写 `package.json`（`private: true`，`dependencies` = 上面三条），
   跑 `npm install --offline --no-audit --no-fund`；
2. 记录 `npm ls --all` 的输出与退出码（**必须是 0**；非 0 说明树本身是"非法重复"，
   不能用来背书"合法重复版本"这一条）；
3. 按 §三 改包名、删 `resolved`/`integrity`/`license`/`engines`（**不动**版本号与范围字符串）；
4. 重跑 §四 的四条命令，同步 `expected.json` 与 `data/README.md` §1.1 的实测行。

## 六、何时必须重新生成（本树的保质期）

"拓扑冻结"冻结的是**这份树本身**，不是"这棵树永远等于 npm 的输出"。下列任一发生时，
背书失效、必须按 §五 重新导出并重新登记：

| 触发条件 | 为什么 |
|---|---|
| `npm` 主版本变更（本树由 **11.12.1** 写出） | hoisting 是 npm 的**内部策略**：同名包两版本的落位（顶层 vs 嵌套）随版本变。落位一变，`requesters` 路径与最小冲突集就变 |
| `debug` / `send` / `ms` / `bytes` 任一包重发版本 | 直接依赖的锁定版本可能被重新解析（`debug@2.6.9` 钉 `ms@2.0.0`、`send@0.18.0` 钉 `ms@2.1.3` 是这棵树存在的唯一理由） |
| `fixtures/real-tree/expected.json` 的断言被改动 | 断言即背书；改断言而不重导出 = 让树去迎合结论 |

**机读锚**：`review_interval=annual` / `next_review=2027-10-28`（与 `data/README.md` §0 的锚一致）。
`tools/check-provenance.mjs` 的 `PROV.REVIEW` 判据会在过期后 FAIL，不会静默放行。
**边界**：本锚只登记"该复核了"，不判断"复核结论是否仍成立"——后者必须由人按 §五 实跑。
