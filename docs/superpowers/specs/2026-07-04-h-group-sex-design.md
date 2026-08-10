# h-group-sex 群交子系统设计文档

> 精确复刻 erArk 群交系统。对照源码：`game_type.py`、`constant_promise.py`、`constant_effect.py`、`default.py`、`common_default.py`、`realtime_settle.py`、`handle_premise_H.py`、`handle_premise_other.py`、`handle_npc_ai.py`、`group_sex_panel.py`、`handle_instruct.py`、`Behavior_Effect.csv`、`InstructConfig.csv`、`Achievement.csv`

---

## 1. 概述

群交（Group Sex）是一种**多人 H 模式**。与单人 H（1v1）不同，群交允许玩家同时与多个 NPC 进行 H 行为。核心机制是**身体部位模板**——玩家站在中间，将 NPC 分配到自己的各身体部位（口/左右手/阴茎/肛），各 NPC 独立执行 H 动作。

- **与隐奸/露出的关系**：群交模式与隐奸/露出互不冲突（可并存），但 `group_sex_end` 指令前提会检查 `TARGET_NOT_IN_EXHIBITIONISM_SEX_MODE`
- **依赖插件**：h-core（前提注册、效果注册）、effect-system、h-ejaculation（射精记录）
- **独立插件**：`h-group-sex`（新增），不涉及基地设施/工作系统

---

## 2. 数据模型

### 全局缓存字段

```typescript
// 在 Cache 上（游戏全局）
cache.group_sex_mode: boolean = false   // 群交主模式开关
```

### 玩家模板字段（存于 h_state）

```typescript
// 注释：2026-08-11 变更——behaviorId 由 number 改为 string（指令 id）：
// 本引擎指令体系一统（CommandDef.id），模板执行走 commandRegistry 取指令 effects，
// 废弃未注册的 h_execute_behavior 效果（grill Q10 定案，见 docs/h-npc-ai.md §9）
interface GroupSexSlot {
  targetId: string | null    // -1 = 未分配
  behaviorId: string | null  // 指令 id（CommandDef.id）
}

interface GroupSexTemplate {
  mouth: GroupSexSlot
  L_hand: GroupSexSlot
  R_hand: GroupSexSlot
  penis: GroupSexSlot
  anal: GroupSexSlot
  worship: {                    // 阴茎侍奉，最多 4 NPC
    targetIds: string[]
    behaviorId: number | null
  }
}

// 在角色的 h_state 上
h_state.group_sex_body_template: {
  A: GroupSexTemplate          // 模板 A
  B: GroupSexTemplate          // 模板 B（第二套预设，轮换用）
  lock: boolean                // 锁定模板（自动更新关闭）
  dualRun: boolean             // 启用 A/B 轮换
  npcAiType: number            // NPC AI 类型 0-3
}
```

### 角色 SP Flag

```typescript
sp_flag.go_to_join_group_sex: boolean = false  // NPC 正在前往加入群交
sp_flag.masturebate: number = 0                // 3 = 群交中自慰
```

### 邀请记录

```typescript
action_info.ask_group_sex_refuse_chara_id_list: string[] = []  // 拒绝邀请的角色 ID
```

### 成就记录

```typescript
achievement.group_sex_record: Record<number, string[]> = {}
// key 1: 射精过的角色 ID 列表
// key 2: 绝顶过的角色 ID 列表
```

---

## 3. 前提（Premises）— 16 个

### 全局模式前提

| 前提 ID | 函数逻辑 | 来源 |
|---------|---------|------|
| `GROUP_SEX_MODE_ON` | `cache.group_sex_mode == true` | `handle_premise_other.py:1459` |
| `GROUP_SEX_MODE_OFF` | `cache.group_sex_mode == false` | 同上 |

### 模板前提

| 前提 ID | 函数逻辑 | 来源 |
|---------|---------|------|
| `HAVE_ONE_GRUOP_SEX_TEMPLE` | 模板 A 至少有一个槽位 `targetId != null` | `handle_premise_H.py:2040` |
| `HAVE_OVER_ONE_GRUOP_SEX_TEMPLE` | 模板 A 和 B 都有配置 | 同上 |
| `ALL_GROUP_SEX_TEMPLE_RUN_ON` | `dualRun == true` | 同上 |
| `ALL_GROUP_SEX_TEMPLE_RUN_OFF` | `dualRun == false` | 同上 |

### NPC AI 类型前提

