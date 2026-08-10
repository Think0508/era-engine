# npc-ai-system — NPC 行为系统使用手册

> 复刻 erArk 的 NPC 行为系统（NPC AI）——行为块时间模型 / 前提权重目标搜索 / 行为状态机 / 工作娱乐排班 / 前置门控 / 带耗时移动 / 行为完成结算。
> erArk 源码对照：`Script/Design/handle_npc_ai.py`、`Script/Design/character_behavior.py`、`Script/Design/settle_behavior.py`、`Script/StateMachine/default.py`（日常部分）、`Script/Design/character_move.py`、`Script/Settle/realtime_settle.py`。
> H 内 NPC AI（`handle_npc_ai_in_h.py`）与行为期随机事件（`event.py`）**不在本系统范围**——后续独立规划。

---

## 1. 概念

erArk 的世界观核心：**每个 NPC 恒有一个"行为块"**（`behavior{id, type, start_time, duration}`）。玩家每次行动推进游戏时间后，引擎对所有 NPC 结算：

1. **窗口自动结算**：按"行为窗口 ∩ 玩家行动窗口"的时长积累属性（疲劳/饥饿/尿意；休息恢复体力气力；睡眠削减疲劳+积累熟睡值）
2. **行为到期**（`start + duration ≤ 当前时刻`）→ 完成结算（行为完成效果 + 移动到达）→ **决策下一个行为**（门控 → 排班 → 目标搜索）→ 若新行为也已到期则**连锁**继续（同一轮内）
3. **叙事**：仅当玩家与 NPC 同地点时输出移动/行为消息

世界因此连贯：NPC 是"移动中 30 分钟"、"站岗到 12 点"、"睡到 6 点"，而不是瞬移。

## 2. 架构分层

```
src/plugins/npc-ai-system/
├── plugin.toml            # condition_fields（state/current_behavior）+ 事件声明
├── index.ts               # onLoad（门控/处理器/前提/跳过谓词/数据校验）+ onEnable（API/监听）
├── behavior-block.ts      # 行为块模型（init/过期/钳正/窗口时长/镜像字段）
├── settle-pass.ts         # 结算通道（窗口结算+到期连锁+性能分帧兜底）
├── target-search.ts       # 目标搜索（前提权重+分层+缓存+延后）
├── behavior-handlers.ts   # 行为类型处理器注册表（10 种日常）
├── schedule.ts            # 排班（time_rules/工作/娱乐）
├── pre-check.ts           # 前置门控链（tired/监禁/跟随，可插拔）
├── narrative.ts           # 同地叙事输出
├── spawns.ts              # npc.toml 路人生成（从 character-system 归位）
├── premise/ai.ts          # AI 基础前提（AI_TIRED_LEVEL_N/AI_NIGHT/AI_WORK_TIME...）
└── data/default/          # 插件默认层（ai-behaviors.toml/ai-targets.toml）
```

依赖：map-system（findPath）、character-system（角色 API）、effect-system（行为完成效果）。跨插件通信只走 API/事件/注册表（core 中介）。

**core 的配合**（通用机制，无玩法语义）：
- `game:time_advanced {minutes}` 事件（`advanceTime` 窗口结束发出）——结算通道的驱动
- `premiseRegistry.getWeightSum(premises, ctx, strict)` —— 前提权重求和（erArk search_target 语义，与口上用的 `getWeight` 不同）
- `skip-registry.ts` —— 通用跳过谓词注册表（npc-ai 注册 dead/offline/unconscious；combat-base 注册 in_combat）
- `realtime-settle.ts` 导出 `settleTired/settleUrine/settleHunger/sleepPassSettle`（窗口结算原语）

## 3. 数据格式

### 3.1 行为规格（ai-behaviors.toml）

插件默认层 `src/plugins/npc-ai-system/data/default/ai-behaviors.toml`，mod 在 `mods/{mod}/definitions/ai-behaviors.toml` 覆盖/新增（字段级 deepMerge）。

```toml
[behaviors.rest]
type = "rest"
name = "休息"
duration = { fixed = 120 }        # 固定时长；或 { min = 30, max = 60 } 随机（下限 1 分钟——0 会无限连锁）
on_complete_effects = [...]        # 行为完成时执行的效果（effectTypeRegistry）
narrative = "{name}找了个地方休息。"  # 开始叙事模板（{name} 角色名 / {place} 目标地点名；仅玩家同地输出）
```

