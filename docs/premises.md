# 前提系统 — premises.md

## 概述

前提（Premise）是游戏中的条件判定单元，用于控制：
- 指令是否显示/可执行（`premises` 字段）
- 口上是否匹配（`condition = "premises:high_1"`）

前提注册在 `premiseRegistry`，任何模块均可通过 `registerPremise(id, handler)` 添加。

## 在 TOML 中使用

```toml
# 指令 premises 数组（多项间是 AND 关系）
premises = ["NOT_H", "HAVE_TARGET"]

# 口上 condition 字符串（用 & 分隔多项）
condition = "premises:high_1&sys_0"
```

## 已注册的前提（engine 默认）

### 基础状态

| 前提 | 说明 |
|------|------|
| `HAVE_TARGET` | 存在选中角色 |
| `SELECTED_EXISTS` | 同 HAVE_TARGET |
| `NOT_H` | 不在 H 模式 |
| `IS_H` | 正在 H 模式 |
| `T_NORMAL` | 目标正常状态（简化版，始终 true）|
| `SCENE_ONLY_TWO` | 当前场景不超过 2 人 |

### 参数等级（PALAM）

检查角色的最高 PALAM 等级：

| 前提 | 说明 |
|------|------|
| `high_1` ~ `high_10` | 最高参数等级 ≥ N（如 `high_1` = 至少有一项参数达到 Lv1）|
| `high_999` | 始终 true（用于无条件口上）|

等级阈值由 `attributes.toml` 中属性的 `level_thresholds` 定义。

### 属性判定

| 前提 | 说明 |
|------|------|
| `HP_G_1` | 体力 > 1 |
| `TIRED_LE_84` | 疲劳度 ≤ 134（适合休息）|
| `TECHNIQUE_GE_3` | 技巧能力 ≥ Lv3 |

### 服装

| 前提 | 说明 |
|------|------|
| `TARGET_WEAR_BRA` | 目标穿着胸罩 |
| `TARGET_NOT_WEAR_BRA` | 目标没穿胸罩 |
| `TARGET_WEAR_PAN` | 目标穿着内裤 |
| `TARGET_NOT_WEAR_PAN` | 目标没穿内裤 |
| `CLOTH_OFF` | 全裸 |
| … | 详见 `premise-clothing.ts` |

### 系统状态

| 前提 | 说明 |
|------|------|
| `sys_0` | 普通状态（已注册，始终 true）|
| `sys_1` ~ `sys_5` | 系统状态占位（当前全返回 false）|

## 注册新前提

```typescript
import { premiseRegistry } from '../h-core'

premiseRegistry.register('MY_PREMISE', (ctx: any) => {
  const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
  if (!charId) return false
  // ...你的判定逻辑
  return true
})
```

`ctx` 包含：

| 字段 | 说明 |
|------|------|
| `selectedCharacterId` | 当前选中的角色 ID |
| `uiStore?.selectedCharacterId` | 同上（fallback）|
| `gameStore` | 游戏状态（仅在 CommandBar 中可用）|

handler 返回 `boolean`（通过/不通过）或 `number`（> 0 通过，≤ 0 不通过，用于带权重的选取）。
