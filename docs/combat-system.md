# 战斗系统（combat-base + combat-wuxia）

> 2026-08-31 合同 v1.0 落地重写：战斗本地管线（相位结算 + 效果区 + 隔离回写）。
> 2026-09-11 修订（合同 v1.1）：公式修订（力道×3 平值威力 / 系数÷1000 / 风格÷1000 / 精通÷250 /
> 新命中公式 / 防御 0.5）+ **公式中间量通道**（效果与天赋可给公式的某一步加值）+
> 补齐 `action_pre`（禁技/技能加成）+ 修正五个相位的统计被静默丢弃 + 命中不截断。
> 2026-09-11 v1.2：**毒伤害**（即时并入同一次命中 / 持续在目标回合开始结算）+
> **「挂状态」类别**（默认 on_hit/enemy、默认 5 回合含本回合、重复刷新、`merge_group` 合并）+ 第 9 个通道「毒伤害」。
> 唯一权威公式实现：`src/plugins/combat-wuxia/formula.ts`；通道机制：`src/plugins/combat-base/formula-channels.ts`。

## 做什么

回合制战斗骨架 + 武侠公式层。combat-base 提供**战斗本地管线**：战斗孤立场景
（hp/mp 快照隔离、结束回写）、回合循环（每轮重排行动序）、18 相位攻击管线、
效果区（效果定义库）、公式中间量通道（机制）、反击/递归防护、死亡/复活、permanent 吸收回写；
combat-wuxia extends combat-base，覆盖武侠公式钩子、注册通道、编译被动/天赋。

发出标准事件 `combat:request` → `combat:start` → `combat:turn`（每行动）→ `combat:end`。

## 关键概念

- **战斗孤立场景**：`CombatScene` + `Combatant`（hp/mp/效果区/统计/通道包）只在战斗中存活；
  实体 hp/mp 结束回写（死亡=0 持久）；permanent 类吸收（内力上限）结束合并进实体
  （NPC 缩水存档持久化）；战斗内效果区全清不回写。
- **相位管线**（每段攻击一次）：
  `attack_pre → attack_launch → hit_roll → [miss: attack_miss | on_hit →
   damage_base → damage_crit → damage_output → damage_on_target → damage_mitigate
   → −防御 → damage_taken] → attack_end`；整招结束 `action_end`（连绵复读）。
  回合级相位：`turn_start / turn_end`；行动前相位 `action_pre`（禁技/技能加成）；
  使用技相位 `on_use`；死亡相位 `death`（复活）。
- **效果区**：战斗内第三容器（与 status-system 分离，战斗外状态暂不换算）。
  条目 = 效果定义库（`definitions/battle-effects.toml`）引用或技能效果条目。
  修正型（`modify_stat` / `modify_channel` 无 trigger → 聚合进战斗统计/通道）与触发型（相位点判定）
  统一在区内。骨架字段：`trigger/action/chance/value/target/duration(turns|battle|permanent)/
  stack(refresh|increment|clamp)/priority/category(buff|debuff)/condition/
  recursive/uses/min_level/stat/mode/skill/channel/when_skill`。
- **行动前相位（v1.1 补齐）**：`action_pre` 在**扣除内力之前**执行——被 `action_block` 禁止则
  内力不扣、行动作废（玩家回 IDLE 可改选其他行动，NPC 本回合不出手）；该相位的
  `modify_stat`/`modify_channel` 叠加作用于本次行动的**全部段**。
- **反击链一层**：反击/反震/取消（以柔克刚类）只对主动攻击触发；反击产生的攻击
  跳过对方反击类效果（护体等减伤照常生效）。
- **递归防护**：repeat 类（连绵）`chance < 1` 加载校验；作业队列深度上限 64，
  超限断链 + errorReporter 上报；复读再扣消耗，内力不足不触发。
- **死亡/复活**：检查点 = 每段攻击结算后/回合初结算后/行动后；0 血失去结算资格
  （剩余段纯演出）；死亡相位内复活（神照经：uses=1 一次性，满状态 + 效果区重建，
  重建跳过已消耗被动——consumedEffects）；同归于尽判玩家败。
- **回合节奏**：每轮重排（initiative 钩子，平速 rng）；角色粒度回合：
  `turn_start → 行动 → turn_end`；NPC 自动行动 MVP 随机。

