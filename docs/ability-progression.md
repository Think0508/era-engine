# 能力升级系统（ability-progression）

## 做什么

管理能力的等级、经验值、技能树解锁与条件驱动升级。独立插件，不属战斗系统——战斗外的锻造/烹饪/副职也用同一机制。

**双模式升级**（2026-08-11 成长系统，ADR-0009）：
- `mode = "xp"`（缺省）：`gain_ability_xp` 即时升级，XP 达阈值自动升，触发 `unlocks`
- `mode = "condition"`：erArk 式条件驱动——结算点（睡眠/H结束）按 per-level `upgrades` 检查 `needs`，满足即升并扣宝珠

## 数据格式

### 存储组织（2026-08-11：目录拆分 + 按需展开）

**能力定义三处存放**（都支持三层 override）：
- `abilities.toml` 单文件（少量能力；h-core 默认层用）
- `definitions/abilities/*.toml` **目录拆分**（大量技能按类别/门派分文件——如 `sword.toml`/`internal.toml`/`craft.toml`，同层重复 id 后读文件胜出）；插件默认层 `data/default/abilities/` 同支持
- `ability-upgrades.toml`（condition 模式 per-level 升级路径大表，h-core 稳定层专用）

**按需展开**：角色 `abilities` 只包含「数据写了 + attributes.toml `category=ability`/`mark` 落位 + `mode="condition"`」的能力——
未拥有的 xp 技能无条目（不进存档、面板不显示、`getByTag`/条件路径语义 = 0 级）。
角色卡能力（感度/刻印/性技）由 attributes.toml 条目自动落位（全角色拥有），技能按需。
**condition 模式能力全量注入 0 级条目**（经验→升级联动：checkUpgrade 遍历 char.abilities 做条件升级，
无条目 = 永不升级）。旧存档的全量条目保留（存档权威）。运行时获得（`unlocks` 解锁等）自动创建条目。

**display 字段**：`display = false` 的能力参与结算/条件/查询，但不出现在角色面板
（如 mod 用不到的默认能力）。缺省 true。

### 战斗技能的"掌握型"经验（2026-08-11 性能验证）

**两种经验分离**：
- `entity.experience.{数值id}`：erArk 标准经验字典（部位/绝顶/体位等身体与行为记录）——
  驱动角色卡能力升级门槛（condition needs 的 E 类型）
- `ability.xp`：能力条目内的升级经验（`{level, xp}`）——**xp 模式技能用这个**。
  `gain_ability_xp` effect / 战斗结算写入，O(1) 条目内操作

战斗技能（掌握型："默认没有，掌握一种是一种"）经验 = **`ability.xp`**，与通用框架的
experience 字典完全独立——不占 erArk 数字 id 空间，不参与 experience 的存档字典。

**性能实测**（性能基准测试，growth.test.ts）：
- 500 技能定义 + 500 NPC 各掌握 20：解析 88ms（加载一次）
- 500 NPC 全员 `checkUpgrade`：**1.4ms**（xp 技能零参与——checkUpgrade 只遍历 condition 能力）
- `gainXp`/`getByTag`：遍历只碰**拥有的条目**（按需展开），与定义总数无关

**存储量**：每角色条目 = 掌握的技能数（按需展开），非定义数——500 技能 × 500 NPC 各掌握 20
= 1 万条目（可接受），而非 25 万。

### xp 模式

```toml
[abilities.华山剑法]
name = "华山剑法"
type = "active"
max_level = 10
tags = ["combat_active", "sword"]
xp_curve = "linear"
xp_per_level = 100
unlocks = [
  { at_level = 6, ability = "独孤九剑" },
  { at_level = 10, talent = "剑意天赋" }
]
```

### condition 模式（erArk AbilityUp.csv 复刻）

