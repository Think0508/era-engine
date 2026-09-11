# 战斗系统（combat-base + combat-wuxia）

> 2026-08-31 合同 v1.0 落地重写：战斗本地管线（相位结算 + 效果区 + 隔离回写）。
> 2026-09-11 修订（合同 v1.1）：公式修订 + **公式中间量通道**（效果与天赋可给公式的某一步加值）+
> 补齐 `action_pre` + 修正五个相位的统计被静默丢弃 + 命中不截断。
> 2026-09-11 v1.2：**毒伤害** + 「挂状态」类别 + 第 9 个通道「毒伤害」。
> 2026-09-12 **v4.0（本版）**：**战斗效果 = 库定义 + 技能引用**（参数白名单覆盖）·
> 数值三形态 + 每层乘性 `growth` · `delivery`/`settle`/`apply_at` 三相位字段 · **施加器**机制 ·
> 新增 3 个通道（准头 / 力道项 / 灵敏项）· 毒合并为单条层数模型 · 火毒寒毒冰火相消 ·
> 删除 `apply_status`/`apply_effect`/`mode`/`k`/`merge_group` 与隐式 `×层数` 缩放（不留兼容分支）。
>
> 唯一权威公式实现：`src/plugins/combat-wuxia/formula.ts`；通道机制：`src/plugins/combat-base/formula-channels.ts`；
> **效果条目解析：`src/plugins/combat-base/effect-entry.ts`**（字段语义以此文件为准）。

## 做什么

回合制战斗骨架 + 武侠公式层。combat-base 提供**战斗本地管线**：战斗孤立场景（hp/mp 快照隔离、
结束回写）、回合循环（每轮重排行动序 + 先攻碾压连动）、18 相位攻击管线、效果区、公式中间量通道、反击/递归防护、
死亡/复活、permanent 吸收回写；combat-wuxia extends combat-base，覆盖武侠公式钩子、注册通道与施加器、
编译被动/天赋。

发出标准事件 `combat:request` → `combat:start` → `combat:turn`（每行动）→ `combat:end`。

## 战斗效果条目（v4.0）

**一个效果 = 库定义（`definitions/battle-effects.toml`）+ 技能引用（`abilities[].battle_effects`）。**

### 先分清两个东西（本节的术语基准）

| 叫法 | 是什么 | 住在哪 | 生命周期 |
|---|---|---|---|
| **战斗效果条目**（技能词条） | 技能上挂的"这一招会干什么"：`{ effect = "流血", chance = 0.3 }` | 静态数据：`abilities[].battle_effects` → 库里 `[effects.X]` | 每个相位现造现弃（id = `技能名#效果名`），**从不进入效果区** |
| **战斗状态**（BUFF / DEBUFF） | 真正挂在人身上、会显示在效果区里的东西 | 运行时：`combatant.zone`（`getCombatState().combatants[x].effects`） | 驻留，带 `stack` / `remainingTurns`，id = **库条目名本身** |

判据就是库条目的 `delivery`：**`instant` = 技能词条**（就地执行）、**`zone` = 战斗状态**（挂到身上）。
技能 A 一下让对手出现【流血】，前者是词条、后者是状态——是两个对象。

效果区里的状态按 **`origin`（来源）** 分三类，`getCombatState` 会一并返回，UI 据此分组即可（不必解析 id 字符串）：

| `origin` | `originId` | 谁弄进来的 | 例子 |
|---|---|---|---|
| `skill` | 技能名 | 技能词条挂上去的（被技能 A 出来的 BUFF/DEBUFF） | 命中后挂上的【流血】 |
| `passive` | 被动技名 | 被动技在战斗开始时常驻编译（id = `passive:能力#条目`） | 内功心法引用的【回血】（整场） |
| `talent` | 天赋名 | 战斗天赋同上（id = `talent:天赋#条目`） | 天赋给的常驻减伤 |
| `system` | — | 插件 API / mod 脚本直接挂 | `mountEffect` 调用 |

