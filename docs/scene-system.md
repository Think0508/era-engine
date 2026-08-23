# Scene 系统 — 事件/任务统一管理

## 概述

Scene 是引擎的统一剧情单元。**事件（event）和任务（quest）使用同一套数据格式**，引擎不区分它们——只有 UI 展示方式不同。

### 原则

- Event 和 quest 是同一个东西——`type` 字段只影响默认 UI 行为
- 引擎不限制"event 里不能嵌套 quest"或"quest 里不能触发 event"
- 所有 scene 统一通过 `id` 索引，兼容多层子目录文件组织

## 什么时候用 event，什么时候用 quest？

| 你想做什么 | 用 `type` | 理由 |
|-----------|-----------|------|
| 进入酒馆自动触发一段演出 | `event` | 玩家没有"接"，被动发生 |
| 令狐冲找你聊天引出支线 | `side` | 玩家感觉"接了个事" |
| 教堂突然出现异响 | `event` | 剧情自己推进，玩家是被动的 |
| 你去调查异响 | `main` 或 `side` | 玩家主动在做一件事 |
| 赫敏教你咒语（教学型） | `event` | 走流程，不显示在任务列表 |
| 你收集 10 个材料 | `side` | 明确的进度目标，玩家追踪 |

经验法则：如果玩家会说"我正在做 XX"→ quest。如果说"刚才发生了 XX"→ event。

## 文件组织

所有 scene 文件放在 mod 的 `quests/` 或 `events/` 目录下，**支持多层子目录**：

```
mods/武侠/
├── quests/
│   ├── main/                  # 主线
│   │   └── 第一章/
│   │       ├── intro.toml
│   │       ├── find_master.toml
│   │       └── sub_events/    # 子场景可以放在子目录
│   │           └── talk_linghu.toml
│   └── side/                  # 支线
│       ├── 采集草药.toml
│       └── 日常/
│           └── 打水.toml
├── events/                    # 事件（被动触发）
│   ├── 酒馆/
│   │   ├── 偶遇.toml
│   │   └── 斗殴.toml
│   └── 序章/
│       └── 醒来.toml
```

引擎通过 `id` 索引，不关心文件路径。子目录只服务于 mod 作者的组织习惯。两个目录下都可以放任意 `type` 的 scene（`events/` 下放 `type = "main"` 也行）。

## Scene ID 命名

- **全局唯一**——加载时报错检测重复
- 建议按目录层级加前缀，上百个 scene 时好管理：

```toml
id = "ch1_find_master"       # 第一章相关
id = "side_collect_herbs"    # 支线采集
```

ID 重复时加载会报错（含文件路径），保证不会静默覆盖。

## Scene 数据格式