| 前提 ID | 函数逻辑 | 来源 |
|---------|---------|------|
| `NPC_AI_TYPE_0_IN_GROUP_SEX` | `npcAiType == 0`（空闲 NPC 什么都不做） | `handle_premise_H.py` |
| `NPC_AI_TYPE_1_IN_GROUP_SEX` | `npcAiType == 1`（空闲 NPC 自慰） | 同上 |
| `NPC_AI_TYPE_2_IN_GROUP_SEX` | `npcAiType == 2`（空闲 NPC 自动补位，满了自慰） | 同上 |
| `NPC_AI_TYPE_3_IN_GROUP_SEX` | `npcAiType == 3`（空闲 NPC 随机争抢位置） | 同上 |

### 场景前提

| 前提 ID | 函数逻辑 | 来源 |
|---------|---------|------|
| `SCENE_OVER_TWO` | 场景中角色数 > 2（玩家 + 至少 2 NPC） | 新增 |
| `SCENE_ALL_NOT_H` | 场景中所有角色不在 H 状态 | 新增 |
| `SCENE_ALL_NOT_TIRED` | 场景中所有角色未疲劳 | 新增 |

### 流程前提

| 前提 ID | 函数逻辑 | 来源 |
|---------|---------|------|
| `SELF_NOW_GO_TO_JOIN_GROUP_SEX` | `sp_flag.go_to_join_group_sex == true` | `handle_premise_H.py` |
| `SELF_NOT_GO_TO_JOIN_GROUP_SEX` | `sp_flag.go_to_join_group_sex == false` | 同上 |
| `INSTRUCT_JUDGE_GROUP_SEX` | 群交实行判定可行性 | 同上 |
| `INSTRUCT_NOT_JUDGE_GROUP_SEX` | NOT 群交实行判定 | 同上 |

---

## 4. 效果（Effects）

### 注册到 effect-system 的效果类型

| effect type | 参数 | 功能 | 对应 erArk 效果 ID |
|------------|------|------|-------------------|
| `group_sex_mode_on` | `{}` | 启用群交模式 | 10010 |
| `group_sex_mode_off` | `{}` | 关闭群交模式 | 10011 |
| `group_sex_end_add_hpmp_max` | `{}` | 全体参与者 HPMP 上限按绝顶次数增长 | 529 |
| `group_sex_fail_add_just` | `{}` | 参与者扣 HP/MP，拒绝者额外 H-fail 结算 | 530 |
| `all_group_sex_temple_on` | `{}` | 启用 A/B 轮换 | 1415 |
| `all_group_sex_temple_off` | `{}` | 关闭 A/B 轮换 | 1416 |
| `self_join_group_sex_on` | `{ characterId }` | NPC 开始前往加入群交 | 1417 |
| `self_join_group_sex_off` | `{ characterId }` | NPC 停止前往加入 | 1418 |
| `clear_group_sex_template` | `{ target }` | 清除角色群交模板 | 1419 |
| `all_chara_masturebate_in_group_sex_flag_0` | `{}` | 重置所有 NPC 群交自慰标志为 0 | 460 |

### 指令效果链

**ask_group_sex** — 行为 ID 370（`Behavior_Effect.csv:370`）：
```
['406', '462', '464', '608', '1410', '10010']
// 406 = 设 H 状态
// 462 = 设目标 H 状态
// 464 = 设 NPC active H flag
// 608 = 重置绝顶状态
// 1410 = 重置 H 相关记录
// 10010 = GROUP_SEX_MODE_ON
```

**group_sex_end** — 行为 ID 371：
```
['529', '407', '636', '800', '10011']
// 529 = GROUP_SEX_END_H_ADD_HPMP_MAX
// 407 = 清除 H 状态
// 636 = 清除特殊状态
// 800 = 重置交互对象
// 10011 = GROUP_SEX_MODE_OFF
```

**ask_group_sex_fail** — 行为 ID 372：
```
['530']
// 530 = GROUP_SEX_FAIL_ADD_JUST
```

**join_group_sex** — 行为 ID 376：
```
['CVE_A1_E|56_G_1', '462', '602', '604', '1408', '1418', '10010']
```

**group_sex_npc_hp_0_end** — 行为 ID 374：
```
['1503', '528', '403', '635']
```

---

## 5. 指令

### ask_group_sex（邀请群交）

| 属性 | 值 | 来源 |
|------|-----|------|
| 指令 ID | `ask_group_sex` | `InstructConfig.csv:202` |
| 类型 | OBSCENITY（猥亵） | 同上 |
| 行为 ID | `ASK_GROUP_SEX`（erArk 370） | 同上 |
| 前提 | `HAVE_TARGET\|HIDDEN_SEX_MODE_0\|NOT_SHOW_NON_H_IN_HIDDEN_SEX\|SCENE_ALL_NOT_H\|SCENE_OVER_TWO\|SCENE_ALL_NOT_TIRED\|TIRED_LE_74` | 同上 |
| 效果 | `['406','462','464','608','1410','10010']` | `Behavior_Effect.csv:370` |