> 同一个库条目被谁引用，决定它会不会进效果区、以及以什么来源出现：主动技引用 `instant` 条目 → 当场执行不进区；
> 主动技引用 `zone` 条目 → 命中/使用时挂上（`origin=skill`）；被动/天赋引用**任何**条目 → 战斗开始就常驻进区
> （`origin=passive|talent`，时长强制 `battle`）。

**为什么非要 `origin` 不可**（三条用途，按"硬"到"软"，缺了它就得解析 id 字符串——格式一改就静默失效）：

1. **驱散 / 净化类效果的正确性判据**。"清除目标身上全部负面状态"必须**只清 `origin='skill'` 的**——
   被动技/天赋给的是"你会什么"（内在能力），不该被一发净化打掉；反过来"卸除增益"也一样。
   没有 `origin`，这类效果迟早会误伤常驻条目。
2. **UI 显示口径**。常驻条目的 `remainingTurns` 恒为 0，面板该显示**"常驻"而不是"0 回合"**；
   而且 BUFF 区通常只列"被挂上去的"，被动/天赋常驻应折叠或单列——两者靠 `origin` 分开，不靠名字猜。
3. **日志归因**。能写「【内功心法】回复 200 气血」而不是一句无主语的"回复 200 气血"；
   调试时也能一眼看出这条状态是怎么进来的。

**跨来源同名：按来源各自独立，不合并**（这是有意为之，别改成"同名一份"）：

- **技能 ↔ 技能**：同名 = 同一个 id（库条目名）→ **按 `merge` 正常合并/刷新**。
  两个不同技能都挂【流血】，目标身上只有一份，重复命中刷新时长/叠层——这是预期行为。
- **技能 ↔ 被动/天赋**：id 不同（被动/天赋用 `passive:能力#条目` 复合键）→ **两条独立实例，各算各的回合**。
  理由：**合并会让"临时叠加"类技能变成废招**——若玩家身上已有被动给的常驻【回血】，合并后
  技能那条要么被降级成 5 回合、要么被常驻吞掉（时长取久者），用了等于没用；分开才能让玩家
  实打实感觉到"我多垫了一层"。反过来，被动常驻也不该被一个临时技能顶掉。
- 由此：**"同名一份"的唯一性规则是「同 id 一份」**。想让某效果在一个人身上绝对只有一份，
  就让所有来源走同一侧（全写在技能里，或全写在被动里）。
- 结构上的兜底：被动/天赋的条目**只能挂到持有者自己身上**（`addResolvedEffect` 只往本人 zone 推），
  所以这种同名并存只可能发生在**自身 BUFF**，永远不会污染敌方 DEBUFF。

```toml
# ① 库定义：时机、目标、落地方式、结算动作、默认参数
[effects."火毒"]
name = "火毒"
description = "每回合开始受到 5% 气血上限伤害（每层 ×1.5），持续 5 回合；化解自身寒毒并引爆敌方寒毒"
delivery = "zone"
target = "enemy"
apply = "apply_element"                     # 施加器（缺省 = mount 直接挂载）
apply_args = { element = "火毒", opposite = "寒毒" }
action = "periodic_damage"                  # zone：结算动作
settle = "turn_start"                       # zone：结算相位
value = { percent = 0.05 }                  # 数值三形态见下
growth = 0.5                                # 每层乘性增量
merge = "strongest"
category = "debuff"
level_names = ["火毒", "烈火毒", "焚身毒"]     # 层数 → 显示名（可选）

# ② 技能引用：只写"引用谁 + 覆盖哪些参数"
[abilities."火毒掌"]
battle_effects = [
  { effect = "火毒", stacks = 2, chance = 0.6 },
]
```

### 字段速查

