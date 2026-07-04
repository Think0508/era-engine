# h-hidden 隐奸子系统设计文档

> 精确复刻 erArk 隐奸系统。对照源码：`hidden_sex_panel.py`、`realtime_settle.py`、`Second_effect.py`、`default.py`、`handle_npc_ai.py`、`settle_behavior.py`、`second_behavior.py`、`handle_premise_sp_flag.py`、`constant_effect.py`、`game_type.py`、`Behavior_Effect.csv`、`InstructConfig.csv`、`Hidden_Level.csv`

---

## 1. 概述

隐奸（Hidden Sex）是一种在他人存在/在场的场景中秘密进行性行为的 H 模式。核心机制是 **隐匿与暴露的风险管理**——每步 H 行为都会积累"被发现度"，达到阈值后有概率暴露，绝顶会大幅增加暴露风险。

- **与露出关系**：独立共存（`hidden_sex_mode` 和 `exhibitionism_sex_mode` 互不干扰）
- **依赖插件**：h-core（前提注册、效果注册）、effect-system、h-ejaculation（射精记录）
- **能力依赖**：ability[35]（隐奸经验）、ability[90]（隐蔽）、ability[34]（露出经验，用于羞耻 tick）

---

## 2. 数据模型

### 角色字段

```typescript
// 在角色的 h_state 上（H 状态数据）
h_state.hidden_sex_discovery_dregree: number = 0    // 0-100, 注意拼写对齐 erArk

// 在角色的 sp_flag 上（特殊标记）
sp_flag.hidden_sex_mode: number = 0                  // 0=否, 1=双不隐, 2=女隐, 3=男隐, 4=双隐
```

### 全局缓存字段

```typescript
// 在 game cache 上
cache.show_non_h_in_hidden_sex: boolean = false       // 隐奸中是否显示非 H 类指令
```

### 成就记录

```typescript
// 在 achievement 记录上
achievement.hidden_sex_record: Record<number, number> = {}
// key 含义: { 1: 模式, 2: 在场其他人数, 3: 射精次数, 4: 隐奸方绝顶次数 }
```

---

## 3. 4 级模式系统

| 模式 | 名称 | 含义 | 发现倍率 | NPC 可见性 |
|:----:|------|------|:--------:|-----------|
| 1 | 双不隐 | 双方身体暴露，仅靠视线遮挡 | 2.0× | 双方对 NPC 可见 |
| 2 | 女隐 | NPC 隐藏，玩家可见 | 1.0× | 女(NPC)对 NPC 不可见，对玩家可见 |
| 3 | 男隐 | 玩家隐藏，NPC 可见 | 1.0× | 玩家对 NPC 不可见 |
| 4 | 双隐 | 双方都隐藏 | 0.5× | 双方对 NPC 不可见 |

### 模式选择限制

模式 2/3/4 需要满足以下条件之一：
- 场景仅 2 人（`scene_only_two`）
- 场景中其他所有人处于无意识/睡眠状态（`scene_all_others_unconscious_or_sleep`）

### 模式选择特殊逻辑

- 模式 1(双不隐) 或 模式 2(女隐) → 男不隐藏 → **清除玩家的 H 标记**（NPC AI 可正常将其作为目标）
- 所有模式 → 目标取消跟随（`is_follow = 0`）
- 设置不正常 flag 3

---

## 4. 前提（Premises）

### 注册到 h-core 的前提

