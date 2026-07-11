# 实体命名空间 — entity-namespaces.md

## 概述

角色的所有数据按命名空间组织。**命名空间名 = `attributes.toml` 的 `category` 值。** 引擎不预知有哪些类别，全由数据驱动。

```toml
# category = "base"   → 角色实体上自动建 base.体力
# category = "parameter" → 自动建 params.恭顺
# category = "my_custom" → 自动建 my_custom.xxx
```

## 映射规则（唯一全局规则）

```typescript
ns = attr.category               // category 的值就是命名空间名
if (!entity[ns]) entity[ns] = {} // 不存在则自动创建
entity[ns][attrName] = defaultValue
```

两个例外：
- `category = "ability"` → 存为 `{ level, xp: 0 }` 对象
- `category = "parameter"` → 命名空间名叫 `params`（简写）

**除此之外，任何 category 值都直接作为命名空间名。**

## 命名空间速查

| TOML category | 实体路径 | 说明 |
|--------------|---------|------|
| `"base"` | `entity.base.*` | 体力、体力上限、气力、气力上限、精力、疲劳度、饥饿值、熟睡值、尿意、愤怒、酒气、情绪、理性、射精槽、射精槽上限、精液量、精液量上限、欲望值、金钱、好感度、信赖度 | ⚠️ 属性已定义，机制待实现（钳位/恢复/积累等） |
| `"parameter"` | `entity.params.*` | 皮肤、恭顺、欲情、屈服等 PALAM | ✅ 每日重置 + 等级阈值 |
| `"mark"` | `entity.marks.*` | 快乐刻印、屈服刻印等 | ⚠️ 属性已定义，获取机制待做 |
| `"ability"` | `entity.abilities.*` | 技巧、顺从等（含 level/xp） | ⚠️ 等级成长待做 |
| `"social"` | `entity.social.*` | 如果 mod 如此定义 |
| `"economy"` | `entity.economy.*` | 金钱等 |
| `"experience"` | `entity.experience.*` | 如果 mod 如此定义 |
| 任何新值 | `entity.{category}.*` | 自动创建 |

## Mod 扩展

### 1. 加新属性到现有命名空间

```toml
# mods/武侠/definitions/attributes.toml
[attributes]
"内力" = { type = "number", default = 0, category = "base" }
"根骨" = { type = "number", default = 0, category = "base" }
# → 存在 entity.base.内力、entity.base.根骨
```

### 2. 加全新的命名空间

```toml
# mods/武侠/definitions/attributes.toml
[attributes]
"剑法经验" = { type = "number", default = 0, category = "experience" }
"内功经验" = { type = "number", default = 0, category = "experience" }
# → 引擎自动建 entity.experience.剑法经验、entity.experience.内功经验
```

条件表达式写：
```toml
condition = "selected.experience.剑法经验 >= 100"
```

### 3. 重命名属性（不改算法）

想保留"气力"的算法但改显示名，只要在 mod 里重新定义：

```toml
# mods/哈利波特/definitions/attributes.toml
[attributes]
# 覆盖插件默认——key 保持 "气力"，显示和分组可改
"气力" = { type = "number", default = 100, category = "base", display = true, display_group = "魔力" }
```

如果要完全改名，新增属性、弃用旧的：

```toml
# 插件默认
"气力" = { type = "number", default = 100, category = "base" }

# mod 扩展：新增
"魔力" = { type = "number", default = 100, category = "base" }
# 然后指令里改引用 "魔力" 而不是 "气力"
```

### 4. 覆盖插件默认属性

同名属性（同一 key）在 override 时替换整个定义，`default`、`display`、`category` 均可改。

## 在条件表达式中引用

```toml
condition = "selected.params.恭顺 >= 50"       # 指定命名空间
condition = "selected.base.体力 <= 30"          # 指定命名空间
condition = "selected.flags.needs_rest == true"  # flags 命名空间
condition = "selected.my_custom.xxx == 1"        # mod 自定义命名空间
```

省略命名空间时，引擎自动在所有已存在的命名空间中查找：

```toml
condition = "selected.恭顺 >= 50"   # 自动在 base→params→flags→talents→marks→... 找到为止
```

## 在效果中引用

