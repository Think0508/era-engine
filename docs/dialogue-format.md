# 口上/叙事格式规范 — dialogue-format.md

## 概述

本规范定义引擎中所有"输出到叙事日志的文本"的统一格式。

### 口上选择机制（T1-T6 复刻 erArk，2026-08-08）

场景口上（`scene_lines`/`character_lines`）的选择流程：

```
候选池合并（场景通用 + 角色专属×10 + 角色通用）
  → 条件筛选（condition / premise( 前提集）
  → 权重计算（前提权重 high_N 累加 + 满足前提数；静态 weight 字段优先；情境加权×5）
  → 权重区间随机选一
  → 混合率（仅角色行、weight<100 时按概率替换为行为地文；场景旁白不参与；受总开关控制）
  → 无候选 → 行为地文兜底（受总开关控制）→ 纸娃娃变量兜底
```

| 机制 | 字段/配置 | 说明 |
|------|----------|------|
| 权重 | `weight = N` | 静态权重（等价 erArk CVP_Weight 固定）；缺省 = 前提权重（无条件=1） |
| 前提权重 | `condition = "premise(high_5)"` | high_N 前提贡献权重 N；其余满足前提各 +1 |
| 专属加权 | — | 角色专属口上（characters/dialogue/）权重 ×10 |
| 情境加权 | hConfig `[[talk.situations]]` | 前提集命中 → ×multiplier（默认 9 类 ×5） |
| 版本化 | `version = N` | 行版本；角色实体 `character_text_version` 选版（0=不启用） |
| 无意识屏蔽 | — | 目标无意识（时停）时，无 unconscious 前提的口上淘汰 |
| 混合率 | hConfig `talk.common_mix_rate`（默认 30） | **角色行**且 weight<100 时按概率替换为行为地文（{penis_in_vagina} 等）；场景旁白不参与；`0`=只关混合、留兜底 |
| 总开关 | hConfig `talk.behavior_text_enabled`（默认 true） | `false` = 混合 + 空池兜底两条纸娃娃路径全关（纯口上；池空静默） |

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

## 口上数据位置总览（默认层 ↔ mod 层）

| 口上数据 | 插件默认层（基座） | mod 层（Override） | 覆盖语义 |
|---------|-------------------|-------------------|----------|
| 命名样式 `[styles]` | `src/plugins/dialogue-system/data/default/talk/styles.toml`（**约定 owner**：默认样式统一由 dialogue-system 提供；机制上任意插件可放） | `mods/{mod}/definitions/talk/styles.toml` | 同名键整体覆盖（不深合并） |
| 行为词条 / 地文（talk-common） | `src/plugins/talk-common-system/data/default/talk-common/**` | `mods/{mod}/definitions/talk-common/**` | variable 同名整体替换（整文件） |
| 场景口上 / 角色通用口上 | 无插件默认层（角色口上轨的 Layer 1 兜底 = talk-common 词条，见 §七） | `mods/{mod}/definitions/scene-dialogue.toml` / `character-dialogue.toml` | mod 写了 → mod 胜出 |
| 角色专属口上 | 无 | `mods/{mod}/characters/{角色}/dialogue.toml` | 专属轨，权重 ×10 优先 |
| 对话树 conversations | （scene 内嵌对话写在任务文件内） | `mods/{mod}/characters/{角色}/conversations/*.toml` + 任务内 `[[dialogues]]` | 文件级注册，id 唯一 |

> 惯例说明：「谁的系统谁带默认数据」——instructions 由 native-instructions / sleep-system 等各自带；
> talk-common 词条由 talk-common-system 带；**样式默认基座只约定由 dialogue-system 带**（不用每个插件都建 talk 目录）。

## 一、`lines` 统一格式

所有场景共用 `lines` 数组：

```toml
# 简写——字符串 = 默认展示参数
lines = ["一句话", "另一句话"]

# 完整写法——对象控制展示参数
lines = [
  { text = "一句话", style = "style_name" },
  { text = "带行内标记的话里的{{color:#FF0000 这几个字}}是红的" },
]
```