```toml
[abilities."房中术"]
name = "房中术"
max_level = 3
tags = ["abl"]
mode = "condition"
sex_need = -1                 # 性别限定（erArk 原值：-1 通用 / 0 男限定 / 1 女限定）
# 能力级附加判定：每级升级前都检查（erArk 技巧的"性技之和 ≥ 等级×倍率"同款）
extra_needs = [{ type = "ability_sum", tag = "technique", per_level = 2, per_level_npc = 3 }]

[[abilities."房中术".upgrades]]            # 第 i 条 = 从 i 级升 i+1 级；条数 = 值域上限
needs = [{ type = "experience", id = 0, value = 5 }]

[[abilities."房中术".upgrades]]
needs = [{ type = "juel", id = 12, value = 100 }, { type = "ability", id = "亲密", value = 2 }]
backup_needs = [{ type = "favorability", value = 60 }]   # 主不满足时备选（任一满足即可）
```

**need 类型**（`needs`/`backup_needs`/`extra_needs` 通用）：

| type | 含义 | 示例 |
|------|------|------|
| `ability` | 能力等级达标 | `{ type = "ability", id = "亲密", value = 2 }` |
| `talent` | 拥有该素质 | `{ type = "talent", id = "剑骨" }` |
| `juel` | 宝珠数量达标（升级时消耗） | `{ type = "juel", id = 12, value = 100 }` |
| `experience` | 经验数值达标（erArk 数字 id 直通） | `{ type = "experience", id = 0, value = 5 }` |
| `favorability` | 好感度达标 | `{ type = "favorability", value = 60 }` |
| `trust` | 信赖度达标 | `{ type = "trust", value = 50 }` |
| `ability_sum` | 带 tag 的能力等级之和 ≥ 当前等级×倍率 | `{ type = "ability_sum", tag = "technique", per_level = 2, per_level_npc = 3 }` |

**数据文件位置**：
- 少量能力：直接在 `abilities.toml` 的 `[abilities.X]` 写 mode/upgrades/extra_needs/sex_need
- 大量 erArk 数据：h-core 默认层 `ability-upgrades.toml`（插件默认层，mod 可在 `definitions/ability-upgrades.toml` 覆盖），加载时并入 abilities 定义

## 结算点

- **睡眠**（sleep-system）：玩家 + NPC 分支调用 `checkUpgrade`（mod 开关 `upgrade_on_player_sleep`/`upgrade_on_npc_sleep`）
- **H 结束**（h-core）：参与 NPC 调用 `checkUpgrade`（开关 `upgrade_on_npc_h_end`）+ 528 上限成长（绝顶次数 → 体力×2/气力×3/精液+1）
- 升级消耗宝珠（juel 需求全量扣减）、发 `character:ability_up` 事件、写叙事日志 `X的Y提升到Z级`

## 值域约束（软约束）

- condition 模式：`upgrades` 条数 = 天然上限（缺条不可升）
- xp 模式：`max_level`
- 存档直写超限值不 clamp（存档权威）；加载校验：upgrades 超 max_level → error；needs 引用不存在的能力/素质 → error

## Mod 作者使用

能力用 `tags` 分类，插件用标签查询分类。加 XP：`effects = [{type = "gain_ability_xp", params = {ability = "华山剑法", xp = 20}}]`（condition 模式能力忽略）。max_level=0 视为无等级能力。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('abilities', 'getByTag', charId, tag)      → {id, level, xp}[]
ctx.api.call('abilities', 'hasTag', charId, tag)        → boolean
ctx.api.call('abilities', 'getLevel', charId, abilityId)→ number
ctx.api.call('abilities', 'gainXp', charId, abilityId, xp) → void
ctx.api.call('abilities', 'checkUpgrade', charId)       → void（结算点调用：条件驱动升级）
```

## Override 规则

能力定义遵循三层 override（`docs/mod-override.md`）。插件提供默认能力（含 erArk 升级路径），mod definitions/ 覆盖或新增。升级数据（ability-upgrades.toml）同样三层可覆盖。
