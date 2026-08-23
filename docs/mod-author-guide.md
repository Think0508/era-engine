# Mod 作者指南

> 给写模组的人。简洁，只讲你需要做什么、引擎给你什么。

## 你的职责

创建 `mods/你的mod名/` 目录，用 TOML 定义游戏世界。不写代码（除非需要 JS 钩子）。

## 目录结构

```
mods/武侠/
├── meta.toml                 # 必需：mod 元信息
├── bindings.toml             # 必需：插件通用名 → 你的属性名
├── theme.toml                # 必需：颜色/字体/间距
├── era-engine.config.toml    # 项目根目录，设 active_mod = "武侠"
├── definitions/
│   ├── attributes.toml       # 所有属性定义
│   ├── talents.toml          # 天赋
│   ├── abilities.toml        # 技能（带 tags）
│   ├── items.toml            # 物品（可拆为 items/ 目录按类别分文件）
│   ├── factions.toml         # 势力/门派（⚠️ 暂未实现，写了不会被加载）
│   ├── relations.toml        # 关系类型
│   ├── status-effects.toml   # 状态效果
│   ├── equipment.toml        # 装备槽部位
│   ├── calendar.toml         # 日历显示（月名/星期/时辰）
│   ├── scene-dialogue.toml   # 场景通用口上
│   └── character-dialogue.toml # 角色通用口上（fallback）
├── templates/character/      # 角色模板（多级继承）
├── characters/
│   ├── roster.toml           # 次要角色批量清单
│   ├── npc.toml              # 路人NPC生成规则
│   └── dialogue/{角色ID}/    # 角色专属口上+对话
│       ├── dialogue.toml
│       └── conversations/    # 交互式对话树
├── maps/locations/           # 地点（平铺+parent）
├── quests/main/ + side/      # 任务（递归扫描子目录）
├── events/                   # 事件（被动触发）
├── conversations/            # 全局共享对话
└── assets/                   # 图片素材
```

## 核心概念

**属性系统**有两个文件，分工不同：

```toml
# definitions/attributes.toml —— 纯数值属性（体力/好感度/每日重置参数等）
[attributes]
"气血" = { type = "number", default = 100, display = true, display_group = "status" }
"好感度" = { type = "number", default = 30, display = true, display_group = "social" }

# definitions/abilities.toml —— 带等级的能力（感觉/ABL/刻印/技能/技术）
[abilities]
[abilities."皮肤感度"]
name = "皮肤感度"
type = "passive"
max_level = 10
tags = ["sensation"]
```

**`attributes.toml` display_group 决定面板位置**：

| display_group | 面板位置 | 示例 |
|-------------|---------|------|
| `"status"` | 主界面 Status 栏 | `体力`、`气力`、`精力` |
| `"身体快感"` | Parameter 区（每日重置） | `皮肤`、`胸部`、`阴蒂` |
| `"行为参数"` | Parameter 区（每日重置） | `恭顺`、`好意`、`屈服`、`羞耻` |

**`abilities.toml` tags 决定面板分组**：

| tag | 面板分组 | 示例 |
|-----|---------|------|
| `sensation` | 角色面板 → 属性 → 感觉 | `皮肤感度`、`胸部感度`、`后穴扩张` |
| `abl` | 角色面板 → 属性 → 能力 | `技巧`、`顺从`、`亲密`、`欲望` |
| `h_mark` | 角色面板 → 属性 → 刻印 | `快乐刻印`、`屈服刻印` |
| `technique` | 角色面板 → 属性 → 性技术 | `指技`、`舌技`、`腰技` |
| 其他 | 角色面板 → 属性 → 其他技能 | `华山剑法`、`混元功` |

## 能力管理工作流

> **存储组织（2026-08-11）**：大量技能建议用**目录拆分**——`definitions/abilities/` 下按类别建文件
> （如 `sword.toml`/`internal.toml`/`craft.toml`），与单文件 `abilities.toml` 等价合并。
> **按需展开**：角色只拥有「数据写了 + 角色卡（attributes 落位）」的能力——mod 技能没写 = 无条目
> （不进存档/不显示/条件语义 0 级）。**display = false**：拥有但不在面板显示（参与结算）。

### 新增一个能力

```toml
# definitions/abilities/sword.toml（目录拆分示范，Layer 3）
[abilities."暗器精通"]
name = "暗器精通"
description = "暗器使用技巧"
type = "passive"
max_level = 10
tags = ["combat_active"]      # 面板分组由 tag 决定（此处显示在「其他技能」）
# display = false            # 可选：拥有但不在面板显示（结算/条件照常）
```

