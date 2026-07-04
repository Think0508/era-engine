# h-hypnosis 催眠子系统设计文档（第一阶段）

> 精确复刻 erArk 催眠系统核心机制。对照源码：`hypnosis_panel.py`、`game_type.py`、`handle_premise_arts.py`、`constant_promise.py`、`constant_effect.py`、`default.py`、`common_default.py`、`Hypnosis_Type.csv`、`Hypnosis_Talent_Of_Pl.csv`、`Hypnosis_Talent_Of_Npc.csv`、`Hypnosis_Sub_Type.csv`

---

## 1. 概述

催眠（Hypnosis）是一个**渐进式 H 子系统**，允许玩家对 NPC 施加催眠状态，逐步提升催眠程度，解锁更多控制能力。第一阶段实现核心机制：催眠程度增长、4 种催眠类型、7 个子状态效果、理智消耗、相关公式。

- **依赖插件**：h-core（前提注册、效果注册）、effect-system
- **独立插件**：`h-hypnosis`（新增）

---

## 2. 数据模型

### 角色 Hypnosis 数据结构

```typescript
// 在角色的 h_state 上
interface HypnosisData {
  hypnosis_degree: number             // 催眠程度 0-200+
  increase_body_sensitivity: boolean  // 体控-敏感度提升
  force_ovulation: boolean            // 体控-强制排卵
  blockhead: boolean                  // 体控-木头人
  active_h: boolean                   // 体控-逆推
  roleplay: number[]                  // 心控-角色扮演 ID 列表（第二阶段）
  pain_as_pleasure: boolean           // 心控-苦痛快感化
}
```

### 角色 SP Flag

```typescript
sp_flag.unconscious_h: number            // 0=正常 4=平然催眠 5=空气催眠 6=体控催眠 7=心控催眠
```

### 玩家能力/天赋

```typescript
// 玩家催眠天赋（影响程度上限和可用类型）
player_talent.hypnosis_primary: boolean     // 天赋 331 - 初级催眠
player_talent.hypnosis_intermediate: boolean // 天赋 332 - 中级催眠
player_talent.hypnosis_advanced: boolean    // 天赋 333 - 高级催眠
player_talent.hypnosis_special: boolean     // 天赋 334 - 特殊催眠
```

### 全局缓存

```typescript
// 存储当前选择的催眠类型
cache.hypnosis_type: number  // 0=无 1=平然 2=空气 3=体控 4=心控
```

---

## 3. 4 种催眠类型

| ID | 名称 | 需要天赋 | 程度上限 | 说明 |
|:--:|------|---------|:--------:|------|
| 1 | 平然催眠 | 331(初级) | 50 | 最基本的催眠，NPC 进入轻度恍惚 |
| 2 | 空气催眠 | 333(高级) | 100 | NPC 表面正常但被催眠，好感和信赖增长归零 |
| 3 | 体控催眠 | 334(特殊) | 100 | 可控制 NPC 身体功能（5 个子状态） |
| 4 | 心控催眠 | 334(特殊) | 200 | 可控制 NPC 心智（2 个子状态 + 角色扮演） |

### `unconscious_h` 映射

| 值 | 含义 |
|:--:|------|
| 0 | 正常 |
| 1 | 睡眠 |
| 2 | 醉酒 |
| 3 | 时停 |
| 4 | 平然催眠 |
| 5 | 空气催眠 |
| 6 | 体控催眠 |
| 7 | 心控催眠 |

---

## 4. 7 个子状态

| ID | 名称 | 类型 | 理智消耗 | 效果 |
|:--:|------|:----:|:--------:|------|
| 1 | 敏感度提升 | 体控 | 10 | 所有快感系数 +2（`common_default.py:304`） |
| 2 | 强制高潮 | 体控 | 50 | 立即触发一次绝顶 |
| 3 | 强制排卵 | 体控 | 10 | `reproduction_period = 5`，受精率 +25% |
| 4 | 木头人 | 体控 | 10 | NPC 在 H 中强制 WAIT（睡眠/群交除外） |
| 5 | 逆推 | 体控 | 10 | NPC 主动发起 H |
| 11 | 苦痛快感化 | 心控 | 10 | 苦痛(state 17) → 快感(state 23) 转换 |
| 12 | 角色扮演 | 心控 | — | 第二阶段实现 |

