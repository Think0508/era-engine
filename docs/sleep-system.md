# sleep-system —— 睡眠系统

> 复刻 erArk 睡眠系统（L1.7 全链：核心睡眠 + 睡眠等级/唤醒 + 无意识H）。
> 2026-08-11 grill 定案 + 实现。权威事实源：`复刻攻略-猥亵-H系统专用/src/`（erArk 源码树）。

## 1. 概念与定位

睡眠 = 日常循环的基石：玩家在床铺地点睡觉 → 跨天跳转到次日起床时刻 → 睡眠数值结算
（疲劳 2 倍削减/熟睡值积累/体力气力恢复）→ **对全员**执行睡眠结算（erArk `update_sleep`：
快感清零/愤怒重置/H 状态重置/素质获得…）→ 睡醒自动存档。睡眠中的角色可被"睡眠猥亵/
无意识奸"（无意识H，h-npc-ai 无意识组）。

| 能力 | erArk 对照 | 本引擎机制 |
|------|-----------|-----------|
| 睡觉指令（1014） | InstructConfig 1014 | 指令 TOML：前提 4 条 + `advance_to_hour=6` 跨天 + 14 效果链 + `settle_mode="sleep"` |
| 睡眠结算对全员 | `sleep_settle.update_sleep()` | `updateSleepAll()`（睡觉指令 execution_end 触发，对全部已生成角色） |
| 睡眠等级 | `Sleep_Level.csv` + `attr_calculation.get_sleep_level` | `sleep.toml` 阈值（30/60/80/100），`getSleepLevelInfo` |
| 睡眠状态 | `sp_flag.sleep` + unnormal_flag bit5/6 | `sp_flag.sleeping` + `sp_flag.unnormal_flag` |
| 睡醒自动存档 | `pl_sleep_save_flag → update_save()` | `game:autosave_requested` 事件 → bridge → `autoSave()` |
| 睡奸实时结算 | `realtime_settle.settle_sleep_h` | h-npc-ai `settleSleepH`（per-tick，erArk 文件映射） |
| 醒来判定 | `handle_npc_ai_in_h.judge_weak_up_in_sleep_h` | h-npc-ai `judgeWeakUpInSleepH`（weak_rate 公式） |
| 恢复流程 | `handle_npc_ai_in_h.recover_from_unconscious_h` | h-npc-ai `recoverFromUnconsciousH`（API：`h-npc-ai.recoverFromUnconsciousH`） |

## 2. 架构分层

```
core（通用数值，不认知睡眠语义）：
  realtime-settle.ts   settleTired/settleUrine/settleHunger（导出）
                      + sleepPassSettle(entity, minutes)——settle_sleep 数值：
                        疲劳 2 倍削减 + 熟睡值积累 + 体力/气力公式恢复
                      + settleDailyReset（导出——daily_reset 标记属性归零）
  game-context.ts     minutesUntilHour(hour) / advanceToHour(hour) 跨天原语
  mod-loader.ts       HInstruction.settle_mode / advance_to_hour + LoadedMod.sleepConfig
  command-executor.ts settle_mode 字段驱动（rest/sleep）+ advance_to_hour 时长计算

sleep-system（本插件）：
  指令数据（sleep/ask_target_sleep + 睡奸系 5 条）
  默认数据（sleep.toml：plan_to_wake_time/plan_to_sleep_time/睡眠等级阈值）
  前提注册（12 条族）
  状态管理（sleep-state.ts：sp_flag.sleeping/unnormal_flag/睡眠等级）
  updateSleepAll()（update-sleep.ts——update_sleep 对全员）
  效果类型（add_small_sanity_point 1504 / add_small_semen_point 1505 /
           unconscious_h_set / unconscious_h_clear）

h-npc-ai（无意识H AI——按 erArk 文件映射归属）：
  sleep-h.ts：settleSleepH（②）/ judgeWeakUpInSleepH（④）/
              recoverFromUnconsciousH（③）/ handleNpcInstructCondition / settleUnconsciousSemenAndCloth
  per-tick.ts：睡奸结算挂点 + 睡奸行为锁定例外 + 无意识疲劳退出修正（只查 HP）
```

