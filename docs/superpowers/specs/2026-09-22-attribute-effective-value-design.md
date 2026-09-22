# 属性有效值层设计（base + 修正栈 → 派生）

> 2026-09-22 定稿。目标：给属性读取引入「有效值」语义 —— `读 = 派生(base) ⊕ 修正栈`，写入语义保持不变。
> 这是后续一批功能的地基：战斗内临时改属性、内功装配加成、被动/天赋属性加成、装备加成、带跨天时长的临时状态。
> 配套：`docs/attributes-system.md`（属性链路与 `compute` 字段的既有说明）、`docs/combat-system.md`（战斗数值链与通道代数）。

## 1. 背景：现状与缺口（查证 2026-09-22）

**现状**：属性是**纯裸读**，不存在任何有效值层。

| 事实 | 证据 |
|---|---|
| 属性读取是直接读 `entity.base.*`（跨命名空间查找） | `src/core/entity-utils.ts` 的 `getEntityAttr`；`src/core/binding-resolver.ts:28,44` 只是转发 |
| **没有**装备加成／buff 修正／派生计算中的任何一层 | 全仓库 grep `getEffective` / `attrBonus` / `recomputeAttr` = 0 命中 |
| `compute`（计算属性）**只有类型声明，零实现** | 仅 `src/core/mod-types.ts:18` 的 `compute?: string`；`docs/attributes-system.md:51` 已把它写成「可选：计算属性脚本」，但无任何消费代码 |
| 调用点极多，且分散在各插件 | 全仓库 140+ 处 `getEntityAttr(` / `bindingResolver.get*(` 调用（含测试） |
| 条件表达式也走同一读取入口 | `src/core/condition-engine.ts:446` 调 `getEntityAttr` |
| 属性被**读-改-写**的既有系统 | `src/plugins/h-core/settle/hpmp-growth.ts:34-35`（`HP_MAX = get(HP_MAX) + n`）、`src/plugins/combat-base/index.ts:2128`（吸内削 `mp_max`）、`src/plugins/sleep-system/update-sleep.ts:39`（写 `STAMINA_MAX`） |

**关键约束**：因为存在读-改-写，任何「派生物化写回 base」的做法都会把公式产物当成长度存下来（重复执行即翻倍），并让成长/削减被静默吞掉。这一条否决了物化方案。

## 2. 已定决策（用户确认）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 生效范围 | **全局**：读属性一律返回有效值（条件判断、日常结算、UI、战斗全部生效） |
| D2 | 修正来源 | **五类全要**：战斗效果/战斗状态、被动技能/战斗天赋、装备/服装、带跨天时长的临时状态、脚本/API 直挂 |
| D3 | 存储模型 | **方案 1 三层惰性**：`base`（存档真相）+ 修正栈 → 派生公式显式读 base。写入只写 base |
| D4 | 声明形态 | **方案 A 内联**：修正数值写在各来源自己的定义里（不建 `attribute-mods.toml` 库） |
| D5 | 每层成长语义 | **历史累积即得**：秘籍/内功练到第 N 层时执行一次写入，永久进 base（非「按当前层数实时派生」） |
| D6 | 管线次序 | **先派生、后叠修正**：修正作用于公式产物（详见 §4） |
| D7 | 循环防护 | **不做静态依赖声明**，改用运行期递归深度上限 + 上报（与战斗管线「深度上限 64」同惯例） |

## 3. 分层与数据模型

```
读(实体, 属性) =
  ① raw = base[属性]                              ← 存档真相；键不存在 → 0（保留现有语义）
  ② v   = compute? 脚本(raw, 属性读取器) : raw      ← 派生；仅声明了 compute 的属性走这步
  ③ v   = (set ?? v + Σflat) × (1 + Σpercent)      ← 修正栈；复用公式通道代数
  ④ 写入缓存
写(实体, 属性, 值) = 只写 base                      ← 现有 140+ 处读写点零改动
```

三层职责：

| 层 | 内容 | 存哪 | 谁写 |
|---|---|---|---|
| `base` | 角色成长/当前值（体力、好感度、上限成长…） | 实体命名空间，随存档 | 现有全部写入路径（不变） |
| 修正栈 | 对属性的临时/条件性增减 | 声明式：不存；运行时：内存或存档 | 各来源（见 §5） |
| `compute` | 派生公式（如 `最大气血 = base.最大气血 + 根骨×10`） | 属性定义（`attributes.toml`） | mod 作者声明 |