每条 line 支持的字段（与引擎实现一致，2026-08-23 校准；未列字段写了会静默无效）：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `text` | string | 必填 | 文本内容，支持 BBCode 行内标记 |
| `style` | string | 无 | 引用 `[styles]` 定义的命名样式 |
| `trigger` | string | `"auto"` | `"auto"` 自动显示 / `"click"` 显示后出现 `▼ 点击继续`，点击才消费本条 |
| `display` | string | `"instant"` | `"instant"` 一下全出 / `"typewriter"` 逐字显示（可见字符渐进，标记不露字） |
| `speed` | number | 60 | 逐字速度（毫秒/可见字），仅 display=typewriter 生效 |
| `color` | string | 无 | 文字颜色，hex 格式 `#RRGGBB` 或 `#AARRGGBB`（半透明经 toCssColor 转换） |
| `size` | string | 无 | 字号：instant 分支映射 small→0.85em / large→1.3em，**其余值（含 `"20px"`）无效**；typewriter 分支整体不应用 size |
| `font` | string | 无 | 字体名，如 `"楷体"`、`"serif"`（逐字分支也生效） |
| `pause` | number | 0 | 本条显示完后**自动暂停的毫秒数**（trigger=auto 时生效）：全屏 EXECUTING 流中该条显示完自动停顿 N 毫秒再继续下一条，等待期间点击可跳过（列表模式无效；2026-08-23 恢复原始设计） |
| `effects` | Effect[] | 无 | 本条文字显示后执行的 effects（可选）|

> 已知边界（2026-08-23 校准）：`italic / strikethrough / bold / bg` 行级字段在引擎数据模型
> （ReactiveLine / LogDisplay）中不存在，写了不报错但静默无效——整句斜体/删除线/加粗请用
> 行内 BBCode（`*斜体*` / `~~删除线~~` / `**加粗**`）。**对话树 `nodes.lines` 目前仅支持字符串**，
> 对象格式（含 style 引用）是 §一 统一格式的规划形态，对话树示例见 §五。

优先级：`text` 里的 BBCode > `style` > 本条字段 > 默认值

### trigger × display 组合

```
auto × instant      → 立刻一下全出（默认）
auto × typewriter   → 自动逐字显示
click × instant     → 玩家点击后一下全出
click × typewriter  → 玩家点击后逐字显示
```

## 二、`[styles]` 命名样式

命名样式把展示参数（trigger/display/speed/color/size/font）抽取为可复用的名，让口上作者只需写 `style = "emphasis"`。

### 定义位置

```
src/plugins/dialogue-system/data/default/talk/styles.toml   ← 插件默认层（基座，已提供 9 个默认样式）
mods/[mod]/definitions/talk/styles.toml                      ← mod 层（同名键整体覆盖）
```

基座内容（2026-08-23 定稿）：`narrator` 灰色楷体旁白 / `thought` 更淡心声 / `slow`（typewriter 100ms）/ `fast`（typewriter 30ms）/ `whisper`（typewriter 70ms 灰小字）/ `emphasis`（click+typewriter 30ms 红）/ `click`（click+instant）/ `shout`（红色大号）/ `announce`（**暗金 `#bdb76b` 楷体系统宣告**：如「你获得了 回气丹！」「力道 上升了！」）。

两层语义（2026-08-23 实现，`mod-parse.collectPluginDefaultStyles`）：各插件默认层 styles 随
`pluginDefaultModules` glob（`/src/plugins/*/data/default/**`）进入 rawTomlMap，多插件同名键按
插件目录字典序后者覆盖前者；mod 层同名键**整体覆盖**默认层（不深合并）。
**归属约定**：默认基座只由 `dialogue-system` 提供（机制不排斥其他插件，但约定如此——不要每个
插件都建 talk 目录）。`speaker` 是普通键，对话系统按 `[styles.speaker.角色名]` 的**内部约定**使用（说话者名样式）。

### 工作流

```
第1步：在 definitions/talk/styles.toml 中定义一个样式
第2步：在口上级写 style = "样式名" 引用
第3步：如需微调，在行级覆盖同名字段即可
```

### 格式