- **缝切方案**：固定常量（时长/效果/显示名）在数据层；状态依赖计算（sleep 算起床、work 算班末、move 算路径）在处理器层
- 内置 10 种类型处理器：`wait`/`stay`/`move`/`rest`/`sleep`/`work`/`entertainment`/`socialize`/`wander`/`go_home`（H 期在同一注册表扩展 `h_*` 类型）
- 武侠作者加"打坐" = 写 TOML（`[behaviors.打坐] type = "rest" duration = {min=30,max=60} on_complete_effects=[...]`），零代码
- 新类型需要代码逻辑 → mod 专属插件调用 `ctx.api.call('npc-ai', 'registerBehaviorHandler', ...)`（见 §6）
- **行为完成效果（on_complete_effects）的注意点**：① 玩家不在场时 `narrative_output` 不执行（远方行为不可见，结算数值静默执行）；② 效果里的 `condition` 用全局上下文求值——`selected.*` 指 UI 选中角色，请用 `character.{id}.*` 引用 NPC 自身；③ 不要在完成效果里写 `advance_time`（行为结算期间推进时间会因事件重入保护被丢弃，且结算 pass 用快照时刻——语义未定义）

### 3.2 目标（ai-targets.toml）

**累积式注册表**：插件默认层 + mod 定义全部并入（不是覆盖）。按 `layer` 升序逐层搜索，首个有候选的层胜出，层内加权随机。

```toml
[[targets]]
id = "rest_tired"
name = "休息（疲惫）"
layer = 40                    # 分层：5 危急 / 40 基本需求 / 100 自由活动（惯例）
premises = ["AI_TIRED_LEVEL_2"]   # 前提 ID——返回值即权重（疲惫越重越想休息）
condition = ""                # 可选：现有条件表达式（布尔门，不参与权重）
behavior = { type = "rest" }  # 决策结果 = 行为规格 ID
get_first_only = false        # 本层只取第一个通过（erArk get_first_only）
```

- 前提权重语义（erArk `search_target`）：每条前提返回**数值即权重**，任一返回 ≤0 则该目标淘汰；权重求和后层内加权随机。无条件目标默认权重 1
- `condition` 是 mod 作者友好通道（现有条件引擎，布尔）；`premises` 是权重通道（注册的 handler，可动态）
- **`condition` 里的 `selected.*` = 被决策的 NPC 自身**（AI 求值上下文注入 `selectedCharacterId`）——如 `condition = "selected.current_location == '华山_酒馆'"`；`player.*` 仍指玩家
- 同层全部失败 → 下一层；全层失败 → 等待 `(now - oldEnd) + 1` 分钟，下一 pass 重试（erArk `start_time += 1` 语义）
- 前提结果**轮内缓存**（同轮同前提只求值一次——erArk premise_data 共享）
- 时段均为**半开区间** `[start, end)`：`[8, 12]` = 8:00-11:59（12:00 不在班）——排班/`AI_WORK_TIME`/娱乐时段统一

### 3.3 工种 / 娱乐（ai-work.toml / ai-entertainment.toml）

```toml
# ai-work.toml（Record keyed by 工种 ID）
[work_types.gate_duty]
name = "站岗"
place = "town_square"          # 工作地点（location ID，加载时校验存在性）
time_slots = [[8, 12], [14, 18]]  # 上班时段（小时闭区间）
auto_ai = true                # 到点自动工作（在岗免决策；不在岗自动前往）——erArk auto_ai

# ai-entertainment.toml
[entertainment_types.drink]
name = "喝酒"
place = "tavern"
period = "evening"            # morning 9-12 / afternoon 14-18 / evening 19-22（erArk judge_entertainment_time）
```

### 3.4 角色行为数据（char.behavior，AGENTS §23 扩展）

```toml
behavior = {
  activity = 0.5,                              # 闲逛活跃度（0=不闲逛；影响 wander 原地停留概率）
  home_locations = { town_square = 0.7, tavern = 0.3 },  # 闲逛目标的地点池（权重）
  time_rules = [                               # 个人时间规律（强排班，优先于工作/娱乐）
    { hour_range = [20, 23], target = "tavern", weight = 0.9 }
  ],
  work = { work_type = "gate_duty" },          # 工种引用
  entertainment = { types = { evening = "drink" } }  # 三时段槽娱乐
}
```