**架构合规**：core 层本管线**不认识任何属性名** —— 属性名是数据，公式是 mod 提供的脚本。「字段可得，名不可得」与「修正从哪来」由上层/数据决定。这满足 AGENTS.md 的三层铁律。

## 4. 读取管线细节

### 4.1 先派生、后叠修正（D6）

```
v = compute ? computeScript(base[attr], readAttr) : base[attr]
v = (mod.set ?? v + Σmod.flat) × (1 + Σmod.percent)
```

理由：「给最大气血 +50」的直觉是**最终值** +50，而不是只加在公式的某个分项上。对**非派生属性**公式是恒等，两种次序完全等价 —— 所以这条只影响派生属性，风险面小。

### 4.1.1 管线闸门（这是零回归的关键）

**只有 `mod.attributes` 里定义过、且（声明了 `compute` 或存在修正条目）的属性才走管线**；其余属性在求值入口**原样返回裸值**。

由此得到一个可证的安全性质：T1 不含来源接入时，任何属性都命不中闸门 → 管线是恒等变换 → 现有 140+ 处读取点逐位不变。这同时把「`getEntityAttr` 也读 `entity.id`/`entity.name` 这类直接属性」的边缘情况一起挡在门外。

### 4.1.2 依赖注入（避免 core 内部循环依赖）

`entity-utils.ts` 不能 import `mod-loader`（`mod-loader → mod-parse → entity-utils` 已构成链路，反向 import 会成环）。因此：

- 新增**叶子模块** `src/core/attribute-eval.ts`：只依赖 `error-reporter`，不 import 任何 core 模块
- 它接收**裸值**作为入参（`readEffective(entity, name, raw)`）—— `SEARCH_ORDER` 与命名空间查找仍单一来源保留在 `entity-utils.ts`（不复制第二份）
- 属性定义与脚本解析器由 `mod-loader` 在加载后**注入**（`configureAttributeEval`），位置与 `conditionRegistry.registerFromAttributes` 并列
- 缓存与修正栈按**实体对象**用 `WeakMap` 索引（不依赖 `entity.id`，且自动随对象回收）

### 4.2 叠加代数：直接复用公式通道

不新造一套叠加数学，沿用 `src/plugins/combat-base/formula-channels.ts:7-10` 的既有语义（已有测试覆盖，且是用户已确认的期望行为）：

```
base′ = set ?? v        （多个 set：后者覆盖，替换基准）
value = (base′ + Σflat) × (1 + Σpercent)
```

| 分量 | 合并方式 | 后果 |
|---|---|---|
| `flat` | 相加，加到基准上 | 平加在 percent **之前**，会被 percent 放大 |
| `percent` | **相加**，最后只做**一次**乘法 | `+10%` 与 `+20%` → `×1.30`（不是 1.1×1.2=1.32）；「×2」必须写成 `percent = 1.0` |
| `set` | 后者覆盖，且**替换基准** | 两个 `set` 互相覆盖，只有最后写入者生效 |

`flat` 为 0 不建条目；`set` 即使为 0 也要记录（`set 0` 是「归零」这一有意义的操作）。

### 4.3 派生脚本契约

```toml
[attributes."最大气血"]
type = "number"
compute = "calc_max_hp.js"      # (base, attrs) => number
```

- 签名 `(base: number, attrs: { get(name: string): number }) => number`；`attrs.get` 返回**其他属性的有效值**（递归走同一管线）。**整条管线是同步的** —— 派生脚本不得返回 Promise（返回非 `number` 一律按失败处理）
- 执行方式：`new Function('base', 'attrs', '"use strict";' + code)` —— 脚本体直接 `return`，与既有 mod 脚本风格一致（`damage_<skillId>.js`、quest 脚本同形）
- ⚠️ **不做超时保护**：同步管线里无法实现超时（`Promise.race` 需要 async，而 140+ 处调用点是同步的），因此**加载期文档必须写明「compute 脚本必须纯同步且快速」**。防护手段只有三条：① 递归深度上限 ② 加载期脚本存在性/非空校验 ③ 运行期抛错与非有限数回退 + 上报。这也是 `src/utils/sandbox.ts` 顶部警告的同一取舍（mod 作者自写脚本、非第三方提交）
- 不使用 `src/utils/sandbox.ts`（该文件零消费者，其注释明确要求「新增钩子一律走 script-runner 的安全姿态，勿直接使用本文件」）；本设计的脚本契约比它更窄（两个入参、同步、返回 number）
- 加载期：`compute` 指向的脚本文件必须存在，否则 error
- 运行期：返回值非有限数 → 回退 `base` 并上报；脚本抛错 → 回退 `base` + 去重上报，不阻断调用方
- 递归深度上限（对齐战斗管线的 64）+ 超限断链上报（D7）

