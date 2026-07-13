# 指令→文字端到端路线图

> 我有一个指令，它的文字该写到哪里？什么场景用哪个文件？分支怎么搞？
> 本文档从指令出发，追踪文字在整个引擎中的完整路径。

---

## 总览

```
指令 (TOML) 执行完毕
  │
  ├── effects 里有 trigger_dialogue
  │     → triggerSceneInternal(scene, charId)
  │         ├── scene-dialogue.toml（旁白，无条件）
  │         ├── character-dialogue.toml（角色通用 fallback）
  │         └── characters/dialogue/{id}/dialogue.toml（角色专属）
  │
  ├── effects 里有 start_conversation
  │     → 对话树（多轮、有玩家选择、可分支）
  │         └── characters/named/{id}/conversations/*.toml
  │
  └── effects 里有 start_quest
        → 多步剧情链（跑路 + 战斗 + 对话 + 收集）
            └── quests/main/ 或 quests/side/
```

**三条路径的本质区别**：

| 路径 | 玩家交互 | 步数 | 典型用途 |
|------|---------|------|---------|
| `trigger_dialogue` | 无——自动显示 | 1 步 | 指令执行后的反应（休息→"你坐下来调息"）|
| `start_conversation` | 有——玩家选分支 | 1 段对话 | 跟特定角色深聊（令狐冲讲独孤九剑）|
| `start_quest` | 有——可跨场景 | 多步 | 完整剧情线（找师父→打怪→交任务）|

### 场景口上 vs 角色口上 vs 剧情链

同一个指令可以同时触发场景口上和角色口上，两者互不排斥：

```
"采集"指令执行 → triggerScene('gather', 令狐冲)
  ├── scene-dialogue.toml  scene=gather
  │   → 旁白描述环境：你蹲下身，在草丛中仔细搜寻。
  └── character-dialogue.toml  scene=gather
      → 角色反应：令狐冲在一旁抱臂看着你。
```

**长段剧情（多步、有分支、跨场景）**不走口上文件——用 quest/event 系统：

```
quests/events/first_meeting.toml
  → 步骤 1: 场景口上触发 → 步骤 2: 对话树 → 步骤 3: 战斗 → 步骤 4: 奖励
```

一句话原则：**口上 = 一句话反应，剧情链 = 多步组织器**。

**三者可以串联**：口上可以带 `effects`（包括 `start_conversation` 和 `start_quest`），
对话节点也可以带 `effects`（包括 `start_quest` 和 `trigger_dialogue`），
任务步也可以带 `effects`（包括 `start_conversation`）。

所以指令→口上→对话→任务是一条完整的链条，文字在哪一步触发由 mod 作者自由决定。

---

## 第一步：写一个指令

```toml
# definitions/instructions/daily.toml

[[instructions]]
id = "rest"
label = "休息"
type = "daily"
time_cost = 60
premises = ["NOT_H", "TIRED_LE_84"]
effects = [
  { type = "recover_permil", target = "self", params = { attr = "体力", rate = 100 } },
  { type = "trigger_dialogue", params = { scene = "rest" } }
]
```

关键字段 `effects`：指令执行完毕后，按顺序执行这些效果。

---

## 第二步：决定文字走哪条路径

### 路径 A：trigger_dialogue — 一句话反应（最常用）

指令执行后，自动触发一段短文字，**没有玩家选择**。

适合：休息、采集、抚摸、打招呼……大多数指令。

在 TOML 中写 `{ type = "trigger_dialogue", params = { scene = "场景名" } }`。

引擎收到这个 effect 后，在三个位置按优先级查找匹配的文本：

```
scene-dialogue.toml（旁白/环境）
  ↑ 低于
character-dialogue.toml（角色通用 fallback）
  ↑ 低于
characters/dialogue/{角色ID}/dialogue.toml（角色专属）
```

**怎么决定把文本写在哪个文件？**

| 文本性质 | 写在哪 | 例子 |
|---------|--------|------|
| **环境描述**，没有说话者 | `scene-dialogue.toml` | "你坐下来，山风拂面。" |
| **任何角色的通用反应**（500 人用同一句） | `character-dialogue.toml` | "XX开始休息。" |
| **某个角色特有的反应** | `dialogue.toml` 在专属文件夹下 | "师弟，累了就歇会儿。" |

**三种文件的格式**：