```toml
# mods/武侠/definitions/talk/styles.toml
[styles]
click = { trigger = "click", display = "instant" }
type_slow = { display = "typewriter", speed = 100 }   # speed = 毫秒/可见字，值越大越慢
type_fast = { display = "typewriter", speed = 30 }
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

**各种 style 的渲染效果**：

| style | trigger | display | 视觉 | 玩家操作 |
|-------|---------|---------|------|---------|
| 默认（无 style） | auto | instant | 白色文字，瞬间全出 | 播完直接继续 |
| `narrator` | auto | instant | 灰色 (`#666666`) 楷体，瞬间全出 | 播完直接继续 |
| `whisper` | auto | typewriter | 灰色 (`#888888`) 小字，逐字出现 | 逐字播完直接继续 |
| `type_fast` | auto | typewriter | 白色，快速逐字（30ms/字） | 逐字播完直接继续 |
| `announce` | auto | instant | 暗金 (`#bdb76b`) 楷体，系统宣告（"你获得了…！"） | 瞬间全出 |
| `emphasis` | click | typewriter | 红色 (`#CC4444`)，逐字慢速 | 逐字播完后出现 `▼ 点击继续`，点击后才结束本条 |
| `click` | click | instant | 白色，瞬间全出 | 全出后出现 `▼ 点击继续`，点击后才结束本条 |

**注意**：`trigger = "click"` 的条目标记为可点击条目，末尾出现 `▼ 点击继续` 提示，
**点击该提示**（不是屏幕任意位置）才消费本条；逐字播放中的文本点击 = 跳过播放（`TypewriterText` 语义，
不消费条目）。

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
| `{foodName}` | 当前行为关联的食物名 | "女儿红"（⚠️ 未实现，当前保留原样） |
| `{bookName}` | 当前行为关联的书名 | "独孤九剑谱"（⚠️ 未实现，当前保留原样） |

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
| `\|\|spoiler\|\|` | 涂黑（悬停显示） | `凶手是\|\|张三\|\|` |
| `{{color:#RRGGBB 文字}}` | 颜色 | `{{color:#FF0000 危险！}}` |
| `{{color:#AARRGGBB 文字}}` | 颜色+透明度 | `{{color:#80FF0000 半透明红字}}` |
| `{{font:字体名 文字}}` | 字体 | `{{font:楷体 旁白}}` |
| `{{size:large 文字}}` | 字号 | `{{size:large 标题}}` |

嵌套使用：
```
{{color:#FF0000 他说：**{{font:楷体 绝对不行}}**}}
```

## 五、对话树（完整示例）

> ⚠️ 2026-08-23 校准：对话树 `nodes.lines` **目前仅支持字符串数组**（`ConversationNode.lines: string[]`）——
> 行对象格式与文件内 `[styles]` 块是规划形态，引擎不会解析（对象行会崩、文件内样式静默忽略）。
> 对话树文本的样式请用**行内 BBCode**；命名样式目前只作用于行口上轨与行为轨词条（见 §七）。

