# 任务系统（quest-system）

## 做什么

管理剧情任务的生命周期：开始、分步推进、目标追踪、完成。任务文件按 main/side 分类放在 `quests/`。步骤由事件驱动自动推进（到达地点、击杀计数、收集物品、对话结束）。发出 `quest:started`、`quest:updated`、`quest:completed` 事件。

## 数据格式

```toml
# quests/main/find_master.toml
id = "find_master"
title = "寻找师父"
prerequisites = ["intro_quest"]
auto_start_condition = "location.id == '华山_正殿'"

[[steps]]
id = "start"
type = "dialogue"
character = "岳灵珊"
conversation = "worry_about_master"
next = "go_to_huashan"

[[steps]]
id = "go_to_huashan"
type = "objective"
description = "前往华山正殿"
objective = { type = "reach_location", target = "华山_正殿" }
next = "find_clue"
```

8 种步骤类型：`dialogue`、`combat`、`objective`、`reward`、`spawn`、`condition`、`goto`、`script`。Objective 的事件驱动：`reach_location`（监听 location:enter）、`kill_count`（combat:end）、`collect_items`（item:added）、`talk_to`（dialogue:end）、`custom`（脚本化目标，监听声明的事件，见下文 C4）。

### 步骤执行上下文（C1，2026-08-14）

`reward` 步骤的 effects 执行时注入上下文 `{ sourceId, _targetIds, uiStore }`（effect-system execute 的 execCtx）：

- `step.source`（可选）：`'player' | 'selected' | 角色ID`，默认 `'player'`（触发者）。决定 effects 的 `sourceId`
- `step.target`（可选）：`'player' | 'selected' | 角色ID`，默认 UI 选中角色，无选中回退 player。决定 `_targetIds`（effects 省略 `target` 时的默认目标）
- `uiStore.selectedCharacterId` = 当前 UI 选中角色，供 effect 显式写 `target = "selected"` 时解析
- ⚠️ `target` 字段双语义：`goto` 步骤里是"下一步 step id"；`reward` 步骤里是"执行目标角色"——按 `step.type` 区分

### combat 步骤参与者过滤（C1，2026-08-14）

`combat:end` 只推进 `step.enemies` 与本次战斗 `participants` **有交集**的战斗——其他战斗（无关敌人/其他场景触发的战斗）结束不推进该步骤，避免多场战斗串步。

### 场景变量（C2，2026-08-14）

任务间通信走数据：每个活跃 scene 带一个 `vars` 字典（`Record<string, any>`），随存档序列化/恢复。

- **写入**：`set_var` effect —— `{ type = "set_var", params = { scene?, var = "key", value = ... } }`；`scene` 省略 = 最新激活场景。也可用 API `ctx.api.call('quest', 'setVar', sceneId, key, value)`
- **读取**：API `ctx.api.call('quest', 'getVar', sceneId, key)`（同步）；条件路径 `quest.{sceneId}.var.{name}`（如 `quest.切磋任务.var.won_duel == 'yes'`、`quest.采集任务.var.count >= 5`）
- **初始值**：任务数据顶层 `vars = { won_duel = "no" }` 预置，启动时展开进运行时
- **条件校验**：`quest.{id}.var.{name}` 已在条件字典注册（加载期可校验、自动进手册）
- ⚠️ 场景完成（从 activeScenes 移除）后 vars 不可读（返回 undefined）——读方需保证写方 scene 仍激活；跨任务通信在"两个任务都激活"的时间窗内进行

### script 步骤（C3，2026-08-14）

步骤内 JS 瞬间逻辑（沙箱执行）：`type = "script"` 的步骤把 `script`（`mods/{mod}/scripts/*.js` 文件名）交给沙箱 runner 执行，返回值决定下一步：

```toml
[[steps]]
id = "win_duel"
type = "script"
script = "duel_reward.js"          # mods/{mod}/scripts/ 下的 .js 文件名（raw 文本加载，不执行模块）
params = { item = "小无相功秘籍" }  # 注入脚本 ctx.params
next = "final"
else = "retry"                     # 可选：脚本返回 false 时跳转
```

**返回值语义**（executeStep 内判定）：

| 脚本返回 | 行为 |
|----------|------|
| `string` | 跳转到该 step id（`advanceToStep`） |
| `false` | 走 `step.else`（无 else 走 `step.next`） |
| `undefined`/其他 | 走 `step.next`（无 next = 场景保持 active 挂起） |
| 抛错 | errorReporter 上报（脚本异常已隔离）+ 走 `step.next`（无 next = 场景保持 active 挂起） |

脚本不存在时 → warning 上报 + 走 `step.next`（无 next = 场景保持 active 挂起）。

场景完成只在 `advanceToStep` 找不到目标步骤时发生（`next`/`else`/返回值指向不存在的步骤 id → 完成）——与其它步骤类型一致；无 next 只是挂起，不会完成。

**脚本内可用 ctx**（沙箱 `with(ctx)` 包裹，禁止访问全局对象/DOM/文件系统；await 只允许瞬间 Promise，禁止跨存档点挂起）：

```js
// sceneId/stepId/params/sourceId/targetIds/payload —— 直接读
getVar(key)                       // 读场景变量（同 quest.getVar）
setVar(key, value)                // 写场景变量（同 quest.setVar）
say(speaker, text)                // 输出到叙事日志（dialogue 类别）
await api.call(ns, method, ...)   // 异步调用任意已注册 API（如 quest.getSceneStatus）
getBinding(entityId, key)         // 读绑定属性（bindings.toml 通用键）
rand(min, max)                    // [min, max] 闭区间随机整数
```

