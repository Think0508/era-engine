# 任务系统（quest-system）

## 做什么

管理剧情任务的生命周期：开始、分步推进、目标追踪、完成。任务文件按 main/side/event 分类放在 `quests/`。步骤由事件驱动自动推进（到达地点、击杀计数、收集物品、对话结束、H 事件）。发出 `scene:started`、`scene:updated`、`scene:completed` 事件。

## 核心概念：C' 模型

任务 = **数据步骤骨架（存档边界）+ 步骤内 JS 脚本（瞬间逻辑）**：

- **步骤骨架是存档边界**：所有跨存档点的状态（进行到哪一步、目标进度、场景变量）都在 `activeScenes` 运行时对象里，随存档序列化/恢复。步骤本身（`[[steps]]`）是纯数据，推进由事件驱动。
- **脚本是瞬间逻辑**：`script` 步骤 / custom objective 的 JS 只做"匹配、计数、发奖励"这类瞬间判断，`await` 只允许瞬间 Promise，**绝不跨存档点挂起**。
- 任务间通信走**数据**（场景变量），不靠模块级共享状态；换/删/加任务对其他部分零影响。
- 台词不占步骤：`say()`（脚本内）、`lines`（dialogue 步骤内联旁白）、内嵌 `[[dialogues]]` 三层选择，不写死在效果链里。

## 完整示例（两个李秋水任务，example-mod）

```toml
# mods/example-mod/quests/events/spar_liqiushui.toml
# 示例：切磋打赢李秋水 → 得小无相功秘籍（单文件）
id = "spar_liqiushui"
title = "与李秋水切磋"
type = "event"
display = "log"

triggers = [
  { type = "command", command = "spar", condition = "selected.id == '李秋水'" },
]

[[steps]]
id = "fight"
type = "combat"
enemies = ["李秋水"]
on_win = "reward"
on_lose = "lost"

[[steps]]
id = "reward"
type = "script"
script = "quest_reward.js"
params = { item = "小无相功秘籍", lines = ["李秋水将秘籍掷来：拿去，莫要辱了它。"] }

[[steps]]
id = "lost"
type = "script"
script = "quest_reward.js"
params = { lines = ["你落败了，李秋水摇头不语。"] }
```

```toml
# mods/example-mod/quests/events/h_with_liqiushui.toml
# 示例：聊天触发 → H → 高潮5次 → 她得天独 + 我得秘籍（单文件）
id = "h_liqiushui"
title = "与李秋水共度良宵"
type = "event"
display = "log"

triggers = [
  { type = "dialogue_end", character = "李秋水" },
]

[[dialogues]]
id = "seduce"

[[dialogues.nodes]]
id = "start"
lines = ["李秋水轻声道：夜深了……你留下来可好？"]
choices = [
  { text = "好", effects = [{ type = "h_start_h", target = "selected" }], next = "end" },
  { text = "改天吧", next = "end" },
]

[[dialogues.nodes]]
id = "end"
lines = ["烛影摇红。"]

[[steps]]
id = "story"
type = "dialogue"
conversation = "scene:h_liqiushui/seduce"
next = "count"

[[steps]]
id = "count"
type = "objective"
objective = { type = "custom", event = "h:orgasm", script = "orgasm_counter.js", params = { target = "李秋水", count = 5 }, fail_event = "h:end", on_fail = "tease" }
next = "reward"

[[steps]]
id = "reward"
type = "script"
script = "quest_reward.js"
params = { set_talent = { target = "李秋水", path = "talents.冰肌玉骨", value = 1 }, item = "白虹掌力秘籍", lines = ["李秋水慵懒地靠在榻上：倒是个可人儿。"] }

[[steps]]
id = "tease"
type = "script"
script = "quest_reward.js"
params = { lines = ["李秋水轻笑：就这点本事？"] }
```

配套脚本（`mods/{mod}/scripts/`，按文件名索引）：

```js
// quest_reward.js —— 通用奖励脚本：发物品 / 加天赋 / 输出台词（params 驱动，可复用）
if (params.item) {
  await api.call('inventory', 'addItem', sourceId, params.item, 1)
}
if (params.set_talent) {
  const t = params.set_talent
  const targetIds = t.target === 'player' ? [sourceId] : [t.target]
  await api.call('effect-system', 'execute',
    [{ type: 'set_field', target: targetIds[0], params: { path: t.path, value: t.value } }],
    { sourceId, _targetIds: targetIds })
}
for (const line of params.lines ?? []) {
  say(null, line)
}
return undefined
```

