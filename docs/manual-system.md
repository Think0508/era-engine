# 秘籍-技能系统（manual-system）

> 版本 1.0.0（2026-09-23）｜插件：`src/plugins/manual-system/`｜设计裁定见 `docs/superpowers/specs/`
> 相关：`docs/ability-progression.md`（技能经验机制）、`docs/attributes-system.md`（装配加成走属性有效值层）、
> `docs/talent-system.md`（天赋）、`docs/item-system.md`（卷册物品）

---

## 一、一句话与三层结构

**秘籍是知识，卷册是物品，修炼烧经验，层数长在角色身上。**

| 层 | 是什么 | 在哪 |
|---|---|---|
| **秘籍（知识）** | 层表：每层给什么成长/技能/天赋；经验曲线；门槛；知识上限 | `definitions/manuals.toml`（或 `definitions/manuals/*.toml`） |
| **载体（卷册物品）** | "持有即解锁修炼"的凭证，并决定**能练到几层** | `definitions/items*.toml` 的 `manual_access` |
| **进度（角色状态）** | `char.manuals[秘籍ID] = { level, cap_unlocked? }`——永久、单调不减 | 存档（角色实体字段） |

由此得到三条硬语义（都有测试钉死）：

1. **进度不随物品走**：卖出/被偷/消耗掉卷册，已练层数、已发成长、已得技能与天赋全部保留；只是**不能再往上练**（上限归零）。剧情物品消耗后仍想继续练 → 用 `unlock_manual_cap` 写永久解锁。
2. **发放只发生在层数 +1 的那一次**：层数只增 → 不会重复发放。秘籍数据改动对老存档**不追溯**（存档权威）。
3. **上限只在增长时钳制**：`cap` 只决定"还能不能往上练"，**永不回退**已存层数。

---

## 二、修炼

### 2.1 一次修炼做什么

```
门槛（整本 requires + 该层 layer_requires）→ 上限 cap → 经验足够
  → 扣「经验」 → 层数 +1
  → 每层成长（属性，永久写基础值）
  → 该层层奖励（属性奖励永久写基础值；技能/天赋授予）
  → 同步该秘籍授予的"分层被动技能/内功"层数
  → 补升"依赖该秘籍且已满经验"的主动技能
  → 事件 manual:layer_gained + 叙事日志
```

任一条不满足即**停**：不扣经验、不发任何收益，原因写进返回值的 `reasons[]`（UI 直接显示）。

### 2.2 门槛（`requires` / `layer_requires`）

- 形状 = **condition 表达式**（复用条件引擎，加载期校验字段路径；写错字段会在加载期报文件名+行号）。
- 作用域：`selected.` 指**修炼者本人**（口诀：门槛里的 `selected.` = 正在练这本秘籍的人），`player.` 指玩家。
- 整本门槛写 `requires`；某层额外门槛写 `[[manuals.X.layer_requires]]`（`layer` + `condition`）。
- 条件引擎的字段都在《可用条件属性手册》里——不知道能写什么就查手册。

### 2.3 经验

- 经验池 = `manual-config.toml` 的 `exp_attr`（默认属性「经验」）。
- 每层消耗：`base × ratio^(层数−1)`。`base` 取品级表的 `xp_base`（内功秘籍取 `xp_base_internal`），
  也可在秘籍里自设：`xp = { base = 55000, ratio = 1.15 }`（极个别特殊秘籍）。
- 经验来源：击败敌人（见 §六）+ 任务/GM 的 `grant_exp` effect。

### 2.4 UI

- 「秘籍」面板（主菜单指令，或秘籍物品的 `open_manual_panel` effect）：列表显示 层数 / 可练上限 / 下一层消耗 / **受阻原因**；按钮「修炼一层」「连修（到不能修为止）」。

---

## 三、层奖励与成长

```toml
layer_growth = [ [ { attr = "拳掌系数", range = [2, 6] }, { attr = "气血上限", flat = 150 } ] ]
```
- **每层成长**：显式 `layer_growth` 优先；不写且 `kind = "skill"` → 按品级表 `coeff_bands` 在层区间内 roll，落到 `category` 映射的系数属性。
- 品级表的 `auto_growth`（武学常识之类）**恒追加**（与是否手写无关）。
- 所有成长都是**永久写基础值**（`applyAttrDelta`），不是临时修正。

```toml
[[manuals.九阴真经.layer_rewards]]
layer = 10
talent = "九阴天赋"                              # 授予天赋
ability = "摧坚神爪"                             # 授予技能
attributes = [ { attr = "轻灵", flat = 12 } ]     # 属性奖励（**永久写基础值**）
```

