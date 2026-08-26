# 效果系统（effect-system）

## 做什么

通用效果执行引擎。效果（Effect）是 TOML 中描述「发生了什么事」的唯一方式。所有系统的动作指令最终都转为 effect 执行：战斗伤害、物品使用、对话触发、模式切换。效果组按数组顺序执行，支持 `depends_on` 前置依赖和 `target` 目标选择。

## 核心效果类型

| 类型 | 说明 | 走绑定系统 |
|------|------|-----------|
| `set_attribute` | 设置属性值 | ✅ |
| `modify_attribute` | 加减属性值 | ✅ |
| `set_field` | 直接改实体字段（abilities/talents 等） | ❌ |
| `add_item` | 加物品到背包 | ❌ |
| `remove_item` | 从背包移除物品 | ❌ |
| `modify_relation` | 修改角色关系值 | ❌ |
| `advance_time` | 推进游戏时间（分钟） | ❌ |
| `narrative_output` | 输出到叙事日志 | ❌ |
| `enter_mode` | push 模式到栈 | ❌ |
| `exit_mode` | pop 模式出栈 | ❌ |
| `recover_permil` | 千分比恢复（如 rate=100 恢复 10%） | ❌ |
| `nop` | 无操作占位符 | ❌ |

## Mod 作者使用

```toml
effects = [
  { type = "modify_attribute", params = { attr = "hp", value = -10 } },
  { type = "narrative_output", params = { text = "你受到 10 点伤害。" } }
]
```
省略 `target` 时默认 `"selected"`。`selected = null` 时静默跳过 + warning。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('effect-system', 'execute', effects, execCtx)   → void
ctx.api.call('effect-system', 'registerType', type, handler)  → void
ctx.api.call('effect-system', 'hasType', type)                → boolean
```

## Override 规则

运行时效果类型 handler 后注册覆盖前注册（`docs/mod-override.md` §运行时 override）。插件注册的效果类型可被 mod 专属插件同名覆盖。