---

## 5. 前提（Premises）

### 能力前提（4 个）

| 前提 ID | 函数逻辑 | 来源 |
|---------|---------|------|
| `PRIMARY_HYPNOSIS` | 玩家有天赋 331 | `handle_premise_arts.py:53` |
| `INTERMEDIATE_HYPNOSIS` | 玩家有天赋 332 | 同上 |
| `ADVANCED_HYPNOSIS` | 玩家有天赋 333 | 同上 |
| `SPECIAL_HYPNOSIS` | 玩家有天赋 334 | 同上 |

### 程度前提

| 前提 ID | 函数逻辑 |
|---------|---------|
| `SELF_HYPNOSIS_0` | `hypnosis_degree == 0` |
| `T_HYPNOSIS_0` | 目标 `hypnosis_degree == 0` |
| `SELF_HYPNOSIS_NE_0` | `hypnosis_degree != 0` |
| `T_HYPNOSIS_NE_0` | 目标 `hypnosis_degree != 0` |

### 状态前提

| 前提 ID | 函数逻辑 |
|---------|---------|
| `IN_HYPNOSIS` | `unconscious_h in {4,5,6,7}` |
| `NOT_IN_HYPNOSIS` | `unconscious_h not in {4,5,6,7}` |
| `T_IN_HYPNOSIS` | 目标在催眠中 |
| `T_NOT_IN_HYPNOSIS` | 目标不在催眠中 |

### 子状态前提（每个子状态 4 个：self/target + on/off）

| 前提 ID | 函数逻辑 |
|---------|---------|
| `HYPNOSIS_INCREASE_BODY_SENSITIVITY` | `hypnosis.increase_body_sensitivity == true` |
| `NOT_HYPNOSIS_INCREASE_BODY_SENSITIVITY` | 取反 |
| `T_HYPNOSIS_INCREASE_BODY_SENSITIVITY` | 目标的对应值 |
| `T_NOT_HYPNOSIS_INCREASE_BODY_SENSITIVITY` | 目标的对应值取反 |

同理适用于：`FORCE_OVULATION`、`BLOCKHEAD`、`ACTIVE_H`、`PAIN_AS_PLEASURE`、`ROLEPLAY`。

---

## 6. 效果（Effects）

### 注册到 effect-system 的效果类型

| effect type | 参数 | 功能 | 对应 erArk |
|------------|------|------|-----------|
| `hypnosis_one` | `{}` | 单人催眠：计算程度增长，扣除理智 | 1211 |
| `hypnosis_all` | `{}` | 集体催眠：对场景中所有角色催眠 | 1212 |
| `hypnosis_cancel` | `{}` | 解除催眠：重置程度/子状态/unconscious_h | 1213 |
| `hypnosis_increase_body_sensitivity_on` | `{}` | 开启敏感度提升 | 1221 |
| `hypnosis_increase_body_sensitivity_off` | `{}` | 关闭敏感度提升 | 1222 |
| `hypnosis_force_climax` | `{}` | 强制绝顶 | 1223 |
| `hypnosis_force_ovulation_on` | `{}` | 开启强制排卵 | 1224 |
| `hypnosis_force_ovulation_off` | `{}` | 关闭强制排卵 | 1225 |
| `hypnosis_blockhead_switch` | `{}` | 切换木头人 | 1226 |
| `hypnosis_blockhead_off` | `{}` | 关闭木头人 | 1227 |
| `hypnosis_active_h_switch` | `{}` | 切换逆推 | 1228 |
| `hypnosis_active_h_off` | `{}` | 关闭逆推 | 1229 |
| `hypnosis_pain_as_pleasure_switch` | `{}` | 切换苦痛快感化 | 1230 |
| `hypnosis_pain_as_pleasure_off` | `{}` | 关闭苦痛快感化 | 1231 |