```toml
# quests/main/find_master.toml
id = "ch1_find_master"                # 唯一 ID（必填）
title = "寻找师父"                      # 场景名称（用于面板/日志）
type = "main"                         # main/side/event
parent = ""                           # 可选：父 scene ID，UI 显示层级用

# 可选：自动触发条件
condition = "location.id == '华山_正殿' && character.令狐冲.好感度 >= 30"
# 注意：旧字段名 auto_start_condition 也可用（兼容），建议统一用 condition

# 显示控制
display = "current"                   # current/log/hidden
visible = "location.id == '华山'"      # 可选：列表可见条件

prerequisites = ["intro"]             # 可选：前置 scene 必须已完成

[[steps]]
# ... 步骤数组
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `id` | string | ✅ | 全局唯一的 scene ID |
| `title` | string | 否 | 场景名（面板/日志用） |
| `type` | string | ✅ | `main` 主线 / `side` 支线 / `event` 事件 |
| `parent` | string | 否 | 父 scene 的 ID，UI 按此显示层级 |
| `condition` | string | 否 | 触发条件——条件表达式；满足时自动开始 scene（旧名 `auto_start_condition` 也兼容） |
| `display` | string | 否 | `current`（面板+输出） / `log`（只输出） / `hidden`（静默） |
| `visible` | string | 否 | 面板可见条件（`display=current` 时有效） |
| `prerequisites` | string[] | 否 | 前置 scene ID 列表，全部完成后才能开始当前 scene |
| `steps` | array | ✅ | 步骤定义（见下文） |

## 步骤类型

所有 step 共有的字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `id` | string | ✅ | 在当前 scene 内唯一的 step ID |
| `type` | string | ✅ | 步骤类型（见下） |
| `next` | string | 否 | 完成后跳转到哪个 step ID。没有 `next` → scene 完成 |
| `title` | string | 否 | 面板上显示的文字（只有 `objective` 步骤有意义） |

### dialogue——对话演出

支持三种内容，可组合使用：

```toml
[[steps]]
type = "dialogue"
# A：旁白（可选）
lines = ["你走进大殿，令狐冲负手而立。"]
# B：对话（可选）——4 种类型可选
conversation = "character:令狐冲/teach_sword"
# C：说话者（可选）
speaker = "令狐冲"
next = "after_talk"
```

执行顺序：先输出 `lines`，再起 `conversation`。`speaker` 是默认说话者，对话系统渲染时用。

**conversation 的 4 种引用方式**：

| 字符串简写 | 含义 | 文件位置 |
|-----------|------|---------|
| `character:令狐冲/teach_sword` | 角色专属对话 | `characters/令狐冲/conversations/teach_sword.toml` |
| `global:common_victory` | 全局共享对话 | `conversations/common_victory.toml` |
| `quest:第一章/intro` | 任务专属对话 | `quests/**/conversations/第一章/intro.toml` |
| `event:酒馆/偶遇` | 事件专属对话 | `events/**/conversations/酒馆/偶遇.toml` |

或者用展开对象（等价于字符串简写）：

```toml
conversation = { type = "character", character = "令狐冲", name = "teach_sword" }
conversation = { type = "global", name = "common_victory" }
conversation = { type = "quest", path = "第一章/intro" }
conversation = { type = "event", path = "酒馆/偶遇" }
```

**对话步的其他组合示例**：

```toml
# 纯旁白
lines = ["一阵风吹过……"]

# 纯对话（有说话者）
conversation = "character:令狐冲/teach_sword"
speaker = "令狐冲"

# 全局对话（无固定角色）
conversation = "global:common_victory"

# 旁白 + 对话
lines = ["你走进大殿。"]
conversation = "character:令狐冲/teach_sword"
speaker = "令狐冲"
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `lines` | string[] | 否 | 内联旁白，conversation 之前输出 |
| `conversation` | string 或 table | 否 | 引用对话。字符串 `"type:参数"` 或对象 `{ type, ... }` |
| `speaker` | string | 否 | 默认说话者，影响样式/头像等 UI 渲染，不自动加文字前缀 |

### Conversation 文件内容格式

Conversation 文件放在对应目录下。内容独立于 scene，可被多个 scene 引用：

```toml
# characters/令狐冲/conversations/teach_sword.toml
id = "teach_sword"            # 可选，默认用文件名
condition = "..."              # 可选：对话出现条件

[[nodes]]
id = "start"
lines = ["想学剑？拜师要去找掌门。"]   # 纯文本，无前缀
choices = [
  { text = "岳掌门在哪", next = "ask_location" },
  { text = "改天再来",
    effects = [{ type = "start_scene", params = { scene = "learn_sword" } }] },
]

[[nodes]]
id = "ask_location"
lines = ["令狐冲指了指正殿方向。"]
next = "end"

[[nodes]]
id = "end"
lines = ["你向正殿走去。"]
```

lines 支持纯文本（Speaker 写在文字里）或带 speaker 的对象格式（高级用法）：

```toml
lines = [
  "无 speaker 的文字",
  { speaker = "令狐冲", text = "有 speaker 的文字" },
]
```

### 说话者样式（speaker style）