- 沙箱实现：`src/plugins/quest-system/script-runner.ts`（`runQuestScript` / `makeScriptCtx` / `QuestScriptCtx`）
- ⚠️ `Error` 等全局构造器被沙箱屏蔽（`new Error()` 不可用）——脚本内抛错请用 `throw '文本'`，message 经 `String(err)` 上报
- ⚠️ **未声明的变量赋值会被静默吞掉**（`x = 1` 不声明 = 无效，不报错）——所有变量必须先声明。推荐统一用 `let`/`const` 声明（`var` 在此沙箱 async 包装下可用，但与其他沙箱实现存在差异，不推荐）
- ⚠️ 所有全局对象（`Math`/`JSON`/`Date` 等）不可用——随机数用 `rand(min, max)`（[min, max] 闭区间整数，见上），不要依赖任何全局
- 脚本文件在 `loadMod` 时按文件名索引进 `LoadedMod.scripts`（glob `query:'?raw'`，Vite 8 语法）

### custom objective（C4，2026-08-14）

事件驱动的脚本化目标——objective 声明监听什么事件，脚本只做匹配逻辑。适合"H 中高潮 5 次"这类既有 4 类型覆盖不到的事件：

```toml
[[steps]]
id = "wait"
type = "objective"
objective = { type = "custom", event = "h:orgasm", script = "orgasm_counter.js",
              params = { target = "李秋水", count = 5 },
              fail_event = "h:end", on_fail = "final" }
next = "final"
```

字段：

| 字段 | 必填 | 说明 |
|------|------|------|
| `type` | 是 | `"custom"` |
| `event` | 是 | 监听的事件名。当前内置监听 `h:orgasm`（payload `{character, partId, level, count, extra}`）、`h:end`（payload `{ally}`）；其他事件如需驱动，扩 `CUSTOM_EVENT_TYPES` 表 |
| `script` | 是 | `mods/{mod}/scripts/*.js` 文件名。脚本签名 `(payload, ctx) => 'done' | 'pending'`，`ctx.payload` = 事件 payload |
| `params` | 否 | 注入脚本 `ctx.params` |
| `fail_event` | 否 | 失败事件：触发时脚本返回 `'pending'` → 走 `on_fail`；返回 `'done'` 不推进 |
| `on_fail` | 否 | 失败时跳转的 step id；缺省 = 静默继续挂起 |

- **语义**：`event` 触发 → 脚本返回 `'done'` → 走 `next`；脚本返回 `'pending'` → 继续挂起（计数存场景变量 `getVar`/`setVar`，随存档持久化）
- 脚本匹配逻辑自由（如 `payload.character !== params.target → 'pending'` 只计目标角色）
- 计数状态放场景变量（`setVar('orgasm_count', ...)`）——场景变量随存档序列化，但"未达成的次数不跨会话累计"由 mod 作者按需设计（任务完成后场景变量不可读）
- 与既有 4 类型 objective（`checkObjectives`）独立并存：标准事件监听不动，custom 独立监听 `CUSTOM_EVENT_TYPES`

### 任务内嵌对话树（C5，2026-08-14）

任务文件可直接内嵌对话树（`[[dialogues]]` 段，与独立 conversation 文件同格式），不用另建 `conversations/*.toml`——"聊天→H→奖励"一条龙任务单文件写完：

```toml
# quests/event/seduce_night.toml
id = "seduce_night"
title = "夜访"
type = "event"
display = "hidden"

[[dialogues]]
id = "seduce"
[[dialogues.nodes]]
id = "start"
lines = ["李秋水道：夜深了。"]
[[dialogues.nodes.choices]]
text = "好"
next = "end"
[[dialogues.nodes]]
id = "end"
lines = ["你留了下来。"]

[[steps]]
id = "s1"
type = "dialogue"
conversation = "scene:seduce_night/seduce"   # scene:{任务ID}/{内嵌对话ID}
next = "final"

[[steps]]
id = "final"
type = "reward"
effects = []
next = "not_exist"
```

- **引用写法**：`conversation = "scene:{sceneId}/{dialogueId}"` 字符串简写，或对象 `{ type = "scene", scene = "{sceneId}", name = "{dialogueId}" }`
- **注册时机**：loadMod 解析 quests//events/ 下的任务文件时，`[[dialogues]]` 自动注册进 `mod.conversations.scene`（sceneId → dialogueId → Conversation）；同一任务内 dialogue id 重复 → 加载期 error
- **语义**：`scene:` 引用与角色/全局对话完全等价——dialogue 步骤照常走 `dialogue.startConversation`（resolveConversation 的 case 'scene'），对话树格式（nodes/lines/choices/effects/next）与独立 conversation 文件一致
- **作用域**：内嵌对话归属任务（sceneId），只在该任务作用域内可引用；跨任务复用请用独立的 conversation 文件

## Mod 作者使用

放 quests/main/ 或 quests/side/。用 `auto_start_condition` 或 `start_quest` effect 启动。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('quest', 'start', sceneId)                 → void（event/quest 通用）
ctx.api.call('quest', 'getActiveScenes')                → string[]（活跃 scene ID 列表）
ctx.api.call('quest', 'getSceneStatus', sceneId)        → 'not_started' | 'active' | 'completed'
ctx.api.call('quest', 'advanceStep', sceneId, stepId)   → void
ctx.api.call('quest', 'checkTriggerConditions')         → string[]（未开始且带 condition 的 scene）
ctx.api.call('quest', 'getVar', sceneId, key)           → any（场景变量；不存在 → undefined）
ctx.api.call('quest', 'setVar', sceneId, key, value)    → void（写场景变量）
```

## Override 规则

任务定义遵循三层 override（`docs/mod-override.md`）。任务 step 按 ID 匹配替换（对象数组规则）。