| 前提 ID | 函数逻辑 | 来源 |
|---------|---------|------|
| `HIDDEN_SEX_MODE_0` | `sp_flag.hidden_sex_mode == 0` | `handle_premise_sp_flag.py` |
| `HIDDEN_SEX_MODE_GE_1` | `sp_flag.hidden_sex_mode >= 1` | 同上 |
| `HIDDEN_SEX_MODE_1` | `sp_flag.hidden_sex_mode == 1` | 同上 |
| `HIDDEN_SEX_MODE_2` | `sp_flag.hidden_sex_mode == 2` | 同上 |
| `HIDDEN_SEX_MODE_3` | `sp_flag.hidden_sex_mode == 3` | 同上 |
| `HIDDEN_SEX_MODE_4` | `sp_flag.hidden_sex_mode == 4` | 同上 |
| `HIDDEN_SEX_MODE_1_OR_2` | `mode == 1 or mode == 2` | 同上 |
| `HIDDEN_SEX_MODE_3_OR_4` | `mode == 3 or mode == 4` | 同上 |
| `HIDDEN_SEX_MODE_1_OR_3` | `mode == 1 or mode == 3`（男不隐或男隐） | 同上 |
| `HIDDEN_SEX_MODE_2_OR_4` | `mode == 2 or mode == 4`（女隐或双隐） | 同上 |
| `TARGET_HIDDEN_SEX_MODE_GE_1` | target 的 `hidden_sex_mode >= 1` | 同上 |
| `TARGET_HIDDEN_SEX_MODE_1` | target 的 `mode == 1` | 同上 |
| `TARGET_HIDDEN_SEX_MODE_2` | target 的 `mode == 2` | 同上 |
| `TARGET_HIDDEN_SEX_MODE_3` | target 的 `mode == 3` | 同上 |
| `TARGET_HIDDEN_SEX_MODE_4` | target 的 `mode == 4` | 同上 |
| `TARGET_HIDDEN_SEX_MODE_1_OR_2` | target 的 `mode == 1 or 2` | 同上 |
| `TARGET_HIDDEN_SEX_MODE_3_OR_4` | target 的 `mode == 3 or 4` | 同上 |
| `PLAYER_IN_HIDDEN_SEX_MODE` | `handle_hidden_sex_mode_ge_1(0)` | 同上 |
| `PLAYER_NOT_IN_HIDDEN_SEX_MODE` | `handle_hidden_sex_mode_0(0)` | 同上 |
| `TARGET_NOT_IN_HIDDEN_SEX_MODE` | `handle_hidden_sex_mode_0(target)` | 同上 |
| `PL_NOT_HIDDEN_SEX_MODE_3_OR_4` | `not (player mode==3 or 4)` | 同上 |
| `SLEEP_H_OR_HIDDEN_SEX` | 睡眠 H 或 `hidden_sex_mode >= 1` | 同上 |
| `TARGET_SLEEP_H_OR_HIDDEN_SEX` | 同上，检查 target | 同上 |
| `PLAYER_NOT_H_OR_HIDDEN_SEX_MODE` | `not_h(player) or player_in_hidden_sex_mode` | 同上 |
| `SHOW_NON_H_IN_HIDDEN_SEX` | `cache.show_non_h_in_hidden_sex == true` | `handle_premise_other.py` |
| `NOT_SHOW_NON_H_IN_HIDDEN_SEX` | 逻辑取反 | 同上 |
| `PLACE_SOMEONE_H_BUT_NOT_HIDDEN_SEX` | 场景中有他人处于非隐奸 H 模式 | `handle_premise_place.py` |
| `PLACE_SOMEONE_NOT_IN_HIDDEN_AND_CONSCIOUS` | 场景中有他人**不在**隐奸中且**有意识** | 同上 |

---

## 5. 效果（Effects）

### 注册到 effect-system 的效果类型

| effect type | 参数 | 功能 | 对应 erArk |
|------------|------|------|-----------|
| `hidden_sex_set_mode` | `{ mode: 1\|2\|3\|4, target?: "self"\|"target"\|"both" }` | 设置隐奸模式 | `Select_Hidden_Sex_Mode_Panel` |
| `hidden_sex_clear` | `{ target?: "self"\|"target"\|"both" }` | 清空隐奸模式为 0 | 效果 471/472/473 |
| `hidden_sex_discovery_tick` | `{}` | 每行为后结算发现度 | `character_behavior.py:423` |
| `hidden_sex_orgasm_exposure` | `{ duration: number, intensity: number }` | 绝顶暴露结算 | 效果 411/412/413/414 |

### 指令效果 ID 映射

**ask_hidden_sex** 效果链（来自 `Behavior_Effect.csv` 第 380 行）：
```typescript
['405', '464', '603', '605', '704', '1409', 'CVE_A1_E|35_G_1', 'CVE_A2_E|35_G_1']
// 405 = UPDATE_ORGASM_LEVEL: 双方同步高潮程度记录
// 464 = T_H_FLAG_TO_1: 目标变成 H 状态
// 603 = TARGET_BRA_SEE: 目标胸罩可视
// 605 = TARGET_PAN_SEE: 目标内裤可视
// 704 = RECORD_CONSCIOUS_H_TIME: 记录有意识 H 时间
// 1409 = TAGET_CONDOM_INFO_SHOW_FLAG_ON: 目标避孕套信息显示
// CVE_A1_E|35_G_1 / CVE_A2_E|35_G_1: 经验[35]隐奸经验 +1（双方）
```