```toml
# characters/named/linghuchong/conversations/talk_about_sword.toml
id = "talk_about_sword"
# 条件：仅当该对话可触发时出现
condition = "character.令狐冲.好感度 >= 30"

[[nodes]]
id = "start"
lines = [
  "令狐冲正在擦拭长剑。",
  "他抬头看见你，微微一笑。",
  "「师弟来得正好。我正想找人聊聊剑法。」",
]
choices = [
  { text = "请教独孤九剑", next = "ask_dugu", condition = "quest.独孤九剑.status == 'active'" },
  { text = "聊聊近况", next = "chitchat" },
  { text = "告辞", next = "farewell" },
]

[[nodes]]
id = "ask_dugu"
lines = [
  "令狐冲压低声音：",
  "「独孤九剑的精要，在于无招胜有招。」",
  "「你记住了，遇敌时不要想下一招是什么。」",
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
# mods/武侠/definitions/scene-dialogue.toml
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

## 七、原生通用口上 + 兜底地文

**原生通用口上（2026-08-17）**：chat 等引擎原生指令带插件默认层口上——
talk-common 词条 `behavior/` 目录（一行为一文件，`variable` = 行为 id，如 `chat`/`chat_failed`）。
它是**角色通用口上（character-dialogue.toml）轨的 Layer 1 默认**：

- mod 未写该 scene 的角色通用口上 → 用默认词条（与角色专属口上同池竞争，专属 ×10 优先）
- mod 写了 → mod 胜出；想覆盖默认 → `definitions/talk-common/chat.toml`（variable 同名整体替换）
- 输出走角色轨格式（`角色名：文本`）；词条可带 `premise(high_1)` 等条件做加权
- 边界约束：`behavior/` 目录只放**非 H 行为**；H 行为默认文本仍走行为地文（见下）

**行为轨整体口上样式（ADR 0018，2026-08-23）**：talk-common 词条条目支持可选**整体修饰字段**
（`style / trigger / display / speed / pause / color / size / font`），与行结构的 display 语义完全同路径
（被选中词条 → 补位 `line` → `resolveLineDisplay`（含 `[styles]` 查找）→ 叙事日志 `LogDisplay` → NarrativeLog）：

```toml
# behavior/daily/chat.toml
[[entries]]
style = "narrator"          # 查活跃 mod 的 [styles] 注册表
display = "typewriter"      # 整条逐字
speed = 40
context = "整条慢出，行内仍可 {{color:#80FF0000 叠加半透明}}。"
```

**语义与行结构完全一致**：
- 优先级：行内 BBCode > 词条自身字段 > `[styles]` 注册表（词条字段覆盖样式表）> 默认外观；
- **style 名作用域**：渲染配置属于 mod——只解析当前活跃 mod 的 `[styles]`（`mods/{mod}/definitions/talk/styles.toml`）；默认层词条引用 style 名也按活跃 mod 解析；
- `trigger="click"`：整条显示后出现 `▼ 点击继续`，点击才消费；`display="typewriter"`：按 `speed`（默认 60，毫秒/可见字）逐字；`pause`（>0）：本条显示完后自动停顿 N 毫秒再继续（全屏流中生效，等待期间点击跳过）；
- **限制**：`parts` 组合词条（body/body_part/action 分段）的 display 只取被选中 **A 段**条目的字段；行为地文（getBehaviorText）保持纯文本；
- 颜色支持 `#AARRGGBB` 半透明——渲染层统一经 `src/ui/utils/color.ts` 的 `toCssColor()` 转 CSS rgba（8 位 hex 直接透传会全透明，2026-08-23 修复，与工具预览同源规则）；

**兜底地文（双轨定位，2026-08 定稿，ADR 0017）**：行为地文 ≠ 独立的第四层口上，而是与口上
同槽位的两种角色——**低权重角色口上的概率共存替代（混合率）** + **无任何口上时的最后兜底**：

- **混合率**：角色通用/专属口上（含原生默认词条）以 `weight<100` 中选后，按
  `talk.common_mix_rate`（默认 30%）概率替换为行为地文（`getBehaviorText`，H 行为 A+B+C 组合）。
  **场景旁白（scene-dialogue 层）不参与混合替换**——旁白是环境叙述，换成角色身体地文语义断裂。
- **兜底**：候选池空（无对口上，含原生默认）时，dialogue-system 自动使用行为地文生成描述；
  `charId` 存在时带说话者前缀（`角色名：文本`）。
- **保护**：任何来源（场景/通用/专属）`weight ≥ 100` 的口上一律不参与混合替换（有意偏离 erArk——
  erArk 只保角色专属高权重；我们通用层是 mod 世界观内容层，与专属同权保护）。
- **总开关 `talk.behavior_text_enabled`**（默认 true）：`false` 时混合与兜底**全关**（对齐 erArk
  `draw_setting[2]=0` 的纸娃娃一侧），有口上出口上、池空静默。

四态矩阵：

| behavior_text_enabled | common_mix_rate | 效果 | 对应 erArk |
|---|---|---|---|
| true | 30（默认） | 混合 + 兜底（双轨默认） | draw_setting[2]=1, [13]=3 |
| true | 0 | 只关混合、留兜底（作者优先+填空） | [13]=0 |
| false | 任意 | 全关纸娃娃（纯口上；池空静默） | [2]=0 |

```toml
# mods/武侠/h-config.toml（示例）
[talk]
common_mix_rate = 30        # 0 = 只关混合、留兜底；越界/非数值 → 钳制回 [0,100] + 告警
behavior_text_enabled = true # false = 全关纸娃娃；非布尔（如字符串 "false"）→ 按 true + 告警（源：ADR 0017）
```

行为地文示例（`getBehaviorText`，H 行为 A+B+C 组合）：

```
{character.name} 和 {target.name} {action_talk_polite}。
```

