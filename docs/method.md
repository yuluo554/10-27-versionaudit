# docs/method.md —— 区间代数与 MUS 的算法说明

> 上游：`plan/02` §四（分工）、`plan/03` M3/M4（判定顺序）、`data/README.md` §7（口径唯一定义）。
> 本文回答"算法怎么算、为什么这么算、结论怎么被机械校验"。

## 一、为什么这一层要自研

`node-semver` 提供的是**原子能力**：

| 能力 | 库里有 | 用于本工具 |
|---|---|---|
| `validRange(range)` | ✅ | 范围展开（唯一来源，不许手写） |
| `satisfies(v, range)` | ✅ | 单版本满足性（含预发布规则） |
| `intersects(a, b)` | ✅ | **两两**相交（作为自研求交的对照基线） |
| `subset(a, b)` | ✅ | 分支包含判定（R6 用） |
| 多个范围的交集是否非空 / 落在哪个候选版本 | ❌ | **自研** |
| 冲突的最小请求者集合（MUS） | ❌ | **自研** |

判别依据：`semver intersection` 在全站检索只有 4 个仓库、最高 9★（`data/README.md` §4）。
"证明 + 最小解释"这一层确实是空的——这也正是本项目的定位（`plan/00` D1 的生死线）。

## 二、半开区间表示

一个范围展开后（`validRange`）是一串比较器的合取，`||` 分隔多个分支。每个分支规范化为：

```
{ lo: <bound>, hi: <bound>, exact: <bound|null>, exclusiveLo: bool, exclusiveHi: bool }
```

`bound` 是 `{ v: [major, minor, patch] | ±INF, pre: "<prerelease>" | null }`。

三条关键口径：

1. **闭/开下界**：`>=` 是闭，`>` 是开（记录 `exclusiveLo`）。**不制造"后继版本"**——
   给 `>1.2.3` 编一个 `1.2.4` 会改变语义（1.2.3 的预发布与 1.2.4 之间没有可比的后继）。
2. **`-0` 上界**：npm 展开的上界一律带 `-0`（如 `<0.3.0-0`），作用是排除该上界的预发布
   （`data/README.md` §2 已把这条与"不同含义"分开陈述）。
3. **预发布排序**：同三元组时无预发布 > 有预发布；预发布标识符按 SemVer §11 比较
   （数字按数值、数字恒小于字母数字、前缀短者小）。这段是手写实现，测试覆盖
   `alpha` / `alpha.1` / `beta` / `beta.2` 的边界。

**空分支判定**：`lo > hi` → 空；`lo == hi` 且不是"精确版本"语义 → 空（`>=1.0.0 <1.0.0` 属于后者，
对应 `data/README.md` A11 的实测：`satisfies` 对任何版本都为 false）。

## 三、多路求交

多个范围求交 = 分支笛卡尔积，逐步收窄，保留下来的分支就是可行区间：

```
acc = [(-∞, +∞)]
for range in ranges:
    acc = [intersect(a, b) for a in acc for b in range.branches if intersect(a,b) != null]
    if acc == []: 记录 failedAtIndex（用于解释"是哪一条让它变空"）
```

复杂度是 `O(∏|branches_i|)`。实际输入里一个范围最多 2–3 个分支、请求者 < 20，
所以是平凡的。**不引入排序或剪枝**——那会让"最短失败前缀"这一解释信息丢失。

## 四、收敛判定为什么不能只看区间非空

`data/README.md` §7.1 明令：`CONVERGIBLE` 必须用**实际候选版本**验证。

反例（`data/README.md` A8/A9）：

- `^1.0.0` 与 `^1.0.0` 的区间交集非空（`[1.0.0, 2.0.0-0)`）；
- 但候选集只有 `1.0.0-beta` 时，`satisfies('1.0.0-beta','^1.0.0') = false`；
- **区间非空 ≠ 有解**，因为预发布可达性不是纯区间性质。

所以实现是两段：