### 用不到的默认能力不显示

```toml
# definitions/abilities.toml 覆盖 h-core 默认能力（如 话术技能 用不到）
[abilities."话术技能"]
display = false
```

### 改名一个能力

能力不走绑定系统，改名直接改配置文件两处：

```toml
# 1. definitions/abilities.toml——改 key 名
[abilities."投掷精通"]        # 原来叫"暗器精通"
name = "投掷精通"

# 2. 所有角色数据中引用了旧名的位置
# roster.toml、named/base.toml、templates/ 里
abilities = { "投掷精通" = 3 }  # 原来写"暗器精通"
```

### 给角色设初始能力等级

两种格式等价，`{level, xp}` 展开由引擎自动处理：

```toml
# 简写（推荐）——只写等级，xp 自动为 0
abilities = { "华山剑法" = 3, "技巧" = 2 }

# 完整写法（手动指定 xp）
abilities = { "华山剑法" = { level = 3, xp = 45 }, "技巧" = { level = 2, xp = 0 } }
```

### 在模板中设默认值

```toml
# templates/character/huashan_disciple.toml
extends = "base-human"
name = "华山弟子"
# 简写（xp 自动为 0）：
abilities = { "华山剑法" = 1, "技巧" = 1 }
# 完整写法（手动指定 xp）——二选一，不能同时写两个 abilities 键：
# abilities = { "华山剑法" = { level = 1, xp = 0 }, "技巧" = { level = 1, xp = 0 } }
```

引擎合并顺序：模板 → roster → named，后加载覆盖前加载。

**绑定系统**——插件用通用名（hp），你在 bindings.toml 映射到你的属性名：
```toml
[bindings.combat-wuxia]
hp = "气血"
attack = "攻击力"
```

**H 公式系数（h-config.toml）**——插件提供默认值，你可以覆写：

```toml
# h-config.toml
# 每当 settle_state 修改角色的参数（恭顺/好意/屈服等），
# 用对应能力的等级计算倍数。此映射决定"改恭顺时用顺从的能力等级"。

[state_ability]
"恭顺" = "顺从"
"好意" = "亲密"
"欲情" = "欲望"
"屈服" = "顺从"
"羞耻" = "露出"
# ...可在你的 h-config.toml 中覆写或新增
```

**口上 = 演出**——几乎所有指令执行后触发口上。三层优先级：
1. 场景通用（`scene-dialogue.toml`）——地点/环境描述
2. 角色通用（`character-dialogue.toml`）——无专属时的 fallback
3. 角色专属（`characters/dialogue/{ID}/dialogue.toml`）——定制台词

**文字格式（BBCode 行内标记）**——作用于口上文本内部（可与样式名叠加）：
- `**加粗**` `*斜体*` `~~删除线~~` `||spoiler（黑框点击展开）||`
- `{{color:#FF0000 红色文字}}` `{{color:#80FF0000 半透明}}` `{{font:楷体 文字}}` `{{size:large 大字}}`

**命名样式（styles）**——把"展示参数组合"抽成可复用的样式名，作用于整条口上：
- **在哪写**：`mods/{mod}/definitions/talk/styles.toml`；底层默认基座约定的位置是
  `src/plugins/dialogue-system/data/default/talk/styles.toml`（当前 dialogue-system 尚未提供任何默认样式，
  基座为空——从 mod 层写起即可），mod 同名样式**整体覆盖**基座
  （覆盖规则见 docs/mod-override.md）
```toml
# mods/武侠/definitions/talk/styles.toml
[styles]
narrator = { color = "#666666", font = "楷体" }
slow = { display = "typewriter", speed = 40 }
clicked = { trigger = "click" }
whisper = { display = "typewriter", speed = 70, color = "#888888", size = "small" }
```
- **可选字段**：`trigger`（"auto"/"click"）、`display`（"instant"/"typewriter"）、`speed`（逐字毫秒/字）、
  `pause`（显示完暂停毫秒）、`color`（支持 `#AARRGGBB` 半透明）、`size`（small/medium/normal/large）、`font`
- **哪些口上能用 style**：
  1. 行口上/对话行：`{ text = "…", style = "narrator" }`（scene_lines / conversation 的 lines）
  2. 行为轨词条（talk-common 条目，ADR 0018）：`[[entries]]` 上写 `style = "narrator"`，
     或直接内联同名字段（`display = "typewriter"`、`speed = 40`…）效果等价