可以为每个说话者注册样式（颜色、字体、速度等），在 `[styles.speaker]` 下定义。
**只能定义在 styles.toml 中**（引擎只从 `mods/{mod}/definitions/talk/styles.toml` 加载 mod.styles，
scene 文件内的 `[styles]` 不生效）：

```toml
# 在 mod 的 styles.toml 中
[styles]
# 普通 style
slow = { display = "typewriter", speed = 40 }   # speed 单位 = 毫秒/字

# speaker style——key 直接写角色名
[styles.speaker]
令狐冲 = { color = "#FFD700" }
岳灵珊 = { color = "#FF69B4" }
```

渲染时自动应用，不需要手动指定。speaker 元数据通过 `dialogue:line` 事件传递给 UI，后续可扩展头像框、popup 等。

### objective——目标追踪

等待游戏事件触发，条件匹配时自动推进到 `next`。不阻塞——玩家可以继续做其他事。

```toml
[[steps]]
id = "reach_holy_peak"
type = "objective"
title = "前往华山正殿"          # 面板上显示的进度文字
objective = { type = "reach_location", target = "华山_正殿" }
next = "step_3"
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `objective` | object | ✅ | 目标定义 |
| `objective.type` | string | ✅ | 目标类型 |

objective.type 可选值：

| type | 监听什么 | 匹配方式 | 示例 |
|------|---------|---------|------|
| `reach_location` | `location:enter` | `target == 到达的地点ID` | `{ type = "reach_location", target = "华山_正殿" }` |
| `kill_count` | `combat:end` | 匹配敌人类型（TODO 计数） | `{ type = "kill_count", target = "山贼", count = 5 }` |
| `collect_items` | `item:added` | 匹配物品 ID（TODO 计数） | `{ type = "collect_items", item = "草药", count = 3 }` |
| `talk_to` | `dialogue:end` | `character == 对话的角色` | `{ type = "talk_to", character = "岳不群" }` |

### combat——战斗

触发一场战斗。战斗结束后跳转到对应分支。

```toml
[[steps]]
id = "fight_bandits"
type = "combat"
enemies = ["山贼_甲", "山贼_乙"]
on_win = "reward_step"          # 胜利后跳转
on_lose = "fight_bandits"       # 失败后跳转（这里写自己 = 重打）
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `enemies` | string[] | ✅ | 敌人 ID 列表 |
| `on_win` | string | 否 | 胜利后跳转的 step ID |
| `on_lose` | string | 否 | 失败后跳转的 step ID |

> `on_win` / `on_lose` 没有默认值时，用 `next` 作为兜底。

### reward——执行效果

按顺序执行 effects。常用于发奖励、改属性、推进对话。

```toml
[[steps]]
id = "give_reward"
type = "reward"
effects = [
    { type = "set_field", params = { path = "talents.思过崖奇遇", value = 1 } },
    { type = "modify_attribute", params = { attr = "声望", value = 10 } },
]
next = "conclusion"
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `effects` | array | ✅ | 任意 effect 对象数组 |

### condition——条件分支

根据条件表达式分流。

```toml
[[steps]]
id = "check_result"
type = "condition"
condition = "selected.好感度 >= 60"
next = "good_end"
else = "bad_end"
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `condition` | string | ✅ | 条件表达式（`selected.X`、`player.X`、`location.X` 等路径） |
| `next` | string | ✅ | 条件为 true 时跳转 |
| `else` | string | 否 | 条件为 false 时跳转。没有 `else` 时，不满足就停在当前步不动 |

### goto——跳转

无条件跳转到指定 step。可用于循环/跳过。

```toml
[[steps]]
id = "skip_to_end"
type = "goto"
target = "final_step"

[[steps]]
id = "loop"
type = "goto"
target = "check_condition"       # 跳回 → 条件循环
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `target` | string | ✅ | 跳转的目标 step ID |

### scene——嵌套子场景

暂停当前 scene，启动子 scene。子 scene 完成自动回到父 scene 的 `next`。

```toml
[[steps]]
id = "side_story"
type = "scene"
scene_id = "mini_event"          # 子 scene 的 ID
next = "after_side_story"
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `scene_id` | string | ✅ | 子 scene 的 ID（全局唯一） |

