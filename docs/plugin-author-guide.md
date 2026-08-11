# 插件作者指南

> 给写玩法插件的人。简洁，只讲接口和约定。

## 你的职责

在 `src/plugins/你的插件名/` 创建 `plugin.toml` + `index.ts`，实现 onLoad/onEnable。

## plugin.toml 最小模板

```toml
[meta]
id = "my-plugin"              # 必需：全局唯一
name = "我的插件"
version = "1.0.0"

[data_dependencies]
provides = ["my:ready"]       # 可选：你提供什么数据能力
depends_on = ["characters:initialized"]  # 可选：你依赖什么

[required_attributes]          # 可选：需要mod绑定的属性
hp = { type = "number", description = "生命值" }

[condition_fields]             # 可选：你注册的条件字段
"my.in_progress" = { type = "boolean", description = "是否进行中" }

[[events.listen]]              # 可选：你监听的事件
name = "combat:end"
description = "战斗结束时处理"

[ui]                           # 可选：你注册的指令（effects类）
location_commands = [
  { id = "gather", label = "采集", modes = ["exploration"],
    condition = "location.tags.has_gather == true", priority = 50,
    effects = [{type = "gather", params = {}}] }
]
```

## index.ts 最小模板

```typescript
import type { PluginContext } from '../../core/types'

export function onLoad(ctx: PluginContext): void {
  // 声明期：注册 API、声明条件字段、监听事件
  // 此时 mod 数据未加载
}

export function onEnable(ctx: PluginContext): void {
  // 开张期：mod 数据已加载，可以调用 API、注册指令、注册 UI 插槽

  // 1. 注册你的 API（其他插件通过 ctx.api.call('my-plugin', 'xxx') 调用）
  ctx.api.register('my-plugin', {
    doSomething: (arg: string) => { /* ... */ },
  })

  // 2. 动态注册指令（比 plugin.toml [ui] 更灵活，handler 是真实函数）
  ctx.commands.register({
    id: 'my-action',
    label: '我的动作',
    group: 'character_commands',
    modes: ['exploration'],
    priority: 10,
    source: 'plugin:my-plugin',
    handler: async (execCtx) => {
      // execCtx.uiStore / execCtx.gameStore / execCtx.engine
      // 执行完调口上
      await ctx.api.call('dialogue', 'triggerScene', 'my-scene', execCtx.uiStore.selectedCharacterId)
    },
  })

  // 3. 监听事件
  ctx.events.on('game:hour_changed', (payload) => {
    // 处理
  })

  // 4. 注册 UI 插槽（自定义组件）
  ctx.ui.registerSlot('status-extra', {
    id: 'my-status-widget',
    component: MyComponent,
    priority: 10,
    condition: (gameCtx) => gameCtx.location?.tags?.includes('has_my_feature'),
  })
}
```

## 生命周期

``onLoad（声明期）→ mod 数据加载 → onEnable（开张期）``

- onLoad：注册 effect type、监听事件、声明条件字段（mod 数据未加载）
- onEnable：调用 API、注册指令、注册 UI 插槽、注册前提（mod 数据已加载）

## 插件继承（extends）

```toml
[meta]
extends = "combat-base"   # 最多继承一个父插件
```
- 自动继承父插件的 required_attributes 和事件监听
- onEnable 时 `ctx.parent.api` 可访问父插件注册的 API
- 加载顺序：父 onLoad → 子 onLoad → 父 onEnable → 子 onEnable

## 你能用的接口

| 接口 | 怎么调 | 说明 |
|------|--------|------|
| 事件总线 | `ctx.events.on/off/emit` | async 串行，优先级，通配符 `combat:*` |
| 公共 API | `ctx.api.call('namespace', 'method', ...args)` | 调其他插件的 API |
| 注册 API | `ctx.api.register('namespace', { method: fn })` | 暴露你的能力 |
| 指令注册 | `ctx.commands.register(cmd)` / `unregister(id)` | 动态注册指令 |
| UI 插槽 | `ctx.ui.registerSlot('slotName', item)` | 注册自定义组件 |
| 父插件 API | `ctx.parent.api` | extends 时可用 |
| 游戏状态 | `ctx.gameState` | 当前地点/玩家/时间（只读快照） |