## 5. 修正栈的两类来源

| 类 | 来源 | 怎么存 | 生命周期 |
|---|---|---|---|
| **声明式**（pull） | 内功装配、被动技能/天赋、装备/服装 | **不存**。每次读按当前状态现推导 | 随穿戴/拥有状态自动生效失效 |
| **运行时**（push） | 战斗效果、跨天临时状态、脚本 API | 战斗内：内存；跨天：**随存档** | 到期/移除即失效 |

**声明式来源必须用「推导」而非「登记/注销」实现**：登记式在漏掉任一注销路径时会永久漂移（例如装备异常移除、角色离队、复活重建）。推导式的正确性不依赖调用方的自觉。

为免每次读取都遍历全表，按**来源集合的版本号**做失效：能力表/天赋表/装备状态变更时 bump（见 §7）。

## 6. 作者侧数据形态（D4：内联）

```toml
# 内功（可装配的特殊被动技能）——装配期间才生效
[abilities."龟息功"]
name = "龟息功"
type = "passive"
equippable = true
equipped_mods = [ { attr = "力道", flat = 10, per_level = 2 } ]

# 无层数被动技能 ——随拥有生效
[abilities."凌波微步"]
name = "凌波微步"
type = "passive"
attribute_mods = [ { attr = "轻功系数", flat = 30 } ]

# 战斗天赋 ——同字段（talents.toml）
[talents."神目"]
attribute_mods = [ { attr = "福缘", flat = 2 } ]

# 装备 / 服装 ——随穿戴生效
[items."玄铁护腕"]
attribute_mods = [ { attr = "根骨", flat = 5 } ]

# 跨天临时状态 ——带时长，随存档（`duration` 形状为本次提案）
[status_effects."挫骨伤"]
attribute_mods = [ { attr = "灵敏", percent = -0.2 } ]
duration = { days = 3 }
```

修正条目形状：`{ attr: string, flat?: number, percent?: number, set?: number, per_level?: number }`。

- 加载期校验：`attr` 必须已在 `attributes.toml` 定义；`flat/percent/set` 至少给一个。
- `per_level` 的缩放基准 = **宿主能力的当前层数**（内功/被动技能即其对应秘籍已修炼层数）。无层数概念的来源（装备/服装、状态效果）写 `per_level` → 加载期 **error**（不静默当 1 层）。

### 6.1 战斗效果改属性（新增落点）

现有战斗效果的 `action` 只有 `modify_stat`（7 个战斗统计键）与 `modify_channel`（13 个公式通道），**属性是第三种落点，目前不存在**。「挂效果让灵敏 −20」需要它：

```toml
[effects."挫骨"]
name = "挫骨"
delivery = "zone"
target = "enemy"
action = "modify_attribute"      # 新增
attr = "灵敏"                     # 新增
value = { percent = -0.2 }
```

实现：挂载时向修正层 push，到期/移除时出栈。**不需要任何「恢复」逻辑** —— base 从未被修改。加载期校验：`action = "modify_attribute"` 必须带 `attr` 且该属性已定义。

## 7. 缓存与失效

- **必须缓存**：NPC 全量结算是每 `game:time_advanced` 一轮（500 NPC 量级）、外加派生脚本，无缓存会吃穿单轮 100ms 预算。
- **版本号失效**：两级版本，命中即用缓存。
  - **实体级** `attrVersion`：下列事件 bump → 该实体全部缓存派生值失效：
    - 任何 base 写入（`setEntityAttr` / `bindingResolver.set*` / `settlement.applyChange`）
    - 修正栈变更（push / pop / 到期）
    - 能力表、天赋表、装备穿戴状态变更
    - 时间推进导致的跨天状态到期
  - **全局级** `dataVersion`：mod 数据定义（abilities / talents / items / attributes / status-effects）变更时 bump → 所有实体缓存失效。用于 mod 热重载与读档重建。
  - 时间推进导致的跨天状态到期
