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
│   ├── items.toml            # 物品
│   ├── factions.toml         # 势力/门派
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
├── quests/main/ + side/      # 任务
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

### 新增一个能力

```toml
# definitions/abilities.toml（Layer 3，覆盖插件默认或新增）
[abilities."暗器精通"]
name = "暗器精通"
description = "暗器使用技巧"
type = "passive"
max_level = 10
tags = ["combat_active"]      # 面板分组由 tag 决定（此处显示在「其他技能」）
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
abilities = { "华山剑法" = 1, "技巧" = 1 }
abilities = { "华山剑法" = { level = 1, xp = 0 }, "技巧" = { level = 1, xp = 0 } }
```

引擎合并顺序：模板 → roster → named，后加载覆盖前加载。

**绑定系统**——插件用通用名（hp），你在 bindings.toml 映射到你的属性名：
```toml
[bindings.combat-wuxia]
hp = "气血"
attack = "攻击力"
```

**口上 = 演出**——几乎所有指令执行后触发口上。三层优先级：
1. 场景通用（`scene-dialogue.toml`）——地点/环境描述
2. 角色通用（`character-dialogue.toml`）——无专属时的 fallback
3. 角色专属（`characters/dialogue/{ID}/dialogue.toml`）——定制台词

**文字格式**——口上/日志支持 Markdown 子集：
- `**加粗**` `*斜体*` `~~删除线~~` `||spoiler（黑框点击展开）||`
- `{{color:#FF0000 红色文字}}` `{{color:#80FF0000 半透明}}` `{{font:楷体 文字}}` `{{size:large 大字}}`

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
condition = "premises:IN_SWORD_VALLEY"
```

**机制**：
- `condition` 字段支持所有标准条件表达式（`> < >= <= == != && || !`）
- 可引用 `player.*`、`location.*`、`character.{ID}.*`、`game.time.*` 等路径
- 引擎启动时自动加载 `definitions/premises.toml`，注册到前提系统
- 如果条件表达式不足以表达你的逻辑，需要写 mod 专属插件（见 `docs/plugin-author-guide.md`）

## 对接什么

| 你要做的 | 对接哪里 |
|----------|----------|
| 定义属性 | `definitions/attributes.toml` |
| 绑定插件属性 | `bindings.toml` |
| 创建角色 | `roster.toml`（次要）或 `templates/`+`roster`（重要） |
| 角色口上 | `characters/dialogue/{ID}/dialogue.toml` |
| 角色对话 | `characters/dialogue/{ID}/conversations/*.toml` |
| 地点 | `maps/locations/*.toml`（平铺+parent） |
| 装备槽 | `definitions/equipment.toml` |
| 日历显示 | `definitions/calendar.toml` |
| 主题 | `theme.toml`（CSS变量） |
| 依赖插件 | `meta.toml` 的 dependencies |

## TOML 注意事项

- 中文属性名/key 必须加引号：`"气血" = 100` 不是 `气血 = 100`
- 内联表中的中文 key 也要引号：`base = { "好感度" = 50 }`
- `parent = null` 直接省略（@iarna/toml 不支持 null 值）

## 参考

- 完整规范：`AGENTS.md`（39节）
- 术语表：`CONTEXT.md`
- 示例模组：`mods/test-mod/`
