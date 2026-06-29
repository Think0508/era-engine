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

**属性系统**——你定义所有属性名，引擎不认识任何属性：
```toml
# definitions/attributes.toml
[attributes]
"气血" = { type = "number", default = 100, display = true, display_group = "status" }
"好感度" = { type = "number", default = 30, display = true, display_group = "social" }
"快C" = { type = "number", default = 0, display = true, display_group = "身体快感", daily_reset = true }
```

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