- **不要求作者声明依赖**（D7）：`compute` 脚本读什么是脚本内部的事，静态推不出依赖图。因此不做静态循环检测，改用运行期深度护栏。

## 8. 连带影响

| 影响面 | 说明 |
|---|---|
| **条件表达式** | `condition-engine` 走 `getEntityAttr` → 自动看到有效值。这是「全局」的应有之义，但写条件时必须意识到**临时修正会计入判断**。需写进 `docs/attributes-system.md` 与条件手册 |
| **存档** | 只存两样：`base` + 跨天时长类修正（剩余时长与来源）。声明式修正随状态重建；战斗内修正战斗结束清 |
| **UI** | 面板显示有效值即自动正确（无需改 UI 代码）；但「基础值 vs 有效值」的差异呈现（如 `120 (+15)`）不在本次范围 |
| **零回归基线** | T1 不含任何来源接入时，管线是恒等变换（无 compute、无修正 → 读出 == base），现有全量测试应逐位不变 —— 这是本设计最重要的安全性质 |

## 9. 分阶段实施

### T1 core：读取管线骨架（零回归基线）
- 新增叶子模块 `src/core/attribute-eval.ts`：闸门（§4.1.1）+ 修正栈 + 叠加代数 + 缓存与版本号失效 + 注入接口
- `entity-utils.ts` 的 `getEntityAttr` 变「先算裸值 → `readEffective`」；`setEntityAttr` 写后 bump；`bindingResolver.get*` 自动继承
- `mod-loader.ts` 在 `registerFromAttributes` 之后注入属性定义
- 修正栈代数复用通道语义（`flat=0` 跳过、`set` 即使为 0 也记录）
- **compute 只留桩**（闸门认 `compute` 字段但执行函数在 T2 接入）；**不含任何来源接入**
- 验收标准 = 全量测试逐位不变（`npm run test` 当前基线 1642 通过 / 5 跳过）

### T2 core：compute 派生
- 脚本解析器注入（`mod.scripts` 按文件名）+ `new Function('base','attrs',…)` 严格模式执行
- 加载期校验（`compute` 指向的脚本存在且非空）；运行期抛错/非有限数回退 + 上报
- 递归深度护栏 + 断链上报
- ⚠️ 无超时保护（§4.3），以文档约束「必须纯同步且快速」

### T3 声明式来源接入
- 装备/服装：`attribute_mods`（随穿戴；与 `clothing-system` 的穿戴状态联动）
- 被动技能 / 战斗天赋：`attribute_mods`（随拥有；`per_level` 按技能层数）
- 内功装配：`equipped_mods`（装卸即生效失效）

### T4 运行时来源接入
- 脚本/API 直挂（`registerModifier` / `removeModifier`，可带自定义时长与条件）
- 带跨天时长的临时状态（`attribute_mods` + `duration`；随存档序列化与恢复；`game:new_day`/时间推进到期）

### T5 战斗效果落点
- `combat-base` 注册 `modify_attribute` 战斗动作 + 效果 schema 加 `attr` 字段
- 挂载/到期与修正栈 push/pop 对接；`combat-wuxia` 的库条目校验加对应规则

### T6 文档
- `docs/attributes-system.md`：补「有效值 vs 基础值」「compute 契约」「条件表达式的可见性」
- 生成/更新属性手册（与条件手册同源的部分）

### 实施切分建议（三个计划）

六个阶段不宜塞进一个计划 —— 它们是可独立验收的三块：

| 计划 | 范围 | 为什么能独立验收 |
|---|---|---|
| **计划一（建议先做）** | T1 + T2：core 读取管线 + `compute` 派生 | 零回归基线 + 派生能力自足：不含任何来源接入，做完 mod 就能用 `compute` 声明派生属性，且现有 1642 例测试逐位不变 |
| 计划二 | T3 + T4：声明式与运行时来源 | 依赖计划一的修正栈；各大来源（装备／被动天赋／内功装配／跨天状态）可分别验收 |
| 计划三 | T5 + T6：战斗效果落点 + 文档 | 依赖计划一的 push/pop；T5 体量很小，可与计划二的任一批次合并 |