**授予规则**（参考口径）：
- 已有该技能/天赋 → **跳过**（视为该奖励不存在）；
- 例外：该技能/天赋**分层**且目标层更高 → 提升到目标层（"事件给的层级更高"那条）；
- `max_level = 0` 的技能 = 无等级被动技能 → 记为 1 级（完全体，获得即完整）。

### 3.1 分层被动技能 / 内功（层数随秘籍）

- **分层被动技能**（含内功）= `type = "passive"` 且 `max_level > 0`：其层数 = `min(自身 max_level, max(依赖秘籍的已修炼进度))`，在"秘籍升层"与"被授予"两处同步，**只升不降**。
- **主动技能**（`type = "active"`）**不同步层数**：它靠"用"涨经验（见 §五），上限由秘籍进度钳制。
- 「已修炼内功」= **`passive_kind = "内功"`** 的被动技能；在角色面板单独一栏显示（不写这个字段也能用，只是不进那一栏）。
  被动四类：**内功 / 护体 / 轻功 / 异术**（角色面板对应四栏）。⚠️ 这是**字段**不是标签：
  主动技能的系别是 `category`（七系），被动类别是 `passive_kind`（四类），所以"异术"在两侧同名也不会混
  （见 AGENTS「能力类别词表」；按类别查用 `combat-wuxia.getPassivesByKind`）。

### 3.2 依赖关系只有一处真相

- 技能↔秘籍的依赖由**秘籍层表自动反向索引**（谁在几层授予了它 → 它依赖那些秘籍）。
  **技能定义不要写依赖**（双写必然漂移）。
- 逃生口：能力定义可写 `capped_by = [秘籍ID]`（事件直接给的技能也要被某秘籍钳制时），与自动索引取并集。

---

## 四、内功装配

```toml
[abilities."龟息功"]
name = "龟息功"
type = "passive"
max_level = 10
tags = ["combat_passive", "内功"]
equipped_mods = [ { attr = "气血上限", flat = 200, per_level = 50 }, { attr = "根骨", flat = 3 } ]
```

- **写了 `equipped_mods` 就是可装配**（没有独立 boolean 字段）。
- 装配状态 = 角色字段 `equipped_abilities`（能力 ID 数组，随存档）；加成只在装配期间生效——
  属性有效值层的第 4 个声明式来源（装/卸即生效/回落，**没有任何"恢复"代码**）。
- `per_level` 的缩放基准 = **该内功的当前层数**（= 秘籍进度），公式：`flat + per_level × (层数−1)`。
- **槽位**：数量来自属性「内功位」（`manual-config.slot_attr`）的**有效值**；`-1` = 无限。
  "学一门武功 +1 内功位 / 内功位无限"用普通属性修正即可：
  `attribute_mods = [ { attr = "内功位", flat = 1 } ]` / `{ attr = "内功位", set = -1 }`。
- **不搞互斥组**：只受数量限制（要互斥用条件/事件）。
- API/effect：`internal.equip/unequip/list/slots`；effect `equip_internal` / `unequip_internal`。UI 在角色面板「已修炼内功」栏。

---

## 五、技能经验（用技能涨层）

| 事项 | 规则 |
|---|---|
| 闸门 | **玩家本人 或 跟随/在队者**（`follow.isFollowing`）；其他 NPC 用技能**不计**（跟随插件未启用 → 只有玩家）。队友系统落地时只换这一个谓词 |
| 时机 | 战斗内、**内力已扣**、行动未被 `action_block` 作废 → 记一次（`combat:skill_used`）；命中与否不影响（经验是练招的报酬，不是打中的报酬） |
| 数量 | `悟性(有效值) × xp_per_wit`（默认 ×10） |
| 每级所需 | 品级表的 `xp_base_skill × ratio^(等级−1)`；能力自设 `xp_curve = "geometric"` 时用自己的 |
| 蓝耗 | 技能**写了 `cost` 就用它**；没写 → 按**秘籍品级表**的 `cost` 自动匹配（三流 170 … 绝世 8500）。解析器在 `combat-base`（`combat.getSkillCost` / `registerSkillCostProvider`），战斗内校验、扣减、可用技列表、指令标签全走同一口径 |
| 层数上限 | `min(能力 max_level, 依赖秘籍的已修炼进度最大值)`；**该角色对这些秘籍毫无进度 → 不钳制**（NPC 直接授权的技能走这条） |
| 到顶 | xp **钳在"下一级所需"**（保持满值，不无界累加）；秘籍升层后立即补升（`recheck`） |
| 无等级技能 | `max_level = 0` → 视为 1 级永久，不参与经验 |

---

