# 前提系统 — premises.md

## 概述

前提（Premise）是游戏中的条件判定单元，用于控制：
- 指令是否显示/可执行（`premises` 字段）
- 口上是否匹配（`condition = "premises:high_1"`）

前提由 `src/core/premise-registry.ts` 统一管理。任何插件在 `onEnable` 中通过
`ctx.api.call('h-core', 'registerPremise', id, handler)` 注册自己的前提。
前提 handler 按 ID 注册，求值时按 ID 查找并执行。

## 架构

```
PremiseRegistry（src/core/premise-registry.ts）
  ├─ register(id, handler)      ← 插件在 onEnable 中调用
  ├─ evaluate(premises, ctx)    ← TOML 指令/口上求值
  └─ 数据流：
       指令定义 premises=["NOT_H","HAVE_TARGET"]
         → command-bar 调 premiseRegistry.evaluate()
         → 逐个查找 handler → 执行 → 返回 boolean
```

**核心原则**：
- `PremiseRegistry` 是通用机制，属于 core 层
- **前提 handler 的具体定义由插件提供**（h-core 注册所有 H/通用前提）
- 子插件/子系统可覆盖已注册的前提（后注册覆盖前注册）
- Mod 可通过 TOML 表达式定义自定义前提（见下文）

## 在 TOML 中使用

```toml
# 指令 premises 数组（多项间是 AND 关系）
premises = ["NOT_H", "HAVE_TARGET"]

# 口上 condition 字符串（用 & 分隔多项）
condition = "premises:high_1&sys_0"
```

## 插件注册新前提

```typescript
// 在自己的 onEnable 中
ctx.api.call('h-core', 'registerPremise', 'MY_PREMISE', (evalCtx) => {
  const charId = evalCtx.selectedCharacterId
  if (!charId) return false
  // ...你的判定逻辑
  return true
})
```

`evalCtx` 包含：

| 字段 | 说明 |
|------|------|
| `selectedCharacterId` | 当前选中的角色 ID |
| `sourceId` | 触发者 ID（玩家或指令源） |

handler 返回 `boolean`（通过/不通过）或 `number`（> 0 通过，≤ 0 不通过）。

## 前提覆盖机制

后注册的同名前提覆盖前注册的。例如：

```
h-core（基础）: register('EXPECTED', handlerBase)
h-hidden（隐奸）: register('EXPECTED', handlerHidden)  ← 覆盖，露出模式下用隐奸的预期判定
```

这允许子插件/子系统在不修改父插件源码的前提下，改变前提行为。

## Mod 自定义前提

Mod 作者可在 `definitions/premises.toml` 中用条件表达式定义新前提，
无需写插件代码：

```toml
# mods/武侠/definitions/premises.toml
[[premises]]
id = "CLOUD_SECT_DISCIPLES_GE_5"
description = "当前地点有 ≥5 名青云门弟子"
condition = "location.characters_by_faction.青云门 >= 5"

[[premises]]
id = "IN_SWORD_VALLEY"
description = "位于剑谷"
condition = "location.id == 'sword_valley'"
```

**机制**：
- 每条前提的 `condition` 字段是一个标准条件表达式（与 `condition` 字段语法一致）
- 引擎加载时自动将这些前提注册到 `PremiseRegistry`，handler = 条件求值
- 前提被其他插件或 mod 注册的同名 ID 覆盖时，使用新 handler

**复杂前提**（无法用条件表达式表达的），需要写 mod 专属插件：

```typescript
// mods/武侠/plugins/my-premises/index.ts
export function onEnable(ctx: PluginContext) {
  ctx.api.call('h-core', 'registerPremise', 'CUSTOM_LOGIC', (evalCtx) => {
    // 任意复杂逻辑
    return countByFaction('青云门') >= 5
  })
}
```

## 已注册的前提

### 基础状态

| 前提 | 说明 | 注册者 |
|------|------|--------|
| `HAVE_TARGET` | 存在选中角色 | h-core |
| `SELECTED_EXISTS` | 同 HAVE_TARGET | h-core |
| `NOT_H` | 不在 H 模式 | h-core |
| `IS_H` | 正在 H 模式 | h-core |
| `T_NORMAL` | 目标正常状态 | h-core |
| `SCENE_ONLY_TWO` | 当前场景不超过 2 人 | h-core |

### 参数等级（PALAM）

检查角色的最高 PALAM 等级：

| 前提 | 说明 | 注册者 |
|------|------|--------|
| `high_1` ~ `high_10` | 最高参数等级 ≥ N | h-core |
| `high_999` | 始终 true（用于无条件口上） | h-core |

等级阈值由 `attributes.toml` 中属性的 `level_thresholds` 定义。

### 属性判定

| 前提 | 说明 | 注册者 |
|------|------|--------|
| `HP_G_1` | 体力 > 1 | h-core |
| `TIRED_LE_84` | 疲劳度 ≤ 134 | h-core |
| `TECHNIQUE_GE_3` | 技巧能力 ≥ Lv3 | h-core |
| `FALL_LEVEL_GE_1` | 陷落等级 ≥ 1 | h-core |

### 服装前提

| 前提 | 说明 | 注册者 |
|------|------|--------|
| `TARGET_WEAR_BRA` | 目标穿着胸罩 | h-core |
| `TARGET_NOT_WEAR_BRA` | 目标没穿胸罩 | h-core |
| `TARGET_WEAR_PAN` | 目标穿着内裤 | h-core |
| `TARGET_NOT_WEAR_PAN` | 目标没穿内裤 | h-core |
| `CLOTH_OFF` | 全裸 | h-core |

详见 `premise-clothing.ts`。

### 系统状态

| 前提 | 说明 | 注册者 |
|------|------|--------|
| `sys_0` | 普通状态（始终 true）| h-core |
| `sys_1` ~ `sys_5` | 系统状态占位（当前全返回 false）| h-core |

### 其他子系统前提

各 H 子系统（隐奸、露出、催眠等）在 `onEnable` 中通过 `registerPremise` 注册自己的前提。
完整列表见 `src/plugins/h-core/premise/` 下的注册文件。
