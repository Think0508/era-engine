# H 射精系统（h-ejaculation）

## 做什么

管理角色射精状态数值（eja 值）和体表精液量。eja 值在 H 中按行动累计，达到阈值触发绝顶（发出 `h:orgasm` 事件）。精液体表量可被其他系统消费（怀孕前提、露出判定、清洗效果）。

## Mod 作者使用

前提引用 `EJACULATION`、`EJACULATION_LIMIT`、`SEMEN_ON_BODY` 等。效果中用 `modify_attribute` 操作 eja 值。精液吸收通过 `absorbSemen` API 触发怀孕判定。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('h-ejaculation', 'getEja', charId)             → number
ctx.api.call('h-ejaculation', 'setEja', charId, val)        → void
ctx.api.call('h-ejaculation', 'getSemenOnBody', charId)     → number
ctx.api.call('h-ejaculation', 'absorbSemen', charId)        → void
```

## Override 规则

前提 handler 可被 mod 专属插件同名覆盖（`docs/mod-override.md` §运行时 override）。不涉及数据 data 文件。