```js
// orgasm_counter.js —— 通用高潮计数：目标角色在一次 H 会话内高潮 N 次
if (payload.character !== params.target) return 'pending'
const cur = (getVar('orgasm_count') ?? 0) + 1
setVar('orgasm_count', cur)
return cur >= params.count ? 'done' : 'pending'
```

两个任务各展示一条"单文件完整链路"：前者 = command 触发 → 战斗 → 按胜负发不同奖励；后者 = dialogue_end 触发 → 内嵌对话（含 H 启动选项）→ custom objective 数高潮 → 脚本发天赋+物品。

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

任务文件放 `quests/main/`（主线）、`quests/side/`（支线）或 `quests/events/`（事件型任务，`type = "event"`，无 UI 追踪入口，靠 triggers/指令启动）。

**8 种步骤类型**：

| 类型 | 说明 | 特有字段 |
|------|------|----------|
| `dialogue` | 委托 dialogue-system（可含内联旁白 lines） | character, conversation, lines, speaker |
| `combat` | 委托 combat-system | enemies, on_win, on_lose |
| `objective` | 目标追踪，事件驱动自动检查 | objective |
| `reward` | 执行效果 | effects |
| `spawn` | 创建角色/物品 | template, at_location, count |
| `condition` | 检查游戏状态分支 | condition, next(满足), else(不满足,可选) |
| `goto` | 跳转到另一个步骤 | target |
| `script` | 步骤内 JS 瞬间逻辑（沙箱），返回值决定下一步 | script, params, next, else |

所有步骤通用可选字段：`source`（`'player' | 'selected' | 角色ID`，默认 `'player'` 触发者，决定 effects/脚本的 `sourceId`）、`target`（`'player' | 'selected' | 角色ID`，默认 UI 选中，决定 `_targetIds`）。⚠️ `target` 字段双语义：`goto` 步骤里是"下一步 step id"；其他步骤里是"执行目标角色"——按 `step.type` 区分。

### 步骤执行上下文（C1，2026-08-14）

`reward` 步骤的 effects 与 `script` 步骤的脚本执行时注入上下文 `{ sourceId, _targetIds, uiStore }`：

- `step.source`（可选）：`'player' | 'selected' | 角色ID`，默认 `'player'`（触发者）。决定 effects 的 `sourceId`
- `step.target`（可选）：`'player' | 'selected' | 角色ID`，默认 UI 选中角色，无选中回退 player。决定 `_targetIds`（effects 省略 `target` 时的默认目标）
- `uiStore.selectedCharacterId` = 当前 UI 选中角色，供 effect 显式写 `target = "selected"` 时解析

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

场景完成只在 `advanceToStep` 找不到目标步骤时发生（`next`/`else`/返回值指向不存在的步骤 id → 完成）——与其它步骤类型一致；**无 next 只是挂起，不会完成**。

> **显式结束写法（2026-08-15）**：`next = ""`（空字符串）= 立即结束场景（advanceToStep 找不到空 id → 完成）。替代旧 `next = "不存在的id"` 哨兵写法——加载期校验（validateSceneSteps）会把未定义的步骤引用报为 error，空字符串是唯一合法的"结束"引用。

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
- ⚠️ **沙箱为 MVP 级（防意外访问，非安全边界）**：可拦截裸全局标识符与 this 逃逸，但对象字面量的 constructor 链（如 `({}).constructor('return process')()`）可构造新函数访问全局——脚本须视为同 TOML 信任级别的 mod 作者代码，**勿处理不可信输入**（根治方案：phase-15 acorn 白名单沙箱）
- ⚠️ `Error` 等全局构造器被沙箱屏蔽（`new Error()` 不可用）——脚本内抛错请用 `throw '文本'`，message 经 `String(err)` 上报
- ⚠️ **变量必须声明后使用**（`let`/`const`）——脚本在严格模式沙箱内运行，未声明赋值（`x = 1`）会抛 **TypeError**（`'set' on proxy: trap returned falsish`）被上报并隔离（按 next 分支推进）；`var` 声明可用但风格上推荐 `let`/`const`
- ⚠️ 所有全局对象（`Math`/`JSON`/`Date` 等）不可用——随机数用 `rand(min, max)`（[min, max] 闭区间整数，见上），不要依赖任何全局
- ⚠️ **超时保护（5 秒）**：脚本 `await` 的 API 超过 5 秒 → 上报 error + 按 next 分支推进；但超时中止后脚本已开始的副作用（变量/状态修改）仍可能完成（Promise 无法取消，仅结果被丢弃）
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
| `script` | 是 | `mods/{mod}/scripts/*.js` 文件名。脚本在沙箱 `with(ctx)` 中执行，`payload` = 事件 payload（直接可读），返回 `'done' | 'pending'` |
| `params` | 否 | 注入脚本 `ctx.params` |
| `fail_event` | 否 | 失败事件：触发时脚本返回 `'pending'` → 走 `on_fail`；返回 `'done'`（目标实际已达成）→ 与主路径一致走 `next` |
| `on_fail` | 否 | 失败时跳转的 step id；缺省 = 静默继续挂起 |