| 字段 | 取值 | 说明 |
|---|---|---|
| `delivery` | `zone` / `instant`（缺省） | zone = 驻留（挂到身上，按 settle 结算）；instant = 就地执行 |
| `action` | 已注册动作名 | zone：**结算动作**；instant：**执行动作** |
| `trigger` | 相位 | **instant 专用**：发生相位（on_hit / attack_end / action_end / death…） |
| `settle` | 相位 | **zone 专用**：驻留期间的结算相位；**省略 = 常驻修正**（modify_stat/modify_channel 直接进聚合） |
| `apply_at` | 相位 | **zone 专用**：何时施加；缺省按 target 推导 → `enemy`→`on_hit`、`self`→`on_use` |
| `apply` | 施加器名 | **zone 专用**：缺省 `mount`（直接挂载）；`apply_poison`（毒）/`apply_element`（冰火） |
| `apply_args` | 表 | 传给施加器的参数 |
| `target` | `self` / `enemy` | zone：挂给谁；instant：作用谁 |
| `duration` | `{turns=N}` / `"battle"` / `"permanent"` | zone 专用；**省略 → 通用默认 5 回合** |
| `merge` | `refresh`（缺省）/`stack`/`strongest` | 重复施加的合并策略 |
| `max_stack` | 整数（缺省 99） | `merge=stack` 时的层数上限 |
| `value` | 数字 / `{flat?, percent?, set?}` | 数值三形态（见下） |
| `growth` | 数字（缺省 0） | 每层乘性增量：`value × (1 + growth×(层数−1))` |
| `stat` | 统计键 | `modify_stat` 用（见「统计键」） |
| `channel` | 通道名 | `modify_channel` 用（见「公式中间量通道」） |
| `category` | `buff` / `debuff` / `neutral` | 乘势等按此判定 |
| `level_names` | 字符串数组 | 层数 → 显示名（缺省 `名字 x层`） |
| `param_labels` | 表 | 覆盖参数在 UI 里的中文标签（只写要改的） |
| `skill` | 技能 id | `counter`/`cancel` 反击时使用的技能 |
| `max_per_action` | 整数（缺省 1；0 = 不限） | `extra_attack`（追击）每次行动的最大追加次数 |
| `priority` | 整数 | 同相位内**大者先**结算 |
| `condition` | 内置字面量 | `target_has_debuff`/`target_has_buff`/`self_has_debuff`/`self_has_buff` |
| `uses` | 整数 | 触发 N 次后移除（封穴 = 1） |
| `when_skill` | 技能 id | 只在施展该技能时参与 |
| `min_level` | 整数 | 技能等级 ≥ N 才参与 |

### 数值三形态与层数缩放

```toml
value  = 20                              # 固定数（≡ { flat = 20 }）
value  = { percent = 0.05 }              # 比例（基准由动作定义）
value  = { flat = 10, percent = 0.05 }   # 比例 + 固定（先比例后固定）
value  = { set = 0 }                     # 覆盖基准（**仅 modify_channel**）
growth = 0.5                             # 层数 k 的数值 = 基础值 × (1 + growth×(k−1))
```

`percent` 的**基准由动作定义**：

| 动作 | percent 的基准 |
|---|---|
| `periodic_damage` | 受方最大气血 |
| `heal_hp` / `heal_mp` | 自身最大气血 / 最大内力 |
| `leech_hp` / `leech_mp` / `leech_mp_max` / `mp_drain` | 对方最大气血 / 最大内力 |
| `leech_hp_from_damage`（饮血） | **本次实际扣掉的血量** |
| `reflect`（反震） | 受击前的待结算伤害 |
| `modify_stat` / `modify_channel` | 原值（倍数） |

三个"随层数递增"的效果同型（都是乘性）：

| 效果 | value | growth | 层数 1/2/3 |
|---|---|---|---|
| 破绽 | `{percent = -0.5}` | 0.5 | 受伤 +50% / +75% / +100% |
| 火毒·寒毒 | `{percent = 0.05}` | 0.5 | 5% / 7.5% / 10% 气血上限 |
| 毒 | `{percent = 0.01, flat = 0.1×M}` | 0.25 | ×1 / ×1.25 / ×1.5 |