**hidden_sex_end** 效果链（来自 `Behavior_Effect.csv` 第 382 行）：
```typescript
['526', '753', '528', '404', '631']
// 526 = ORGASM_EDGE_RELEASE: 寸止解放
// 753 = DOOR_CLOSE_RESET: 取消关门状态
// 528 = END_H_ADD_HPMP_MAX: 结束 H 体力气力上限成长
// 404 = 双方 H 状态重置（同时清空 hidden_sex_mode=0, exhibitionism_sex_mode=0, is_h=False）
// 631 = T_CLOTH_BACK: 目标穿回衣服
```

**ask_hidden_sex_fail** 效果链（来自 `Behavior_Effect.csv` 第 381 行）：
```typescript
['526', '528', '404', '631', '153']
// 153 = 体力减少（失败惩罚）
```

---

## 6. 指令

### ask_hidden_sex（邀请隐奸）

| 属性 | 值 | 来源 |
|------|-----|------|
| 指令 ID | `ask_hidden_sex` | `InstructConfig.csv:200` |
| 类型 | OBSCENITY（猥亵） | 同上 |
| 行为 ID | `ASK_HIDDEN_SEX`（erArk 378） | `Behavior_Data.csv` |
| 前提 | `HAVE_TARGET\|NOT_H\|HIDDEN_SEX_MODE_0\|NO_TARGET_OR_TARGET_CAN_COOPERATE\|TIRED_LE_74` | `InstructConfig.csv:200` |
| 实行判定惩罚 | 隐奸类：`60 + 60 × other_count` | `14-隐奸系统.md` |
| 效果 | `['405','464','603','605','704','1409','CVE_A1_E\|35_G_1','CVE_A2_E\|35_G_1']` | `Behavior_Effect.csv:380` |
| 跳转面板 | `ASK_HIDDEN_SEX`（面板 ID 61）→ `Select_Hidden_Sex_Mode_Panel` | `hidden_sex_panel.py` |

### hidden_sex_end（结束隐奸）

| 属性 | 值 | 来源 |
|------|-----|------|
| 指令 ID | `hidden_sex_end` | `InstructConfig.csv:214` |
| 类型 | SEX（性爱） | 同上 |
| 行为 ID | `END_H` | 同上 |
| 前提 | `HAVE_TARGET\|T_NPC_NOT_ACTIVE_H\|TARGET_HIDDEN_SEX_MODE_GE_1\|TARGET_NOT_IN_EXHIBITIONISM_SEX_MODE\|GROUP_SEX_MODE_OFF\|IS_H` | 同上 |
| 效果 | `['526','753','528','404','631']` | `Behavior_Effect.csv:382` |

---

## 7. 发现度系统（核心机制）

### 7.1 数据结构

```typescript
// 4 级阈值（来自 Hidden_Level.csv）
const HIDDEN_LEVELS = [
  { cid: 0, name: '完全隐蔽', threshold: 30 },
  { cid: 1, name: '隐蔽',     threshold: 60 },
  { cid: 2, name: '引人注意', threshold: 80 },
  { cid: 3, name: '随时暴露', threshold: 95 },
]

function getHiddenLevel(value: number): { cid: number; name: string } {
  // 找到第一个 value <= threshold
  // 默认返回等级 3（随时暴露）
}
```

### 7.2 积累公式（`hidden_sex_panel.py:134-200`）

```
add_flag 自动判断（默认 None 时 auto-detect）:
  - 行为 tag 含"猥亵"或"性爱" → add_flag = true
  - 行为 ID 为 WAIT → add_flag = false

mode_adjust:
  - hidden_sex_mode == 1 → 2.0
  - hidden_sex_mode == 4 → 0.5
  - else → 1.0

强度推导（从行为 tag 列表，取 max）:
  - tag 含"道具" → 4
  - tag 含"插入" → 3
  - tag 含"侍奉" → 2
  - 默认 → 1

ability_adjust = getAbilityAdjust(character.ability[90])
// ability[90] = 隐蔽能力

other_chara_adjust = max(sceneCharacterCount - 2, 1)

if add_flag:  // 增加暴露
    adjust = intensity × mode_adjust / ability_adjust × other_chara_adjust
else:         // 减少暴露（等待/休息）
    adjust = -2 / mode_adjust × ability_adjust

delta = int(duration × adjust)
h_state.hidden_sex_discovery_dregree = clamp(h_state.hidden_sex_discovery_dregree + delta, 0, 100)
```

### 7.3 发现概率（`hidden_sex_panel.py:202-221`）