```toml
# scene-dialogue.toml（旁白）
[[scene_lines]]
scene = "rest"
condition = "location.id == '华山_剑坪'"
text = "你坐在剑坪边缘，俯瞰群山。"

[[scene_lines]]
scene = "rest"
text = "你坐下来调息。"
```

```toml
# character-dialogue.toml（角色通用）
[[character_lines]]
scene = "rest"
condition = "player.好感度 >= 60"
text = "{character.name}关切地看着你。\n{character.name}：累了吧？歇会儿。"

[[character_lines]]
scene = "rest"
text = "{character.name}看着你休息。"
```

```toml
# characters/dialogue/令狐冲/dialogue.toml（角色专属）
[[lines]]
scene = "rest"
condition = "player.好感度 >= 60"
text = "令狐冲笑道：师弟，我这儿有壶好酒。"

[[lines]]
scene = "rest"
text = "令狐冲靠在树上，闭目养神。"
```

**带条件的文字**（同一个 scene 多条，用 condition 区分）：

```toml
[[scene_lines]]
scene = "rest"
condition = "game.time.hour >= 22"
text = "夜深了，你找个避风处躺下。"

[[scene_lines]]
scene = "rest"
text = "你坐下来调息。"
```

同一 scene 多条 condition 都满足 → 随机选一条。

**指令触发的口上也可以带条件本身**：

```toml
effects = [
  { type = "recover_permil", params = { attr = "体力", rate = 100 } },
  # 好感度高时触发热情版口上
  { type = "trigger_dialogue", params = { scene = "rest_high" },
    condition = "player.好感度 >= 60" },
  # 否则触发普通版
  { type = "trigger_dialogue", params = { scene = "rest" } }
]
```

---

### 路径 B：start_conversation — 对话树（有分支）

需要**玩家做选择**、多轮对话时使用。

适合：打听情报、请求帮助、情感场景……

```toml
[[instructions]]
id = "ask_sword"
label = "请教剑法"
type = "daily"
time_cost = 10
premises = ["HAVE_TARGET", "NOT_H"]
effects = [
  { type = "start_conversation" }
]
```

`start_conversation` 会自动根据当前选中的角色和 condition 选择对话树。对话树文件放在 `characters/named/{角色ID}/conversations/` 下：

```toml
# characters/named/令狐冲/conversations/talk_about_sword.toml
id = "talk_about_sword"
condition = "quest.独孤九剑.status == 'active'"

[[nodes]]
id = "start"
lines = ["令狐冲道：师弟，你来了。"]
choices = [
  { text = "询问独孤九剑", next = "ask_sword" },
  { text = "闲聊", next = "chitchat" },
  { text = "告辞", next = "farewell" }
]

[[nodes]]
id = "ask_sword"
lines = ["令狐冲低声道：独孤九剑讲究无招胜有招……"]
effects = [{ type = "set_field", params = { path = "abilities.独孤九剑", value = 1 } }]
next = "start"
```

对话树的完整格式见 `docs/dialogue-format.md`。

---

### 路径 C：start_quest — 多步剧情链

需要**跨场景、多步骤、有进度追踪**时使用。

适合：主线任务、支线任务、长篇事件……

```toml
# quests/main/find_master.toml
id = "find_master"
title = "寻找师父"
type = "main"
auto_start_condition = "location.id == '华山_正殿'"

[[steps]]
id = "go_to_huashan"
type = "objective"
description = "前往华山正殿"
objective = { type = "reach_location", target = "华山_正殿" }

[[steps]]
id = "find_clue"
type = "dialogue"
character = "岳灵珊"
conversation = "worry_about_master"

[[steps]]
id = "defeat_enemy"
type = "combat"
enemies = ["华山_弟子_甲", "华山_弟子_乙"]
on_win = "report"

[[steps]]
id = "report"
type = "reward"
effects = [{ type = "modify_attribute", params = { attr = "声望", value = 10 } }]
```

任务步骤类型：dialogue / combat / objective / reward / spawn / condition / goto。
完整格式见 `docs/mod-author-guide.md`。

---

## 三步决策树（快速参考）

```
指令执行后，我想要……

一句话文字（无交互）
  → effects 里加 { type = "trigger_dialogue", params = { scene = "场景名" } }
    文字写在：
      环境描述 → scene-dialogue.toml
      角色通用 → character-dialogue.toml
      角色专属 → characters/dialogue/{id}/dialogue.toml

多轮对话（有分支、有选择）
  → effects 里加 { type = "start_conversation" }
    对话树写在：
      characters/named/{id}/conversations/*.toml

跨场景剧情链（有进度、有目标）
  → effects 里加 { type = "start_quest", params = { quest = "任务ID" } }
    任务写在：
      quests/main/ 或 quests/side/
```

