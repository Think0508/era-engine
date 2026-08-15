# H 露出系统（h-exposure）

> erArk 露出系统完整复刻（2026-08-15）。管理露出模式（0-4）、动态模式切换、露出中羞耻/心理快感、露出经验、成就。
> 关键设计决策见 `docs/adr/0014-exposure-system-replication.md`（成就结构契约、砍门决策、has_indoor 约定）。

## 概念

露出 H = 在可能被人看到的场景进行 H。erArk 用 `exhibitionism_sex_mode`（0-4）区分暴露程度，**模式不参与任何数值公式**（只做前提门槛），仅决定语义/口上/成就分支。

| 值 | 名称 | 判定条件（动态切换，每次 H 行动后重评估）|
|----|------|------|
| 0 | 无 | 非露出 |
| 1 | 室内露出 | 场景仅 2 人 + 地点带 `has_indoor` tag |
| 2 | 室外露出 | 场景仅 2 人 + 地点无 `has_indoor`（缺省=室外）|
| 3 | 人前露出 | 场景 >2 人 + 有清醒旁观者 |
| 4 | 无意识人前 | 场景 >2 人 + 旁观者全部无意识/睡眠 |

- **场景** = 同地点角色数（`current_location` 过滤；500 NPC mod 下全图计数失真——h-hidden 同款语义）
- **旁观者** = 场景中除自己 + 自己的 H 目标外的角色
- **意识判定**：`unconscious_h === 0 && !sleeping` = 清醒（睡眠系统落地后的约定）
- **门未锁条件已砍**（ADR-0014）：erArk mode 1 要求"室内+门未锁"，门概念限定世界观（通用 mod 无门模型），不引入

## 启动与结束

- **邀请露出**（`ask_exhibitionism_sex`，5054）：前提 `HAVE_TARGET | NOT_H | NOT_SHOW_NON_H_IN_HIDDEN_SEX | EXHIBITIONISM_SEX_MODE_0 | NO_TARGET_OR_TARGET_CAN_COOPERATE | TIRED_LE_74`。效果链：双方 `exposure_set_level`（level 缺省=按场景自动算初始模式）→ `h_start_h` → 双方露出经验 → 口上。
- **结束露出**（`exhibitionism_sex_end`，6007）：前提 `HAVE_TARGET | TARGET_IS_H | T_NPC_NOT_ACTIVE_H | TARGET_NOT_IN_HIDDEN_SEX_MODE | TARGET_EXHIBITIONISM_SEX_MODE_GE_1 | GROUP_SEX_MODE_OFF | IS_H`。效果链：`h_end_h` + 口上；露出模式清除由 `h:end` 事件统一处理（与 h-hidden 清隐奸模式对称）。
- 邀请模式选择面板（erArk exhibitionism_sex_panel）**未实现**——`exposure_set_level` level 缺省自动计算，TODO。

## 结算效果

### 实时羞耻/快感（realtime_settle.py:610-613 露出块）

```
每次 H 行动（execution_end）：
  羞耻/心理快感 += time×3 × (ability_lv_adjust[露出] + 天赋/fall 修正 + min(他人×0.1, 2))，tenths=False
  他人 = max(0, 场景人数 - 2)
```

数值与模式 1/2/3/4 **无关**（模式只做 ≥1 门槛）。2026-08-15 起此逻辑归 h-exposure（自 h-hidden 迁出，h-hidden 只留隐奸块）。

### 露出经验（settle_behavior.py:670-672）

每次 H 行动，**每个**露出中角色 `experience['34'] + 1`（无条件，不看行为类型——与隐奸经验"玩家+猥亵/性爱+非等待"的语义不同）。

### 结束清理

`h:end` 事件 → 遍历清所有 `exhibitionism_sex_mode`（erArk 404 效果语义）。

## 成就

`achievement.exhibitionism_sex_record`：rec[1]=进入时模式、rec[2]=进入时场景其他人数、rec[3]=射精次数、rec[4]=露出绝顶次数（挂玩家=露出发起方）。

| ID | 名称 | 条件 |
|----|------|------|
| 931 | 展示自我 | 首次露出（rec[1] 存在）+ 射精 ≥1 |
| 932 | 光天化日 | rec[1] ∈ {3,4} + 其他 ≥1 + 射精 ≥1 + 绝顶 ≥1 |
| 933 | 众目睽睽 | 其他 ≥10 + 射精 ≥3 + 绝顶 ≥3 |
| 934 | 看清楚了吗 | 依赖被发现系统——未实现（TODO）|

成就结构契约已记入 ADR-0014（可能增删改）。

## 前提（erArk 原名，constant_promise.py:1664-1689）

| 前提 | 语义 |
|------|------|
| `EXHIBITIONISM_SEX_MODE_0` | 自己不在露出 |
| `EXHIBITIONISM_SEX_MODE_GE_1` | 自己在露出 |
| `EXHIBITIONISM_SEX_MODE_1~4` | 自己处于各模式 |
| `TARGET_EXHIBITIONISM_SEX_MODE_GE_1` | 目标在露出 |
| `TARGET_EXHIBITIONISM_SEX_MODE_1~4` | 目标处于各模式 |
| `TARGET_NOT_IN_EXHIBITIONISM_SEX_MODE` | 目标不在露出 |
| `PLAYER_NOT_IN_EXHIBITIONISM_SEX_MODE` | 玩家不在露出 |

命名维度：无前缀=自己（sourceId）、TARGET_=目标（selectedCharacterId）、PLAYER_=玩家。旧自造名 `EXPOSURE_SEX_MODE_*` 已废弃删除。

## 指令数据

`data/default/instructions/obscenity.toml`（邀请露出）+ `sex.toml`（结束露出），mod 可 override。

## API（见 `docs/plugin-author-guide.md`）

```
ctx.api.call('h-exposure', 'getLevel', charId)            → number
ctx.api.call('h-exposure', 'setLevel', charId, level)     → void
ctx.api.call('h-exposure', 'getModeName', charId)         → string
ctx.api.call('h-exposure', 'updateMode', charId)          → number（动态切换，返回新模式）
ctx.api.call('h-exposure', 'checkAchievements', charId)   → number[]
```

## 与 h-hidden 的关系

- **独立共存**：`exhibitionism_sex_mode` 与 `hidden_sex_mode` 互不干扰，可并存
- **对称结构**：scene/effects/premises/api 模块化同构；h:end 清理、成就记录挂玩家、同地点场景计数均为同款语义
- **差异**：露出 tick 无行为条件、无发现度（被发现是被动事件驱动，隐奸是概率驱动）

## 待办（半成品标记）
- 被发现处理（Sex_Be_Discovered_Panel 5 选项）——`exposure_discovered` 效果占位，检测事件+面板 UI 推迟
- 邀请模式选择面板——`exposure_set_level` level 显式传参可绕过自动计算
- 704 RECORD_CONSCIOUS_H_TIME（last_conscious_h_time 字段，无意识H系统消费）/ 1409 CONDOM_INFO_SHOW_FLAG_ON（UI 标记）——邀请露出效果链中注释标注
- UI 标签 `<露>`——`ExposureTag` 组件 TODO（与 h-hidden HiddenSexTag 同批落地）
- 成就 934（依赖被发现系统）
