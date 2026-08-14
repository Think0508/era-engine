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

7 种步骤类型：`dialogue`、`combat`、`objective`、`reward`、`spawn`、`condition`、`goto`。Objective 的事件驱动：`reach_location`（监听 location:enter）、`kill_count`（combat:end）、`collect_items`（item:added）、`talk_to`（dialogue:end）。

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