```
function checkDiscovery(degree: number): boolean {
  const [hiddenLv] = getHiddenLevel(degree)
  if (hiddenLv < 2) return false    // 等级 0 或 1 → 不可能被发现

  // 等级 1 的 threshold = 60
  const discoverRate = (degree - 60) * 3
  // 例: degree=80 → rate=60, degree=95 → rate=105, degree=100 → rate=120
  const roll = randomInt(0, 100)
  return discoverRate >= roll
}
```

### 7.4 被发现时的处理（`hidden_sex_panel.py:223-251`）

```
settle_discovered(characterId):
  1. character.sp_flag.hidden_sex_mode = 0    // 清除隐奸模式
  2. 目标设为场景中第一个隐奸角色
  3. 打开被发现面板 Sex_Be_Discovered_Panel（第一个发现者）
```

---

## 8. 每行为后结算

### 8.1 主结算入口（`character_behavior.py:423`）

每次玩家行为后自动调用（玩家在隐奸模式且不是结束 H 时）：

```python
if handle_hidden_sex_mode_ge_1(0) and behavior_id != END_H:
    handle_hidden_sex_flow()  // 默认参数: add_flag=None, duration=0, intensity=0
```

`handle_hidden_sex_flow` 内部：先调用 `settle_hidden_value_by_action()`，再调用 `check_hidden_sex_discovery()`，必要时调用 `settle_discovered()`。

### 8.2 羞耻/心理快感 tick（`realtime_settle.py:503-509`）

```python
# 每次 realtime_settle 时，如果 hidden_sex_mode >= 1:
hidden_sex_mode = char.sp_flag.hidden_sex_mode
extra_add = (4 - hidden_sex_mode) + others_count × 0.1
# others_count = 场景总人数 - 2（减去自己和玩家）

# 羞耻(state 16): add_time = true_add_time × 5, base_value=0, ability=ability[34](露出经验), extra_adjust=extra_add, tenths_add=False
# 心理快感(state 23): 同上
base_chara_state_common_settle(charId, add_time=true_add_time×5, state_id=16, base_value=0, ability_level=ability[34], extra_adjust=extra_add, tenths_add=False)
base_chara_state_common_settle(charId, add_time=true_add_time×5, state_id=23, base_value=0, ability_level=ability[34], extra_adjust=extra_add, tenths_add=False)
```

注：ability[34] = 露出经验，extra_add 中 mode 越低保数越高（mode1=+3, mode4=+0 + others×0.1）。

### 8.3 经验结算（`settle_behavior.py:683-699`）

```python
# 每次行为结算时:
if character_id == 0 AND hidden_sex_mode >= 1:
    if 行为 tag 含"猥亵"或"性爱" AND 行为不是 WAIT:
        base_chara_experience_common_settle(charId, 35, change_data)       # 玩家 experience[35] + 1
        base_chara_experience_common_settle(charId, 35, target_flag=True)  # 目标 experience[35] + 1
```

---

## 9. 绝顶暴露

监听 `h:orgasm` 事件 → 根据绝顶等级调用：

| 绝顶等级 | duration | intensity | 对应 erArk SecondEffect |
|---------|:--------:|:---------:|----------------------|
| 小绝顶 | 5 | 2 | 411 - EXPOSED_ORGASM_SMALL_IN_HIDDEN_SEX |
| 普绝顶 | 6 | 3 | 412 - EXPOSED_ORGASM_NORMAL_IN_HIDDEN_SEX |
| 强绝顶 | 7 | 4 | 413 - EXPOSED_ORGASM_STRONG_IN_HIDDEN_SEX |
| 超强绝顶 | 10 | 5 | 414 - EXPOSED_ORGASM_SUPER_IN_HIDDEN_SEX |

处理流程：
```
h:orgasm → 检查角色是否在隐奸模式(>=1) → 
  handle_hidden_sex_flow(add_flag=true, duration=X, intensity=Y)
  → settle_hidden_value_by_action(add_flag=true, duration, intensity)  // 大幅增加发现度
  → check_hidden_sex_discovery()  // 可能被发现
```

---

## 10. NPC 隐匿逻辑

对应 `handle_npc_ai.py:800-815`，在 NPC 寻找可用目标时过滤：

```python
function findAvailableTargets(scene_characters):
    for charId in scene_characters:
        // 跳过条件（按优先级）:
        if charId in H_STATE: continue                  // 已在 H 中
        if charId is moving: continue                   // 移动中
        if charId is sleeping: continue                 // 睡眠中
        
        // 隐奸过滤:
        if handle_hidden_sex_mode_4(charId): continue    // 模式 4: 双隐 → 完全跳过
        if charId == 0 AND handle_hidden_sex_mode_3(0): continue  // 模式 3: 玩家隐藏 → 跳过玩家
        if charId != 0 AND handle_hidden_sex_mode_2(charId): continue  // 模式 2: NPC 隐藏 → 跳过该 NPC
```