- **语义**：`event` 触发 → 脚本返回 `'done'` → 走 `next`；脚本返回 `'pending'` → 继续挂起（计数存场景变量 `getVar`/`setVar`，随存档持久化）
- 脚本匹配逻辑自由（如 `payload.character !== params.target → 'pending'` 只计目标角色）
- 计数状态放场景变量（`setVar('orgasm_count', ...)`）——场景变量随存档序列化，但"未达成的次数不跨会话累计"由 mod 作者按需设计（任务完成后场景变量不可读）
- 脚本缺失 → 去重 warning + 目标保持挂起（不误推进）
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
next = ""     # 显式结束标记（空字符串 = 立即结束场景）
```

- **引用写法**：`conversation = "scene:{sceneId}/{dialogueId}"` 字符串简写，或对象 `{ type = "scene", scene = "{sceneId}", name = "{dialogueId}" }`
- **注册时机**：loadMod 解析 quests//events/ 下的任务文件时，`[[dialogues]]` 自动注册进 `mod.conversations.scene`（sceneId → dialogueId → Conversation）；同一任务内 dialogue id 重复 → 加载期 error
- **语义**：`scene:` 引用与角色/全局对话完全等价——dialogue 步骤照常走 `dialogue.startConversation`（resolveConversation 的 case 'scene'），对话树格式（nodes/lines/choices/effects/next）与独立 conversation 文件一致
- **作用域**：内嵌对话归属任务（sceneId），只在该任务作用域内可引用；跨任务复用请用独立的 conversation 文件

### triggers 触发声明（C6，2026-08-14）

任务文件可声明触发条件——指令拦截 / 对话结束自动启动，mod 作者不用写任何启动代码：

```toml
# quests/event/duel_reward.toml
id = "duel_reward"
type = "event"
display = "hidden"

[[triggers]]
type = "command"                              # 指令拦截：执行该指令时（条件满足）改道启动本任务
command = "spar"                              # 指令 id（CommandRegistry）
condition = "selected.id == '李秋水'"          # 可选：触发条件（条件引擎表达式）

[[triggers]]
type = "dialogue_end"                         # 对话结束触发：与指定角色对话结束时启动本任务
character = "李秋水"