## 3. 数据格式

### 3.1 sleep.toml（插件默认层，mod 可覆盖——`mods/[mod]/definitions/sleep.toml`）

```toml
plan_to_wake_time = [6, 0]      # 计划醒来时刻 [时, 分]——睡觉跨天目标时刻
plan_to_sleep_time = [18, 0]    # 计划睡觉时刻 [时, 分]——睡眠窗口起点

[[sleep_levels]]                # 睡眠等级阈值（升序，最后一项封顶）
name = "半梦半醒"
sleep_point = 30
# LV1 浅睡 60 / LV2 熟睡 80 / LV3 完全深眠 100（erArk Sleep_Level.csv）
```

### 3.2 睡觉指令（data/default/instructions/daily.toml）

```toml
[[instructions]]
id = "sleep"
label = "睡觉"
type = "daily"
time_cost = -1
advance_to_hour = 6             # 跨天到次日 6:00（mod 可覆盖指令或改 sleep.toml）
settle_mode = "sleep"           # 实时结算模式：睡眠（疲劳2倍削减/熟睡积累/体力恢复）
premises = ["IN_DORMITORY_OR_HOTEL", "NOT_H", "TIME_STOP_OFF", "TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1"]
effects = [ ... ]               # 14 效果链（erArk 1014，见 §4）
```

### 3.3 睡眠状态字段（实体运行时）

| 字段 | 类型 | 说明 |
|------|------|------|
| `sp_flag.sleeping` | boolean | 正在睡眠（玩家睡觉指令期间 / NPC 睡眠行为——npc:behavior_started 事件管理） |
| `sp_flag.unnormal_flag` | number | 位掩码：bit5=0x10 意识模糊/弱交互、bit6=0x20 完全意识不清醒（睡眠中置位） |
| `sp_flag.sleep_h_awake` | boolean | 睡奸中醒来标记（醒来后装睡/结束判定） |
| `h_state.pretend_sleep` | boolean | 装睡（醒来但继续无意识H） |
| `action_info.wake_time` | GameTimeData | 醒来时间（睡眠结算记录） |
| `action_info.h_interrupt` | number | H 被撞破标记（睡眠结算清零） |

## 4. 睡觉指令效果链（14 ID，erArk 1014）

| erArk ID | 名称 | 翻译 |
|----------|------|------|
| 31 | NOT_TIRED | `set_field sp_flag.tired=false` |
| 36 | SLEEP_POINT_ZERO | `set_field base.熟睡值=0`（unnormal bit5 归 sleep-system 状态管理） |
| 301 | SHOWER_FLAG_TO_0 | `set_field sp_flag.shower_state=0` |
| 321 | SLEEP_FLAG_TO_0 | `set_field sp_flag.sleeping=false`（运行时标记由事件管理） |
| 489 | HYPNOSIS_FLAG_TO_0 | TODO（h-hypnosis 字段盘点后接入） |
| 457 | MASTUREBATE_BEFORE_SLEEP_FLAG_TO_0 | `set_field sp_flag.masturebate_before_sleep=false` |
| 509 | SLEEP_ADD_ADJUST | TODO（宿舍换睡衣+关门——关门机制未实装；换睡衣由 634 承担） |
| 606 | CLOTH_SEE_ZERO | TODO（服装可见性全清——634 已设睡衣可见） |
| 634 | GET_SLEEP_CLOTH | `set_field sp_flag.pajamas=true` + `cloth_set_visible(睡衣)` + `cloth_wear_all` |
| 648 | CLEAN_LOCKER_CLOTH_SEMEN | TODO（储物柜未实装） |
| 932 | ADJUST_BODY_MANAGE_SLEEP_ITEM | TODO（身体管理道具未实装） |
| 1504 | ADD_SMALL_SANITY_POINT | `add_small_sanity_point`（15%/h 恢复，绑定 sanity 可选） |
| 1505 | ADD_SMALL_SEMEN_POINT | `add_small_semen_point`（15%/h 恢复，仅玩家） |
| 1751 | FACILITY_DAMAGE_CHECK | TODO（方舟设施，世界观专属） |