- **优先级**：行内 BBCode > 行/词条自身字段 > `[styles]` 样式表 > 默认外观
- **查表作用域**：style 名解析「默认基座 + 当前 mod」——想让某个 mod 有专属表现就写进该 mod 的 styles.toml
- 特殊命名空间：`[styles.speaker.角色名]` = 说话者名样式（见「说话者样式」）

**{var} 插值**——口上文本中用变量：
- `{player.name}` `{player.气血}` `{character.name}` `{location.name}` `{time.hour}`

## 自定义前提

前提（Premise）是指令的显隐条件和口上的匹配条件。你可以在 `definitions/premises.toml` 中用条件表达式定义自己的前提，无需写代码：

```toml
# mods/武侠/definitions/premises.toml
[[premises]]
id = "IN_SWORD_VALLEY"
description = "位于剑谷"
condition = "location.id == 'sword_valley'"

[[premises]]
id = "HAVE_SWORD_ABILITY"
description = "玩家有剑类技能 ≥ 3 级"
condition = "player.abilities.华山剑法 >= 3"
```

然后就可以在指令和口上中引用：

```toml
# 指令中使用
[[instructions]]
id = "sword_practice"
premises = ["NOT_H", "IN_SWORD_VALLEY", "HAVE_SWORD_ABILITY"]

# 口上中使用
condition = "premise(IN_SWORD_VALLEY)"
```

**机制**：
- `condition` 字段支持所有标准条件表达式（`> < >= <= == != && || !`）
- 可引用 `player.*`、`location.*`、`character.{ID}.*`、`game.time.*`、`selected.*` 等路径
- 引擎启动时自动加载 `definitions/premises.toml`，注册到前提系统
- 如果条件表达式不足以表达你的逻辑，需要写 mod 专属插件（见 `docs/plugin-author-guide.md`）

### 精液追踪条件（body_semen）

检查角色身上是否有精液（量、等级等），用于口上条件分支：

```toml
# 语法：selected.body_semen.{部位}.{索引} {运算符} {值}

# 头发上有 > 1ml 精液
condition = "selected.body_semen.头发.1 > 1"

# 口内有 ≥ 350ml 精液
condition = "selected.body_semen.口.1 >= 350"

# 阴道内有精液（任意量）
condition = "selected.body_semen.阴道.1 > 0"

# 肛内有精液
condition = "selected.body_semen.肛.1 > 0"

# 精液等级 >= 3（1~10，百分位阈值）
condition = "selected.body_semen.胃.2 >= 3"

# 也可用数字编号（不推荐）：
condition = "selected.body_semen.6.1 > 10"   # 6 = 阴道
```

**部位名称对照表**：

| 中文名（别名） | 编号 | 说明 |
|---------------|:----:|------|
| 头发 | 0 | H 中沾到的精液 |
| 面 / 脸 | 1 | 颜射 |
| 口 / 嘴 / 口腔 | 2 | 口交/颜射后 |
| 胸 / 胸部 / 乳房 / 乳 | 3 | 乳交/射在胸上 |
| 阴蒂 / 蒂 | 4 | — |
| 手 | 5 | — |
| **阴道** / 穴 | **6** | 内射——最常见的检查 |
| **子宫** / 宫 | **7** | 子宫内射 |
| **肛** / 后穴 / 菊花 | **8** | 肛交内射（可被吸收→胃） |
| 脚 | 9 | — |
| 尿道 | 10 | — |
| 腿 | 11 | — |
| 腰 / 腰部 | 12 | — |
| 臀部 / 臀 / 屁股 | 13 | — |
| 背 | 14 | — |
| **胃** / 肚子 / 腹 | **15** | 从肛流入/吞入（可被吸收） |
| 耳 | 16 | — |
| 腋 / 腋下 | 17 | — |
| 全身 | 18 | 全身精液覆盖 |
| 体内 | 20 | 体内总量（含胃+肛等内部） |

**数组索引说明**：

| 索引 | 含义 | 例子 |
|:----:|------|------|
| 0 | 未使用 | — |
| **1** | **当前精液量(ml)** | `selected.body_semen.阴道.1 > 50` |
| **2** | **精液等级 1~10** | `selected.body_semen.阴道.2 >= 3` |
| 3 | 历史总量(ml) | `selected.body_semen.阴道.3 >= 500` |

精液等级 = 当前量占该部位最大容量的百分比阈值：

