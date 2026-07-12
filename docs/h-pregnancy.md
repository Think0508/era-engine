# H 妊娠系统（h-pregnancy）

## 做什么

管理妊娠判定、妊娠天数追踪、周期显示。监听精液吸收事件触发怀孕判定。妊娠状态存入角色存档，按游戏天数推进周期变化。

## 数据格式

角色运行时字段：`{ isPregnant: boolean, days: number, period: string }`。妊娠定义在 `definitions/` 层（可选，含周期名称、怀孕概率等配置）。

## Mod 作者使用

前提引用 `PREGNANT`、`PERIOD_TYPE`、`DAYS_OF_PREGNANCY` 等。用 `absorbSemen`（h-ejaculation 提供）触发判定。妊娠天数通过 `getDays` 查询，周期通过 `getPeriod` 查询。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('h-pregnancy', 'isPregnant', charId)          → boolean
ctx.api.call('h-pregnancy', 'getDays', charId)             → number
ctx.api.call('h-pregnancy', 'getPeriod', charId)           → string
```

## Override 规则

前提 handler 可被 mod 专属插件同名覆盖（`docs/mod-override.md` §运行时 override）。周期定义和概率配置遵循数据 override。
