# H 露出系统（h-exposure）

## 做什么

管理角色的露出状态等级和模式。等级影响 NPC 反应概率、对话选项、好感度变化方向。模式名称由模组自定义（如「羞耻」「快感」「麻木」），系统只存数值。

## Mod 作者使用

前提引用 `EXPOSURE`、`EXPOSURE_MODE`、`EXPOSURE_LEVEL` 等。用 `setLevel` 在对应效果中调整。模式名通过 `getModeName` 获取显示用字符串，模式名映射在 mod definitions/ 配置。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('h-exposure', 'getLevel', charId)            → number
ctx.api.call('h-exposure', 'setLevel', charId, level)     → void
ctx.api.call('h-exposure', 'getModeName', charId)         → string
```

## Override 规则

前提 handler 可被 mod 专属插件同名覆盖（`docs/mod-override.md` §运行时 override）。模式名映射表遵循数据 override。