| 等级 | 阈值 |
|:----:|------|
| 1 | ≥ 1% |
| 2 | ≥ 5% |
| 3 | ≥ 10% |
| 4 | ≥ 20% |
| 5 | ≥ 35% |
| 6 | ≥ 50% |
| … | +15% per level |
| 10 | ≥ 100%（溢满） |

> **注意**：衣物精液追踪（`cloth_semen`）尚未实现。目前只支持 body（身体部位）上的精液。

## Scene（事件/任务系统）

Scene 是引擎的统一剧情单元。**事件和任务使用同一套数据格式**。

### 文件组织

```
mods/武侠/
├── quests/
│   ├── main/               # 主线任务
│   │   ├── 第一章/
│   │   │   ├── find_master.toml
│   │   │   └── conversations/   # 可选：任务专属对话
│   │   │       └── intro.toml
│   │   └── final.toml
│   └── side/               # 支线任务
│       ├── 采药.toml
│       └── conversations/       # 全局共享对话
│           └── common_victory.toml
├── events/                 # 事件（被动触发）
│   ├── 酒馆/
│   │   └── 偶遇.toml
│   └── conversations/           # 全局共享对话
│       └── common_defeat.toml
```

引擎递归扫描所有子目录，通过 scene 的 `id` 索引，不关心文件路径。

### Scene 数据格式

```toml
# quests/main/find_master.toml
id = "ch1_find_master"              # 全局唯一 ID
title = "寻找师父"                    # 场景名
type = "main"                       # main/side/event
parent = ""                         # 可选：父 scene ID，UI 层级用
condition = "location.id == '华山_正殿'"  # 可选：自动触发条件
display = "current"                 # current/log/hidden
visible = "location.id == '华山'"    # 可选：面板可见条件
prerequisites = ["intro"]           # 可选：前置 scene

[[steps]]
# ... 步骤数组
```

### 9 种步骤类型

| 类型 | 做什么 | 关键字段 |
|------|--------|---------|
| `dialogue` | 对话演出（见下文） | `conversation` + `speaker` + `lines` |
| `objective` | 目标追踪，事件驱动推进 | `objective = { type, target }` |
| `combat` | 触发战斗 | `enemies`, `on_win`, `on_lose` |
| `reward` | 执行效果（发奖励） | `effects` |
| `condition` | 条件分支 | `condition`, `next`, `else` |
| `goto` | 跳转到另一步 | `target` |
| `scene` | 嵌套子场景 | `scene_id` |
| `spawn` | 生成角色/物品 | `template`, `at_location`, `count` |
| `script` | 步骤内 JS 瞬间逻辑（沙箱） | `script`, `params`, `next`, `else` |

### 对话步（dialogue step）

Dialogue step 引用 conversation 文件。Conversation 是**独立的对话数据**，不绑定剧情文件：

```toml
# 示例 1：引用角色专属对话
[[steps]]
type = "dialogue"
conversation = "character:令狐冲/teach_sword"
speaker = "令狐冲"         # 可选：默认说话者，影响样式

# 示例 2：引用全局共享对话
[[steps]]
type = "dialogue"
conversation = "global:common_victory"

# 示例 3：引用任务专属对话
[[steps]]
type = "dialogue"
conversation = "quest:第一章/intro"

# 示例 4：纯旁白（无对话）
[[steps]]
type = "dialogue"
lines = ["一阵风吹过，树叶沙沙作响。"]
```

**conversation 引用方式**：

| 简写 | 含义 | 对应文件 |
|------|------|---------|
| `character:令狐冲/teach_sword` | 角色专属对话 | `characters/named/令狐冲/conversations/teach_sword.toml`（旧结构 `characters/dialogue/{ID}/` 仍兼容） |
| `global:common_victory` | 全局共享对话 | `conversations/common_victory.toml` |
| `quest:第一章/intro` | 任务专属对话 | `quests/**/conversations/第一章/intro.toml` |
| `event:酒馆/偶遇` | 事件专属对话 | `events/**/conversations/酒馆/偶遇.toml` |

conversation 文件内容示例（`characters/named/令狐冲/conversations/teach_sword.toml`）：

```toml
id = "teach_sword"
[[nodes]]
id = "start"
lines = ["想学剑？拜师要去找掌门。"]
choices = [
  { text = "岳掌门在哪", next = "ask_location" },
  { text = "改天再来", effects = [{ type = "start_scene", params = { scene = "learn_sword" } }] },
]
```

### 触发方式

1. **自动触发**：scene 写 `condition`，条件满足时自动开始
2. **手动触发**：对话选项或指令中用 `start_scene` effect：

