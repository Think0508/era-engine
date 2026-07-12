# 状态效果系统（status-system）

## 做什么

管理持续性效果：中毒、醉意、buff、debuff 等。独立于战斗系统，广泛用于战斗内外——醉意影响对话好感度、中毒影响移动体力。监听 `game:hour_changed` 按 tick_interval 跳动执行 tick_effects。

## 数据格式

```toml
# definitions/status-effects.toml
[status-effects.中毒]
name = "中毒"
category = "debuff"              # debuff | buff | neutral
duration = 360                   # 分钟，-1 = 永久
tick_interval = 60               # 每 60 分钟执行一次 tick_effects
stackable = false
max_stack = 1
tick_effects = [{ type = "modify_attribute", params = { attr = "气血", value = -5 } }]
on_apply_effects = []            # 施加时触发
on_remove_effects = []           # 移除时触发
```

施加：`effects = [{type = "apply_status", params = {status = "中毒", target = "selected"}}]`
移除：`effects = [{type = "remove_status", params = {status = "中毒", target = "selected"}}]`

## Mod 作者使用

在 `definitions/status-effects.toml` 定义状态。叠加规则：重新施加总是刷新 duration；stackable=true 时 stack +1 至 max_stack。tick_effects 数值按 stack 倍乘。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('status', 'hasStatus', charId, statusId)       → boolean
ctx.api.call('status', 'getStack', charId, statusId)        → number
ctx.api.call('status', 'getRemaining', charId, statusId)    → number
ctx.api.call('status', 'apply', charId, statusId)           → void
ctx.api.call('status', 'remove', charId, statusId)          → void
```

## Override 规则

状态定义遵循三层数据 override（`docs/mod-override.md`）。插件默认在 `src/plugins/*/data/default/` 提供通用状态，mod 同名 ID 覆盖或新增。