## 核心引擎 API（ctx.api.call('engine', ...))

| 方法 | 参数 | 说明 |
|------|------|------|
| `getEntity(type, id)` | `(string, string)` | 获取实体数据 |
| `bindings.get(entityId, key)` | `(string, string)` | 读绑定属性 |
| `bindings.set(entityId, key, value)` | `(string, string, any)` | 写绑定属性 |
| `enterMode(id)` | `(string)` | push 模式到栈 |
| `exitMode()` | `()` | pop 模式出栈 |
| `saveGame(slot)` | `(string)` | 手动存档 |
| `loadGame(slot)` | `(string)` | 读档 |
| `getSaveSlots()` | `()` | 获取存档列表 |
| `deleteSave(slot)` | `(string)` | 删除存档 |

## 插件 API 速查

### 通用系统插件

#### map — 地图服务

```typescript
ctx.api.call('map', 'getCurrentLocation')                    // → LocationData | null
ctx.api.call('map', 'getReachable', locationId?)              // → ReachableLocation[]
ctx.api.call('map', 'getChildren', locationId)                // → LocationData[]
ctx.api.call('map', 'getAncestors', locationId)               // → LocationData[]
ctx.api.call('map', 'getLocation', locationId)                // → LocationData | null
ctx.api.call('map', 'hasTag', locationId, tag)                // → boolean
ctx.api.call('map', 'findPath', fromId, toId)                 // → { path: string[], total_minutes } | null（NPC AI 寻路，dijkstra）
ctx.api.call('map', 'moveTo', targetLocationId)               // → void（校验可达性后移动，触发生成 location:enter）
```

- `getReachable` 替代旧 `getExits`，综合 parent 链 + graph 边返回可达地点。`ReachableLocation` 包含 `{ target, name, time_cost, via }`，其中 `via` 为 `'parent' | 'child' | 'graph'`
- `moveTo` 内部调用 `getReachable` 获取耗时，不可达则抛错。移动逻辑委托给 `gameContext.moveTo(targetId, timeCost)`
- `findPath`（2026-08-10，npc-ai-system 消费）：dijkstra 最短路径（parent 链 + graph 边，边权 = time_cost），`total_minutes` = 总耗时；不可达返回 `null`。图条件边按当前游戏上下文求值
- 移动耗时可在 `definitions/move.toml` 中自定义（详见 `docs/map-system.md`）

#### npc-ai — NPC 行为系统（2026-08-10）

```typescript
ctx.api.call('npc-ai', 'getBehavior', charId)                          // → BehaviorBlock | null（{id,type,start_time,duration,target?,move_path?,move_final_target?,params?}）
ctx.api.call('npc-ai', 'getState', charId)                             // → string | null（wait/move/rest/sleep/work/entertainment/socialize/wander…）
ctx.api.call('npc-ai', 'setBehavior', charId, specId, params?)         // → boolean（强制设定行为：按行为规格+处理器生成行为块，从现在开始；发 npc:behavior_started）
ctx.api.call('npc-ai', 'isSkipped', charId)                            // → boolean（dead/离线/无意识/插件跳过谓词）
ctx.api.call('npc-ai', 'registerBehaviorHandler', type, handler)       // → void（扩展新行为类型；H 期注册 h_*）
ctx.api.call('npc-ai', 'registerPreCheck', id, handler)                // → void（扩展前置门控）
```