```toml
effects = [{ type = "start_scene", params = { scene = "find_master" } }]
```

没有 `condition` 的 scene 不会自动开始，必须手动触发。

### 说话者样式

注册说话者的文字样式（颜色、速度等），自动生效。**只能定义在 styles.toml 中**
（引擎只从 `mods/{mod}/definitions/talk/styles.toml` 加载，scene 文件内的 `[styles]` 不会生效）：

```toml
# mods/武侠/definitions/talk/styles.toml
[styles.speaker]
令狐冲 = { color = "#FFD700" }
岳灵珊 = { color = "#FF69B4" }
```

字段与普通样式一致（trigger/display/speed/pause/color/size/font；`speed` 单位是毫秒/字，不要写 0.5）。

### 完整示例：一个包含对话→目标→战斗→奖励的 scene

```toml
# quests/main/find_master.toml
id = "ch1_find_master"
title = "寻找师父"
type = "main"
display = "current"
condition = "location.id == '华山_正殿'"

[[steps]]
id = "talk"
type = "dialogue"
conversation = "character:令狐冲/worry"
next = "find"

[[steps]]
id = "find"
type = "objective"
title = "前往华山正殿"
objective = { type = "reach_location", target = "华山_正殿" }
next = "fight"

[[steps]]
id = "fight"
type = "combat"
enemies = ["山贼_甲"]
on_win = "reward"
on_lose = "fight"

[[steps]]
id = "reward"
type = "reward"
effects = [{ type = "modify_attribute", params = { attr = "声望", value = 10 } }]
```

> 完整文档见 `docs/scene-system.md`。

## 指令效果参数协议

> 覆写或新增指令（`definitions/instructions/`）时，`effects` 里的每个效果都有参数协议。
> 参数值全部有 erArk 源码依据（`docs/instruction-replication/batch-01-daily.md`），**-1/0 不是魔法数字**，含义如下：

### 通用结算效果（h-core 注册）

| 效果 type | 参数 | 语义 |
|-----------|------|------|
| `settle_hp_mp` | `hpValue` / `mpValue` | **-1 = 按程度扣减，1 = 按程度增加**，其他值 = 固定增减量（erArk common_default.py:42 同款协议） |
| | `degree` | 程度档：**0=少**（体力1/分、气力3/分）、1=中（3/6）、2=大（5/10）——erArk degree_dict |
| | `addTime`（可选） | 覆盖 time_cost；缺省用指令的 time_cost |
| `modify_attribute` / `set_attribute` | `attr` | **ability 类属性（技巧/刻印/感度/性技等）自动操作 `abilities[name].level`（保持 {level,xp} 结构）**；其他属性写 base（绑定优先）——2026-08-09 契约语义，写 TOML 时无需区分 |
| | `value` | modify：增减量；set：设置值 |
| `settle_state` | `state` | 状态属性名（好意/快乐/恭顺…，取 attributes.toml 的 parameter 属性） |
| | `baseValue` | 基础固定值，**默认 30**（erArk base_chara_state_common_settle 默认值）；最终 = (time_cost + baseValue) × 系数 |
| | `ability_level`（可选） | 系数用哪个能力的等级；缺省查 hConfig `state_ability` 映射（如 好意→亲密） |
| | `negate`（可选） | true = 结果取负 |
| `settle_favorability` | — | 好感度按 calcFavorability 公式（状态/能力/素质修正链）结算 |
| `settle_trust` | — | 信赖度按 calcTrust 公式；上限 300 |
| `h_experience` | `expId` | 经验 ID（如 `"80"` = 对话经验，Experience.csv） |
| | `value` | 增量（erArk CVE 效果的最后一个数字） |
| `judge_check` | — | **loader 自动注入**（有 judge_base 时），不要手写；target 默认 = 指令目标 |
| `accumulate_degrees` | `degrees` | 五度属性统一累加通道（2026-08-21，`docs/five-degrees-attributes.md`）：一次性对目标累加多个「度」`{ 屈服度 = 10, 软弱度 = 5 }`。**单调不降**：负值入参 → warning + 丢弃；度名未在 attributes.toml（category=social）定义 → warning + 跳过；换算/性格系数留 TODO（恒 1） |

### chat 专用效果

