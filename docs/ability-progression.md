# 能力升级系统（ability-progression）

## 做什么

管理能力的等级、经验值、技能树解锁。独立插件，不属战斗系统——战斗外的锻造/烹饪/副职也用同一机制。监听 `gain_ability_xp` effect，XP 积累到阈值自动升级，触发 `unlocks` 解锁。

## 数据格式

```toml
# definitions/abilities.toml
[abilities.华山剑法]
name = "华山剑法"
type = "active"                      # active | passive
max_level = 10
tags = ["combat_active", "sword"]    # 插件按标签查询
xp_curve = "linear"
xp_per_level = 100
unlocks = [
  { at_level = 6, ability = "独孤九剑" },
  { at_level = 10, talent = "剑意天赋" }
]
```

角色数据存储为 `abilities = { "华山剑法": { level: 3, xp: 45 } }`（mod 简写 `华山剑法 = 3` 由引擎展开）。

## Mod 作者使用

能力用 `tags` 分类，插件用标签查询分类。加 XP：`effects = [{type = "gain_ability_xp", params = {ability = "华山剑法", xp = 20}}]`。max_level=0 视为无等级能力。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('abilities', 'getByTag', charId, tag)      → {id, level, xp}[]
ctx.api.call('abilities', 'hasTag', charId, tag)        → boolean
ctx.api.call('abilities', 'getLevel', charId, abilityId)→ number
ctx.api.call('abilities', 'gainXp', charId, abilityId, xp) → void
```

## Override 规则

能力定义遵循三层 override（`docs/mod-override.md`）。插件提供默认能力、mod definitions/ 覆盖或新增。xp_curve 可选 linear/exponential/custom。
