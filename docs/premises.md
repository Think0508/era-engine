# 前提系统 — premises.md

## 概述

前提（Premise）是游戏中的条件判定单元，用于控制：
- 指令是否显示/可执行（`premises` 字段）
- 口上是否匹配（`condition = "premise(high_1)"`）

2026-08-13 起，前提与条件表达式引擎**合并为单一语法**（`src/core/condition-engine.ts`）：
前提 = 表达式的命名别名。`premise(X)` 是表达式引擎的一等语法（函数调用形态），
`premises` 数组 = 多个 `premise(X)` 的 && 连接简写。一套语法、一套上下文、一套校验。

## 架构

```
conditionEngine（src/core/condition-engine.ts）
  ├─ registerPremise(id, handler)      ← 插件 onEnable 中调用（或 engine API premises.register）
  ├─ evaluate(expr, ctx)               ← 条件表达式求值（premise(X) 内联解析）
  ├─ evaluatePremises(ids, ctx)        ← premises 数组简写求值
  ├─ getPremiseValue(id, ctx)          ← 单前提原始值（权重场景取数值）
  ├─ getRegisteredPremiseIds()         ← 注册清单（校验用）
  └─ clear()                           ← 清注册表 + AST 缓存（测试隔离/模组重载）
```

**核心原则**：
- `conditionEngine` 是通用机制，属于 core 层
- **前提 handler 的具体定义由插件提供**（h-core 注册所有 H/通用前提）
- 子插件/子系统可覆盖已注册的前提（后注册覆盖前注册 = mod override 设计特性）
- Mod 可通过 TOML 表达式定义自定义前提（见下文）

## 在 TOML 中使用

```toml
# 指令 premises 数组（多项间是 AND 关系）
premises = ["NOT_H", "HAVE_TARGET"]

# 口上 condition 字符串（前提内联进表达式）
condition = "premise(high_1) && premise(sys_0)"

# 混写（前提 + 数据条件）
condition = "premise(high_1) && selected.body_semen.阴道.1 > 0"
```

## 插件注册新前提

```typescript
// 在自己的 onEnable 中（engine API——不依赖任何具体插件）
ctx.api.call('engine', 'premises.register', 'MY_PREMISE', (ctx) => {
  const charId = ctx.selectedCharacterId
  if (!charId) return false
  // ...你的判定逻辑
  return true
})
```

handler 上下文 = **完整 GameContext**：

| 字段 | 说明 |
|------|------|
| `selectedCharacterId` | 当前选中的角色 ID（口上/NPC AI 场景 = 目标角色） |
| `sourceId` | 触发者/被判定者 ID（talk-common 传行为发起者；NPC AI 传被决策 NPC） |
| `player` / `location` / `time` / `mode` | 完整游戏上下文（handler 可直接读取） |

handler 返回 `boolean`（通过/不通过）或 `number`（> 0 通过，≤ 0 不通过；数值本身是权重——NPC AI 目标搜索/随机事件按返回值求和）。

## 前提覆盖机制

后注册的同名前提覆盖前注册的。例如：

```
h-core（基础）: registerPremise('EXPECTED', handlerBase)
h-hidden（隐奸）: registerPremise('EXPECTED', handlerHidden)  ← 覆盖，露出模式下用隐奸的预期判定
```

这允许子插件/子系统在不修改父插件源码的前提下，改变前提行为。

## Mod 自定义前提

Mod 作者可在 `definitions/premises.toml` 中用条件表达式定义新前提，无需写插件代码：

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
- 每条前提的 `condition` 字段是一个标准条件表达式（与 `condition` 字段语法一致，可嵌套 `premise(X)` 引用）
- 引擎加载时自动编译为命名前提注册（handler = 表达式求值闭包）
- 与代码注册同表，统一覆盖语义（mod 可覆盖插件默认前提）
- 循环引用（A 引用 B、B 引用 A）由求时检测兜底（未知前提抛错）

**复杂前提**（无法用条件表达式表达的），需要写 mod 专属插件：

```typescript
// mods/武侠/plugins/my-premises/index.ts
export function onEnable(ctx: PluginContext) {
  ctx.api.call('engine', 'premises.register', 'CUSTOM_LOGIC', (ctx) => {
    // 任意复杂逻辑
    return countByFaction('青云门') >= 5
  })
}
```

## 权重语义（消费方策略）

前提 handler 返回数值时，**怎么消费这个数值是消费方的策略**，core 只提供机制函数：

| 函数 | 语义 | 消费方 |
|------|------|--------|
| `weightAllToOne(premises, ctx)` | erArk weight_all_to_1：`high_N` → +N，其余满足 +1，任一不满足 → 0，空集 → 1 | talk-common 口上权重竞争 |
| `premiseWeight(v)` | boolean → 1/0，number → 原值（求和规范化） | NPC AI 目标搜索、随机事件 |

## 校验（严格）

- `premise(X)` 引用未注册前提 → 加载期 **error + 注销该指令**（与未注册字段同强度，`conditionRegistry.validateExpression` 负责）
- `premises` 数组项未注册 → 同上（instruction-loader 校验）
- 运行时未知前提 → 抛错（调用方 try/catch 容错——UI 返回 false 不崩、NPC AI 淘汰目标并上报）
- 旧 `premises:` 字符串前缀语法已移除（2026-08-13 数据全量迁移），禁止使用

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
| `jj_0` ~ `jj_3` | 阴茎大小档位（0-3，角色注册时按分布初始化） | h-ejaculation |

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

各 H 子系统（隐奸、露出、催眠等）在 `onEnable` 中通过 `premises.register` 注册自己的前提。
完整列表见 `src/plugins/h-core/premise/` 下的注册文件。