| 效果 type | 参数 | 语义 |
|-----------|------|------|
| `chat_settle` | `fail_effects` / `success_effects` | 分支链（effect_blocks 块名或内联数组）；`talk_count > 发起者.话术技能+1` → fail，否则 success；无论如何 talk_count +1（衰减由引擎在每次行动开始自动处理） |
| | `success_scene` / `fail_scene` | **可选（2026-08-17）**：成败口上场景（对应 erArk CHAT/CHAT_FAILED 双 behavior 口上）。成功链执行后触发 `triggerScene(success_scene, 目标)`；失败链后触发 `fail_scene`。`fail_scene` 缺省 = 无（失败不出失败口上，大多数指令默认成功）；两者均缺省 = 不触发（兼容外部 trigger_dialogue 用法） |
| `talk_add_adjust` | — | 复刻 erArk 501（default.py:5875）：结算条件 = 有目标且任一方为玩家（NPC→NPC 跳过）；好感 = int(calcFavorability × 话术adjust)，>0 再乘连续减值；好意/快乐 = 完整 base_chara_state_common_settle 管线（tenths/素质/攻略/连续减值，ability_level = 发起者话术技能，快乐用 mark_debuff_adjust）；记录 talk_time |

### 体技效果

| 效果 type | 参数 | 语义 |
|-----------|------|------|
| `tech_adjust` | `part` | 部位属性名（皮肤/胸部/阴蒂/阴道/后穴/尿道/子宫/口喉/心理…）——体技修正的部位快感+欲情：快感 = base×sqrt(发起者.技巧 × 目标.部位感度) + 附加修正（体位/喜欢体位/眼罩/无觉刻印/群交/怀孕灌肠/催眠敏感），欲情 = base×ability表[目标.部位感度] + 素质/催眠/群交修正；含 tenths/连续减值/无意识门控 |
| | `baseValue` | 基础固定值，默认 50 |
| `pain_by_lubrication` | — | 121：目标苦痛 = base(30)×(苦痛刻印系数 + 润滑苦痛系数)，润滑越少苦痛系数越高（erArk default.py:8255） |
| `pain_by_part` | `part` | 122-125：V/A/U/W 性交苦痛 = base(V/A=30/U=1000/W=100)×(苦痛刻印系数 + max(润滑系数−腰技系数,0)×扩张尺寸系数)；W 子宫奸 ×3（erArk default.py:8287-8468） |
| `feel_by_sex` | `part` | 131-134：性交快感/欲情：快感 = base(50)×sqrt(目标感度×发起者.技巧) + (阴茎大小/2+腰技/2)，欲情额外修正同；后穴(A)欲情只加阴茎大小项（erArk :8552 源码原样）（erArk default.py:8471-8636） |
| `pain_to_h` | — | 135：心理快感 = base(50)×sqrt(心理感度×发起者.技巧) + 受虐系数；欲情 + 技巧+受虐；苦痛 + 技巧+受虐（erArk default.py:8639-8680） |

> 以上 5 个效果全走 settleOneState 通用管线（tenths_add/连续减值/素质修正/无意识门控自动生效），
> 来源为 erArk 独立 settle 函数（2026-08-08 补齐）。**兽部不支持**（方舟世界观专属，全砍——遇兽部 warning+跳过）。

### 射精欲效果（h-ejaculation 注册）

| 效果 type | 参数 | 语义 |
|-----------|------|------|
| `pl_p_adjust` | `skill`（可选） | PL_P 系列（erArk 120/141-146）：被服务时发起者自己的射精欲 += int((time_cost+50) × adjust + 自己P快/8)；adjust = 服务者.技巧（无 skill）或 服务者.技巧/2 + 服务者.对应技（指技/舌技/足技/胸技/膣技/肛技）；**target 应为 self** |
| `eja_add` | — | 70：自己射精欲 += int(time_cost + 10 + 射精欲×0.4)（erArk default.py:3648） |
| `eja_add_target` | `baseValue` | 44：目标射精欲 += int((time_cost+baseValue) × ability表[目标.阴茎感度])（erArk default.py:3219） |

> 射精欲积累的另一种途径（自动）：任何 P 部位快感结算后，二段结算自动按
> `射精欲 += 100 + int(射精欲×0.4)` 积累（erArk Second_effect.py:657-679），无需手写效果。

### 礼物效果（h-core 注册）

| 效果 type | 参数 | 语义 |
|-----------|------|------|
| `give_gift` | `mode` | **favor** = 好感公式管线 / **apology** = 道歉（愤怒清零+好感+10+好意+10）/ **drug** = 不处理（药物效果由物品 effects 链表达）/ **mold** = TODO 未实装 |
| | `favor_base`（favor） | 好感基础值，默认 10；最终好感 = calcFavorability(target, floor(favor_base × talk_multiplier × 话术修正)) |
| | `talk_multiplier`（favor） | 话术倍率（小×1.5/中×2/大×3，mod 按礼物价值给） |
| | `trust_base`（favor，可选） | >0 时信赖 += calcTrust(target, floor(trust_base × 话术修正)) |
| | `target` | 礼物接收者（同 effect 通用 target 协议） |