- 行为处理器签名：`(ctx: { charId, char, spec, params, start_time, now }) => BehaviorBlock | Promise<BehaviorBlock>`——`spec` 是 ai-behaviors.toml 规格（含 duration/on_complete_effects/narrative），处理器负责状态依赖计算（时长/目标/路径）
- 前置门控签名：`(charId, char, now) => { handled: boolean }`——`handled=true` 表示接管决策（须已设行为块）
- 事件：`npc:behavior_started` `{character, behavior_id, type, duration, target?}`、`npc:arrived` `{character, from, to}`（移动完成到达）
- 条件字段：`character.{id}.state`（行为类型）、`character.{id}.current_behavior`（行为规格 ID）、`character.{id}.current_location`（NPC 当前位置）——口上/任务/目标条件可直接用（如 `character.令狐冲.state == 'sleep'`、AI 目标条件 `selected.current_location == 'X'`）
- AI 前提 handler ctx 约定：`{ sourceId: 被决策的 NPC id }`，返回数值即权重（0 = 淘汰）
- 完整说明见 `docs/npc-ai-system.md`

#### random-event — 行为期随机事件（2026-08-10）

```typescript
ctx.api.call('random-event', 'triggerFor', subjectId, behaviorId, targetId)  // → Promise<void>（手动触发一次事件选择与结算）
ctx.api.call('random-event', 'chooseOption', index)                          // → Promise<boolean>（玩家选择子事件选项；index 非法 false）
ctx.api.call('random-event', 'getPending')                                  // → PendingOption | null（{behaviorId, subjectId, targetId, fatherId, options: [{eventId, text}]}）
ctx.api.call('random-event', 'clearPending')                                // → void（作废挂起选项）
```

- 事件数据：`definitions/events/*.toml` 按行为分文件（`[[events]]`：id/behavior/type/adv/side/text/premises/condition/trigger_guard/option_son/effects）
- 触发：玩家每次指令结算（`game:execution_end`，挂载键 = 指令 id）+ NPC 新行为开始（`npc:behavior_started`，挂载键 = 行为块 id）；NPC 文本事件需玩家同地点，静默事件（text 空）任意地点
- 系统效果：`noop` / `record_event` / `record_event_today` / `open_son_options` / `set_interactant`（mode: player/self/player_target_to_me/masturbator/most_desire）/ `interrupt_activity`
- UI 事件：`random-event:options` `{fatherId, options}`、`random-event:options_clear`（engine-ui-bridge 同步选项条）
- 条件字段：`player.current_behavior`（玩家当前行为 = 指令 id / move / wait）
- 完整说明见 `docs/random-event-system.md`

#### character — 角色服务

```typescript
ctx.api.call('character', 'getCharactersAt', locationId)      // → EntityData[]
ctx.api.call('character', 'getLocation', charId)              // → string | null
ctx.api.call('character', 'getAttribute', charId, attr)       // → any（走命名空间搜索）
ctx.api.call('character', 'setAttribute', charId, attr, value)// → void
ctx.api.call('character', 'setField', charId, path, value)    // → void（直接设 entity.field）
ctx.api.call('character', 'getRelation', charId, targetId, type) // → number（-1/0/1 或 sentiment 数值）
ctx.api.call('character', 'setRelation', charId, targetId, type, value) // → void（relation 型收 1/0/-1 或 "正面"/"中立"/"负面"；发 relation:added/changed）
ctx.api.call('character', 'removeRelation', charId, targetId, type) // → void（删除条目=解除关系；发 relation:removed）
ctx.api.call('character', 'getRelationPanel', charId, targetId, type) // → string（成对名：父子/父女…）
ctx.api.call('character', 'getRelationAddress', charId, targetId, type) // → string（单方称呼：父亲/儿子…）
ctx.api.call('character', 'moveTo', charId, locationId)       // → void（角色瞬移，无事件）
// 离线生命周期（2026-08-10）——角色从活动世界消失（装袋搬走/外勤等指令的落点）
ctx.api.call('character', 'setOffline', charId, reason?)      // → void（置 sp_flag.offline + 清位置 + 发 character:offline {id, reason}，幂等）
ctx.api.call('character', 'setOnline', charId, locationId?)   // → void（恢复在线；缺省位置 = home_locations 最高权重；发 character:online）
ctx.api.call('character', 'isOffline', charId)                // → boolean
```

- 离线生命周期契约：`character:offline` 是统一清理信号——各"在场活动状态"属主监听它清自己的领域（follow-system 已接入：解除跟随 reason=offline）。只清位置，不动身份持久数据（属性/关系/物品/经验）