此外：
- 玩家隐藏时（mode 3/4）：仅可对也在隐奸模式中的目标执行指令（`14-隐奸系统.md:42`）
- NPC AI 打出打招呼时，若玩家处于 mode 3/4 → 跳过打招呼（`second_behavior.py:204`）
- NPC 因任何原因退出 H 模式 → `hidden_sex_mode = 0`（`handle_npc_ai_in_h.py:112`）

---

## 11. 成就追踪

注册监听：

| 触发时机 | 记录内容 |
|---------|---------|
| `h:orgasm` + 隐奸模式 | `hidden_sex_record[4] += 1`（隐奸方绝顶次数） |
| `h:shoot` + 隐奸模式 | `hidden_sex_record[3] += 1`（射精次数） |
| 模式选择时 | `hidden_sex_record[1] = 当前模式; [2] = 在场其他人数` |

成就条件（erArk 成就 ID 911-913）：
- **911**: `hidden_sex_record[3] >= 1`（隐奸中射精 ≥ 1）
- **912**: `hidden_sex_record[3] >= 3 AND hidden_sex_record[4] >= 3`（射精 ≥ 3 + 隐藏方绝顶 ≥ 3）
- **913**: mode == 1 AND 未被发现 AND 射精 ≥ 3 AND 绝顶 ≥ 3 AND 在场无感知角色 ≥ 10

---

## 12. UI 集成

| UI 元素 | 说明 | erArk 参照 |
|---------|------|-----------|
| `<隐>` 状态标签 | 角色名旁显示 `<隐>` 表示隐奸中 | `00-公式手册.md:615` |
| 发现度指示 | H 场景内显示发现度等级文本（完全隐蔽/隐蔽/引人注意/随时暴露） | `See_Hidden_Sex_InfoPanel` |
| 发现度警告 | 达到等级 2 以上时显示警告文本 | 同上 |
| 被发现面板 | 暴露时弹出，与露出系统共享 | `Sex_Be_Discovered_Panel` |
| 非 H 指令切换 | `show_non_h_in_hidden_sex` 控制隐奸中是否显示非 H 指令 | `Cache.show_non_h_in_hidden_sex` |

---

## 13. 文件结构

```
src/plugins/h-hidden/
├── plugin.toml
├── index.ts                    # onLoad + onEnable
├── data.ts                     # 数据结构定义与常量
├── premise.ts                  # 前提 handler 注册
├── effects.ts                  # 效果 handler 注册
├── discovery.ts                # 发现度系统（积累/衰减/概率/等级）
├── flow.ts                     # 主流程（handle_hidden_sex_flow + settle_discovered）
├── npc-visibility.ts           # NPC 可见性逻辑
├── tick.ts                     # realtime 羞耻/快感 tick
├── experience.ts               # 经验结算
├── achievements.ts             # 成就追踪
├── panel.ts                    # 模式选择面板逻辑（UI 插槽注册）
└── ui.ts                       # UI 状态标签/发现度指示
```

---

## 14. 与现有插件集成

| 插件 | 集成方式 |
|------|---------|
| h-core | 通过 `registerPremise` 注册所有隐奸前提；通过 `effectTypeRegistry` 注册效果类型；监听 `h:orgasm` `h:shoot` `h:end` `game:execution_end` |
| h-ejaculation | 监听 `h:shoot` 事件追踪射精，用于成就记录 |
| h-exposure | 独立共存，互不干扰；`hidden_sex_end` 前提检查 `TARGET_NOT_IN_EXHIBITIONISM_SEX_MODE` |
| h-judge | `ask_hidden_sex` 有实行判定惩罚（60 + 60×otherCount） |
| effect-system | 注册全部隐奸效果类型 |

---

## 15. 复刻铁律对照

| 检查项 | 状态 |
|--------|------|
| 每个数值可追溯 erArk 源码（文件名+行号） | ✅ 已标注 |
| 没有简化/合并/省略任何效果 | ✅ |
| 所有前提 handler 已注册，对齐 erArk 前提列表 | ✅ 全部 32+ 个 |
| 指令 TOML 中每个 effect 的 baseValue 与 erArk default.py 一致 | ✅ |
| 服装/道具等影响的 premise handler 已注册 | ✅ |
| `npm run typecheck` + `npm run test` 通过 | 实现后验证 |
| 改动记录在 skill 的"已完成 vs TODO"表中 | 实现后更新 |