子 scene 可以是 event 或 quest，文件放在 `quests/` 或 `events/` 下都可以。引擎通过 `scene_id` 查找，不关心文件路径。

### spawn——生成（TODO）

预留。用于创建角色或物品。当前不做实现。

```toml
[[steps]]
id = "spawn_npc"
type = "spawn"
# TODO: 创建角色/物品
next = "..."
```

## 完成判定

Scene 完成 = `advanceToStep` 找不到 `next` 指向的 step：

```toml
# 这个 step 没有 next → 执行完就是 scene 完成
[[steps]]
id = "final"
type = "reward"
effects = [{ type = "..." }]
```

### 多个不同结局

用 `condition` 分流到不同的 terminal step（没有 `next` 的 step）：

```toml
[[steps]]
id = "judge"
type = "condition"
condition = "player.声望 >= 100"
next = "hero_ending"
else = "common_ending"

[[steps]]
id = "hero_ending"
type = "reward"
effects = [{ type = "..." }]       # 没有 next → 完成

[[steps]]
id = "common_ending"
type = "reward"
effects = [{ type = "..." }]       # 没有 next → 完成
```

## 触发方式

### 1. `condition` 自动触发

每次 `triggerScene` 调用时，引擎检查所有 scene 的 `condition`。满足条件且未开始未完成的 scene 自动开始。

```toml
# events/first_meeting.toml
id = "first_meeting"
type = "event"
condition = "location.id == '华山_正殿' && character.令狐冲.好感度 >= 30"
```

### 2. 手动触发（`start_scene` effect）

没有 `condition` 的 scene 不会自动开始，必须通过 `start_scene` effect 手动触发。不打断当前操作。

**从 conversation 对话选项触发**：

```toml
[[nodes]]
id = "ask_favor"
choices = [
  { text = "帮我找个人",
    effects = [{ type = "start_scene", params = { scene = "find_master" } }] },
]
```

**从指令 TOML 触发**：

```toml
[[instructions]]
id = "start_find_master"
label = "接取任务：寻找师父"
effects = [{ type = "start_scene", params = { scene = "find_master" } }]
```

**从 scene 的 reward step 触发**：

```toml
[[steps]]
id = "trigger_next"
type = "reward"
effects = [{ type = "start_scene", params = { scene = "next_quest" } }]
```

**从任意 effect 上下文触发**——只要是能写 effect 的地方（对话节点、指令、场景步骤）都可以用 `start_scene`。

### 3. `start_quest`（别名）

`start_quest` 是 `start_scene` 的向后兼容别名，参数 `quest` 和 `scene` 都可以：

```toml
effects = [{ type = "start_quest", params = { quest = "find_master" } }]
```

### 4. 前置依赖（prerequisites）

Scene 开始前检查前置 scene 是否已完成：

```toml
id = "find_master"
prerequisites = ["intro"]          # intro 必须已完成
```

未完成时 scene 不会开始，日志输出"前置条件未满足"。

## 嵌套子场景

`type = "scene"` 的 step 暂停父 scene，启动子 scene。子 scene 完成后自动回到父 scene 的 `next`：

```
父 scene steps:
  step1 (dialogue) → step2 (scene, scene_id="mini") → step3 (reward)
                                          ↓
                                    子 scene "mini" 独立执行
                                        完成 → pop → step3
```

场景栈跟踪嵌套关系，不限深度。子 scene 本身也可以嵌套子 scene。

## 显示与日志

`display` 控制场景的输出位置：