### 技能侧引用（参数白名单）

技能只能覆盖下列参数（**结构字段一律以库条目为准**；越界 → 加载期 error）：

`chance`（0–1，缺省 1，**多段技按段掷**）、`value`、`growth`、`stacks`（施加层数，缺省 1）、
`turns`、`merge`、`max_stack`、`uses`、`priority`、`condition`、`when_skill`、`min_level`。

> 需要给某技能定制结构（换时机/换目标/换动作）→ **单独写一条库条目**，不要在技能里覆盖。

### 合并策略

| merge | 语义 |
|---|---|
| `refresh`（缺省） | 按本次声明的数值/层数重新施加，只重置时长 |
| `stack` | 层数累加（受 `max_stack` 限），基础数值不变（层数由 `growth` 放大） |
| `strongest` | 本次层数 ≥ 现有层数才升级（数值取大），否则只重置时长——弱的一击不降级 |

## 回合数语义（合同，与实际施加时机无关）

| 类型 | `turns = N` 的含义 |
|---|---|
| **常驻型**（破甲/失势/致盲/截脉/缓慢…，无 settle） | 含挂上那回合在内共 N 个回合。挂上时对方**还没动** → 影响 N 回合；挂上时对方**本回合已结束** → 只影响 **N−1 回合** |
| **结算型·turn_start**（流血/毒/火毒/寒毒） | 恰好 **N 次结算**，每次都在该角色行动**之前**（先吃伤害再行动） |
| **结算型·turn_end**（回血/回内） | 恰好 **N 次结算**，在该角色行动**之后** |

实现：`tickDurations(c, phase)` 在角色自己的回合按 `settle` 分桶扣数（`turn_end` 的条目在 turn_end
相位之后扣，其余在 turn_start 相位之后扣）。

> ⚠️ 毒发**不打断**本回合行动：毒在行动前结算，扣完血若角色存活，照常行动；被毒死属于死亡
> （失去行动资格），不是额外的"打断"机制。历史文档里"毒杀可打断该角色本回合行动"的措辞已废弃。

### 先攻碾压连动（2026 修订）

轮初重排行动序时，若某人的**先攻值 ≥ 对方存活者中最快的先攻值 × 2**，本轮多一次连续行动
（2 倍 +1、4 倍 +2、8 倍 +3…，**封顶 +3**，即快方每轮最多 4 动）。行动序展开成 `[A, A, B]`：
快方连动完才轮到对方。

| 规则点 | 语义 |
|---|---|
| 比较值 | **最终先攻值**（`先攻` 钩子返回值 = 轻功系数 + `先攻` 通道），不是裸面板 |
| 比较对象 | **对方存活者中最快者**——必须碾过对方全员才连动（否则带个弱杂兵就能对强敌多打一套） |
| 档位 | `min(floor(log2(自己 / 对方最快)), 3)`；**恰好 2/4/8 倍进档**（浮点带 1e-9 容差） |
| 自己先攻 ≤ 0 | 0 档（双方全 0 都不连动） |
| 对方最快先攻 ≤ 0 | 满档 +3（比值无穷；轻功系数缺失/被压到 0 都落此支） |
| 采样时机 | **轮初冻结**：轮中先攻变化（缓慢/buff 到期/属性被改）**不影响本轮**，下一轮重算 |

**连动 = 完整回合**（不是"额外攻击"）：照跑 `turn_start` / `turn_end` 相位、扣时长、扣内力，因此

- 连动方吃毒/DOT **按自己的行动次数**结算（一轮内多跳）——回合越多越被伤害，是预期的策略博弈；
- 连动方的**自身 buff/减速同样按自己的行动次数更快烧掉**（3 回合的「缓慢」在一轮内就走完），
  即"用减速反制连动"天然偏弱——与上一条是同一枚硬币，属可接受的一致推论；