#### dialogue — 口上/对话

```typescript
ctx.api.call('dialogue', 'triggerScene', scene, charId?)      // → void（演出管线）
ctx.api.call('dialogue', 'startConversation', charId, convId?)// → void（交互对话）
ctx.api.call('dialogue', 'getConversations', charId)          // → Conversation[]
ctx.api.call('dialogue', 'interpolate', text, context)        // → string（{var} 插值）
// 场景角色过滤器（2026-08-10）——scene+charId 命中任一过滤器则跳过该角色口上（含 talk-common 兜底）
ctx.api.call('dialogue', 'registerSceneCharFilter', scene, (charId) => boolean) // → () => void（注销函数）
```

- `triggerScene` 自动匹配三层口上：场景通用 → 角色专属 → 角色通用 fallback
- `triggerScene` 无 charId 时只查场景通用口上
- `startConversation` 不传 convId 时自动选第一个 condition 满足的对话
- `registerSceneCharFilter`：通用抑制机制——follow-system 注册 `greet` 过滤器实现"跟随者到达不打招呼"；未来送别/移动口上场景建立后同样注册

#### follow — 跟随/同行系统（2026-08-10）

```typescript
ctx.api.call('follow', 'isFollowing', charId)                 // → boolean（is_follow ≠ 0）
ctx.api.call('follow', 'getMode', charId)                     // → number（0-4）
ctx.api.call('follow', 'setMode', charId, mode)               // → boolean（0/1/2/4；3 已移除会报错）
ctx.api.call('follow', 'invite', charId)                      // → boolean（智能跟随，= setMode(1)）
ctx.api.call('follow', 'end', charId, reason?)                // → boolean（解除；reason: instruction/fatigue/offline）
ctx.api.call('follow', 'getFollowers')                        // → string[]（所有跟随中的角色 ID）
ctx.api.call('follow', 'isControlled', charId)                // → boolean（跟随中——character-system AI 移动跳过查询）
```

- 模式语义（复刻 erArk `is_follow`）：0 不跟随 / 1 智能跟随（玩家移动时同位置跟随者瞬移同步）/ 2 强制跟随（每小时移动到玩家位置）/ 3 已移除（方舟专属）/ 4 召唤 TODO（存储 + warning，AI 未实现）
- 事件：`follow:started` `{character, mode}`、`follow:ended` `{character, reason}`（自定义域，带插件前缀）
- 条件字段：`character.{id}.following`（boolean）、`character.{id}.follow_mode`（number）——数据存实体顶层镜像字段（`following`/`follow_mode`），与 `sp_flag.is_follow` 单点同步
- 前提：`TARGET_IS_FOLLOW` / `TARGET_NOT_FOLLOW` / `IS_FOLLOW` / `NOT_FOLLOW` / `IS_FOLLOW_4` / `NO_TARGET_OR_TARGET_CAN_COOPERATE`
- 效果：`set_follow`（params: `mode` 0-4 **必填**、target——指令效果链用，等价 erArk 效果 363/365；缺 mode 报错拒绝，防漏写参数静默变"结束同行"）
- 自动解除：疲劳（可选绑定 `hp` ≤1，未绑定则跳过）、角色离线（character:offline）、隐奸开始（h-hidden 走 follow API）
- 完整说明见 `docs/follow-system.md`

#### effect-system — 效果执行

```typescript
ctx.api.call('effect-system', 'execute', effects, execCtx)    // → boolean[]
ctx.api.call('effect-system', 'registerType', type, handler)  // → void
ctx.api.call('effect-system', 'hasType', type)                // → boolean
```

- `execute` 返回每个 effect 的执行结果数组
- effect handler 签名：`(params, execCtx) => boolean | Promise<boolean>`

#### status — 状态效果

```typescript
ctx.api.call('status', 'hasStatus', charId, statusId)         // → boolean
ctx.api.call('status', 'getStack', charId, statusId)          // → number
ctx.api.call('status', 'getRemaining', charId, statusId)      // → number（剩余分钟）
ctx.api.call('status', 'apply', charId, statusId)             // → void
ctx.api.call('status', 'remove', charId, statusId)            // → void
```

