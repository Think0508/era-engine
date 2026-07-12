# 天赋系统 — talent-system

> 天赋的定义、效果声明、自动习得、mod override 全链路。

---

## 一、定义格式

```toml
# mods/武侠/definitions/talents.toml

[talents]

[talents."剑骨"]
name = "剑骨"
description = "天生适合练剑，剑法伤害+5%/级"
max = 10                     # 最大等级，0=无等级
tags = ["combat"]            # 可选：分类标签

# 数值效果（modifier）
[[talents."剑骨".modifiers]]
formula = "combat_damage"    # 影响的公式点
when_tag = "sword"           # 过滤条件：当技能标签含 "sword"
multiply = 0.05              # 每级乘 0.05（5%）

# 自动习得条件
[talents."初出茅庐"]
name = "初出茅庐"
max = 1
gain = { condition = "player.技巧 >= 10" }

# 替换类天赋（升级）
[talents."剑术大师"]
name = "剑术大师"
max = 5
gain = { condition = "player.talents.剑术精通 >= 5", replace = "剑术精通" }
# 满足条件时，剑术精通升级为剑术大师（移除剑术精通）
```

## 二、modifier（数值效果）

天赋通过 `modifiers` 影响已有的公式点。当前支持的公式点：

| formula | 作用 | 查询模式 | 调用位置 |
|---------|------|---------|---------|
| `judge` | 实行值判定（所有 H 指令） | `sumTalentModifiers(char, 'judge', {type})` | h-core/judge.ts |
| `combat_damage` | 战斗伤害 | `multiplyTalentModifiers(char, 'combat_damage', {tag, ability})` | combat-wuxia |
| `favorability` | 好感度变化 | `multiplyTalentModifiers(char, 'favorability', {})` | h-core/favorability.ts |
| `trust` | 信赖度变化 | `multiplyTalentModifiers(char, 'trust', {})` | h-core/trust.ts |

**modifier 过滤字段**（全部可选，不写则匹配所有）：

| 字段 | 说明 | 例子 |
|------|------|------|
| `when_tag` | 按能力标签匹配（abilities 的 tags） | `"sword"`, `"anal"` |
| `when_type` | 按指令 type 匹配 | `"anal"`, `"kiss"` |
| `when_ability` | 按具体能力 ID 匹配 | `"降龙十八掌"` |
| `condition` | 额外条件表达式 | `"game.time.hour >= 22"` |

**效果字段**（二选一或都用）：

| 字段 | 含义 | 例子 |
|------|------|------|
| `plus` | 每级加法值 | `plus = 10` → Lv3 时 +30 |
| `multiply` | 每级乘法系数 | `multiply = 0.05` → Lv3 时 +15% |

## 三、自动习得（gain）

每次指令执行后（`game:execution_end`），引擎检查玩家角色是否满足未拥有的天赋的 `gain.condition`。

```toml
[talents."初出茅庐"]
name = "初出茅庐"
max = 1
gain = { condition = "player.技巧 >= 10" }
```

- 条件满足 → 自动获得该天赋（获得后在日志中显示）
- 已有 → 不再检查
- 条件不满足 → 下次指令执行后再检查

**替换类天赋**（`replace` 字段）：

```toml
[talents."剑术大师"]
max = 5
gain = { condition = "player.talents.剑术精通 >= 5", replace = "剑术精通" }
```

满足条件时，移除 `剑术精通` 并赋予 `剑术大师`。用于天赋升级链。

## 四、天赋的 patch 与 override

天赋遵循三层优先级规则（详见 `docs/mod-override.md`）：

| 层 | 来源 | 说明 |
|---|------|------|
| 1 | 通用插件 `data/default/talents.toml` | 提供默认天赋定义 |
| 2 | Mod 专属插件 `data/talents.toml` | 覆盖或增加天赋 |
| 3 | Mod `definitions/talents.toml` | 最终定义 |

同层同名 ID → 加载时报错。跨层同名 → 高覆盖低。

**新增天赋**：直接在 `definitions/talents.toml` 加新的 `[talents."新ID"]` 即可。

**删除插件默认天赋**：在 `definitions/talents.toml` 中写 `"插件天赋ID" = null`。

**修改插件默认天赋的某字段**：在 `definitions/talents.toml` 中写同名 ID，只写要改的字段（深合并）。

## 五、条件引用

天赋等级可在条件和口上中引用：

```toml
# 指令 condition
condition = "player.talents.剑骨 >= 3"

# 口上 condition
condition = "premises:HAVE_TALENT_剑骨"

# 口上 condition 直接引用（如果注册了路径）
condition = "player.talents.剑骨 >= 1"
```

## 六、与 attributes.toml 的关系

天赋不需要在 `attributes.toml` 中注册。它直接存在 `char.talents` 命名空间中。
`attributes.toml` 用于属性和参数（体力、好感度、欲情等），天赋是独立的。

## 七、完整示例

```toml
[talents]

[talents."降龙精通"]
name = "降龙精通"
description = "降龙十八掌伤害+10%/级"
max = 5
gain = { condition = "player.abilities.降龙十八掌 >= 3" }
[[talents."降龙精通".modifiers]]
formula = "combat_damage"
when_ability = "降龙十八掌"
multiply = 0.10

[talents."魅惑体质"]
name = "魅惑体质"
description = "所有指令实行值+5/级"
max = 3
[[talents."魅惑体质".modifiers]]
formula = "judge"
plus = 5
```