```toml
effects = [
  { type = "set_field", params = { path = "flags.needs_rest", value = false } },
  { type = "set_field", params = { path = "talents.处女", value = 0 } },
  { type = "set_field", params = { path = "first_record.kiss_id", value = "令狐冲" } },
  { type = "set_field", params = { path = "experience.剑法经验", value = 50 } },
  { type = "set_field", params = { path = "base.气力", value = 100 } },
]
```

## 实用场景

```toml
# 武侠 mod：六维 + 经验系统
"力道" = { type = "number", default = 10, category = "base" }
"根骨" = { type = "number", default = 10, category = "base" }
"身法" = { type = "number", default = 10, category = "base" }
"剑法经验" = { type = "number", default = 0, category = "experience" }
"内功经验" = { type = "number", default = 0, category = "experience" }

# 哈利波特 mod：重命名 + 新命名空间
"体力" = { type = "number", default = 100, category = "base", display_group = "巫师状态" }
"魔力" = { type = "number", default = 100, category = "base" }
"黑魔法防御经验" = { type = "number", default = 0, category = "experience" }
"咒语熟练度" = { type = "number", default = 0, category = "experience" }
```

## 休息/睡眠体系（eraTW 复刻目标）

### 指令一览

| 指令 | eraTW ID | 时长 | 恢复（体力/气力） | 特点 |
|------|----------|------|-------------------|------|
| **休憩** | COMF403 | 60分 | 10~17.5% / 20~27.5% | 同伴恢复、家具加成、疲劳超标自动入睡 |
| **昼寝** | COMF417 | 短 | 20% / 25% | 短时间高效恢复 |
| **就寝** | COMF402 | 长 | 全恢复 | 睡前副业、自动存档、每日结算 |
| **添い寝** | COMF354 | 陪伴 | 对方恢复 | 关系型，陪指定角色睡 |

### 疲劳判定（NEMUKE）

eraTW 的 NEMUKE = 总清醒分钟数 − 起床时间：
- NEMUKE < 960（16小时内）→ **休憩可用**
- NEMUKE ≥ 960（16小时+）→ **休憩不可用**，需就寝
- 休憩中 NEMUKE ≥ 960 → 自动切入睡眠

对应我们：`疲劳度` 0→160 对应 NEMUKE 0→960，即 `疲劳度 × 6 = NEMUKE`。

### 恢复公式

千分比恢复（permil）：
```
体力增加 = ceil(体力上限 × 恢复率‰ / 1000)
气力增加 = ceil(气力上限 × 恢复率‰ / 1000)
```

基础恢复率：休憩 体力 100‰（10%）、气力 200‰（20%）

### 家具加成（TODO）

eraTW 的家具加成是指定物品（橡木沙发等）提升恢复率：

| 家具等级 | 条件 | 体力恢复率 | 气力恢复率 |
|---------|------|-----------|-----------|
| 0（无家具） | 默认 | 100‰（10%） | 200‰（20%）|
| 1 | 橡木沙发×1 | 125‰（12.5%）| 225‰（22.5%）|
| 2 | 橡木沙发×2 | 150‰（15%）| 250‰（25%）|
| 3 | 橡木沙发×3 | 175‰（17.5%）| 275‰（27.5%）|

家具系统实现后，检查当前地点是否有对应家具，取 `min(家具数量, 3)` 作为等级。

### 同伴恢复

指令的目标角色（`_targetIds`）存在时，同伴也获得同样的恢复效果。
eraTW 额外检查 `CFLAG:态度 > 0`（目标愿意配合才恢复）。当前简化版不检查态度，有目标就恢复。

## 与 erark 的差距（TODO）

### 差距 2：NPC 完整行为循环

erark 在玩家行动后，会逐个 NPC 执行完整的 `character_behavior()`——NPC 自己选行为、结算效果、走实时积累。目前我们对 NPC 仅执行了 `realtimeSettle`（只积累疲劳/饥饿等），没有 NPC AI 行为循环。

需要等 NPC AI 系统时考虑。

### 差距 3：二段结算

erark 的 `effects` 之后还有一个 `check_second_effect()` 阶段，处理：
- 绝顶检测（快感超阈值 → 触发绝顶行为）
- 刻印获取（恭顺+屈服 积累到阈值 → 获得刻印）
- 道具持续效果（振动棒等）

目前与普通 effects 混在一起。等刻印/H 系统时再做。
