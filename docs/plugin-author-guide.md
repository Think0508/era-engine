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
ctx.api.call('map', 'moveTo', targetLocationId)               // → void（校验可达性后移动，触发生成 location:enter）
```

- `getReachable` 替代旧 `getExits`，综合 parent 链 + graph 边返回可达地点。`ReachableLocation` 包含 `{ target, name, time_cost, via }`，其中 `via` 为 `'parent' | 'child' | 'graph'`
- `moveTo` 内部调用 `getReachable` 获取耗时，不可达则抛错。移动逻辑委托给 `gameContext.moveTo(targetId, timeCost)`
- 移动耗时可在 `definitions/move.toml` 中自定义（详见 `docs/map-system.md`）

#### character — 角色服务

```typescript
ctx.api.call('character', 'getCharactersAt', locationId)      // → EntityData[]
ctx.api.call('character', 'getLocation', charId)              // → string | null
ctx.api.call('character', 'getAttribute', charId, attr)       // → any（走命名空间搜索）
ctx.api.call('character', 'setAttribute', charId, attr, value)// → void
ctx.api.call('character', 'setField', charId, path, value)    // → void（直接设 entity.field）
ctx.api.call('character', 'getRelation', charId, targetId, type) // → number
ctx.api.call('character', 'setRelation', charId, targetId, type, value) // → void
ctx.api.call('character', 'moveTo', charId, locationId)       // → void（角色瞬移，无事件）
```

#### dialogue — 口上/对话

```typescript
ctx.api.call('dialogue', 'triggerScene', scene, charId?)      // → void（演出管线）
ctx.api.call('dialogue', 'startConversation', charId, convId?)// → void（交互对话）
ctx.api.call('dialogue', 'getConversations', charId)          // → Conversation[]
ctx.api.call('dialogue', 'interpolate', text, context)        // → string（{var} 插值）
```

- `triggerScene` 自动匹配三层口上：场景通用 → 角色专属 → 角色通用 fallback
- `triggerScene` 无 charId 时只查场景通用口上
- `startConversation` 不传 convId 时自动选第一个 condition 满足的对话

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
ctx.api.call('abilities', 'gainXp', charId, abilityId, xp)    // → void（可能触发升级）
```

#### inventory — 背包物品

```typescript
ctx.api.call('inventory', 'addItem', charId, itemId, count)   // → void
ctx.api.call('inventory', 'removeItem', charId, itemId, count)// → void
ctx.api.call('inventory', 'useItem', charId, itemId)          // → void（执行物品 effects）
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
ctx.api.call('h-core', 'calcJudge', judgeBase, favorability, trust) // → JudgeResult
ctx.api.call('h-core', 'getFavorabilityLevel', charId)         // → number
ctx.api.call('h-core', 'getTrustLevel', charId)                // → number
ctx.api.call('h-core', 'registerPremise', id, handler)         // → void
```

#### h-ejaculation — 射精

```typescript
ctx.api.call('h-ejaculation', 'getEja', charId)               // → number
ctx.api.call('h-ejaculation', 'setEja', charId, val)          // → void
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
ctx.api.call('h-group-sex', 'getTemplate', charId)            // → GroupTemplate | null
ctx.api.call('h-group-sex', 'setTemplate', charId, template)  // → void
ctx.api.call('h-group-sex', 'setNpcAiType', charId, type)     // → void
ctx.api.call('h-group-sex', 'getNpcAiType', charId)           // → string
ctx.api.call('h-group-sex', 'getNpcAiName', type)             // → string
```

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
| item:used | inventory-system | `{ charId, itemId }` | 物品使用 |
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