---

## 7. 公式

### 7.1 催眠程度增长（`hypnosis_panel.py:42-86`）

```
hypnosis_degree_gain = 1 × adjust × random(0.5, 1.5)

adjust = base_coefficient(类型系数)
  - 平然催眠（类型 1/2）→ 2
  - 空气催眠（类型 3）→ 4
  - 体控/心控（类型 3/4）→ 6
  + 调香加成（aromatherapy == 6 时 +5）  // TODO: 依赖香薰系统
  × ability_adjust[19]  // 无觉刻印等级修正

结果四舍五入到一位小数
```

### 7.2 理智消耗（`hypnosis_panel.py:23-40`）

```
sanity_cost = 10 + 修正
  被完全催眠(天赋73) → 修正 = -9（总 1）
  被深度催眠(天赋72) → 修正 = +10（总 30）
  被初级催眠(天赋71) → 修正 = +5（总 25）
  无 → 修正 = +10（总 20）
```

### 7.3 催眠程度上限

```
上限 = max(config_hypnosis_talent_of_pl[玩家拥有最高天赋].max_hypnosis_degree)
  初级催眠(331) → 50
  中级催眠(332) → 100
  高级催眠(333) → 100
  特殊催眠(334) → 200
```

### 7.4 催眠完成检查

当 `hypnosis_degree >= 阈值` 时：
- 阈值由 `Hypnosis_Talent_Of_Npc.csv` 定义（50%/100%/200%）
- NPC 获得对应催眠天赋（71/72/73）
- 触发二段行为（`has_been_primary_hypnosis` / `deep` / `complete`）
- 触发成就

### 7.5 敏感度提升公式（`common_default.py:304`）

```python
# 所有快感系数调整时:
if character_data.hypnosis.increase_body_sensitivity:
    final_adjust += 2
```

### 7.6 苦痛快感化公式（`common_default.py:243`）

```python
# 当结算状态 17(苦痛) 时:
if character_data.hypnosis.pain_as_pleasure:
    # 重定向到状态 23(快感) 而不是积累苦痛
    state_id = 23
```

### 7.7 空气催眠信赖替换

```python
# 当 unconscious_h == 5(空气催眠) 且 双方同一位置时:
# 好感和信赖增长归零
favorability_gain = 0
trust_gain = 0
```

### 7.8 催眠姦经验

```python
# 在性交经验结算时:
if 处于催眠状态:
    experience[126](催眠姦) += 1
    experience[127](被催眠姦) += 1
```

---

## 8. 指令

| 指令 ID | 前提 | 说明 |
|---------|------|------|
| `hypnosis_one` | `HAVE_TARGET\|NOT_H\|TIRED_LE_74` | 对单个目标催眠 |
| `hypnosis_all` | `SCENE_OVER_TWO\|SCENE_ALL_NOT_H\|TIRED_LE_74` | 集体催眠 |
| `hypnosis_cancel` | `T_IN_HYPNOSIS` | 解除目标催眠 |
| 7 个子状态指令 | `T_IN_HYPNOSIS` + 对应子状态前提 | 开关子状态 |

---

## 9. 文件结构

```
src/plugins/h-hypnosis/
├── plugin.toml
└── index.ts              # onLoad + onEnable（全部逻辑）
```

---

## 10. TODO（第二阶段）

- 角色扮演系统（50+ roleplay ID + 分类 + 约束 + 联动 + 互斥）
- 玩家催眠天赋进阶（经验累积 + 升级）
- NPC 催眠天赋获取（程度阈值触发）
- AI 文本生成集成（roleplay context prompt）
- 口上数据（hypnosis_one/hypnosis_all/hypnosis_cancel）
- 催眠类型选择面板 UI（Chose_Hypnosis_Type_Panel）
- 角色扮演选择面板 UI（Chose_Roleplay_Type_Panel）
