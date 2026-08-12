# 饥饿系统手册（hunger-system）

## 一、概述

独立插件 `hunger-system`，管理饥饿值增长、进食效果、消化 CD 与 NPC 口粮。

核心职责边界：
- **饥饿值增长**：收敛于引擎行动级结算（erArk realtime_settle 语义，`settleHunger` 含 HP/MP 比例系数）——本插件**不**做小时级增长，避免与行动级重叠双倍增长
- **本插件负责**：进食（`eat_food` 效果）、消化 CD 递减、NPC 自动进食、每日口粮发放

## 二、数据与配置

属性（mod `definitions/attributes.toml` 定义）：
- `饥饿值`（number）：当前饥饿值
- `消化剩余`（number）：消化 CD 剩余分钟数，>0 时不能进食

数值配置（h-config.toml `[hunger]`，可 patch/override）：

```toml
[hunger]
digestion_per_hour = 60        # 每小时消化 CD 递减量（分钟）
npc_auto_eat_threshold = 190   # NPC 饥饿值超过此值且消化中才自动进食
daily_ration_id = "口粮"       # 每日口粮物品 ID（关闭则不发放）
daily_ration_count = 1         # 每日口粮数量
```

食物物品字段（`definitions/items.toml`）：

```toml
[items.馒头]
use = ["food"]                  # use 必须含 "food" 才是食物
hunger_reduction = 240          # 进食减饥饿值
digestion_time = 240            # 消化 CD 分钟
hp_recovery = 1.0               # HP 回复倍率
mp_recovery = 1.0               # MP 回复倍率
time_cost = 30                  # 进食耗时（分钟）
```

## 三、机制

- **消化递减**：监听 `game:hour_changed`，全员 `消化剩余` 按 `digestion_per_hour` 递减
- **NPC 自动进食**：同 tick——NPC（非玩家）饥饿值 > `npc_auto_eat_threshold` 且消化 CD = 0 时，从背包找第一个食物自动 `eat_food`
- **每日口粮**：监听 `game:new_day`，给全部 NPC 发放 `daily_ration_id` × `daily_ration_count`（配置缺失则跳过）

## 四、效果类型

| 效果 | 参数 | 说明 |
|------|------|------|
| `eat_food` | `{ itemId }` | 进食：需背包有该食物且消化剩余=0；扣 1 个食物 → 减饥饿值 → 设消化 CD（天赋 `饿得快` 减半）→ 按 erArk 公式回体力/气力。不满足条件时输出日志并跳过 |

## 五、API

```typescript
ctx.api.call('hunger-system', 'getHunger', charId)     // → number（当前饥饿值）
ctx.api.call('hunger-system', 'getDigestion', charId)  // → number（当前消化剩余分钟）
```

## 六、依赖

- `inventory-system`（扣食物/加口粮）
- `effect-system`（执行 eat_food 效果链）

## 七、文件索引

| 文件 | 用途 |
|------|------|
| `src/plugins/hunger-system/plugin.toml` | 插件声明（依赖 + 事件监听） |
| `src/plugins/hunger-system/index.ts` | 插件入口：eat_food 效果 + 消化/进食 tick + 口粮 + API |
| `mods/*/definitions/items.toml` | 食物物品定义（use=["food"] + hunger_reduction 等） |