> 话术修正：目标有 hConfig `gift_talk_ability_id`（默认"话术技能"）能力时乘 `ability_lv_adjust` 表。
> 完整说明见 `docs/item-system.md` §八。测试物品：test-mod `玉佩`（favor）/ `道歉信`（apology）。

## 物品字段协议

> 物品定义在 `definitions/items.toml`（**可拆为 `definitions/items/*.toml` 按类别分文件**，加载时合并）。
> H 原生物品（药物/玩具/避孕套）在 h-core 插件默认层 `data/default/items/`，mod 可 override。完整手册见 `docs/item-system.md`。

### schema 速查

| 字段 | 必填 | 取值 | 说明 |
|------|------|------|------|
| `id` | ✅ | 中文，整个模组唯一 | 跨文件重复 → 加载 error |
| `name` | — | 显示名 | 省略时用 id |
| `type` | ✅ | `consumable`/`equipment`/`tool`/`material`/`key` | 五枚举 |
| `use` | ✅ | 数组（兼容字符串单值） | `self`/`target`/`equip`/`gift`/`key`（内置）+ `h_drug`/`h_toy`/`h_special`（h-core 注册）+ 插件自定义（useRegistry.register） |
| `tags` | — | 自由字符串数组 | 引擎不校验不消费 |
| `stackable` | — | boolean | 是否可堆叠 |
| `consume` | — | boolean，默认 true | 使用后扣数量（false = 可重复使用） |
| `effects` | — | 效果组 | 使用/装备时执行（effect-system） |
| `description`/`price`/`level`/`time_cost` | — | 数字（后三者） | 描述/价格/需求等级/耗时；price/level/time_cost 非数字 → warning |
| `body_slot` | H 专属 | 数字；-1 = 即时药 | 身体物品槽位号，槽位自由扩展 |
| `body_auto_remove` | body_slot≥0 时必填 | `manual`/`h_end`/`expiry` | 缺失 → 加载 error |
| `duration` | — | 分钟 | expiry 药品持续时间（装槽时写 expiry 时间戳） |
| `tick_base`/`tick_part` | — | 数字 / `{ability, params}` | 玩具 H 中持续快感（body_item_tick） |
| `attack_bonus`/`defense_bonus` | — | 顶层数字 | 装备加值，引擎不识别语义，由消费方插件读取 |

### 消耗语义

| 场景 | 背包 |
|------|------|
| 使用（consume=true） | -1（数量不足拦截） |
| 使用（consume=false） | 0 |
| 装槽（body_item_equip） | -1（占用） |
| 手动卸下 / H 结束（h_end） | +1（归还） |
| expiry 到期 / 避孕套射精消耗 / 即时药（body_slot=-1） | 不归还 |

### 校验规则（加载时）

- **error**：mod 文件间同 id 重复；`body_slot ≥ 0` 缺 `body_auto_remove`
- **warning**：`use` 值未注册（useRegistry）；`consume` 非 boolean；`price`/`level`/`time_cost` 非 number
- **不校验**：tags 内容、attack_bonus/defense_bonus、槽位冲突

## 角色字段速查（标准角色契约）

> 权威契约：`docs/character-schema.md`（11 节：属性表/最小必需集/字段字典/校验规则/**字段分层表**/改名记录）。
> 写角色数据（roster/named/base.toml）前必读。速查要点：

- **定义权威**：`definitions/attributes.toml`（h-core 提供全套默认，mod 可覆写/新增）——角色数据禁止裸字段，未定义键 → 加载 warning
- **命名空间映射**：`category=base` → 写 `base = {}`；`parameter` → `params = {}`；`mark` → `marks = {}`；`ability` → `abilities = {}`（简写数字，加载展开为 `{level, xp}`）
- **最小必需集**（角色必须有的字段，缺了结算/判定静默失效）：
  - base：体力/气力/体力上限/气力上限/好感度/信赖度/欲望值/射精欲/射精欲上限/精液量/精液量上限
  - params：皮肤/胸部/阴蒂/阴茎/阴道/后穴/子宫/口喉/心理 + 润滑/习得/恭顺/好意/欲情/快乐/先导/屈服/羞耻/苦痛/恐怖/抑郁/反感
  - marks：快乐/屈服/苦痛/恐怖/反发刻印
  - abilities：技巧/顺从/亲密/欲望/露出/施虐/受虐
  - 其余（疲劳度/饥饿值/感度组/扩张/话术/隐蔽/性技/排卵周期/精神…）缺失 = 对应功能静默关闭