| display | 侧栏面板 | 叙事输出栏 | 适用 |
|:-------:|:--------:|:----------:|------|
| `current` | ✅ 显示 title+进度 | ✅ 正常输出 | 主线/支线 |
| `log` | ❌ 不显示 | ✅ 正常输出 | background event |
| `hidden` | ❌ 不显示 | ❌ 不输出 | 纯静默执行 |

## 生命周期

1. **加载**：mod 启动时从 `quests/` + `events/` 加载所有 scene 到 `mod.scenes`，校验 ID 唯一性 + `scene_id` 引用存在
2. **触发**：`condition` 满足 或 `start_scene` effect → `startScene()`
3. **运行**：执行第一个 step，按 chain 推进
4. **中断**：玩家走到一边做其他事 → scene 挂起（`activeScenes` 存当前 step）
5. **恢复**：事件监听触发对应的 objective → 继续推进
6. **完成**：最后一步无 `next` → `completeScene()` → 加入 `completedScenes`
7. **持久化**：存档时 `completedScenes` 写入 `gameState`，读档恢复

## 完成的 scene 不会重复触发

`gameContext.isCompleted(sceneId)` 检查 —— 已完成的 scene 跳过 `condition` 检查和 `start_scene` 调用。

## 完整示例

### 主线任务：寻找师父

```toml
# quests/main/find_master.toml
id = "ch1_find_master"
title = "寻找师父"
type = "main"
display = "current"
condition = "location.id == '华山_正殿'"

[[steps]]
id = "talk_to_linghu"
type = "dialogue"
character = "令狐冲"
conversation = "worry_about_master"
next = "reach_holy_peak"

[[steps]]
id = "reach_holy_peak"
type = "objective"
title = "前往华山正殿"
objective = { type = "reach_location", target = "华山_正殿" }
next = "fight_bandits"

[[steps]]
id = "fight_bandits"
type = "combat"
enemies = ["山贼_甲"]
on_win = "reward_step"
on_lose = "fight_bandits"

[[steps]]
id = "reward_step"
type = "reward"
effects = [
    { type = "modify_attribute", params = { attr = "声望", value = 10 } },
    { type = "modify_relation", params = { target = "令狐冲", relation = "好感度", value = 20 } },
]
next = "start_side"

[[steps]]
id = "start_side"
type = "scene"
scene_id = "side_collect_herbs"
next = "conclusion"

[[steps]]
id = "conclusion"
type = "dialogue"
character = "令狐冲"
conversation = "master_found"
```

### 事件：酒馆偶遇

```toml
# events/酒馆/偶遇.toml
id = "event_tavern_meet"
title = "酒馆偶遇"
type = "event"
display = "log"
condition = "location.id == '酒馆' && character.令狐冲.好感度 >= 30"

[[steps]]
id = "intro"
type = "dialogue"
character = "令狐冲"
conversation = "tavern_meet"
next = "check_mood"

[[steps]]
id = "check_mood"
type = "condition"
condition = "selected.好感度 >= 60"
next = "drink_together"
else = "end"

[[steps]]
id = "drink_together"
type = "dialogue"
character = "令狐冲"
conversation = "drink"

[[steps]]
id = "end"
type = "reward"
effects = [
    { type = "modify_relation", params = { target = "令狐冲", relation = "好感度", value = 5 } },
]
```

## 玩家侧体验流程

很多 mod 作者会困惑：场景开始后玩家看到什么？需不需要强制切换画面？

答案：**不切换、不打断、不传送**。场景在后台跟着玩家的正常操作自动推进。

### 完整例子：玩家接了一个"收集草药"任务

```
1. 玩家在酒馆和 NPC 对话
   对话选项 → { type = "start_scene", params = { scene = "collect_herbs" } }
     ↓
2. 叙事日志输出：开始：收集草药
   侧栏面板显示：📍 收集草药 → 前往后山采集
   玩家继续在酒馆喝酒（场景开始不打断当前操作）
     ↓
3. 玩家移动到后山
   location:enter 触发 → objective: reach_location 匹配
     ↓
4. 面板更新：📍 收集草药 → 采集 5 株
   玩家正常探索，走到草药旁采集
     ↓
5. 采集到 5 株 → reward step 执行 → 任务完成
   日志输出：完成：收集草药
```

