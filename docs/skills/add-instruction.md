# 添加一条新指令

## 工作流

### 1. 写 TOML

```toml
# mods/武侠/definitions/instructions/daily.toml

[effect_blocks]
recover_hp = { type = "recover_permil", target = "self", params = { attr = "体力", rate = 100 } }

[[instructions]]
id = "rest"
label = "休息"
type = "daily"
time_cost = 60
premises = ["NOT_H", "TIRED_LE_84"]
effects = ["recover_hp"]
```

### 2. 注册效果类型（如没有现成的）

`src/plugins/effect-system/index.ts` 的 `onLoad` 里注册：

```typescript
effectTypeRegistry.register('my_effect', (params, ctx) => {
  const ids = ctx._targetIds as string[]
  for (const id of ids) {
    if (ctx.settlement) {
      ctx.settlement.applyChange(id, params.attr, params.value)
    }
  }
  return true
})
```

### 3. 验收

- `npm run dev` → 无启动报错
- 指令出现在指令栏（premises 满足时）
- 点击后全屏输出显示变化
- 退出后主界面数值已更新（自动同步，无需额外代码）

## 易犯的坑

### target 字段放错位置

```toml
# ❌ 错——target 在 params 里
{ type = "modify_attribute", params = { target = "self", attr = "体力", value = 10 } }

# ✅ 对——target 在顶层
{ type = "modify_attribute", target = "self", params = { attr = "体力", value = 10 } }
```

`resolveTarget` 读的是 `effect.target`，不是 `effect.params.target`。

### 指令名冲突

TOML 指令的 `id` 如果和 `native-commands.ts` 里的 handler 同名，会冲突。
写新指令前确认 `src/ui/native-commands.ts` 中没有同名 handler。

### 持续输出需用 settlement

Effect handler 里改属性后要调 `ctx.settlement.applyChange(id, attr, delta)` 才能记入输出日志。直接用 `char.base[attr] = value` 改值不会产生输出记录。