## 战斗流程 ↔ 相位 ↔ 中间量（一张图看懂"效果/天赋改哪里"）

| 流程 | 相位/钩子 | 可改的中间量（通道） |
|---|---|---|
| 回合初结算（毒/到期） | `turn_start` + `tickDurations` | 毒 DoT（毒伤害通道）；到期效果在此扣数移除 |
| 常驻被动不重复加载 | `combatant_init` + `consumedEffects` | 常驻通道随效果区聚合 |
| 用技能前（禁技/技能加成） | `action_pre`（+`action_block`） | 本次行动：全部通道 |
| 使用技能（扣内力/挂效果） | `on_use` | 全部通道（常驻） |
| 出手前 / 出手时 | `attack_pre` / `attack_launch` | `命中率` `闪避率` `暴击率`* `暴击倍率`* `武功威力` `风格系数` `其他加成` `防御` |
| 命中判定 | `hit_roll` + `hit_rate` 钩子 | `命中率` `闪避率` |
| 未命中结算 | `attack_miss` → `attack_end` | — |
| 基础伤害（e1/e2） | `base_damage` 钩子 + `on_hit`/`damage_base` | `武功威力` `风格系数` `其他加成` `毒伤害`(即时毒伤) (+ 统计键 `damage_out`) |
| 暴击（e3） | `damage_crit` + `crit_rate`/`crit_mul` 钩子 | 统计键 `crit_rate` `crit_mul` |
| 浮动（e4） | `damage_output` + `float_mul` 钩子 | `浮动系数`（该相位统计键作用于最终伤害） |
| 打到对方（e5，取消/反击） | `damage_on_target` | `防御` `受伤`* |
| 护体/反震（e6） | `damage_mitigate` | `防御`（+ 统计键 `damage_in`） |
| −防御（e7） | `defense_value` 钩子 | `防御`（`set 0` = 无视防御） |
| 受到伤害后（e8） | `damage_taken` | —（本段已结算，仅记录） |
| 多段 | 每段独立走完整管线 | 每段各自求值 |
| 反击/反伤 | 独立作业（不递归，深度 64 断链） | 同上 |
| 回合结束 / 轮转 | `action_end` / `turn_end` / `advanceTurn` | — |

`*` = 该阶段目前用既有统计键表达（`crit_rate`/`crit_mul`/`damage_in`），未注册通道——见下节判据。

## 公式中间量通道（v1.1 新增）

**要解决的问题**：「风格系数 ×1.1」「命中率 +10%」「防御提高 20%」「无视防御」这类效果/天赋，
此前只能改 7 个固定统计键，公式内部的分项完全摸不到。

**设通道的判据（三条全中才设）**：
1. 天赋/效果常改这个阶段；2. **改属性达不到**（能靠属性 buff 达成的，不设通道）；3. 改了影响本次计算。

按此判据**被剪掉的**：`力道项`/`灵敏项`（= 力道/灵敏属性 buff）、`武器项`（= 装备数据）、
`武功系数`/`精通系数`/`内力项`（= 对应属性 buff 的自然结果）、基础命中率 90 与 K=180（常量，且二者
数学上互相抵消）、`基础伤害`/`受伤`/`暴击率`/`暴击倍率`（已有统计键 `damage_out`/`damage_in`/`crit_rate`/`crit_mul`）。
**机制通用**：以后要加回某个分项 = 注册表加一行 + 公式里读一行。

| 通道 | 落点 | 语义 |
|---|---|---|
| `先攻` | 每轮行动序 | 默认 = 轻功系数 |
| `命中率` | 命中判定（攻方） | 0 基准：flat=点数、percent=倍率、`set 999` = 必中 |
| `闪避率` | 命中判定（守方） | 与「命中率」相减 |
| `浮动系数` | 伤害浮动 | 默认 0.9–1.1 随机；`set 1.0` = 稳定输出 |
| `防御` | 最终伤害扣减 | flat=平加、percent=倍率、`set 0` = 无视防御 |
| `武功威力` | 伤害分项 | 该段威力（power×威力曲线÷段数） |
| `风格系数` | 伤害分项 | 乘法链内分项（×1.1 类加成） |
| `其他加成` | 伤害公式末项 | flat 平加伤害（公式里的 `+ 其他加成`） |
| `毒伤害`（v1.2） | 毒伤（即时与持续共用） | **受方**的减免：flat/percent/`set 0` = 免疫毒伤（只作用于伤害数字，**不阻止挂毒**） |