关键是：**scene 不驱动玩家行为，玩家行为驱动 scene**。scene 只是观察游戏事件（移动、对话、战斗），在条件满足时自动推进步骤。玩家全程自由操作，不会有"强制切换到任务模式"的体验。

### 那 combat step 怎么触发？

Combat step 不会让玩家"突然进入战斗"。它监听 `combat:end` 事件——玩家在探索中主动攻击敌人、触发战斗，战斗结束后 scene 检测到匹配的敌人类型，自动推进到下一步。玩家可能甚至没注意到 scene 在那里。

### 什么时候会"感觉在做任务"？

| 场景步骤 | 玩家的感知 |
|---------|-----------|
| objective: reach_location | 面板显示"前往 XX"，走到那里自动完成 |
| objective: talk_to | 面板显示"和 XX 交谈"，去对话就行 |
| combat: 打山贼 | 面板显示"击败山贼"，去打就推进 |
| dialogue | 下次触发对应场景口上时自动播放任务对话 |

**scene = 记分牌，不是指挥棒。**

## Start Scene 的完整调用链路

许多 mod 作者困惑的是：`start_scene` 怎么和 scene TOML 文件对接？

### 文件分布

```
quests/main/拜师剑法.toml            ← scene 定义（步骤流程）
  ↓ step type = "dialogue" 引用
characters/令狐冲/conversations/teach_sword.toml   ← 对话内容
  ↓ 对话选项里的 start_scene 又可以引用
quests/side/go_to_market.toml         ← 另一个 scene
```

### 拜师任务的完整流程

```toml
# quests/main/拜师剑法.toml
id = "learn_sword"
title = "拜师剑法"
type = "main"
condition = "location.id == '华山_正殿'"

[[steps]]
id = "step1"
type = "dialogue"
character = "令狐冲"
conversation = "teach_sword"          # 引用对话文件
next = "step2"
```

```toml
# characters/令狐冲/conversations/teach_sword.toml
id = "teach_sword"
[[nodes]]
id = "start"
lines = ["令狐冲道：想学剑？"]
choices = [
  { text = "请问岳掌门在哪", next = "ask_location" },
  { text = "改天再来",
    effects = [{ type = "start_scene", params = { scene = "learn_sword" } }] },
]
```

### 执行链路

```
玩家走进华山正殿
  ↓
triggerScene("enter") → condition 满足
  ↓
quest-system.startScene("learn_sword")
  ↓
执行 step1: type = "dialogue"
  ↓
调 dialogue.startConversation("令狐冲", "teach_sword")
  ↓
加载 conversations/teach_sword.toml
  ↓
玩家看到对话、选选项
  ↓
对话结束 → dialogue:end 事件
  ↓
quest-system 检测到 → advanceToStep("learn_sword", "step2")
```

### 关键区分

| 谁 | 管什么 | 放在哪 |
|----|--------|--------|
| scene 文件 | 步骤流程：先对话→再去哪→给奖励 | `quests/` 或 `events/` |
| conversation 文件 | 对话具体内容：说什么、选什么 | `characters/{id}/conversations/` |
| scene_lines (口上) | 一句式反应："你好""再见"等 | `definitions/scene-dialogue.toml` |

- Scene ID 全局唯一，不能跨 scene 引用 `step.id`（step.id 只在所属 scene 内有效）
- `prerequisites` 引用的是其他 scene 的 `id`，不是 step ID
- 子场景的文件放在 `quests/` 或 `events/` 下任意目录都可以，引擎按 `scene_id` 查找
- 一个 scene 可以同时被多个父 scene 引用（`scene_id` 复用）
- 已完成 scene 的 `start_scene` 调用会被跳过（日志提示"已完成"）
