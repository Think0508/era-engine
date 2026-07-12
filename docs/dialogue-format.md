# 口上/叙事格式规范 — dialogue-format.md

## 概述

本规范定义引擎中所有"输出到叙事日志的文本"的统一格式。

### 四个层级的关系

```
Scene（多步剧情）
  └→ 步（step）
      ├── dialogue → Conversation（对话树，一步内的分支）
      ├── objective → 目标
      ├── combat → 战斗
      └── reward → 奖励

Conversation（对话树）
  └→ nodes（节点）
      ├── lines → 文本行（本规范）
      ├── choices → 分支
      └── effects → 效果

Scene Line（简单反应式口上）
  └→ scene_lines → 文本行 + 效果（无条件/条件）

Line（文本行——最小单位）
  └→ text（可含 BBCode）
  └→ style / trigger / display / speed（展示参数）
```

**什么时候用什么：**
- 一句话反应 → `scene_lines`
- 多轮对话有分支 → `conversation`
- 多步剧情（跑路、战斗、收集）→ `scene`
- 被动触发的剧情 → `scene` + `type = "event"`
- 玩家有明确目标的剧情 → `scene` + `type = "quest"`

**三者都支持 `effects`**：口上命中、对话节点到达、任务步骤执行时，可以触发任意 effect，
包括 `start_conversation`、`start_quest`、`trigger_dialogue` 等，实现组件间自由串联。

## 一、`lines` 统一格式

所有场景共用 `lines` 数组：

```toml
# 简写——字符串 = 默认展示参数
lines = ["一句话", "另一句话"]

# 完整写法——对象控制展示参数
lines = [
  { text = "一句话", style = "style_name" },
  { text = "带行内标记的话里的{{color:#FF0000这几个字}}是红的" },
]
```

每条 line 支持的字段：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `text` | string | 必填 | 文本内容，支持 BBCode 行内标记 |
| `style` | string | 无 | 引用 `[styles]` 定义的命名样式 |
| `trigger` | string | `"auto"` | `"auto"` 自动显示 / `"click"` 玩家点击后才显示 |
| `display` | string | `"instant"` | `"instant"` 一下全出 / `"typewriter"` 逐字显示 |
| `speed` | number | 60 | 逐字显示速度（毫秒/字），仅 display=typewriter 时生效 |
| `color` | string | 无 | 文字颜色，hex 格式 `#RRGGBB` 或 `#AARRGGBB` |
| `size` | string | 无 | 字号，`"small"/"normal"/"large"` 或具体值如 `"20px"` |
| `font` | string | 无 | 字体名，如 `"楷体"`、`"serif"` |
| `pause` | number | 0 | 本条显示完后自动暂停的毫秒数（trigger=auto 时生效） |
| `italic` | boolean | false | 整句斜体 |
| `strikethrough` | boolean | false | 整句删除线 |
| `bold` | boolean | false | 整句加粗 |
| `bg` | string | 无 | 背景色，用于涂黑效果 `"#000000"` |
| `effects` | Effect[] | 无 | 本条文字显示后执行的 effects（可选）|

优先级：`text` 里的 BBCode > `style` > 本条字段 > 默认值

### trigger × display 组合

```
auto × instant      → 立刻一下全出（默认）
auto × typewriter   → 自动逐字显示
click × instant     → 玩家点击后一下全出
click × typewriter  → 玩家点击后逐字显示
```

## 二、`[styles]` 命名样式

`[styles]` 可在三个层级定义，下层覆盖上层：

| 层级 | 文件位置 | 说明 |
|------|---------|------|
| 插件默认 | `src/plugins/dialogue-system/styles.toml` | 引擎自带默认样式 |
| mod 定义 | `mods/[mod]/definitions/talk/styles.toml` | 模组可覆盖/增量 |
| 局部定义 | 在口上/事件/任务 TOML 文件顶部 | 仅该文件内可用 |

```toml
# mods/武侠/definitions/talk/styles.toml
[styles]
click = { trigger = "click", display = "instant" }
type_slow = { display = "typewriter", speed = 40 }
type_fast = { display = "typewriter", speed = 80 }
emphasis = { trigger = "click", display = "typewriter", speed = 30, color = "#CC4444" }
whisper = { display = "typewriter", speed = 70, color = "#888888", size = "small" }
shout = { color = "#FF0000", size = "large" }
narrator = { color = "#666666", font = "楷体" }
thought = { color = "#999999", font = "楷体" }
```

使用：
```toml
lines = [
  "普通对话。",
  { text = "重要的话慢慢说", style = "emphasis" },
  { text = "小声嘀咕", style = "whisper" },
  { text = "旁白叙述", style = "narrator" },
  { text = "风格引用后再覆盖单个参数", style = "emphasis", speed = 50 },
]
```

## 三、插值变量

口上文本中可用 `{obj.prop}` 格式引用运行时变量，不认识的变量保留原样。

### 可用变量表

