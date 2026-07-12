# H 初次系统（h-first-time）

## 做什么

记录关键事件的「第一次」。以 key-value 形式存储首次记录（首次口交、首次插入等），按身体部位或行为类别区分。可用于前提判定（如 `FIRST_INSERT`）和口上条件分支（给/不给第一次描述）。

## 数据格式

角色运行时字段 `first_times`：`{ "insert_vagina": { done: true, gameTime: {...}, partner: "令狐冲" }, ... }`。key 自由定义，不限制命名。

## Mod 作者使用

前提引用 `FIRST`、`NOT_FIRST` 等。用 `isVirgin(charId, key?)` 按 key 检查或无 key 时检查所有。`setFirstTime` 由系统在对应 effect 中调用，mod 也可手动调用。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('h-first-time', 'isVirgin', charId, key?)    → boolean
ctx.api.call('h-first-time', 'getRecord', charId, key)    → any
ctx.api.call('h-first-time', 'setFirstTime', charId, key) → void
```

## Override 规则

无数据文件。前提 handler 可被 mod 专属插件同名覆盖（`docs/mod-override.md` §运行时 override）。
