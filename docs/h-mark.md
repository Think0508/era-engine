# H 刻印系统（h-mark）

## 做什么

管理角色身上的永久或长期刻印标记。刻印有等级（0-5），影响对话选项、战斗结算、H 行為的修正系数。每个刻印可提供独立的数值修正（`getMarkAdjust`），如「堕落刻印 → 口上好感度阈值降低 20%」。刻印定义在 mod 的 `definitions/` 中。

## 数据格式

```toml
# definitions/marks.toml（示例）
[marks.堕落]
name = "堕落"
max_level = 5
adjustments = { 口上好感度阈值 = -0.2, 服从指令率 = 0.15 }
```

注册前提：`MARK_堕落`（检查 level >= 1）、`MARK_堕落_3`（检查 level >= 3）。

## Mod 作者使用

前提引用 `MARK_XXX` 系列。用 `checkOne` 检查特定刻印、`checkAll` 遍历。`getMarkAdjust` 在结算公式中调用（如 h-core 的 calcJudge 可读调整系数）。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('h-mark', 'getLevel', charId, markId)        → number
ctx.api.call('h-mark', 'checkOne', charId, markId)        → boolean
ctx.api.call('h-mark', 'checkAll', charId)                → {markId, level}[]
ctx.api.call('h-mark', 'getMarkAdjust', charId, markId)   → number
```

## Override 规则

刻印定义遵循三层 override（`docs/mod-override.md`）。前提 handler 可被 mod 专属插件同名覆盖。