#### abilities — 能力

```typescript
ctx.api.call('abilities', 'getByTag', charId, tag)            // → {id, level, xp}[]
ctx.api.call('abilities', 'hasTag', charId, tag)              // → boolean
ctx.api.call('abilities', 'getLevel', charId, abilityId)      // → number
ctx.api.call('abilities', 'gainXp', charId, abilityId, xp)    // → void（xp 模式即时升级）
ctx.api.call('abilities', 'checkUpgrade', charId)             // → void（2026-08-11：结算点调用，
                                                              //   condition 模式能力按 per-level needs
                                                              //   升级 + 扣宝珠；睡眠/H结束调用）
```

#### inventory — 背包物品

```typescript
ctx.api.call('inventory', 'addItem', charId, itemId, count)   // → void
ctx.api.call('inventory', 'removeItem', charId, itemId, count)// → boolean（成功 true；物品不存在/数量不足/角色不存在 false）
ctx.api.call('inventory', 'useItem', charId, itemId, targetId?)// → Promise<boolean>（consume 默认 true 先扣 1，数量不足
                                                              //   返回 false 不执行 effects；consume=false 只执行 effects；
                                                              //   targetId 提供时 effects 目标用 targetId）
ctx.api.call('inventory', 'getInventory', charId)             // → {itemId, count}[]
ctx.api.call('inventory', 'equip', charId, itemId, slot)      // → void
ctx.api.call('inventory', 'unequip', charId, slot)            // → void
```

#### set — 套装检测

```typescript
ctx.api.call('set', 'checkSets', charId)                      // → string[]（激活的套装 ID 列表）
ctx.api.call('set', 'getActiveSets', charId)                  // → SetData[]
```

#### combat — 战斗骨架

```typescript
ctx.api.call('combat', 'getCombatContext')                    // → CombatContext | null
ctx.api.call('combat', 'registerHook', hookName, handler)     // → void
ctx.api.call('combat', 'start', enemies, allies?)             // → void（发出 combat:start）
ctx.api.call('combat', 'executeAction', actorId, action, targetId) // → void（发出 combat:turn）
ctx.api.call('combat', 'end', winner, outcome)                // → void（发出 combat:end）
```

#### combat-wuxia — 武侠战斗（extends combat-base）

```typescript
ctx.api.call('combat-wuxia', 'calcPanel', charId)             // → CombatPanel
ctx.api.call('combat-wuxia', 'getAbilitiesByTag', charId, tag)// → {id, level}[]
```

#### quest — 任务

```typescript
ctx.api.call('quest', 'start', questId)                       // → void
ctx.api.call('quest', 'getActiveQuests')                      // → QuestState[]
ctx.api.call('quest', 'getQuestStatus', questId)              // → 'not_started' | 'active' | 'completed'
ctx.api.call('quest', 'advanceStep', questId, nextStepId)     // → void
```

### H 系统插件

#### h-core — H 核心

```typescript
ctx.api.call('h-core', 'evaluatePremises', premises, evalCtx) // → boolean
ctx.api.call('h-core', 'startHScene', ...)                     // → void
ctx.api.call('h-core', 'endHScene', ...)                       // → void
ctx.api.call('h-core', 'getLevel', charId, levelType)          // → number
ctx.api.call('h-core', 'calcFavorability', charId)             // → number
ctx.api.call('h-core', 'calcTrust', charId)                    // → number
ctx.api.call('h-core', 'calcJudge', judgeBase, favorability, trust, charId?, judgeClass?) // → JudgeResult
ctx.api.call('h-core', 'getFavorabilityLevel', charId)         // → number
ctx.api.call('h-core', 'getTrustLevel', charId)                // → number
ctx.api.call('h-core', 'registerPremise', id, handler)         // → void
// 通用状态结算（统一管线：能力系数/素质/fall/连续减值/tenths/max(0) 钳制等）
ctx.api.call('h-core', 'settleState', charId, state, baseValue, timeCost, opts?)
//   opts?: { abilityLevel?, abilityKeyOverride?, isGroupSex?, continuous?, negate?, tenthsAdd?, extraAdjust?,
//            externalAbilityLevel? }
//   externalAbilityLevel：快感状态的外部能力等级 → 系数 = sqrt(目标部位感度 × 外部等级)
//   （erArk chara_feel_state_adjust:296-299，如 pain_to_h 心理快感 = sqrt(心理感度 × 发起者.技巧)）
//   例：隐奸持续快感 —— settleState(npcId, '羞耻', 0, timeCost*5, { abilityLevel: 露出等级, extraAdjust: 3.1, tenthsAdd: false })
```

