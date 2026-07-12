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

## Mod 作者使用

放 quests/main/ 或 quests/side/。用 `auto_start_condition` 或 `start_quest` effect 启动。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('quest', 'start', questId)                → void
ctx.api.call('quest', 'getActiveQuests')                → string[]（quest ID 列表）
ctx.api.call('quest', 'getQuestStatus', questId)        → string
ctx.api.call('quest', 'advanceStep', questId, stepId)   → void
```

## Override 规则

任务定义遵循三层 override（`docs/mod-override.md`）。任务 step 按 ID 匹配替换（对象数组规则）。