- `activity=0` 的角色：不做闲逛决策，但排班（工作/娱乐/时间规律）与休息/睡眠目标照常生效——需要"完全不动"用 `sp_flag.imprisonment` 或跳过谓词
- 排班优先级：**time_rules（个人规律，作者意图最强）→ 工作（职责）→ 娱乐（时段）** → 目标搜索

## 4. 结算通道（settle-pass）

`game:time_advanced` 触发，对每个 NPC：

```
isSkipped（dead/离线/无意识/战斗中/插件谓词）→ 跳过
isPinned（玩家正在交互：选中 + 非探索模式）→ 本轮完全不结算（wait_flag 语义）
循环（连锁上限 60）：
  钳正 start（start > now → start = now，erArk 时间回拨防御）
  窗口结算（trueAddTime = 行为窗口 ∩ 玩家窗口）：
    疲劳积累（睡眠行为跳过；休息也积累——erArk settle_tired 原义）
    休息 → 体力/气力恢复（erArk settle_rest：hp_base=上限×0.003+10，在家×1.0 否则×0.3）
    睡眠 → 疲劳 2 倍削减 + 熟睡值积累（erArk settle_sleep）
    尿意 / 饥饿积累（全角色，有上限钳）
  行为未到期 → 结束
  到期 → 完成结算（move 先到达 + 发 npc:arrived；再执行 on_complete_effects，
         玩家同地输出结算文本，否则 _silent）→ 决策下一个 → 循环
```

- **连锁**：新行为 `start = 旧行为结束时刻`（erArk `start_time = end_time`），窗口结算自然覆盖"间隙"
- **决策上下文**：单 pass 内所有连锁决策都用本 pass 的时刻求值（erArk 同——`cache.game_time` 固定）——超长窗口（如玩家睡 12h）的中间决策以窗口末时刻上下文求值，这是批量模型的固有语义（erArk 同构），不是缺陷
- **性能**：全量同步结算（决策永远真实时刻上下文，**无追算**——延迟计算的叙事/状态错位是结构性 bug，已否决）；前提缓存 + 层短路；单轮超 100ms 预算 → 剩余 NPC 排后续轮（玩家所在+直接相邻优先当轮）
- 长窗口（如玩家睡 12 小时）连锁 10+ 次属正常（erArk 同构）；超 60 次防御性强制等待

## 5. 前置门控（pre-check）

可插拔注册表（`registerPreCheck`），任一 `handled` 即接管决策：

| 门控 | 判定 | 行为 |
|------|------|------|
| tired | 体力 ≤ 1 → `sp_flag.tired = true`（>1 清除） | 仅维护标记（疲惫前提/口上条件消费）；跟随中疲劳解除由 follow-system 处理 |
| cant_move | `sp_flag.imprisonment` | 原地等待 60 分钟（禁移动）——mod 可注册更多禁移动判定 |
| follow | `sp_flag.is_follow ∈ {1,2}` | 原地等待 60 分钟（移动由 follow-system 接管，AI 不竞争） |

跳过集（`skip-registry`，core 通用机制）：dead / 离线 / 无意识（时停）/ **H 中（is_h）** / 战斗中（combat-base 注册）/ 插件注册谓词。

助理问安 / H 失神：不建机制位（Q8 决策）——后续用目标前提数据实现。

## 6. API（namespace `npc-ai`）

```typescript
ctx.api.call('npc-ai', 'getBehavior', charId)                       // → BehaviorBlock | null（{id,type,start_time,duration,target?,move_path?,move_final_target?,params?}）
ctx.api.call('npc-ai', 'getState', charId)                          // → string | null（wait/move/rest/...）
ctx.api.call('npc-ai', 'setBehavior', charId, specId, params?)      // → boolean（强制设定行为：按规格+处理器生成行为块；发 npc:behavior_started）
ctx.api.call('npc-ai', 'isSkipped', charId)                         // → boolean（dead/离线/无意识/插件谓词）
ctx.api.call('npc-ai', 'registerBehaviorHandler', type, handler)    // → void（mod 插件扩展新行为类型）
ctx.api.call('npc-ai', 'registerPreCheck', id, handler)             // → void（mod 插件注册门控）
```