## 八、速度参数速查

`speed` 单位 = **毫秒/可见字**（引擎 TypewriterText 语义，2026-08-23 定稿）：
逐字按「可见字符」渐进——**BBCode 标记字符不计入、不显示**（样式即时生效），字/秒 ≈ 1000 ÷ speed。

| speed 值 | 效果 | 适用场景 |
|----------|------|---------|
| 20 | 很快（50 字/秒） | 急促、兴奋 |
| 40 | 快（25 字/秒） | 轻松聊天 |
| 60 | 中等（≈16 字/秒） | 默认，普通对话 |
| 80 | 慢（12.5 字/秒） | 叙述、回忆 |
| 100 | 很慢（10 字/秒） | 沉重、犹豫的语气 |

## 九、变量插值（{var} 替换）

### 两层替换

```
第1层（talk-common.replaceAll）：
  {penis} {anal} {vagina_s} {breast} ...
  → 替换为角色的身体部位描述（详情见 docs/talk-common-system.md）

第2层（interpolateText）：
  {player.name} {character.name} {target.name} ...
  → 替换为游戏运行时的上下文数据
```

### 可用变量表

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{player.name}` | 玩家角色名 | "博士" |
| `{player.nickname}` | 玩家昵称 | "主人" |
| `{character.name}` | 当前说话/动作的角色名 | "令狐冲" |
| `{target.name}` | 当前交互目标名 | "岳灵珊" |
| `{target.nickname}` | 目标昵称 | "珊儿" |
| `{location.name}` | 当前地点名 | "华山剑坪" |
| `{time.hour}` | 当前小时(0-23) | "14" |
| `{time.minute}` | 当前分钟 | "30" |
| `{time.day}` | 当前日 | "15" |

### 新增自定义变量

在 `src/plugins/dialogue-system/index.ts` 的 `interpolateLine` 函数中，
把数据加到 `context` 对象即可（**当前 context 只含 player / character / target / location / time**，
示例中的 `weather` 尚未实现）：

```typescript
const context: any = {
  player: ctx.player,
  location: ctx.location,
  time: ctx.time,
  // weather: ctx.weather,  // 规划：新增 {weather.temperature}（未实现）
}
```

所有口上 TOML 数据自动支持新变量，无需逐条修改。

### 两层关系

- 第1层处理 `{word}`（无点号，由 talk-common 索引管理）
- 第2层处理 `{obj.prop}`（带点号，由 context 对象管理）
- 未识别的变量**保留原样**，不报错，不崩溃

## 十、渲染层实现要点（2026-08-23 校准为现状，原 writePieces 规划已废弃）

1. **存储**：`narrativeLog.write(text, type, source, interactive?, payload?, display?)`（`src/core/narrative-log.ts`）——
   文本 + 可选的 `LogDisplay`（trigger/display/speed/pause/color/size/font）整体入条目，不做分段。
2. **渲染分支**（`NarrativeLog.vue`）：
   - `_display.display === "typewriter"` → `<TypewriterText>`（**可见字符渐进**：标记不露字、样式即时生效，speed=ms/可见字）；颜色/字体取 `_display`（8 位 hex 经 `toCssColor` 转 rgba）；
   - 其余 → `<FormattedText>`（BBCode 解析渲染 + `_display` 的 color/font/size 作整体参数）；
   - `_display.trigger === "click"` → 条目末渲染 `▼ 点击继续`，点击该提示才消费条目（`dialogue:line`/`narrative:consumed` 事件流由 UI store 管理）。
3. **样式解析**：`dialogue-system` 的 `resolveLineDisplay(line)`——查 `[styles]` 注册表（插件默认基座 + 活跃 mod）→ 行级/词条字段覆盖 → 产出 LogDisplay；早退条件是**全部**展示字段均为空（仅 color/size/font 也生效，2026-08-23 修复）。
4. **行内 BBCode**：`FormattedText` / `TypewriterText` 共用 `ui/utils/bbcode-parser.ts`（块级先、行内后，扁平化分段）；`ui/utils/color.ts` 的 `toCssColor()` 统一转换 `#AARRGGBB`。
5. 事件/任务系统的叙事文本同样经 `narrativeLog.write` 输出，命中同一渲染管线（不做独立实现）。
