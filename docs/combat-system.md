# 战斗系统（combat-base + combat-wuxia）

## 做什么

回合制战斗骨架。combat-base 提供通用回合循环、HP 扣减、状态结算、钩子系统；combat-wuxia 继承 combat-base，提供武侠风格的伤害公式、技能面板、内功/剑法加成。发出标准事件 `combat:start/turn/end`。

## 数据格式

```toml
# combat-wuxia 配置（专属 data 文件）
[formula]
attack_base = "player.攻击力 * 1.5 + abilities.华山剑法.level * 3"
defense_base = "player.防御力 * 0.8"
```

## 关键概念

- **钩子系统**：combat-base 暴露内部钩子（`damage_calc`、`hit_check`），combat-wuxia 在 onEnable 中覆盖公式
- **标准事件**：`combat:request` → `combat:start` → `combat:turn`（每回合）→ `combat:end`
- **能力标签**：combat-wuxia 查询 `combat_active`、`sword`、`internal`、`movement` 标签做加成

## Mod 作者使用

启用的战斗插件在满足条件的指令处自动生效。mod 用 `effects = [{type = "start_combat", params = {enemies = ["华山_弟子_甲"]}}]` 触发战斗。

## API（见 `docs/plugin-author-guide.md`）

```
# combat-base
ctx.api.call('combat', 'getCombatContext')            → CombatContext | null
ctx.api.call('combat', 'registerHook', hookName, fn)  → void
ctx.api.call('combat', 'start', enemies, allies?)     → void
ctx.api.call('combat', 'executeAction', actor, action, target) → void
ctx.api.call('combat', 'end', winner, outcome)         → void

# combat-wuxia（extends combat-base）
ctx.api.call('combat-wuxia', 'calcPanel', charId)     → CombatPanel
ctx.api.call('combat-wuxia', 'getAbilitiesByTag', ...)
```

## Override 规则

运行时钩子 handler 后注册覆盖前注册（`docs/mod-override.md` §运行时 override）。combat-wuxia 通过 `registerHook` 覆盖 damage_calc/hit_check 等内部钩子。