#### h-ejaculation — 射精

```typescript
ctx.api.call('h-ejaculation', 'getEja', charId)               // → number（当前射精欲）
ctx.api.call('h-ejaculation', 'setEja', charId, val)          // → void（绝对值写入）
ctx.api.call('h-ejaculation', 'addEja', charId, delta)        // → void（增量累加——射精欲字段唯一写入口；
                                                              //   h-core 结算经此写入，禁止其他插件直接改字段）
ctx.api.call('h-ejaculation', 'getSemenOnBody', charId)       // → number
ctx.api.call('h-ejaculation', 'absorbSemen', charId)          // → void
```

#### h-pregnancy — 妊娠

```typescript
ctx.api.call('h-pregnancy', 'isPregnant', charId)             // → boolean
ctx.api.call('h-pregnancy', 'getDays', charId)                // → number
ctx.api.call('h-pregnancy', 'getPeriod', charId)              // → string
```

#### h-first-time — 第一次

```typescript
ctx.api.call('h-first-time', 'isVirgin', charId, key?)        // → boolean
ctx.api.call('h-first-time', 'getRecord', charId, key)        // → any
ctx.api.call('h-first-time', 'setFirstTime', charId, key)     // → void
```

#### h-exposure — 露出

```typescript
ctx.api.call('h-exposure', 'getLevel', charId)                // → number
ctx.api.call('h-exposure', 'setLevel', charId, level)         // → void
ctx.api.call('h-exposure', 'getModeName', charId)             // → string
```

#### h-mark — 刻印

```typescript
ctx.api.call('h-mark', 'getLevel', charId, markId)            // → number
ctx.api.call('h-mark', 'checkOne', charId, markId)            // → boolean
ctx.api.call('h-mark', 'checkAll', charId)                    // → {markId, level}[]
ctx.api.call('h-mark', 'getMarkAdjust', charId, markId)       // → number（修正系数）
```

#### h-hypnosis — 催眠

```typescript
ctx.api.call('h-hypnosis', 'getDegree', charId)               // → number
ctx.api.call('h-hypnosis', 'getType', charId)                 // → string
ctx.api.call('h-hypnosis', 'isHypnotized', charId)            // → boolean
ctx.api.call('h-hypnosis', 'getTypeName', charId)             // → string
```

#### h-hidden — 隐奸

```typescript
ctx.api.call('h-hidden', 'getMode', charId)                   // → number
ctx.api.call('h-hidden', 'setMode', charId, mode)             // → void
ctx.api.call('h-hidden', 'getDiscoveryDegree', charId)        // → number
ctx.api.call('h-hidden', 'getModeName', charId)               // → string
ctx.api.call('h-hidden', 'getHiddenLevel', charId)            // → number
ctx.api.call('h-hidden', 'isHidden', charId)                  // → boolean
ctx.api.call('h-hidden', 'checkAchievements', charId)         // → void
```

#### h-group-sex — 群交

```typescript
ctx.api.call('h-group-sex', 'isActive')                       // → boolean
ctx.api.call('h-group-sex', 'getTemplate', charId)            // → GroupTemplate | null（返回可变引用，槽位可直改）
ctx.api.call('h-group-sex', 'setTemplate', charId, template)  // → void
ctx.api.call('h-group-sex', 'setNpcAiType', charId, type)     // → void
ctx.api.call('h-group-sex', 'getNpcAiType', charId)           // → string
ctx.api.call('h-group-sex', 'getNpcAiName', type)             // → string
```