**行为处理器签名**（registerBehaviorHandler）：
```typescript
// ctx: { charId, char, spec, params, start_time, now } → BehaviorBlock
// spec = ai-behaviors.toml 的规格（含 duration/on_complete_effects/narrative）
// 处理器负责"状态依赖计算"（时长/目标点/路径），固定常量留在 TOML
```

**AI 前提 handler ctx 约定**：`{ sourceId: 被决策的 NPC id, selectedCharacterId: 同 NPC }`，返回数值即权重（0 = 淘汰）。mod 插件可注册自定义前提供 ai-targets.toml 引用。

## 7. 事件与条件字段

| 事件 | payload | 说明 |
|------|---------|------|
| `npc:behavior_started` | `{character, behavior_id, type, duration, target?}` | 行为开始（结算通道与 setBehavior 都发） |
| `npc:arrived` | `{character, from, to}` | 移动完成到达（quest/口上消费；NPC 移动**不**复用玩家 location:enter） |

条件字段：`character.{id}.state`（行为类型字符串）、`character.{id}.current_behavior`（行为规格 ID）——数据存实体顶层镜像字段（`state`/`current_behavior`，引擎独占层 L3），与 `ai_behavior` 单点同步。口上/任务/指令条件可直接用，如：

```toml
condition = "character.令狐冲.state == 'sleep'"
```

## 8. 与 erArk 的有意偏差（记录）

| 项 | erArk | 本引擎 | 理由 |
|----|-------|--------|------|
| NPC 自然醒的 wake 侧效果 | 玩家睡眠时 `update_sleep` 对全员执行（daily_reset/愤怒重置/精液） | 仅玩家睡眠结算（isSleep 分支）；NPC 自然醒不触发 | 依赖 H/睡眠系统成熟度（L1.7），随 H 内 AI 阶段统一 |
| 休息恢复修正 | 设施等级/天赋 351/352 修正 | 不搬 | 方舟世界观专属 |
| 监禁 | 强制送回宿舍 | 原地等待 | 宿舍概念由 mod 地点/目标实现 |
| 上班岗位 | recruit_index 分配制 | 无（工种引用制） | 方舟博士分配岗专属 |
| 行为期随机事件 | event.py 行为期事件链 | 不实现 | 独立大系统，后续单独规划 |

## 9. 前提清单（npc-ai 注册）

| 前提 | 返回值 | 说明 |
|------|--------|------|
| `AI_TIRED_LEVEL_1/2/3` | 疲劳等级（0 淘汰） | 疲惫度 ≥ 阈值时返回等级（权重随疲惫增长） |
| `AI_TIRED` | 1 | `sp_flag.tired`（体力 ≤1 标记） |
| `AI_NIGHT` / `AI_DAY` | 1 | 夜晚 22:00-5:59 / 白天 6:00-21:59 |
| `AI_WORK_TIME` | 1 | 当前在工种 time_slots 内（半开区间） |
| `AI_ENTERTAINMENT_TIME` | 1 | 当前在娱乐三时段内 |
| `AI_HOME` | 1 | 当前在自己 home_locations |
| `AI_NOT_AT_HOME` | 1 | 有 home_locations 且当前不在其中（"回家"目标用） |
| `AI_IMPRISONED` | 1 | 监禁中 |

疲劳等级（erArk `get_tired_level`）：`疲劳度/160 ≤ 0.74 → 0`，`≤0.84 → 1`，`<1 → 2`，`≥1 → 3`。

插件默认目标集（data/default/ai-targets.toml）：`rest_tired`（层 40）/ `sleep_tired`（层 40）/ `sleep_night`（层 40）/ `go_home_night`（层 39——夜晚不在家先回最高权重家，再睡；erArk 睡宿舍语义）/ `wander`（层 100 兜底）。mod 追加目标 = 累积式并入。

## 10. 验证

- 单元：`src/plugins/npc-ai-system/target-search.test.ts`（权重/分层/缓存/延后/get_first_only/未知前提）
- 集成：`src/plugins/npc-ai-system/npc-ai-system.test.ts`（初始决策/窗口结算/排班/连锁移动到达/门控/战斗冻结/pin/每日结算/500 NPC 性能冒烟）
- 全量：`npm run typecheck && npm run test`