```
1. 区间求交（回答"理论上有没有解"，用于给 reason）
2. 对每个锁中版本 v：satisfies(v, S_1) ∧ … ∧ satisfies(v, S_n)（回答"实际有没有解"）
```

第 2 步才是 `CONVERGIBLE` 的判据；第 1 步的结果只进 `reason`：

| 区间 | 有候选 | 结论 |
|---|---|---|
| 空 | 无 | `NOT_CONVERGIBLE`，`reason: empty-intersection` |
| 非空 | 无 | `NOT_CONVERGIBLE`，`reason: no-locked-candidate`（**与上一行不许合并陈述**） |
| 非空 | 有 | `CONVERGIBLE` |

## 五、MUS（极小不可满足子集）

定义（`data/README.md` §7.2）：`M ⊆ R` 是最小冲突集 ⇔ ① `M` 无解；② `∀ M' ⊊ M` 有解。

算法：**按基数升序枚举**。

```
1. 先查单元素：某个请求者的范围自己就无解（R5 形态）→ 单元素 MUS，直接返回
2. k = 2, 3, …: 枚举 C(n, k) 个子集，收集所有无解者
3. 对每个无解子集，显式复核"移除任一元素后有解"（极小性）
4. 第一个非空的 k 层就是答案；同层多个结果按请求者 id 字典序全返回
```

三条实测教训（都写进了 `src/mus/minimal-set.mjs` 的注释）：

- **单元素必须单独查**：`>=1.0.0 <1.0.0` 自身无解，从 k=2 起会漏掉它，
  而且会让"移除任一元素后冲突消失"这条属性测试在单元素集上无意义。
- **极小性要显式复核**：组合枚举写错（少一层循环、边界 off-by-one）时，
  外层 `k` 层的首个命中看起来仍然"最小"，只有复核 `k-1` 子集才抓得到。
- **超限必须显式降级**：`--max-requesters` 默认 12，超限返回贪心近似并带
  `degraded: true` + `reason`。**不许静默冒充最小集**（`plan/03` K8）。

## 六、结论的可机械校验性

本工具的每条"证明"都能被独立的机械断言验证，这是与 `npm dedupe --check`（只给布尔）
的本质区别：

| 结论 | 机械校验方式 | 落点 |
|---|---|---|
| `CONVERGIBLE` 的目标 `v` | 对每个请求者 `satisfies(v, S_i)` 必须为 true | `tests/proof/m3-dedupe.test.mjs` |
| `CONVERGIBLE` 的目标列表完整 | 枚举全部锁定版本，凡满足全体的都必须在 `targets` 里 | `tests/proof/m3-dedupe.test.mjs` |
| `NOT_CONVERGIBLE` 的 MUS | ① `M` 无解；② 移除**任一**元素后有解 | `tests/proof/m3-dedupe.test.mjs` / `m4-minimality.test.mjs` |
| M4 的 `minimalSet` | 同上（复用同一份 MUS 内核） | `tests/proof/m4-minimality.test.mjs` |
| 每条范围展开 | `validRange` 复算必须逐字节相同（退出码 4 的自证） | `tests/exit-codes/inconsistency.test.mjs` |

## 七、已知限制（诚实边界）

1. **只判定"已锁定树"**，不做版本搜索。`REQUIRES_OVERRIDE` 的"建议"不是"应当改成什么"，
   它只说"放宽哪条声明可收敛"（`plan/01` §7 边界）。
2. **不实现 npm 的 overrides 语义求值**。`overrides`/`resolutions` 作为声明参与 R 规则，
   但不参与"实际解析结果"的计算——那需要完整的 npm 解析器（且 npm 文档本身对嵌套 overrides
   的优先级描述不完整）。这条列在 `docs/limitations.md`。
3. **区间代数不处理 build metadata 的排序**。SemVer §10 规定 build metadata 在优先级比较中
   被忽略，因此区间端点也不带它（`data/README.md` A10 的实测支持这一点）。
4. **`||` 分支的 `subset` 判定依赖库**。`subset` 在预发布边界上的行为我们只做了差分覆盖
   （R6 的正反例），没有独立实现。