- 反伤/反击机会按行动次数同倍放大；内力消耗也同倍。

**实现**：`combat-base/index.ts` 的 `EXTRA_TURN_CAP`（常量 3，调平衡改这一行）+ `extraTurnsFor()`
+ `buildRound` 展开 `combat.order`；档位快照在 `CombatScene.extraTurns`，经
`combat.getCombatState().combatants[id].extraTurns` 暴露（`order` 里的重复项即是连动）。
连动**不增加 `combat.round`**（"第 N 轮"日志语义不变）。

## 相位管线

`attack_pre → attack_launch → hit_roll → [miss: attack_miss | on_hit → damage_base → damage_crit →
damage_output → damage_on_target → damage_mitigate → −防御 → damage_taken] → attack_end`；
整招结束 `action_end`（连绵复读）。回合级：`turn_start` / `turn_end`；行动前：`action_pre`（禁技/技能加成）；
使用技：`on_use`；死亡：`death`（复活）。

| 流程 | 相位/钩子 | 可改的中间量（通道） |
|---|---|---|
| 回合初结算（DoT/到期） | `turn_start` + `tickDurations` | 毒伤害（毒系 DoT） |
| 回合末结算（回血/回内/到期） | `turn_end` + `tickDurations(turn_end)` | — |
| 用技能前（禁技/技能加成） | `action_pre`（+`action_block`） | 本次行动：全部通道 |
| 使用技能（扣内力/挂效果） | `on_use` | 全部通道（常驻） |
| 出手前 / 出手时 | `attack_pre` / `attack_launch` | `命中率` `闪避率` `准头` `暴击率`* `暴击倍率`* `武功威力` `风格系数` `其他加成` `防御` |
| 命中判定 | `hit_roll` + `hit_rate` 钩子 | `准头`（攻/守两侧）`命中率` `闪避率` |
| 基础伤害（e1/e2） | `base_damage` 钩子 + `on_hit`/`damage_base` | `力道项`/`灵敏项` `武功威力` `风格系数` `其他加成` `毒伤害` |
| 暴击（e3） | `damage_crit` + `crit_rate`/`crit_mul` 钩子 | 统计键 `crit_rate` `crit_mul` |
| 浮动（e4） | `damage_output` + `float_mul` 钩子 | `浮动系数` |
| 打到对方（e5，取消） | `damage_on_target` | `防御` |
| 真伤害前（护体/反震/反击） | `damage_mitigate` | `防御`；统计键 `damage_in`（正 = 减伤、负 = 易伤，**不截断**） |
| −防御（e7） | `defense_value` 钩子 | `防御`（`set 0` = 无视防御） |
| 受到伤害后（e8） | `damage_taken` | —（本段已结算） |
| 出手结束（命中或未命中） | `attack_end` | ctx 带 `pendingDamage` = **本段实际扣血量** |
| 多段 | 每段独立走完整管线 | 每段各自求值（`chance` **按段掷**） |

`*` = 该阶段目前用既有统计键表达（`crit_rate`/`crit_mul`），未注册通道。

## 战斗效果动作（已注册）

| 动作 | 落点 | 说明 |
|---|---|---|
| `modify_stat` | 统计键 | 常驻（无 trigger）进聚合；有 trigger 则只作用于该相位 |
| `modify_channel` | 公式通道 | 同上；`value.set` 表示覆盖基准 |
| `mount_effect` | zone 引用入口 | 由 combat-base 内建：按库条目的 `apply` 施加器把效果挂到目标 |
| `action_block` | 行动前 | 该次行动作废、轮到下一位（玩家与 NPC 一致） |
| `periodic_damage` | 任意相位 | 按数值扣血（走死亡/复活/受伤害后链路） |
| `heal_hp` / `heal_mp` | 任意相位 | 按数值回复（封顶） |
| `leech_hp` / `leech_mp` / `leech_mp_max` / `mp_drain` | 命中后 | 吸取转移 / 上限吸收 / 削减内力 |
| `leech_hp_from_damage` | attack_end | 按本次**实际扣血量**回血（饮血） |
| `reflect` | damage_mitigate | 反震（按待结算伤害的比例） |
| `counter` / `cancel` | damage_mitigate / damage_on_target | 反击 / 取消伤害（`skill` 指定反击技能） |
| `repeat` | action_end | 复读整招（连绵；`chance` 必须 < 1，再扣内力） |
| `extra_attack` | 命中后 | 追击：同招再打一次（不递归、扣内力、`max_per_action` 限次） |
| `revive` | death | 复活（`uses=1` 一场一次） |
| `poison_dot` | turn_start | combat-wuxia 注册：毒系持续伤害（过「毒伤害」通道） |