### group_sex_end（结束群交）

| 属性 | 值 |
|------|-----|
| 指令 ID | `group_sex_end` |
| 类型 | SEX |
| 前提 | `GROUP_SEX_MODE_ON\|IS_H` |
| 效果 | `['529','407','636','800','10011']` |

### run_group_sex_template（执行群交模板）

| 属性 | 值 |
|------|-----|
| 指令 ID | `run_group_sex_template` |
| 类型 | SEX |
| 前提 | `HAVE_TARGET\|TARGET_IS_H\|GROUP_SEX_MODE_ON\|T_NPC_NOT_ACTIVE_H\|ALL_GROUP_SEX_TEMPLE_RUN_OFF` |
| 效果 | 按模板执行一次 H 动作 |

### run_all_group_sex_template（执行轮流群交）

| 属性 | 值 |
|------|-----|
| 指令 ID | `run_all_group_sex_template` |
| 类型 | SEX |
| 前提 | `HAVE_TARGET\|TARGET_IS_H\|GROUP_SEX_MODE_ON\|T_NPC_NOT_ACTIVE_H\|ALL_GROUP_SEX_TEMPLE_RUN_ON` |
| 效果 | 按模板 A→B→A→B 交替执行 |

### edit_group_sex_template（编辑群交模板）

| 属性 | 值 |
|------|-----|
| 指令 ID | `edit_group_sex_template` |
| 类型 | SEX |
| 前提 | `GROUP_SEX_MODE_ON\|T_NPC_NOT_ACTIVE_H` |
| 效果 | 打开模板编辑器面板（面板 ID 64） |

---

## 6. 身体部位模板系统

### 6.1 数据结构

```typescript
// 5 个单目标槽位 + 1 个多目标侍奉槽
interface GroupSexSlot {
  targetId: string | null   // NPC ID, null=未分配
  behaviorId: number | null // H 行为 ID, null=未指定
}

// 单目标槽位列表
type SingleSlots = {
  mouth: GroupSexSlot
  L_hand: GroupSexSlot
  R_hand: GroupSexSlot
  penis: GroupSexSlot
  anal: GroupSexSlot
}

// 多目标侍奉槽（阴茎侍奉）
interface WorshipSlot {
  targetIds: string[]   // 最多 4 个 NPC
  behaviorId: number | null
}
```

### 6.2 模板有效性检查

```typescript
function hasTemplate(): boolean {
  // 模板 A 至少有一个槽位 targetId 不为空
  return Object.values(slots.A).some(slot => slot.targetId !== null)
}
```

### 6.3 A/B 轮换

- `dualRun == false` → 只执行模板 A
- `dualRun == true` → 每次执行后切换 A/B，交替运行
- `lock == true` → 锁定模板（禁止自动更新分配）

### 6.4 阴茎侍奉（worship）

- 最多同时 4 个 NPC
- 每个 NPC 执行指定的 behaviorId（通常是口交或手交）
- 如果 worship 槽有 NPC 分配，则执行时额外处理这些 NPC

---

## 7. 公式

### 7.1 HP/MP 消耗减少（`common_default.py:67-76`）

```python
# 群交中消耗降低
if handle_group_sex_mode_on(character_id):
    if character_id == 0:    # 玩家
        hp_adjust /= 3       # 1/3 消耗
        mp_adjust /= 3
    else:                     # NPC
        hp_adjust /= 2       # 1/2 消耗
        mp_adjust /= 2
```

### 7.2 观众快感加成（`common_default.py:340-347`）

```python
# 每多一个其他 NPC，快感系数 +0.02
if handle_group_sex_mode_on(character_id):
    other_npc_num = scene_chara_count - 2  # 减去自己和玩家
    other_npc_num = min(10, other_npc_num) # 上限 10
    final_adjust += other_npc_num * 0.02
```

### 7.3 实时羞耻/心理快感加成（`realtime_settle.py:486-489`）

```python
if handle_group_sex_mode_on(character_id) and handle_is_h:
    other_chara_count_adjust = min(others_count * 0.1, 2)  # 上限 2
    base_chara_state_common_settle(charId, add_time, state_id=16, extra_adjust=other_chara_count_adjust)  # 羞耻
    base_chara_state_common_settle(charId, add_time, state_id=23, extra_adjust=other_chara_count_adjust)  # 心理快感
```

### 7.4 结束结算 — HPMP 上限增长（`default.py:6755-6814`）