## 5. 前提（premise/sleep.ts）

| 前提 | 语义 |
|------|------|
| `IN_DORMITORY_OR_HOTEL` | 当前地点有 `has_bedroom` tag（位置前提迁移定案） |
| `TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1` | 疲劳 ≥120 或 睡眠时间窗口 或 体力 ≤1 |
| `TIRED_GE_75` / `TARGET_TIRED_GE_75` | 自己/目标 疲劳 ≥120（75%×160） |
| `GAME_TIME_IS_SLEEP_TIME` / `SLEEP_TIME` / `NOT_SLEEP_TIME` | 睡眠窗口：≥ plan_to_sleep_time 或 < plan_to_wake_time |
| `T_ACTION_SLEEP` / `T_ACTION_NOT_SLEEP` | 目标 正在睡眠 / 未睡眠 |
| `T_NORMAL_1` / `T_NORMAL_2` / `T_NORMAL_6` | 目标意识/行为正常（非睡眠中/非休息、非监禁、非深度无意识） |
| `T_UNCONSCIOUS_FLAG_0` / `T_UNCONSCIOUS_FLAG_7` | 目标无意识等级 = 0 / 7（1-6 由 h-core 注册） |
| `SCENE_ALL_UNCONSCIOUS_OR_SLEEP` | 玩家所在地点其他角色全部无意识/睡眠 |
| `SCENE_ALL_OTHERS_UNCONSCIOUS_OR_SLEEP` | 除自己和交互对象外全部无意识/睡眠 |
| `SLEEP_H_AWAKE` 族（SELF/TARGET/NOT + 装睡组合） | 睡奸醒来/装睡标记 |
| `SLEEP_PILLS` 族 | 恒 false + TODO（body_item[9] 安眠药未实装） |
| `TIME_STOP_OFF` / `TIME_STOP_ON` | h-time-stop 注册（模块级状态） |

## 6. 睡眠结算（updateSleepAll——erArk update_sleep 对全员）

玩家睡觉指令收尾（`game:execution_end` commandId==='sleep'）触发，对**全部已生成角色**：

- **全员**：daily_reset 标记属性归零（快感清零——宝珠系统已砍只留清零）
- **玩家**：射精欲=0（无条件）、day_first_shoot_semen=true（无条件，醒来第一发翻倍）、
  wake_time 记录、精液转化（≥6h：额外精液 += floor(精液/2)，上限 精液上限×4，
  满则"浓厚精液"天赋）；TODO：理智成长（精力无消费方）、能力升级检测
- **NPC**：愤怒=rand(1,35)、h_interrupt=0、day_first_meet=1（first_record 存在时）、
  素质获得（checkTalentGain）、H 状态重置（h_state 置空）、sleep_h_awake=false；
  TODO：妊娠检查（h-pregnancy 无 check_all 对等）、能力升级检测
- 睡醒自动存档：`game:autosave_requested` 事件 → bridge → `autoSave()`（auto 槽）

**注意**：NPC 的 `sp_flag.sleeping` 由 `npc:behavior_started` 事件管理（type==='sleep' 入睡，
其他类型醒来）——updateSleepAll 不清 NPC 睡眠标记（玩家睡觉不代表 NPC 立即醒来，erArk 同构）。

## 7. 无意识H（h-npc-ai 无意识组 ②④③）

- **② settleSleepH**（per-tick 玩家分支）：玩家 H 中 + 目标睡眠 + unconscious_h==1 →
  WAIT 指令/安眠药中 → sleep_level=2 规避吵醒；否则 熟睡值 -= 3×t（睡眠积累的双倍扣除）→
  等级 ≤1 → 吵醒判定；目标窗口结算由 per-tick 显式 sleepPassSettle 补偿
  （B5 注记：h:start 已把参与方行为块覆写为 h_wait——运行时靠 sp_flag.sleeping 分支识别睡奸目标）