## 施加器（zone 型条目的"怎么挂"）

| 施加器 | 说明 |
|---|---|
| `mount`（缺省） | 直接挂载：按 `merge`/`stacks`/`duration` 合并进效果区 |
| `apply_poison`（combat-wuxia） | 先算毒功面板的 M 快照，再以 `{percent: 1%气血上限, flat: 0.1×M}` 挂载 |
| `apply_element`（combat-wuxia） | 冰火相消：挂本元素 → 清自己身上层数 **≤ 本次层数**的对立毒 → 引爆对方对立毒（按层数结算一次并清除） |

插件可用 `ctx.api.call('combat','registerApply', name, fn)` 注册自己的施加器。

## 公式中间量通道（12 个）

| 通道 | 落点 | 语义 |
|---|---|---|
| `先攻` | 每轮行动序 + 连动档位 | 默认 = 轻功系数；`flat=-10` = 缓慢（下一轮生效）。**同时决定连动档位**：比值跨过 2/4/8 倍会整档折算成额外行动，flat 加成会被放大成整回合 |
| `命中率` | 命中判定（攻方） | **0 基准**：flat = 点数、set = 覆盖贡献（如 999 = 必中）；**percent 对 0 基准无效** |
| `闪避率` | 命中判定（守方） | 同上（与「命中率」相减） |
| `准头` | 命中判定的准头 | **比例修正现算准头**（轻功系数×2+灵敏）：`percent -0.5` = 失势、`-0.3` = 致盲 |
| `浮动系数` | 伤害浮动 | 默认 0.9–1.1 随机；`set 1.0` = 稳定输出 |
| `防御` | 最终伤害扣减 | flat = 平加、percent = 倍率、`set 0` = 无视防御 |
| `武功威力` | 伤害分项 | 该段威力（power×威力曲线÷段数） |
| `风格系数` | 伤害分项 | 乘法链内分项（×1.1 类加成） |
| `其他加成` | 伤害公式末项 | flat 平加伤害 |
| `力道项` / `灵敏项` | 伤害公式属性分项 | `percent -0.3` = 截脉（力道减三成；只影响对应轴） |
| `毒伤害` | 毒伤（即时与持续共用） | 受方减免：flat/percent/`set 0` = 免疫毒伤（只作用于伤害数字，不阻止挂毒） |

**语义**：`base′ = set ?? base` → `value = (base′ + flat) × (1 + percent)`；层数缩放由效果数值的
`growth` 在累加前完成。通道只在战斗本地存活（战斗开始编译、复活重建、战斗结束全清）。

## 战斗统计键（7 个）

| 键 | 单位 | 吃哪一项 |
|---|---|---|
| `hit_bonus` / `dodge_bonus` / `crit_rate` | 点数 | `value.flat` |
| `crit_mul` / `damage_out` / `damage_in` / `defense_mult` | 倍率 | `value.percent` |

用错单位（点数组给 percent / 倍率组给 flat）→ 忽略该分量并报一次 warning（**不做静默换算**）。