**语义**：`base′ = set ?? base` → `value = (base′ + flat) × (1 + percent)`；`stack` 按层数缩放。
通道只在战斗本地存活（与统计键同生命周期：战斗开始编译、复活重建、战斗结束全清）。

### 三条作者入口（不写代码）

```toml
# ① 战斗效果库（definitions/battle-effects.toml）：常驻
[effects."飘逸（示例）"]
action = "modify_channel"
channel = "风格系数"     # 必填；未注册通道 → 加载期 error（列出可用通道）
mode = "percent"          # flat / percent / set
value = 0.1
target = "self"
duration = "battle"

# ①b 相位版：只在施展指定技能时、该段攻击前生效（触发一次即消）
[effects."蓄势（示例）"]
action = "modify_channel"
trigger = "attack_pre"
channel = "武功威力"
mode = "percent"
value = 0.3
uses = 1
when_skill = "降龙十八掌"   # 只在施展该技能时参与（未定义技能 → 加载期 error）

# ② 技能自带效果（abilities.toml 的 effects[]，min_level 控制解锁）
effects = [{ trigger = "damage_base", action = "modify_channel", channel = "其他加成", mode = "flat", value = 50 }]

# ③ 天赋 modifier（talents.toml；带 when_tag/when_ability 过滤）
[[talents."剑骨".modifiers]]
formula = "combat_channel"
channel = "风格系数"
when_tag = "刀剑"
multiply = 0.10           # percent；plus = flat
```

### 常用写法对照

| 你想要的效果 | 写法 |
|---|---|
| 命中率 +10%（点数） | `命中率` flat 10（或统计键 `hit_bonus`） |
| 命中率提高 20%（乘法） | `命中率` percent 0.2（旧机制做不到） |
| 出手必中 / 必被闪 | `命中率` set 999 / `闪避率` set 999 |
| 防御提高 20% | `防御` percent 0.2（或统计键 `defense_mult`） |
| 无视防御 | `防御` set 0（旧机制做不到） |
| 伤害提高 20% / 减伤 30% | 统计键 `damage_out` / `damage_in`（不重复造通道） |
| 暴击率 +10 点 / 倍率 +0.5 | 统计键 `crit_rate` / `crit_mul` |
| 该武功威力 +20% | `武功威力` percent 0.2 |
| 风格系数 ×1.1 | `风格系数` percent 0.1 |
| 先手 +50 | `先攻` flat 50 |
| 浮动不再随机 | `浮动系数` set 1.0 |

## 毒与「挂状态」体系（2026-09-11 v1.2）

### 挂状态类别（通用）

技能/效果条目可以在**命中或某相位**把 battle-effects 里的一个**状态**挂到目标身上：

```toml
# abilities.toml —— 毒沙掌带"剧毒"词条（trigger/target 可省略：默认 on_hit / enemy）
effects = [{ action = "apply_poison", status = "剧毒" }]
```

| 规则 | 说明 |
|---|---|
| 缺省时机/目标 | 声明了 `status` 的条目：`trigger` 默认 `on_hit`、`target` 默认 `enemy`（自增益请显式写 `on_use` + `self`） |
| 生命周期 | 词条 `turns` > 状态定义 `duration` > **类别默认 5 回合（含本回合）**；其它 effects 的缺省仍是"整场"，不受影响 |
| 重复命中 | `merge`（词条）> 状态定义 `merge` > 默认 `refresh`（刷新回合数，不叠层）；`strongest` = k 取高、数值取大、回合重置；`stack` = 叠层 |
| 一份状态 | 状态定义可给 `merge_group`（缺省 = 状态 id）：毒的 毒/猛毒/剧毒 三条定义共用组 `毒` → **一个目标只有一份毒**，显示名随最强那一级 |
| 通用动作 | `apply_status`（combat-base，不含任何"毒"语义）；毒用 `apply_poison`（combat-wuxia 注册：先算 M 再挂同名状态） |