- **④ judgeWeakUpInSleepH**：`weak_rate = LV1阈值(60) - 熟睡值 + max(LV0阈值(30) - 熟睡值, 0)`；
  `weak_rate ≥ randint(1,100)` → 醒（疲劳=0/熟睡=0/unnormal bit5 清）→ 恢复流程
- **③ recoverFromUnconsciousH**（API：`h-npc-ai.recoverFromUnconsciousH(actorId)`，仅处理
  unconscious_h===1）：
  睡眠标记清 + sleep_h_awake=true（仅真睡眠时）+ 二段结算（无意识精液/服装数据清零，
  second-behavior 未实装 → TODO）+ 继续H判定（陷落系统未实装 → 恒继续装睡，TODO）+
  装睡（setPretendSleep：pretend_sleep=true + unconscious_h=1 + is_h 重设）或结束 H +
  时间推进 5 分钟（嵌套 time_advanced 被重入守卫丢弃——设计内代价）
- 睡奸行为锁定例外：睡奸目标不参与锁死逻辑（per-tick sleeping 分支 + 显式窗口结算补偿）
- 无意识疲劳退出修正：无意识目标只查 HP，不查疲劳（睡奸不被疲劳中断）；睡眠中目标同样查 HP
- h:end 兜底（onHEnd）：H 参与方（h_* 行为块）的 unconscious_h===1 残留清除
  （sleeping 保留 + bits 保留——不变量）

## 8. API（namespace `sleep-system`）

| 方法 | 签名 | 说明 |
|------|------|------|
| `isSleeping` | `(charId) => boolean` | 是否正在睡眠（sp_flag.sleeping） |
| `getSleepLevel` | `(charId) => number` | 睡眠等级 0-3（熟睡值按 sleep.toml 阈值推导） |
| `getSleepLevelInfo` | `(sleepPoint) => {level, name}` | 睡眠等级详情 |
| `isSleepTimeWindow` | `() => boolean` | 是否处于睡眠时间窗口（Q2 定案语义） |
| `setAsleep` / `clearAsleep` | `(charId) => void` | 入睡/醒来标记（GM/脚本） |

**效果类型**（onLoad 注册）：`add_small_sanity_point`（1504，绑定 sanity 可选，
未绑定 warning+跳过）、`add_small_semen_point`（1505，仅玩家）、`unconscious_h_set`
（设目标无意识等级+unnormal 位）、`unconscious_h_clear`（清 0 + unnormal 位；
`params.wake=false` 只清无意识奸标记、目标继续睡——5046 用；默认唤醒——6005 用；
wake=false 且仍 sleeping 时保留 bit5|6 不变量）、`ask_sleep`（目标真实入睡——经
npc-ai setBehavior sleep 块，睡眠标记自动置位）。

**事件**：

| 事件 | 方向 | 说明 |
|------|------|------|
| `game:execution_end` | 监听 | 睡觉指令收尾（updateSleepAll + 自动存档事件） |
| `npc:behavior_started` | 监听 | NPC 睡眠行为开始/结束 → 睡眠标记维护 |
| `game:autosave_requested` | 发出 | 睡醒自动存档（bridge 监听执行） |

## 9. 跨天原语（core）

- `gameContext.minutesUntilHour(hour)`：到指定小时的分钟数（已过则次日，恰等则 24h）
- `gameContext.advanceToHour(hour)`：推进到目标小时（逐步发射 hour_changed/new_day/time_advanced）
- 指令 `advance_to_hour` 字段：command-executor 按 minutesUntilHour 计算真实时长并推进

## 10. 与其他系统交互

| 系统 | 交互 |
|------|------|
| npc-ai-system | NPC 睡眠行为窗口走 `sleepPassSettle`（数值）；npc:behavior_started 事件驱动睡眠标记 |
| h-npc-ai | 无意识H AI（睡奸结算/唤醒/恢复）——sleep-system 提供状态字段契约，h-npc-ai 直读 |
| h-core | 睡觉效果链的服装效果（cloth_*）、H 开始/结束（h_start_h/h_end_h）、NOT_H/TIRED_LE_74 前提 |
| h-time-stop | TIME_STOP_OFF 前提（睡觉前提之一） |
| dialogue-system | trigger_dialogue(scene="sleep"/"sleep_obscenity" 等口上) |
| UI bridge | game:autosave_requested → autoSave（睡醒自动存档） |

