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

- onLoad：API 注册、事件监听、声明条件字段（mod 数据未加载）
- onEnable：调用 API、注册指令、注册 UI（mod 数据已加载）

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

| 方法 | 说明 |
|------|------|
| `getEntity(type, id)` | 获取实体数据 |
| `bindings.get(entityId, key)` | 读绑定属性 |
| `bindings.set(entityId, key, value)` | 写绑定属性 |
| `enterMode(id)` | push 模式到栈 |
| `exitMode()` | pop 模式出栈 |

## 已有插件 API（ctx.api.call(namespace, method, ...))

| namespace | 方法 | 说明 |
|-----------|------|------|
| map | getCurrentLocation/getExits/getChildren/getAncestors/moveTo | 地图服务 |
| character | getCharactersAt/getAttribute/setAttribute/setField/getRelation/setRelation/moveTo | 角色服务 |
| dialogue | triggerScene(scene, charId?)/startConversation(charId, convId?)/getConversations/interpolate | 口上/对话 |

## 标准事件（你可以监听或发出）

| 事件 | 发出者 | 说明 |
|------|--------|------|
| location:enter/leave | game-context | 玩家移动 |
| game:hour_changed/new_day/night_start | game-context | 时间推进 |
| game:mode_changed | game-context | 模式栈变化 |
| game:execution_start/end | command-executor | 指令执行包裹 |
| character:changed | character-system | 角色属性变化 |
| narrative:written | narrative-log | 日志条目写入 |
| dialogue:start/line/end | dialogue-system | 对话生命周期 |

你的插件自定义事件必须加插件名前缀（`myplugin:xxx`），防止冲突。标准事件不加前缀。

## 指令的 effects vs handler

- **effects 类**（plugin.toml [ui]）：数据驱动，`effects = [{type: "xxx", params: {}}]`，由 effect-system 执行（Phase 9+）
- **handler 类**（ctx.commands.register）：编程式，handler 是真实函数，适合复杂逻辑
- Phase 6-7：handler 类用 ctx.commands.register，effects 类等 effect-system（Phase 9）

## 注意事项

- 禁止直接 import 其他插件源文件——走事件总线 + 公共 API
- 禁止硬编码属性名——用 bindings 或 ctx.api.call('engine', 'bindings.get', ...)
- 禁止直接 console.error——用 errorReporter（core/error-reporter.ts）
- 插件错误降级为「禁用该插件 + 弹警告」，不死锁启动
- 测试：每个插件必须有启用/禁用隔离测试
