# 剧情系统 — scene-system.md

## 概述

Scene 是引擎的统一剧情单元，覆盖两种常见呈现方式：

- **事件（event）**：被动触发，由条件自动推进，玩家感觉"剧情自然发生了"
- **任务（quest）**：主动接取/自动开始，显示在任务列表，玩家有"在做任务"的感知

底层是同一条引擎——多步、可暂停、可分支、可嵌套。

## 什么时候用 event，什么时候用 quest？

| 场景 | 用 | 理由 |
|------|----|------|
| 进入酒馆时自动触发一段演出 | **event** | 被动触发，玩家没有"接" |
| 令狐冲找你聊天，聊出一个支线 | **quest** | 玩家感觉"接了个事" |
| 哈利波特里礼堂突然出现异响 | **event** | 剧情自己推进 |
| 你去禁林调查异响 | **quest** | 玩家在做一件事 |
| 赫敏教你一个咒语 | **event** | 教学/教程型 |
| 你需要收集 10 个材料 | **quest** | 明确的进度目标 |

**经验法则：** 如果玩家能说"我正在做 XX"，用 quest。如果说"刚才发生了 XX"，用 event。

## Scene 数据格式

```toml
# events/first_meeting.toml
id = "first_meeting"                    # 唯一 ID
title = "初次见面"                       # 可选：场景名称（用于列表/日志）
display = "current"                     # "current" 当前剧情面板 / "hidden" 不显示 / "log" 只记大事志
type = "event"                          # "event" 被动 / "quest" 主动

# 可选：触发条件（event 用）
condition = "location.id == '华山_正殿' && scene.has_character('令狐冲') && quest.初遇.status == 'not_started'"

# 可选：任务可见条件（quest 用）
visible = "location.id == '华山_正殿'"

# 步骤
[[steps]]
id = "meet"
type = "dialogue"                       # 对话步：调 conversation
character = "令狐冲"
conversation = "初见"

[[steps]]
id = "find_sword"
type = "objective"                      # 目标步：事件驱动自动检查
objective = { type = "reach_location", target = "华山_思过崖" }

[[steps]]
id = "reward"
type = "reward"                         # 奖励步：执行效果
effects = [{ type = "set_field", params = { path = "talents.思过崖奇遇", value = 1 } }]

[[steps]]
id = "complete"
type = "goto"
target = "meet"                         # 循环/跳转
```

## 步骤类型

| 类型 | 说明 | 特有字段 |
|------|------|----------|
| `dialogue` | 调 conversation 对话树 | character, conversation |
| `objective` | 目标追踪，条件满足自动完成 | objective |
| `reward` | 执行效果 | effects |
| `combat` | 触发战斗 | enemies, on_win, on_lose |
| `condition` | 条件分支 | condition, next(满足), else(不满足) |
| `goto` | 跳转到另一步 | target |
| `scene` | 触发嵌套子场景 | scene_id |

## 触发与拦截机制

```
指令执行
  ↓
triggerScene("scene_name")
  ↓
① event-system 检查：当前有无匹配的 event？
   ├─ 有 → 执行 event 演出，停止 ← 普通口上/对话不执行了
   └─ 没有 →
② dialogue-system 正常查找
   ├─ conversation（对话树）？
   ├─ scene_lines（反应式口上）？
   └─ 兜底地文（talk-common-system）
```

**关键规则：** event 一旦触发，完全接管这次 triggerScene。不存在"event 演完再补一句普通口上"。event 本身可以包含 conversation（对话树），其中的 lines 就是这次演出的全部内容。

### 主动触发

event 不限于被动。通过 `start_scene` effect 可主动触发另一个 scene：

```toml
# conversation 里选特定选项 → 触发 event
[[nodes]]
id = "ask_about_hogwarts"
lines = ["赫敏眼睛一亮：「你也想去霍格沃茨？」"]
choices = [
  { text = "当然想", next = "excited",
    effects = [{ type = "start_scene", params = { scene = "初登特快列车" } }] },
]
```

## 嵌套

```toml
[[steps]]
id = "side_event"
type = "scene"
scene_id = "mini_side_story"            # 触发子场景，完成后回到当前场景的下一步
```

子场景可以是 event 或 quest，独立管理进度。主场景不阻塞——玩家可以做到一半去做别的事。

## Scene 与 Conversation 的关系

```
Scene 步: type = "dialogue"
  └→ conversation（对话树，多节点分支演出）
      └→ nodes.lines（口上演出的文本行）
      └→ nodes.effects（可改变 scene 进度）

Scene 步: type = "objective"
  └→ 事件监听（location:enter / combat:end 等）自动检查进度
```

- conversation 是"一步内"的分支交互
- scene 是"多步间"的剧情推进
- conversation 的 effects 可以调 `advanceScene(sceneId, nextStepId)` 来推动 scene

## 口上与 Conversation 的选择建议

| 需求 | 用 |
|------|----|
| 一句简单的反应（"你好"） | 口上 scene_lines（轻量） |
| 一句话根据条件不同 | 口上 scene_lines（多条 + condition） |
| 多轮对话，有分支选择 | conversation 对话树 |
| 需要推进任务/改变属性 | conversation（effects）或 scene（reward 步） |
| 多地点跑腿、战斗、收集 | scene（多步 objective/combat/reward） |
| 不显示在任务列表的被动剧情 | scene type = "event" |