> 槽位行为标识 = **指令 id（string）**（2026-08-11，取代 erArk 数字 behaviorId）；
> 模板执行走 commandRegistry 取指令 effects（废弃 h_execute_behavior）。

#### h-npc-ai — H 内 NPC AI（2026-08-11）

```typescript
ctx.api.call('h-npc-ai', 'isActiveH', charId)                 // → boolean（NPC 逆推状态，含催眠 active_h）
ctx.api.call('h-npc-ai', 'setActiveH', charId, on)            // → void（手动开关逆推）
ctx.api.call('h-npc-ai', 'triggerActiveH', npcId)             // → Promise<boolean>（触发一次逆推执行器：NPC 选行为赋给玩家执行）
ctx.api.call('h-npc-ai', 'tryActiveH', npcId, judgeBase?)     // → Promise<boolean>（尝试夺回主动权，默认 base=150——M20 修正，与代码一致）
ctx.api.call('h-npc-ai', 'recoverFromUnconsciousH', actorId, infoText?)  // → Promise<void>（从无意识H中恢复：erArk recover_from_unconscious_h，2026-08-11 无意识组）
```

效果类型（指令/脚本可调用）：`npc_active_h_on` / `npc_active_h_off`（开关目标逆推）、
`npc_active_h_act`（触发逆推执行器）、`try_pl_active_h`（夺回判定，`params.base` 默认 100）。
指令 tag 词表（part:/flag:）与逆推/群交 AI 机制详见 `docs/h-npc-ai.md`。
无意识H（睡奸结算/醒来判定/恢复流程）详见 `docs/sleep-system.md` §7。

#### sleep-system — 睡眠系统（2026-08-11）

```typescript
ctx.api.call('sleep-system', 'isSleeping', charId)            // → boolean（正在睡眠，sp_flag.sleeping）
ctx.api.call('sleep-system', 'getSleepLevel', charId)         // → number（睡眠等级 0-3，熟睡值按 sleep.toml 阈值推导）
ctx.api.call('sleep-system', 'getSleepLevelInfo', sleepPoint) // → {level, name}
ctx.api.call('sleep-system', 'isSleepTimeWindow')             // → boolean（睡眠时间窗口：≥ plan_to_sleep_time 或 < plan_to_wake_time）
ctx.api.call('sleep-system', 'setAsleep', charId)             // → void（入睡标记 + unnormal bit5,6）
ctx.api.call('sleep-system', 'clearAsleep', charId)           // → void（醒来标记清除）
```

效果类型（指令/脚本可调用）：`add_small_sanity_point`（1504：理智 15%/h 恢复，绑定 sanity
可选——未绑定 warning+跳过；上限读"精力上限"属性）、`consume_sanity`（2026-08-11：精力消耗
+ `action_info.today_sanity_point_cost` 今日计数——催眠/体控系指令成本，供睡眠精力成长）、
`add_small_semen_point`（1505：精液 15%/h 恢复，仅玩家）、
`unconscious_h_set`（设目标无意识等级 0-7 + unnormal 位）、`unconscious_h_clear`
（清 0 + unnormal 位）。前提（TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1 / T_ACTION_SLEEP /
T_NORMAL_1/2/6 / SCENE_ALL_UNCONSCIOUS_OR_SLEEP 等）与数据格式详见 `docs/sleep-system.md`。

#### h-bondage — 紧缚

```typescript
ctx.api.call('h-bondage', 'getBondage', charId)               // → string | null
ctx.api.call('h-bondage', 'getBondageName', charId)           // → string
ctx.api.call('h-bondage', 'getBondageTypes')                  // → string[]
```

#### h-time-stop — 时停

```typescript
ctx.api.call('h-time-stop', 'isActive')                       // → boolean
ctx.api.call('h-time-stop', 'getTSP', charId)                 // → number
ctx.api.call('h-time-stop', 'getTSPMax', charId)              // → number
ctx.api.call('h-time-stop', 'getOrgasmCount', charId, partId?)// → number
ctx.api.call('h-time-stop', 'getXP', charId)                  // → number
```