## 11. 已知偏差与 TODO

| 项 | erArk | 本引擎 | 说明 |
|----|-------|--------|------|
| 精液转化时机 | 睡前（行为开始时） | 睡眠结算后 | 基数含睡眠恢复量（量级：小时级恢复） |
| 恢复修正系数 | 天赋 351/352、监禁、宿舍设施、管理员知识 | 无（×1） | 方舟世界观专属，Q4 定案砍掉 |
| 愤怒重置 | randrange(1,35) = 1..34 | 1..34 | M1 修复（2026-08-11 off-by-one） |
| 熟睡积累 | 浅睡 +1.5/分、深睡 rand(-0.3~0.6)/分（无系数） | 同 erArk | I6 修复（2026-08-11 删 tired_adjust——G6 旧决策引用了不存在的源码行号） |
| 睡眠效果链 | 489/509/606/648/932/1751 | TODO 注释 | 催眠/关门/储物柜/道具/设施未实装 |
| 安眠药（6106） | body_item[9] | 指令数据就绪，前提恒 false | 道具系统落地后接入 |
| 理智成长/能力升级检测 | update_sleep 玩家分支 | TODO | 精力无消费方/ability-progression 无对等 API |
| 妊娠检查 | check_all_pregnancy | TODO | h-pregnancy 无 check_all 对等 API |
| 继续H判定 | 陷落等级三分支 | 恒继续（装睡） | 陷落系统未实装 |
| 无意识二段行为 | second_behavior | 数据清零 + TODO | 二段行为机制未实装 |
| 睡奸经验（120/121） | Experience_Relations 映射 | 未接入 | 随睡奸指令效果链批次 |
| 装睡/醒来地文（7700+ 条） | 前提真语义已注册 | 端到端未接线 | ⚠️ 半成品（2026-08-11 第八轮）：前提注册/数据校验/守护测试全绿，但 orgasm 地文消费链未接线（h-core 绝顶结算只发 h:orgasm 事件、未调 talk-common 渲染）——B3-B6 指令批次 + orgasm 地文渲染范畴；前提侧届时无需改动 |
| 吵醒恢复的 5 分钟窗口 | 完整嵌套结算流 | 时钟推进 + hourly 事件照发，嵌套 time_advanced 被重入守卫丢弃 | 5 分钟窗口的 H 判定/NPC 结算跳过（I3 偏差，量级小） |
| 睡眠猥亵（5045） | 只设 unconscious_h=1+unnormal | 同 erArk（不开 H） | I5 修复（2026-08-11 移除 h_start_h——原实现让 5046 的 NOT_H 恒假） |
| 睡觉指令效果 321 | 清 sp_flag.sleep 请求标记 | 不翻译 | I2 修复（2026-08-11：原误映射为清 sleeping 运行时标记）；玩家 sleeping 由 execution_start 置位 |

## 12. 测试

`src/plugins/sleep-system/sleep-system.test.ts`（20 条，全插件加载）：前提矩阵四象限/
窗口边界/T_ACTION_SLEEP/has_bedroom/时停、睡眠等级阈值边界、advanceToHour 跨天事件、
updateSleepAll 玩家/NPC 分支、睡觉指令全流程（跨天→结算→存档事件）、睡奸结算三态
（深睡不醒/WAIT 规避/吵醒装睡 + is_h 重设）、h:end 兜底（含误伤面四角色）、
unconscious_h_clear 两态（唤醒/wake=false 继续睡 + bits 不变量）、ask_sleep 真实入睡。
`src/core/realtime-settle.test.ts`：睡眠体力/气力公式恢复、NPC 窗口同构、G4/G5 迁移注记。