> ⚠️ 同名不同层：`status-system` 也注册了一个 effect **type** 叫 `apply_status`（战斗**外**挂 status-system 状态，如 example-mod `打坐.toml` 的 振奋/力竭）。
> 本条讲的是**战斗效果区**的挂状态（战斗动作），作用域、生命周期与减免链路都不同，勿混用。
### 毒（公式与流程）

```
M = 该段武功威力 × (1 + 暗毒系数/1000) × 毒功系数 × 毒功精通系数        ← 施加时快照，写进毒状态
毒功系数     = (1 + 技能毒性/1000) × (1 + 人物毒功/50)
毒功精通系数 = 1 + 人物毒功/200
```
- **技能毒性**在技能侧（技能风格四维的第 4 维 `style.毒性`，可选）；**人物毒功**在人物侧（与轻灵/厚重/巧技同档的永久积累属性）。
  `毒性`/`毒功` **不进**风格系数与精通系数——毒是独立一条线（除数也不同：技能侧 /1000、人物侧 /50、毒功精通 /200）。
- 毒源在技能侧：人物毒功为 0 时 `M = 该段威力 × (1+暗毒系数/1000)`，零毒功角色使毒招照样有毒伤。

**即时毒伤**（与普通伤害同一次判定）：
```
本段基础伤害 = D(标准公式) + M′        M′ = M 过**受方**的「毒伤害」通道
→ 一起走 暴击 → 浮动 → damage_out → 取消 → 护体 → −防御 → 扣血（防御只减一次）
```
**持续毒伤**（简化流程，**目标自己的回合开始时**）：
```
持续毒伤 = (1 + 0.25×(k−1)) × (1%×目标气血上限 + M×0.1)   ← M 为施加时快照
→ 过「毒伤害」通道 → 扣血 → 死亡相位/复活 → 触发 damage_taken（受伤害后效果）
不走：命中 / 暴击 / 浮动 / 防御 / 取消 / 反震 / 反击；**不吃**通用减伤 damage_in
```
**时序与计数**（8 回合含本回合）：`turn_start` 相位先结算毒伤 → 再 `tickDurations` 扣回合数 → 扣到 0 移除
⟹ `turns = 8` 正好 8 次毒发，且毒发在目标行动之前（**毒杀可打断该角色本回合行动**）。
若施加时机已错过目标本回合的 `turn_start`（目标本轮先动过），本回合不跳毒、8 次顺延（已确认为可接受）。

**减免空间（TODO seam）**：通道 `毒伤害` 是唯一落点——未来的抗毒/解毒/医疗只需往它写值；
`set 0` 表示免疫毒伤（**不阻止挂毒**，"免疫是否等于不中毒"留给后续细化的抗毒设计）。
现有 `毒抗性`/`带毒体质` 天赋（h-core 默认层）是**待重设计的占位**，本期未接线，勿直接接上。

**战斗边界**：毒是战斗内状态，战斗结束随效果区全清（不换算 status-system 的 `中毒`）。

## 钩子

覆盖型（子插件独占）：`initiative / hit_rate / base_damage / crit_rate / crit_mul /
float_mul / defense_value / is_attack_skill`
链式：`battle_start / combatant_init（被动/天赋编译）/ turn_start（动态技能指令挂载）/ turn_end`

钩子 ctx 统一带 `channels: { source, target }`（攻方/守方通道包，已合并该公式之前的所有相位叠加）；
返回值可以是 `number`，也可以是 `{ value, parts }`（`parts` = 中间量明细，写入公式明细环）。

## 武侠公式（combat-wuxia/formula.ts）

- 命中：`准头 = 轻功系数×2 + 灵敏`；`比率 = 攻方准头 /(攻方准头 + 守方准头)`（双方全 0 → 0.5）；
  `命中率 = 90 + (比率 − 0.5)×180 + 攻方 hit_bonus − 守方 dodge_bonus + 通道 ±`
  ——**不截断**：>100 必中、<0 必 Miss。（注：90 与 K=180 数学上抵消 → 实际等价 `180 × 比率`）
- 标准系（拳掌/指腿/刀剑/奇兵）：
  `base = (力道×3 + 武功威力(L) + 武器基础) × (1+武功系数/1000) × 风格系数 × 精通系数 + 当前内力/25 + 其他加成`