### 辅助系统

#### talk-common — 条件文本片断

```typescript
ctx.api.call('talk-common', 'replace', text, targetId)        // → string（替换 {var} 占位符）
ctx.api.call('talk-common', 'getText', variable, targetId)    // → string | null
ctx.api.call('talk-common', 'getVariables')                   // → string[]
```

详见 `docs/talk-common-system.md`。

## 前提注册 API

前提（Premise）是指令可见性的条件判定单元，由 `src/core/premise-registry.ts` 统一管理。

```typescript
// 在自己的 onEnable 中注册新前提
ctx.api.call('h-core', 'registerPremise', 'MY_PREMISE_ID', (evalCtx) => {
  return evalCtx.selectedCharacterId !== null
})
```

前提 handler 签名：`(evalCtx: { selectedCharacterId, sourceId, ... }) => boolean | number`
- 返回 `false` 或 `<= 0` 时前提不满足
- 重复注册允许（后注册覆盖前注册，用于子系统覆盖基础前提）

**Mod 自定义前提**：见 `docs/mod-author-guide.md`。

## 标准事件（你可以监听或发出）

| 事件 | 发出者 | 参数 | 说明 |
|------|--------|------|------|
| location:enter | game-context | `{ to, from? }` | 玩家进入地点 |
| location:leave | game-context | `{ from, to? }` | 玩家离开地点 |
| game:hour_changed | game-context | `{ hour, minute }` | 每小时 |
| game:new_day | game-context | `{ day, month, year }` | 每天开始时 |
| game:night_start | game-context | `{ hour }` | 夜晚开始（默认 22:00） |
| game:mode_changed | game-context | `{ mode, stack }` | 模式栈变化 |
| game:execution_start | command-executor | `{ commandId }` | 指令执行开始 |
| game:execution_end | command-executor | `{ commandId }` | 指令执行结束 |
| game:wake_up | game-context | `{}` | 玩家起床 |
| character:changed | character-system | `{ charId, attr, oldVal, newVal }` | 角色属性变化 |
| character:ability_up | ability-progression | `{ charId, abilityId, newLevel }` | 能力升级 |
| dialogue:start | dialogue-system | `{ character, conversationId }` | 对话开始 |
| dialogue:line | dialogue-system | `{ speaker, text }` | 对话行输出 |
| dialogue:end | dialogue-system | `{ character, conversationId }` | 对话结束 |
| combat:start | combat-base | `{ participants }` | 战斗开始 |
| combat:turn | combat-base | `{ actor, action, target, result }` | 战斗回合 |
| combat:end | combat-base | `{ winner, outcome }` | 战斗结束 |
| item:added | inventory-system | `{ charId, itemId, count }` | 物品添加 |
| item:removed | inventory-system | `{ charId, itemId, count }` | 物品移除 |
| item:used | inventory-system | `{ charId, itemId, targetId }` | 物品使用 |
| narrative:written | narrative-log | `{ text, type, source }` | 日志条目写入 |

你的插件自定义事件必须加插件名前缀（`myplugin:xxx`），防止冲突。标准事件不加前缀。

## 指令的 effects vs handler

- **effects 类**（plugin.toml [ui]）：数据驱动，`effects = [{type: "xxx", params: {}}]`，由 effect-system 执行
- **handler 类**（ctx.commands.register）：编程式，handler 是真实函数，适合复杂逻辑
- 两者都可以注册指令，effects 类适用于纯数据驱动的指令

## 注意事项

- 禁止直接 import 其他插件源文件——走事件总线 + 公共 API
- 禁止硬编码属性名——用 bindings 或 `entity-utils.ts` 工具函数
- 禁止直接 console.error——用 errorReporter（`src/core/error-reporter.ts`）
- 插件错误降级为「禁用该插件 + 弹警告」，不死锁启动
- 测试：每个插件必须有启用/禁用隔离测试
- **新增插件时必须同步更新本文档的 API 速查表**