- `damage_in`：**正 = 减伤**（护体 `+0.3`）、**负 = 易伤**（破绽 `-0.5`）；**不截断**（易伤无上限）。
- `defense_mult`：正 = 加防、负 = 破甲（`-0.5` = 防御 ×0.5 → 公式 `×(1+defense_mult)`）。

## 毒 / 火毒 / 寒毒

**毒**（单条定义 + 层数）：技能写 `{ effect = "毒", stacks = N }`，N = 1/2/3 → 显示名 毒/猛毒/剧毒。

```
M = 该段武功威力 × (1 + 暗毒系数/1000) × 毒功系数 × 毒功精通系数     ← 施加时快照（施加器 apply_poison 算）
毒功系数     = (1 + 技能毒性/1000) × (1 + 人物毒功/50)
毒功精通系数 = 1 + 人物毒功/200
即时毒伤：本段基础伤害 = D(标准公式) + M′       M′ = M 过**受方**的「毒伤害」通道
持续毒伤（该角色自己的回合开始、行动前）= (1%×气血上限 + 0.1×M) × (1 + 0.25×(层数−1)) → 过「毒伤害」→ 扣血
```
- 结算：`turn_start` 相位先结算毒伤 → 再 `tickDurations` 扣回合数；`turns = 8` 恰好 8 次毒发。
- 重复命中：`merge = strongest` → 层数取高、M 取大、回合重置；弱毒不覆盖强毒。
- 持续毒伤**不走**命中/暴击/浮动/防御/取消/反震/反击，也**不吃**通用减伤 `damage_in`。

**火毒 / 寒毒**（施加器 `apply_element`，5 回合）：
1. 敌方得到本次层数的本元素毒（`merge = strongest`）；
2. **自己**身上层数 **≤ 本次层数**的对立毒被清除（高于本级别的留着）；
3. **敌方**身上若有对立毒 → 按其层数立刻结算**一次**伤害（过「毒伤害」）并**清除**（天生不共存）。

## 钩子

覆盖型（子插件独占）：`initiative / hit_rate / base_damage / crit_rate / crit_mul /
float_mul / defense_value / is_attack_skill`
链式：`battle_start / combatant_init（被动/天赋编译）/ turn_start（动态技能指令挂载）/ turn_end`

钩子 ctx 统一带 `channels: { source, target }`；返回值可以是 `number` 或 `{ value, parts }`。

## 武侠公式（combat-wuxia/formula.ts）

- 命中：`准头 = 轻功系数×2 + 灵敏`；`比率 = 攻方准头 /(攻方准头 + 守方准头)`（双方全 0 → 0.5）；
  `命中率 = 90 + (比率 − 0.5)×180 + 攻方 hit_bonus − 守方 dodge_bonus + 通道 ±`，其中准头先过各自的
  「准头」通道（比例修正）——**不截断**。
- 标准系：`base = (力道×3 + 武功威力(L) + 武器基础) × (1+武功系数/1000) × 风格系数 × 精通系数 + 当前内力/25 + 其他加成`；
  属性分项先过「力道项」/「灵敏项」通道。暗毒系以 `灵敏×3` 代 `力道×3`。
- 气功/异术：`scripts/damage_<skillId>.js` 沙箱脚本（返回基础伤害数字）。
- 先攻 = 轻功系数（≥ 对方最快者 2 倍 → 本轮连动 +1，封顶 +3，见「先攻碾压连动」）；暴击 = 福缘/5 + 修正（%点），倍率 1.5 + 加成；浮动 0.9–1.1。
- 防御 = (根骨×0.8 + 定力×0.5) × (1 + defense_mult) → 通道「防御」；最终伤害扣减（伤害 < 防御 = 0）。
- 被动技能（type=passive）与战斗天赋（`modifiers` `combat_*`/`combat_channel`、`talent.battle_effects`）
  在战斗开始时编译进效果区/通道包。

## 数据校验（combat-wuxia onEnable + game:mod_loaded）