## 10. 验证要点

**单元（T1/T2）**
- 三层管线：无修正无公式 = 恒等；仅 flat；仅 percent；flat+percent（`(base+flat)×(1+percent)`）；`set` 覆盖基准；`set 0` 归零
- 多来源叠加：`+10%` 与 `+20%` → ×1.30（非 ×1.32）
- 缓存失效：base 写入后重算；修正 push/pop 后重算；不同实体互不干扰
- 派生：compute 脚本读其他属性；脚本抛错回退 base；深度超限断链上报

**集成**
1. 战斗中挂「灵敏 −20」→ 命中率与伤害公式跟着变 → 效果到期 → **自动恢复**（无恢复代码）
2. 装配内功 → 属性（及上限）变化 → 卸下回落
3. 派生属性随根骨变化：根骨 −10 → 最大气血按公式下降；根骨回正 → 回升
4. **读-改-写清扫（2026-09-22 已完成）**：`hpmp-growth` 的 `HP_MAX = get + n` 曾是**经有效值读取器**的
   读-改-写（`getEntityAttr` 读有效值 → `setEntityAttr` 写基础值）。派生或修正一旦存在，
   `get` 的值里已含修正/公式，回写就把**修正烘焙进 `base`**，下次读取再叠一次 —— **无界膨胀**。
   （本设计初稿曾断言「成长项进 base、公式叠加其上」是错的：那只对"读基础值"的实现成立。）

   **已完成**：5 处站点（`settlement-context` / `hpmp-growth` / `sleep-system` / `combat-base` 吸内削上限 /
   `effect-system` 绑定回退）全部改为在**基础值域**做读-改-写，并新增两个机制：
   - `applyAttrDelta(entity, attr, delta, { clamp?, max? })`（core）：读基础 → 加 → 钳制 → 写基础，原子
   - `bindingResolver.getRaw(id, key)`（core）：绑定键 → 基础值（`get` 仍是有效值）
   防回归：`src/core/entity-utils.test.ts`（`applyAttrDelta` 组，含**反证**用例：误用有效值就复现膨胀）+
   `src/plugins/h-core/settle/hpmp-growth.test.ts`（真实站点回归）。变异验证：把 `applyAttrDelta` 的读改回
   有效值 → `expected 1006 to be 506`（+500 修正被烘焙进 base）。
   规则与作者侧说明见 `docs/attributes-system.md`「写路径契约」的 ⚠️ 段。
5. 条件表达式看到有效值（临时修正计入判断）
6. 跨天状态：存档 → 读档 → 剩余时长与修正均正确恢复；到期后属性回落

## 11. 不做（YAGNI）

- 不做 `attribute-mods.toml` 库模式（D4：数值与使用处同文件）
- 不做修正的静态依赖图 / 静态循环检测（D7：运行期护栏）
- **读-改-写站点**：原计划一"不改动任何现有写入路径"，但全分支审查发现 5 处读-改-写会被有效值层污染，
  故**已在计划一内清扫**（§10 验证要点 4；只改「读的一半」+ 新增 `applyAttrDelta`/`getRaw`，
  写入语义与封顶数值逐位不变）。除此之外不改动其他写入路径
- 不做「每层成长按当前层数实时派生」（D5：历史累积即得）
- 不做 UI 的基础值/有效值差异呈现
- 不做秘籍/技能系统本身（本设计只提供属性层能力，秘籍是消费方）

## 12. 范围之外（后续独立议题）

- **技能威力公式**：`威力 = 固定值 | 与某项有关的公式`。技能威力**不是属性**，它属于技能 schema（写在技能定义里）。本设计完成后，威力公式只是属性读取的一个消费方，需单独设计。
- **秘籍系统**：秘籍层数、每层成长发放、x 层/10 层奖励、修炼门槛与经验公式（含品级表驱动的自动成长）。D5 已定「每层成长 = 练到时写一次 base」，故它不需要本设计之外的新机制，但发放时机与去重需要自己的设计。
