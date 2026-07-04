# 紧缚系统手册（h-bondage）

## 一、概述

独立插件 `h-bondage`，实现绳艺捆绑系统。完全对齐 erArk bondage 系统。

核心机制：
- `h_state.bondage`：int，0=未捆绑，1-15=捆绑类型 ID
- H 结束时自动清除
- 每行动后持续产生欲情/羞耻/苦痛

## 二、捆绑类型（Bondage Config）

定义在 `definitions/bondage/types.toml`：

```toml
[[types]]
id = 1
name = "双手缚"
level = 1
affect_walking = false
need_facility = false
description = "双手被绑在身前或身后"
```

| 字段 | 类型 | 含义 |
|------|------|------|
| id | int | 唯一 ID（0=未捆绑） |
| name | string | 显示名 |
| level | int | 捆绑等级 1-3 |
| affect_walking | bool | 是否影响行走 |
| need_facility | bool | 是否需要调教室 |
| description | string | 描述文本 |

### 全部 15 种捆绑

| ID | 名称 | 等级 | 影响行走 | 需调教室 |
|----|------|------|---------|---------|
| 0 | 未捆绑 | 0 | — | — |
| 1 | 双手缚 | 1 | ❌ | ❌ |
| 2 | 后高手缚 | 1 | ❌ | ❌ |
| 3 | 直臂缚 | 1 | ❌ | ❌ |
| 4 | 直立缚 | 2 | ❌ | ❌ |
| 5 | 后手观音 | 2 | ❌ | ❌ |
| 6 | 苏秦背剑 | 2 | ❌ | ❌ |
| 7 | 菱绳缚 | 2 | ❌ | ❌ |
| 8 | 吊缚 | 2 | ✅ | ✅ |
| 9 | 后手吊缚 | 2 | ✅ | ✅ |
| 10 | 单足吊缚 | 2 | ✅ | ✅ |
| 11 | 驷马缚 | 3 | ✅ | ✅ |
| 12 | 团缚 | 3 | ✅ | ❌ |
| 13 | 逆团缚 | 3 | ✅ | ❌ |
| 14 | 龟甲缚 | 3 | ❌ | ❌ |
| 15 | 海老缚 | 3 | ✅ | ✅ |

## 三、前提

| 前提 | 含义 |
|------|------|
| `HAVE_BONDAGE` | 背包里有绳子 |
| `SELF_NOW_BONDAGE` | 自己被捆绑着 |
| `SELF_NOT_BONDAGE` | 自己没被捆绑 |
| `TARGET_NOW_BONDAGE` | 目标被捆绑着 |
| `TARGET_NOT_BONDAGE` | 目标没被捆绑 |

## 四、效果

| effect type | 参数 | 说明 | erArk 效果 |
|------------|------|------|-----------|
| `bind` | `{ bondageId: number }` | 执行捆绑+屈服/羞耻+SM经验 | 15/16/21/59/81/86 |
| `unbind` | 无 | 解除捆绑+屈服/羞耻+经验 | 15/16/21/81 |
| `bondage_tick` | 自动触发 | 每行动后欲情/羞耻/苦痛 | 12/16/17 |

## 五、持续效果公式（erArk `realtime_settle.py`）

```
timeBase = addTime × 3
adjust = level × 0.5
finalAdj = feelAdj + adjust                         ← 相加，不是相乘！
finalValue = timeBase × finalAdj
```

| 状态 | 能力 | feelAdj 来源 | feelAdj 表 |
|------|------|-------------|-----------|
| 欲情(12) | 欲情[33] | `get_ability_adjust`（标准表） | 0→1.0, 5→1.8, 10→4.0 |
| 羞耻(16) | 露出[34] | `get_ability_adjust`（标准表） | 同上 |
| 苦痛(17) | 苦痛刻印[15] | `get_mark_debuff_adjust`（刻印表） | 0→1, 1→1.5, 2→3, 3+→5 |

### 数值示例（level=2, ability=5, addTime=10）

```
时间基数 = 10 × 3 = 30
adjust = 2 × 0.5 = 1.0

欲情：feelAdj = 1.8(ability[33]=5), finalAdj = 1.8 + 1.0 = 2.8, 每 tick +84
苦痛：feelAdj = 3.0(ability[15]=2), finalAdj = 3.0 + 1.0 = 4.0, 每 tick +120
```

## 六、能力门槛

| 等级 | 需要指技[70] |
|------|-------------|
| 1 | ≥ 2 |
| 2 | ≥ 4 |
| 3 | ≥ 6 |

## 七、物品

| 物品 | ID | 说明 |
|------|----|------|
| 绳子 | `绳子` | 可重复使用，背包有即可执行捆绑 |

## 八、API

```typescript
ctx.api.call('h-bondage', 'getBondage', charId)        // → int
ctx.api.call('h-bondage', 'getBondageName', charId)     // → string
ctx.api.call('h-bondage', 'canBind', charId, bondageId) // → { ok, reason? }
ctx.api.call('h-bondage', 'getBondageTypes')             // → BondageType[]
```

## 九、TODO

- `need_facility` 检查（调教室 location tag）
- 爱情旅馆顶级套房豁免绳子需求
- 位置前提：`TARGET_NOT_BONDAGE` → 屏蔽骑乘位/侍奉位
- NPC AI：被捆绑则无自主行动
- 口上绑定 CSV（bind.csv / unbind.csv）

## 十、文件索引

| 文件 | 用途 |
|------|------|
| `src/plugins/h-bondage/plugin.toml` | 插件声明 |
| `src/plugins/h-bondage/index.ts` | 插件入口 + 效果 + 前提 + 生命周期 |
| `mods/test-mod/definitions/bondage/types.toml` | 15 种捆绑类型定义 |
| `mods/test-mod/definitions/items.toml` | 绳子物品 |
| `mods/test-mod/definitions/abilities.toml` | 指技/欲情/露出能力 |