- **库条目**：`action` 必须已注册；`trigger`/`settle`/`apply_at` 必须是合法相位；`apply` 必须已注册；
  `merge` 枚举；`value` 形态；`value.set` 仅 `modify_channel`；`modify_stat` 的 `stat` 合法且单位匹配；
  `modify_channel` 的 `channel` 必须已注册；`when_skill` 必须指向已定义技能；`repeat` 的 `chance` 必须 < 1；
  `apply_poison` 必须配 `poison_dot`；`damage_in` 极端值 warning。
- **技能引用**：`effect` 必须存在（列可用名）；**白名单外的字段 → error**；`repeat` 的技能侧 `chance` 必须 < 1。
- **旧字段**：技能写 `effects`（而非 `battle_effects`）→ error 提示改名。
- **技能契约**：category 唯一、power_curve 格式、特殊系脚本存在性。

## API

```
# combat-base
ctx.api.call('combat', 'getCombatState')
    → 战斗快照；combatants[id].effects[] = 效果区里的**战斗状态**
      （name / stack / remainingTurns / category / trigger / value / growth / origin / originId）
ctx.api.call('combat', 'registerHook', name, fn)
ctx.api.call('combat', 'registerAction', name, fn)         # 战斗动作
ctx.api.call('combat', 'registerApply', name, fn)          # 施加器
ctx.api.call('combat', 'resolveEffect', raw)               # {ok, entry} | {ok:false, error}
ctx.api.call('combat', 'mountEffect', entityId, effectId, {sourceId, params, value, turns})
ctx.api.call('combat', 'mountResolved', entityId, entry, {sourceId, value, turns})
ctx.api.call('combat', 'addResolvedEffect', entityId, entry, {id})   # 常驻编译（被动/天赋）
ctx.api.call('combat', 'applyDamage', entityId, amount, {source, kind, triggerTakenPhase})
ctx.api.call('combat', 'registerChannel', {id, label?, description?})
ctx.api.call('combat', 'getChannels') / ('getParamVocab') / ('getEffectCatalog')   # 手册/UI 数据源
ctx.api.call('combat', 'getLastFormula') / ('getFormulaHistory') / ('setFormulaDetail')

# combat-wuxia
ctx.api.call('combat-wuxia', 'getSnapshot', charId)
ctx.api.call('combat-wuxia', 'getUsableSkills', charId)
ctx.api.call('combat-wuxia', 'previewDamage', sourceId, skillId?, level?, targetId?)
```

调试指令：`@公式明细`（主菜单，开关明细输出并打印最近一次公式的全部中间量）。

## Mod 作者使用

- 给技能加效果：`battle_effects = [{ effect = "流血", chance = 0.3 }]`（效果名见
  `docs/native-entries-catalog.md` 的「战斗效果」一节，或 `combat.getEffectCatalog()`）。
- 新效果：在 mod 的 `definitions/battle-effects.toml` 写 `[effects."XXX"]`（与插件默认层同 id 深合并）。
- 调参：`@公式明细` + `combat-wuxia.previewDamage`；战斗测试：主菜单"战斗测试（临时）"。

## 挂账（后续轮）

- 战斗 UI 面板与技能选择视觉（当前为动态指令 + 叙事日志 MVP）；**拖拽式技能编辑器**（数据侧已备：
  `getEffectCatalog` 给出分类/参数/默认值，`getParamVocab` 给出参数中文标签与类型）。
- 战斗内道具（回血丹类）走 UI 轮；装备系统（武器基础 weapon_base 绑定）。
- 战斗外毒换算（status-system `中毒`）；细化的抗毒/解毒设计（`毒伤害` 通道是唯一落点；
  `毒抗性`/`带毒体质` 天赋仍是待重设计的占位）。
- 通道扩展：`暴击率`/`暴击倍率`/`基础伤害` 的 percent/set 形态、技能标签过滤 `when_tag`。
- 把通道暴露进条件字典（如 `combat.风格系数 > 2`）。
- 毒影响 NPC AI 行为（中毒逃跑/求医）。