- 暗毒系：同式以 `灵敏×3` 代 `力道×3`。
- 空手平A：同式，武功威力 = 0、武功系数 = 0（力道轴）。
- 气功/异术：`scripts/damage_<skillId>.js` 沙箱脚本（裸标识符作用域：
  `source/target/skill/combat/channels/rand`），返回"基础伤害数字"，脚本值再 `+通道「其他加成」`。
- 风格：得分 `(1+技能值/1000)×(1+人物值/50)`（武功无该系风格 → 技能值 0，人物项仍计入）；
  `风格系数 = (轻²+厚²+巧²)/(轻+厚+巧)`（全 0 → 1.0）。
- 精通系数 = `1 + (人物轻灵+人物厚重+人物巧技)/250`（单次乘法）。
- 先攻 = 轻功系数；暴击 = 福缘/5 + 修正（%点），倍率 1.5 + 加成；浮动 0.9–1.1。
- 防御 = 根骨×0.8 + 定力×0.5（再 ×(1+defense_mult)，最后套通道「防御」；最终伤害扣减，伤害<防御=0）。
- 威力曲线默认 `0.7 + 0.05×(L−1)`（L≥1 线性外推）；`power_curve` 表覆写。
- 多段：威力(总)/N 每段，**每段完整套公式**（力道/武器/内力项逐段全量重复）。
- 被动技能（type=passive）与战斗天赋（modifiers `combat_*`/`combat_channel`、
  talent.battle_effects）在战斗开始编译进效果区/通道包。

### 量级提示（数值由 mod 数据决定，插件不设死值）

威力从"百分比乘数"变"平值加数"后，同一面板下伤害整体放大（示例面板 铁砂掌 375→1013、平A 0→716）；
防御 = 根骨×0.8+定力×0.5 在高伤害量级下占比会变小；多段技因逐段重复力道项而显著偏强。
调参入口：`六维`/`武学系数`/`威力 power`/`威力曲线`/`hits`/`cost`，以及 `combat-wuxia.previewDamage`
与 `@公式明细`（见下）。

## 数据格式

```toml
# abilities.toml（战斗切片）
[abilities."铁砂掌"]
type = "active"
power = 100            # 武功基础威力（等级 1 基准，×威力曲线）
cost = 20              # 内力消耗（平值，不随等级）
hits = 1               # 多段数（不随等级；每段完整套公式）
category = "拳掌"      # 唯一系别：拳掌/指腿/刀剑/奇兵/暗毒/气功/异术
style = { 轻灵 = 0, 厚重 = 60, 巧技 = 0, 毒性 = 0 }
effects = []           # 战斗效果条目（trigger/action/…），效果 x 级解锁用 min_level
attack = true          # 显式 false = 增益/架势技（如蛤蟆功：使用不攻击，挂蓄势）
power_curve = [[1, 1.0], [5, 1.5]]   # 可选：等级→威力系数表

# 被动技能示例
[abilities."神照经"]
type = "passive"
effects = [{ trigger = "death", action = "revive", uses = 1, duration = "battle" }]

# definitions/battle-effects.toml（效果定义库；插件默认层 + mod 层）
[effects."战中毒"]
action = "periodic_damage"
trigger = "turn_start"
value = 15
duration = { turns = 3 }
category = "debuff"
stack = "increment"
max_stack = 5
```

战斗效果动作（base 注册）：`modify_stat / modify_channel / action_block / periodic_damage /
leech_hp / leech_mp / leech_mp_max / mp_drain / reflect / counter / cancel / repeat / revive / apply_effect`。

## 战斗状态/条件

- 条件路径：`game.mode == 'combat'`（战斗指令门控）。
- 战斗内毒等状态与 status-system 分离（战斗外中毒暂不进战斗，将来毒换算）。

## API