| 变量 | 来源 | 示例值 |
|------|------|--------|
| `{player.name}` | `roster.toml` 中 role=player 角色的 name | "博士" |
| `{player.nickname}` | 角色对玩家的称呼，由 `nick_name_to_pl` 字段定义 | "主人"/"老师" |
| `{character.name}` | 当前说话/行动的角色名 | "令狐冲" |
| `{character.nickname}` | 当前角色对玩家的称呼 | "师弟" |
| `{target.name}` | 交互对象名 | "岳灵珊" |
| `{target.nickname}` | 交互对象对玩家的称呼 | "师兄" |
| `{location.name}` | 当前地点名 | "华山_思过崖" |
| `{time.hour}` | 当前小时 (0-23) | 14 |
| `{time.day}` | 当前天数 | 3 |
| `{foodName}` | 当前行为关联的食物名 | "女儿红" |
| `{bookName}` | 当前行为关联的书名 | "独孤九剑谱" |

### 定义位置

| 变量 | 定义位置 |
|------|---------|
| `player.name` | `mods/[mod]/characters/roster.toml` 中 player 的 `name` 字段 |
| `character.name` / `target.name` | roster 条目的 `name` 字段 |
| `{character,player,target}.nickname` | 角色实体的 `nick_name` / `nick_name_to_pl` 字段 |
| `location.name` | `maps/locations/` 下对应文件的 `name` 字段 |
| `time.*` | 游戏时间的运行时状态 |

## 四、BBCode 行内标记

在 `text` 字符串内部使用，只影响被包裹的部分：

| 语法 | 效果 | 示例 |
|------|------|------|
| `**加粗**` | 加粗 | `他说：**绝对不行**` |
| `*斜体*` | 斜体 | `心想：*这下糟了*` |
| `~~删除线~~` | 删除线 | `~~这段话不算数~~` |
| `\|\|spoiler\|\|` | 涂黑（点击展开） | `凶手是\|\|张三\|\|` |
| `{{color:#RRGGBB 文字}}` | 颜色 | `{{color:#FF0000 危险！}}` |
| `{{color:#AARRGGBB 文字}}` | 颜色+透明度 | `{{color:#80FF0000 半透明红字}}` |
| `{{font:字体名 文字}}` | 字体 | `{{font:楷体 旁白}}` |
| `{{size:large 文字}}` | 字号 | `{{size:large 标题}}` |

嵌套使用：
```
{{color:#FF0000 他说：**{{font:楷体 绝对不行}}**}}
```

## 五、对话树（完整示例）

```toml
# characters/dialogue/linghuchong/conversations/talk_about_sword.toml
id = "talk_about_sword"
# 条件：仅当该对话可触发时出现
condition = "character.令狐冲.好感度 >= 30"

[styles]
story = { trigger = "click", display = "typewriter", speed = 50 }
question = { display = "typewriter", speed = 60 }
serious = { trigger = "click", display = "typewriter", speed = 30, color = "#CC4444" }

[[nodes]]
id = "start"
lines = [
  "令狐冲正在擦拭长剑。",
  { text = "他抬头看见你，微微一笑。", style = "click" },
  { text = "「师弟来得正好。我正想找人聊聊剑法。」", style = "story" },
]
choices = [
  { text = "请教独孤九剑", next = "ask_dugu", condition = "quest.独孤九剑.status == 'active'" },
  { text = "聊聊近况", next = "chitchat" },
  { text = "告辞", next = "farewell" },
]

[[nodes]]
id = "ask_dugu"
lines = [
  { text = "令狐冲压低声音：", style = "narrator" },
  { text = "「独孤九剑的精要，在于无招胜有招。」", style = "serious" },
  { text = "「你记住了，遇敌时不要想下一招是什么。」", style = "story" },
]
# 触发效果：学会独孤九剑
effects = [{ type = "set_field", params = { path = "abilities.独孤九剑", value = 1 } }]
choices = [
  { text = "受教了", next = "end" },
]

[[nodes]]
id = "farewell"
lines = [
  "令狐冲拱了拱手：「慢走。」",
]
```

## 六、简单口上（无分支）

```toml
# mods/武侠/definitions/talk/chat.toml
[[scene_lines]]
scene = "chat"
condition = "selected.好感度 >= 60"
text = "你兴致勃勃地和{target.name}聊了起来。{target.name}也很高兴。"
effects = [
  { type = "settle_state", params = { state = "好意", baseValue = 10 } },
]

[[scene_lines]]
scene = "chat"
condition = "selected.好感度 < 30"
text = "{target.name}不太想理你。"
effects = []
```

## 七、兜底地文

当没有对口上时，dialogue-system 自动使用 talk-common-system 生成描述：

```
{character.name} 和 {target.name} {action_talk_polite}。
```

## 八、速度参数速查

| speed 值 | 效果 | 适用场景 |
|----------|------|---------|
| 20 | 很慢（5 字/秒） | 沉重、犹豫的语气 |
| 40 | 慢（8 字/秒） | 叙述、回忆 |
| 60 | 中等（16 字/秒） | 默认，普通对话 |
| 80 | 快（25 字/秒） | 轻松聊天 |
| 100 | 很快 | 急促、兴奋 |

## 九、渲染层实现要点

1. `narrativeLog.write()` 保持纯文本兼容
2. 新增 `narrativeLog.writePieces(type, source, pieces)` 写入带样式的条目
3. NarrativeLog.vue 升级渲染：解析 BBCode、应用 styles、typewriter 动画
4. 对话系统：`lines` → `pieces` → `writePieces`
5. 事件/任务系统：同样调 `writePieces`