## 六、经验经济（击败结算）

- 监听 `combat:end`：玩家在参与者里且**胜** → 对每个敌方结算 `血量上限 / kill_exp_divisor`（默认 ÷10）。
- **首杀**（该玩家首次击败"这类敌人"）× `first_kill_multiplier`（默认 ×3）；
  账本 `char.kill_ledger[键]`，键 = `实体.template ?? 实体.id`（模板实例化的敌人带 `template`，roster 角色数据本就有）。
- 绑定键 `hp_max` **没有绑定**时静默跳过（= 该 mod 没接入击破经验）；绑定存在但数值非正 → warning + 跳过该敌人。
- 全部数值在 `manual-config.toml`：`kill_exp_divisor` / `first_kill_multiplier` / `xp_per_wit`。
- 任务/GM 给经验：effect `grant_exp { amount }`。

---

## 七、数据格式速查

### 7.1 秘籍（`definitions/manuals.toml` 或 `definitions/manuals/*.toml`）

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | ✅ | 显示名 |
| `tier` | ✅ | 品级（键须在 `manual-tiers.toml` 的 `tiers`） |
| `kind` | | `skill`（缺省，纯技能秘籍）/ `internal`（内功秘籍）/ `passive`（被动技能秘籍）——只影响经验列与是否自动系数成长；与被动类别 `passive_kind = "内功"` 是两件事 |
| `category` | kind=skill 必填 | 武功类别（拳掌/指腿/刀剑/奇兵/暗毒…须在 `category_attrs` 有映射） |
| `max_layer` | | 知识上限，缺省 10 |
| `layer_growth` | | 每层成长列表（`attr` + `flat` 或 `range = [min,max]`） |
| `layer_rewards` | | `[[manuals.X.layer_rewards]]`：`layer` + `ability`/`talent`/`attributes` |
| `requires` | | 整本门槛（condition，`selected.` = 修炼者） |
| `layer_requires` | | `[[manuals.X.layer_requires]]`：`layer` + `condition` |
| `xp` | | 自设经验曲线 `{ base, ratio? }`（覆盖品级表） |

### 7.2 品级表（`definitions/manual-tiers.toml`）

```toml
[manual-tiers.category_attrs]
"拳掌" = "拳掌系数"

[manual-tiers.tiers."三流"]
xp_base = 250                 # 纯技能秘籍第 1 层
xp_base_internal = 1250       # 内功秘籍第 1 层（= 纯技能 × 5）
xp_base_skill = 200           # 技能第 1 级
cost = 170                    # 技能蓝耗（技能没写 cost 时按品级自动匹配）
ratio = 1.15
coeff_bands = [ { from = 1, to = 3, min = 1, max = 1 }, … ]   # 层区间 → 每层 roll 范围
auto_growth = [ { attr = "武学常识", flat = 1 } ]              # 每层恒有
```

### 7.3 卷册物品（`definitions/items*.toml`）

```toml
[items."九阴人皮"]
name = "九阴人皮"
type = "key"
stackable = false
consume = false                                  # 不是消耗品
tags = ["manual", "kungfu"]
effects = [ { type = "open_manual_panel", params = { manual = "九阴真经" } } ]
manual_access = { manual = "九阴真经", cap = 5 }  # cap 省略 = 该秘籍 max_layer
```

### 7.4 插件配置（`definitions/manual-config.toml`，可整段省略用默认）

```toml
[manual]
exp_attr = "经验"        # 修炼消耗的经验池
slot_attr = "内功位"      # 可装配数量（-1 = 无限）
wit_attr = "悟性"        # 技能经验基准属性
xp_per_wit = 10
kill_exp_divisor = 10
first_kill_multiplier = 3
```

---

## 八、API / effect / 事件

```typescript
// 秘籍（namespace: manual）
ctx.api.call('manual', 'getState', charId, manualId)     // → { level, cap, maxLayer, nextCost, canPractice, reasons[], heldVolumes[] } | null
ctx.api.call('manual', 'listManuals', charId)            // → ManualState[]（持有载体的 + 已修炼的）
ctx.api.call('manual', 'practice', charId, manualId, layers)  // → { ok, gained, reasons[] }；layers=0 = 连修到底
ctx.api.call('manual', 'grantLayer', charId, manualId, toLayer)  // 剧情直给层数（不走经验与门槛）
ctx.api.call('manual', 'unlockCap', charId, manualId, cap)       // 永久提升上限（只增不减）
ctx.api.call('manual', 'getConfig')                      // → 生效中的配置

// 内功装配（namespace: internal）
ctx.api.call('internal', 'equip', charId, abilityId)     // → { ok, reason? }
ctx.api.call('internal', 'unequip', charId, abilityId)
ctx.api.call('internal', 'list', charId)                 // → string[]
ctx.api.call('internal', 'slots', charId)                // → { used, total, unlimited }
```