```
# combat-base
ctx.api.call('combat', 'getCombatContext')      → {enemies, allies, target} | null
ctx.api.call('combat', 'getCombatState')        → 战斗快照（回合/行动序/战斗实体/统计/通道包/效果区）
ctx.api.call('combat', 'registerHook', name, fn)
ctx.api.call('combat', 'addZoneEffect', entityId, partial)
ctx.api.call('combat', 'recalcStats', entityId)
ctx.api.call('combat', 'setRng', fn)            # 测试确定性
ctx.api.call('combat', 'start', enemies, allies?)
ctx.api.call('combat', 'executeAction', actor, {type:'skill'|'flee', skillId?, targetId?})
ctx.api.call('combat', 'end', winner, outcome)
ctx.api.call('combat', 'registerChannel', {id, label?, description?})   # 注册公式中间量通道
ctx.api.call('combat', 'getChannels')           → [{id,label,description,source}]
ctx.api.call('combat', 'getLastFormula')        → 最近一次公式明细 {hook,parts,channels,value}
ctx.api.call('combat', 'getFormulaHistory', n?) → 公式明细环形缓冲（最近 50 条）
ctx.api.call('combat', 'clearFormulaHistory')
ctx.api.call('combat', 'setFormulaDetail', on)  # 明细写入叙事日志（调参用）
ctx.api.call('combat', 'getFormulaDetail')      → boolean

# combat-wuxia
ctx.api.call('combat-wuxia', 'getSnapshot', charId)      → 六维/系数/风格面板（含防御按新式）
ctx.api.call('combat-wuxia', 'getUsableSkills', charId) → 七系过滤的可用主动技
ctx.api.call('combat-wuxia', 'getAbilitiesByTag', charId, tag)
ctx.api.call('combat-wuxia', 'getChannels')             → 武侠通道清单（实为 combat.getChannels）
ctx.api.call('combat-wuxia', 'previewDamage', sourceId, skillId?, level?, targetId?)
                                    → {parts, value, hitRate, hitParts}（不战斗也能算，调参/UI 用）
ctx.api.call('combat-wuxia', 'setFormulaDetail', on) / ('getFormulaDetail')
```

调试指令：`@公式明细`（主菜单，开关明细输出并打印最近一次公式的全部中间量）。

## 数据校验（combat-wuxia onEnable + game:mod_loaded）

battle-effects 条目与技能效果条目共用一套字段级校验：相位合法性、动作必须已注册、
递归类 `chance < 1`、`apply_effect` 引用的效果存在、**`modify_channel` 必须给出已注册的 `channel` 且
`value` 为数值**、`mode='set'` 只允许用于 `modify_channel`、`when_skill` 必须指向已定义技能；
天赋 `combat_channel` modifier 必须给出已注册的 `channel`（缺 `plus`/`multiply` → warning）；
技能契约（category 唯一、power_curve 格式、特殊系脚本存在性）。错误即 errorReporter error。

## Mod 作者使用

- 战斗触发：`effects = [{type = "start_combat", params = {enemies = ["华山_弟子_甲"]}}]`。
- 给公式加值：写 `modify_channel` 效果条目或 `combat_channel` 天赋 modifier（见上「三条作者入口」）。
- 测试指令：主菜单"战斗测试（临时）"（battle_test）——临时注入演示技能与对手，
  战斗结束自动清理（玩家面板/技能/临时敌人/临时技能定义全部还原）。
- 调参：`@公式明细` + `combat-wuxia.previewDamage`。

## 挂账（后续轮）

- 战斗 UI 面板与技能选择视觉（当前为动态指令 + 叙事日志 MVP）
- 战斗内道具（回血丹类）走 UI 轮（effect 需战斗感知执行）
- 装备系统（武器基础 weapon_base 绑定，缺省 0）
- 战斗外毒换算（status-system `中毒`）；异术系公式；效果批次全量条目；敌人 AI 升级
- 公式**整体替换**（mod 用脚本换掉整个伤害公式——当前只支持分项通道加值）
- 通道扩展：`暴击率`/`暴击倍率`/`基础伤害` 的 percent/set 形态、技能标签过滤 `when_tag`
- 把通道暴露进条件字典（如 `combat.风格系数 > 2`）
- **毒**：更高毒等级（k>3）与毒层数叠加；细化的抗毒/解毒设计（`毒抗性`/`带毒体质` 待重设计；
  「`毒伤害` 通道 set 0 是否等于不中毒」的接缝已留）；医疗类减免写入 `毒伤害` 通道；
  毒影响 NPC AI 行为（中毒逃跑/求医）