- **默认值**：全部在 `docs/character-schema.md` §2 属性表（mod 不写 → 用 default；读档缺字段自动补齐 + warning）
- **字段分层（ADR-0007，schema §11）——写角色数据前先对号入座**：
  - ✅ **L1 能写**：`base`（气力/好感度/自定义属性）、`abilities`（含刻印：`快乐刻印 = 2`）、`marks`（自动归一化到 abilities）、`talents`、`experience`、`first_times`（`virgin_V = true` = 非处女）、`status_effects`（初始）、`relations`、`inventory`、`equipment`、`assets`、`behavior`、`current_location`（初始）、`dead`、`pregnancy`（孕妇初始设定）
  - ⚠️ **L2 罕见**：`params`（daily_reset 每日清零，写了仅首日意义）、`sp_flag`（需插件声明）——写了有 warning，正常不写
  - 🚫 **L3 别碰**：`h_state` / `body_items` / `first_records` / `dirty` / `hypnosis` / `action_info` / `achievement` / `equipment_off` / `equipment_visible` / `equipment_blood`——系统运行时管理，写了无效
- **经验**：`experience = { 数值id = 次数 }`（erArk 数值直通，禁改键名）
- **改名对照**（erArk ↔ 我们）：肛肠→后穴、心理快感→心理、射精槽→射精欲、精液槽→精液量、疲劳值→疲劳度、醉酒度→酒气、处女天赋→`first_times.virgin_*`（h-first-time 破处时同步删对应天赋）——完整表见 schema §10 + `scripts/erark-name-map.json`
- **禁止**：数字键能力（读 `abilities['技巧']` 不是 `abilities[30]`）、手动写 h_state/body_items（引擎管理）、改 experience 键名、补回已砍字段（兽部/尿道感度/激素/技能系列，见对账表"有意删减"）

## 对接什么

| 你要做的 | 对接哪里 | 是否有插件默认？ |
|----------|----------|------------------|
| 定义属性 | `definitions/attributes.toml` | ✅ h-core 提供全套 |
| 定义能力 | `definitions/abilities.toml` | ✅ h-core 提供全套 |
| 绑定插件属性 | `bindings.toml` | — |
| 创建角色 | `roster.toml`（次要）或 `templates/`+`roster`（重要） | — |
| 装备槽 | `definitions/equipment.toml` | ✅ h-core 提供 9 槽 |
| 物品 | `definitions/items.toml`（可拆 `definitions/items/`） | ✅ h-core 提供 H 物品默认（药物/玩具/避孕套） |
| 状态效果 | `definitions/status-effects.toml` | ✅ h-core 提供通用 |
| 关系类型 | `definitions/relations.toml` | ✅ h-core 提供好感度 |
| 角色口上 | `characters/dialogue/{ID}/dialogue.toml` | — |
| 角色对话 | `characters/{ID}/conversations/{name}.toml`（或 `quests/*/conversations/`） | — |
| 地点 | `maps/locations/*.toml`（平铺+parent） | — |
| 日历显示 | `definitions/calendar.toml` | — |
| 主题 | `theme.toml`（CSS变量） | — |
| 依赖插件 | `meta.toml` 的 dependencies | — |
| H 公式系数 | `h-config.toml` | ✅ h-core 提供默认（含 state_ability 映射） |
| 精液追踪 | `selected.body_semen.{部位}.{索引}` | ✅ h-ejaculation 自动追踪 |
| 事件/任务 | `quests/` 或 `events/` 下的 TOML | — |
| 全局对话 | `conversations/` 下的 TOML | — |

## TOML 注意事项

- 中文属性名/key 必须加引号：`"气血" = 100` 不是 `气血 = 100`
- 内联表中的中文 key 也要引号：`base = { "好感度" = 50 }`
- `parent = null` 直接省略（@iarna/toml 不支持 null 值）

## 参考

- 完整规范：`AGENTS.md`（39节）
- 术语表：`CONTEXT.md`
- 示例模组：`mods/test-mod/`
- 口上/样式细节：`docs/dialogue-format.md`（BBCode、styles、行为轨整体修饰）· `docs/talk-common-system.md`（行为词条）· `docs/mod-override.md`（覆盖规则）