**effects**：`practice_manual`{manual, layers?}、`learn_manual_layer`{manual, layer}、`unlock_manual_cap`{manual, cap}、`equip_internal`{ability}、`unequip_internal`{ability}、`grant_exp`{amount}、`open_manual_panel`{manual?}。
**事件（发出）**：`manual:layer_gained`{character, manual, layer}、`manual:cap_unlocked`、`internal:equipped`、`internal:unequipped`。
**事件（监听）**：`combat:skill_used`（标准事件，战斗域）、`combat:end`。
**UI 事件**：`ui:open_manual_panel`{manual}（engine-ui-bridge → 「秘籍」面板）。

**条件路径**（可直接在口上/任务/指令里写）：
- `character.{id}.manuals.{秘籍ID}.level` / `.cap_unlocked`（number）
- `character.{id}.equipped.{能力ID}`（boolean，是否装配中）
- 是否学过某内功 → 直接用现成的 `character.{id}.abilities.{内功ID}.level >= 1`

---

## 九、与其他系统的交互

| 系统 | 交互 |
|---|---|
| 物品/背包 | 卷册 = 普通物品（可买卖/被偷）；`manual_access` 让它同时是修炼凭证 |
| 属性有效值层 | `equipped_mods` 是第 4 个声明式来源；每层成长/属性奖励走 `applyAttrDelta` 写**基础值** |
| 能力升级 | 秘籍系统注册"外部层数上限"与"外部经验曲线"两个提供者；升层后调 `recheck` 补升 |
| 战斗 | 用技能 → `combat:skill_used`；战斗结束 → `combat:end`（含 `enemies`） |
| 跟随系统 | 技能经验闸门用 `follow.isFollowing` |
| 任务 | `learn_manual_layer` / `unlock_manual_cap` / `grant_exp` 三个 effect；残本合成 = 普通物品增删 |
| 天赋 | 层奖励引用 `talents.toml` 的天赋 ID（不在此定义天赋） |

---

## 十、常见坑

| 症状 | 原因 |
|---|---|
| 面板里"未持有该秘籍" | 没有 `manual_access` 的载体物品，或载体被卖了（进度还在，只是不能继续练） |
| 只能练到第 5 层 | 手上是残本（`cap = 5`）；要更完整就换载体，或用 `unlock_manual_cap` |
| 技能练到某层就不动了 | 秘籍进度就是上限（`max_level` 或 cap）。提示：技能 xp 会**停在满值**，秘籍再升一层即自动补升 |
| 技能写在第 2 层给"分层数被动技能" | 合法：它的层数按"依赖秘籍的进度"同步（不必非在第 1 层给） |
| `[manuals.九阴真经]` 报 TOML 语法错 | TOML 的**裸键不能含中文**：必须写 `[manuals."九阴真经"]` |
| 改了秘籍层表，老存档没变化 | 存档权威：已发放不追溯。要补，用 `learn_manual_layer` |
| 直接 `set_field` 写 `manuals.X.level` | **会长出层数但不发成长/技能**。唯一支持的写法是 `practice` / `learn_manual_layer` |
| 内功位写 `set = -1` 却没生效 | `-1` 是"无限"的哨兵值，由本系统解释；属性本身仍是普通数字 |

---

## 十一、文件索引

| 内容 | 文件 |
|---|---|
| 插件入口（effect/API/事件注册） | `src/plugins/manual-system/index.ts` |
| 定义读取与反向索引 | `src/plugins/manual-system/context.ts` |
| 进度/上限/修炼/发放/授予/同步 | `src/plugins/manual-system/manual.ts` |
| 内功装配 | `src/plugins/manual-system/internal.ts` |
| 击败经验与首杀账本 | `src/plugins/manual-system/economy.ts` |
| 技能经验/层数钳制/补升 | `src/plugins/manual-system/skills.ts` |
| 默认属性与配置 | `src/plugins/manual-system/data/default/attributes.toml`、`manual-config.toml` |
| 加载期校验 | `src/core/mod-validate.ts` 的 `validateManualDefs` / `validateAbilityXpGrowth` |
| 属性层装配来源 | `src/core/attribute-eval.ts`（`equipped_mods`） |
| UI | `src/ui/components/ManualPanel.vue`、`CharacterPanel.vue`（已修炼内功/秘籍） |
| 测试 | `src/plugins/manual-system/manual-system.test.ts`、`manual-validate.test.ts` |