---

## 文字格式语法

口上文本支持 BBCode 行内标记。常见语法：

| 语法 | 效果 |
|------|------|
| `**加粗**` | **加粗** |
| `*斜体*` | *斜体* |
| `~~删除线~~` | ~~删除线~~ |
| `\|\|黑框\|\|` | 点击展开的 spoiler |
| `{{color:#FF0000 红字}}` | 红色文字 |
| `{{font:楷体 文字}}` | 指定字体 |
| `{{size:large 大字}}` | 字号 |

`{var}` 插值：`{player.name}` `{character.name}` `{location.name}` `{time.hour}`

完整规范及高级用法（typewriter / click / style）：`docs/dialogue-format.md`

## event vs quest

```
effects = [{ type = "start_quest", params = { quest = "my_event" } }]
```

这个 effect 启动的可以是一个**事件**（event）或**任务**（quest），两者底层是同一个机制。

| | event | quest |
|--|-------|-------|
| 玩家感知 | "刚才发生了 XX" | "我正在做 XX" |
| 触发方式 | `auto_start_condition` 自动 | 指令/对话中手动 `start_quest` effect |
| 显示 | 剧情面板或隐式 | 任务列表 |
| TOML type | `type = "event"` | `type = "main"` 或 `"side"` |

```toml
# 事件示例（进入酒馆自动触发）
type = "event"
auto_start_condition = "location.id == '酒馆' && quest.初遇.status == 'not_started'"
display = "current"   # 显示在剧情面板

# 任务示例（玩家主动接取）
type = "main"
# 无 auto_start_condition——玩家通过对话接取
```

**`visible` 字段**：控制任务/事件在 UI 中什么时候可见。
不写则默认始终可见。配合 `display = "hidden"` 可做全程幕后事件。

```toml
# 支线任务——到过相关地点后才出现在任务列表
type = "side"
visible = "location.id == '华山_正殿'"

# 幕后事件——全程不可见，纯推进逻辑
type = "event"
display = "hidden"
auto_start_condition = "game.time.day >= 3"
```

## 口上/对话节点带 effects

口上、对话节点、任务步**三者都支持 `effects` 字段**，可以互相串联：

```toml
# 口上命中后→启动对话（scene-dialogue.toml）
[[scene_lines]]
scene = "enter"
condition = "location.id == '华山_正殿' && quest.华山初遇.status == 'not_started'"
text = "你走进华山正殿，一个青衣少年迎了上来。"
effects = [{ type = "start_conversation", params = { character = "令狐冲", conversation = "初见" } }]

# 对话节点到达后→启动任务（conversations/*.toml）
[[nodes]]
id = "答应了"
lines = ["令狐冲笑道：那就这么说定了！"]
effects = [{ type = "start_quest", params = { quest = "find_master" } }]
choices = [
  { text = "告辞", next = "farewell" }
]

# 任务步完成后→触发口上（quests/*.toml）
[[steps]]
id = "reward"
type = "reward"
effects = [
  { type = "modify_attribute", params = { attr = "声望", value = 10 } },
  { type = "trigger_dialogue", params = { scene = "quest_complete" } }
]
```

详见 `docs/scene-system.md`。

## 相关文档

## 文字渲染到哪里

文字最终出现在两个地方：

| 时机 | 组件 | 行为 |
|------|------|------|
| 指令执行后（output 模式） | **FullscreenOutput** | 全屏覆盖，逐条显示，click 条目隐式等待点击推进 |
| IDLE 状态（exploration 布局） | **NarrativeLog** | 主界面日志栏，可滚动查看历史，始终可见 |

两者读同一数据源（`gameStore.narrativeLogEntries`）。新增 `_display` 等字段时需同步更新两个组件。

---

| 文档 | 内容 |
|------|------|
| `docs/skills/add-instruction.md` | 添加一条新指令的完整工作流 |
| `docs/dialogue-format.md` | 口上/叙事文本的格式规范（含 BBCode）|
| `docs/talk-common-system.md` | `{vagina_s}` 等占位符替换系统 |
| `docs/scene-system.md` | 剧情系统（event vs quest 完整格式）|
| `docs/mod-workflow.md` | 从 500 龙套到专属角色的渐进开发 |
| `docs/mod-author-guide.md` | Mod 作者完整指南 |