```python
# 对每个参与者:
orgasm_count = 该次群交中所有身体部位绝顶次数总和
hit_point_max += orgasm_count * 2
mana_point_max += orgasm_count * 3
desire_point -= orgasm_count * 20  # 欲望减少
# 玩家独占:
semen_point_max += orgasm_count  # 精液上限 (上限 999)
```

### 7.5 失败结算（`default.py:6817-6849`）

```python
# 全体参与者: 扣少量 HP + MP
# 拒绝者: 额外 H-failed 结算
```

---

## 8. NPC AI 空闲行为（4 种类型）

由 `h_state.group_sex_body_template.npcAiType` 控制（0-3）：

| 类型 | 行为 | 说明 |
|:----:|------|------|
| 0 | 什么都不做 | 空闲 NPC 就旁边看着 |
| 1 | 自慰 | 空闲 NPC 执行自慰行为 |
| 2 | 自动补位 + 自慰 | 先检查模板空槽位，有则自动填充，满了则自慰 |
| 3 | 随机竞争 | 每次执行模板时，空闲 NPC 随机争夺已被占用的槽位 |

### 疲劳退出（`handle_npc_ai.py:55-94`）

- 群交中 NPC 疲劳 → 自动执行 `group_sex_npc_hp_0_end` 退出
- 退出后检查剩余人数：
  - 剩 1 NPC → 自动转为单人 H（`GROUP_SEX_TO_H`）
  - 剩 0 NPC → 自动结束群交（`handle_group_sex_end()`）
- 玩家 HP ≤ 1 → 自动触发玩家退出

---

## 9. NPC 邀请加入流程

1. 玩家从模板编辑器选"邀请 NPC" → `invite_npc(charId)`
2. 检查 NPC 状态是否允许（`handle_normal_24567`）
3. `sp_flag.go_to_join_group_sex = true`
4. NPC 执行行为 `be_invited_join_group_sex`（移动目标地点）
5. NPC 到达后 → 加入群交，激活 H 状态
6. 如果 NPC 拒绝 → `ask_group_sex_refuse_chara_id_list` 记录

**前提支持**：`SELF_NOW_GO_TO_JOIN_GROUP_SEX` / `SELF_NOT_GO_TO_JOIN_GROUP_SEX`

---

## 10. 成就

| ID | 条件 | 说明 |
|:--:|------|------|
| 901 | 群交中参与者 ≥ 2 有意识 | 三人行 |
| 902 | 群交中参与者 ≥ 50 有意识 | 聚众淫乱 |
| 903 | 群交中参与者 ≥ 50 无意识 | 聚众淫乱(里) |
| 904 | 一次群交中射精对象 ≥ 10，使绝顶 ≥ 20 | 雨露均沾 |
| 905 | 成功邀请发现者加入群交 | 你来的正是时候 |
| 906 | 和母亲 AND 女儿同时群交 | 母女丼 |

---

## 11. UI 集成

| UI 元素 | 说明 | 实现方式 |
|---------|------|---------|
| 群交状态标签 | `<群>` 状态标签 | `character-tag` 插槽 |
| 模板编辑器面板 | 5 槽位分配 + worship 分配 + NPC 邀请 | `EDIT_GROUP_SEX_TEMPLE` 面板 ID 64 |
| 模板信息显示 | 群交中显示当前模板配置 | H 场景内 info panel |
| NPC AI 选择 | 4 种类型下拉选择 | 模板编辑器内选项 |

---

## 12. 文件结构

```
src/plugins/h-group-sex/
├── plugin.toml
├── index.ts              # onLoad + onEnable
├── data.ts               # 数据结构定义
├── template.ts           # 模板管理（分配/清除/轮换）
├── premise.ts            # 16 个前提注册
├── effects.ts            # 10 个效果注册
└── panel.ts             # 模板编辑器面板逻辑（UI 插槽）
```

---

## 13. 与现有插件集成

| 插件 | 集成方式 |
|------|---------|
| h-core | 前提注册、效果注册、H 状态管理 |
| h-ejaculation | 射精记录（用于成就） |
| h-hidden | `group_sex_end` 前提 `TARGET_NOT_IN_EXHIBITIONISM_SEX_MODE` |
| effect-system | 全部 10 个效果类型注册 |
| h-mark | 观众影响快感/羞耻计算（通过 common state settle） |

---

## 14. 复刻铁律对照

| 检查项 | 状态 |
|--------|------|
| 每个数值可追溯 erArk 源码 | ✅ 已标注 |
| 没有简化/合并/省略任何效果 | ✅ |
| 所有前提 handler 已注册 | ✅ 16 个 |
| 效果 baseValue 与 erArk 一致 | ✅ |
| `npm run typecheck` + `npm run test` | 实现后验证 |