[[steps]]
id = "s1"
type = "reward"
effects = [{ type = "narrative_output", params = { text = "剧情开始" } }]
```

- **command 拦截语义**：条件满足时指令改道执行场景，**指令自身的 effects/handler 不执行**（时间也不推进）；条件不满足 → 走指令默认行为。场景已活跃/已完成 → 跳过
- **冲突检测**：同一指令多个 trigger 条件同时满足 → errorReporter 报错（含各 scene id）+ 不拦截（走指令默认行为）——触发条件需互斥（如按 `selected.id` 区分）
- **dialogue_end 语义**：与指定角色对话结束（`dialogue:end` 事件 payload 的 `character`）时启动匹配场景；已活跃/已完成 → 跳过
- **条件求值**：用 `gameContext.getContext()` 的 `selected`/`player` 路径（UI 选中已由 bridge 同步，无需额外参数）；求值抛错 → 去重 warning + 不拦截（指令默认 handler 正常执行）
- **索引生命周期**：onEnable 初始构建；`game:load`（读档后 mod.quests 重建）自动重建；运行时增删带 triggers 的任务（如动态 scene）需调 `ctx.api.call('quest', 'reindexTriggers')`
- **类型校验**：加载期校验 `type` 合法值——非法 type / 未实现类型（`location_enter`/`item_used`/`time`，Phase 2 计划）→ error（含任务 id + 文件），防止作者以为已生效而静默失效

### 运行时 scene 注册（C7，2026-08-14）

动态/制式任务生成入口——运行时构造 Quest 对象并注册，数据走与 TOML 任务同一套执行链路（steps 链、triggers、auto_start 全部生效）：

```typescript
// 构造完整 Quest 对象（steps 必需）——id 需全局唯一（建议前缀/时间戳）
const scene = { id: 'dynamic_quest', title: '动态任务', type: 'side', display: 'hidden', steps: [...] }
ctx.api.call('quest', 'registerScene', scene)   // → void
ctx.api.call('quest', 'start', 'dynamic_quest') // 注册后即可照常启动
```

- **写入位置**：`mod.quests`（与 TOML 任务同表）——start/getSceneStatus/advanceStep/checkAutoStart 等全部既有 API 立即生效
- **校验范围**：registerScene 走运行时路径，但**共用 `validateSceneSteps` 步骤图校验**（步骤 id 唯一/引用字段指向存在步骤/objective/combat/goto 必填字段——与 TOML 路径同一校验函数，含场景定位）+ 空 steps/重复 id 拒绝注册（报错不覆盖）；带 `dialogues` 的 scene 自动注册进 `conversations.scene`，`scene:` 引用可用（G2-I-2 修正：与 TOML 路径一致）
- **副作用**：注册后自动重建触发器索引（新场景的 triggers 立即拦截）+ 立即检查 condition 自动触发
- **重复 id** → errorReporter 报错（含 id）+ 不覆盖（跳过注册）
- **与 registerDynamicScene 的区别**：后者注册进独立动态表（不持久、注册方负责读档重建，confinement 追捕委托用）；本 API 注册后常驻 mod.quests
- **角色生成配套**：`ctx.api.call('character', 'spawnCharacter', templateId, atLocation, overrides?)` → 按 `templates/character/` 模板实例化角色（模板与 overrides 深合并、放置到指定地点、随存档持久化），生成 id 规则 `{templateId}_{timestamp}_{随机后缀}`；模板不存在 → errorReporter + null——支撑"先 spawn 敌人再注册追捕任务"的完整动态链路

## 存档行为

- quest-system 注册存档 provider（`id = 'quest-system'`，经 `src/core/save-system.ts` 的 provider 注册表）：进行中任务（`activeScenes`）、场景变量（vars）、嵌套场景栈（sceneStack）随存档序列化，读档后按原样恢复
- 已完成任务由 `gameContext` 维护（`addCompletedScene`），随存档保存——读档后已完成任务不会重新启动（`start` 跳过、触发跳过）
- 恢复后 `mod.quests`（TOML 数据 + 运行时注册的 scene）重建，triggers 索引由 `game:load` 事件自动重建
- 动态 scene（`registerDynamicScene`）**不随存档序列化**——注册方（如 confinement）负责在存档 restore 后按原样重建

## Mod 作者使用

放 quests/main/、quests/side/ 或 quests/events/。用 `auto_start_condition`、`start_quest` effect 或 triggers 启动。任务间通信用场景变量（不要共享模块级状态）。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('quest', 'start', sceneId)                 → void（event/quest 通用）
ctx.api.call('quest', 'getActiveScenes')                → string[]（活跃 scene ID 列表）
ctx.api.call('quest', 'getSceneStatus', sceneId)        → 'not_started' | 'active' | 'completed'
ctx.api.call('quest', 'advanceStep', sceneId, stepId)   → void
ctx.api.call('quest', 'checkAutoStart')                  → void（M3：统一自动启动入口——求值所有未开始场景的 condition/auto_start_condition，满足即启动；dialogue 口上链也经此转发）
ctx.api.call('quest', 'getVar', sceneId, key)           → any（场景变量；不存在 → undefined）
ctx.api.call('quest', 'setVar', sceneId, key, value)    → void（写场景变量）
ctx.api.call('quest', 'registerDynamicScene', sceneId, scene)     → void（动态 scene，不持久）
ctx.api.call('quest', 'startDynamicScene', sceneId, scene)        → void（注册 + 启动一步完成）
ctx.api.call('quest', 'unregisterDynamicScene', sceneId)          → void（移除动态 scene）
ctx.api.call('quest', 'reindexTriggers')                → void（C6 重建触发器索引）
ctx.api.call('quest', 'registerScene', scene)           → void（C7 运行时注册 scene——写入 mod.quests，立即重建触发器索引 + 检查自动触发；重复 id/空 steps 报错不覆盖；共用 validateSceneSteps 步骤图校验；带 dialogues 自动注册进 conversations.scene）
```

## Override 规则

任务定义遵循三层 override（`docs/mod-override.md`）。任务 step 按 ID 匹配替换（对象数组规则）。
