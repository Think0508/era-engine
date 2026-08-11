# 睡眠系统复刻（L1.7 全链：核心睡眠 + 睡眠等级/唤醒 + 无意识H）

> 2026-08-11 grill 定案。复刻 erArk 睡眠系统，范围 C（用户要求完整）。
> 权威事实源：`复刻攻略-猥亵-H系统专用/src/`（erArk 源码树）+ `docs/instruction-replication/`。

## 范围

- 睡觉指令（1014）完整复刻：前提 4 条 + 跨天跳转 + 14 效果链 + 睡醒自动存档
- 让对方去睡觉（1022）
- 睡眠结算 `update_sleep()` 对全员（对齐 erArk `npc_id_got + {0}`）
- 睡眠等级（Sleep_Level：LV0 半梦半醒 ≤30 / LV1 浅睡 31-60 / LV2 熟睡 61-80 / LV3 完全深眠 81-100）
- 唤醒机制（`judge_weak_up_in_sleep_h`：weak_rate 公式）
- 睡奸实时结算 `settle_sleep_h` + 无意识H 全链（睡奸/唤醒/装睡/二段结算）
- 睡奸系指令数据：5045 sleep_obscenity / 5046 stop_sleep_obscenity / 5052 unconscious_h / 6005 unconscious_h_end / 6106 sleeping_pills
- NPC 睡眠对齐（npc-ai-system windowSettle sleep 分支 + unnormal flag）
- h-npc-ai 无意识分支 ②④③ 落地

## Grill 定案

| # | 决策 |
|---|------|
| Q1 | 范围 C：核心睡眠 + 睡眠等级/唤醒 + 无意识H 全链 |
| Q2 | `TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1` 的 `SLEEP_TIME` = 当前游戏时间处于睡眠窗口（≥plan_to_sleep_time 默认 18:00 或 <plan_to_wake_time 默认 6:00），窗口值插件默认数据、mod 可覆盖 |
| Q3 | 架构：新建 `src/plugins/sleep-system/`；`settle_sleep_h` 移出 core；core 只留通用数值结算 |
| Q4 | 睡眠结算对全部已生成角色；睡醒自动存档；体力恢复公式搬入（上限×0.0025+3/分、气力×0.005+6/分），方舟世界观修正（天赋 351/352、宿舍设施、监禁、管理员知识）砍掉 |

## erArk 源码事实（带行号）

### sleep_settle.py（update_sleep）
- `id_list = npc_id_got + {0}`——所有已遇见 NPC + 玩家（:45-46）
- 每角色：`settle_character_juel`（状态→宝珠；宝珠已砍，只留 daily_reset 清零）（:52）
- 玩家（:54-77）：理智成长（:55，无消费方→TODO）、eja_point=0（:56，无条件）、day_first_shoot_semen=True（:57，无条件）、能力升级（:75，ability-progression 无对等→TODO）
- NPC（:78-97）：angry=rand(1,35)（:80）、h_interrupt=0（:82）、day_first_meet=1（:84）、妊娠检查（:88）、素质获得 gain_talent type=3（:90）、能力升级（:92，TODO）、H状态重置 get_h_state_reset（:95）、sleep_h_awake=False（:97）
- 自动存档 pl_sleep_save_flag → update_save（:100 / character_behavior.py:82-84）

### realtime_settle.py
- `settle_tired`（:285-308）：睡眠行为跳过；时停不积累
- `settle_sleep`（:347-391）：疲劳 -2×(t/6)（:359）；熟睡值 level≤1 → +t×1.5 / 否则 randint(t×-0.3, t×0.6) cap 100（:361-367）；unnormal flag 5+6（:368-369）；体力恢复 hp_base=上限×0.0025+3、mp_base=上限×0.005+6（:388-391，世界观修正砍）
- `settle_sleep_h`（:436-464）：目标 SLEEP+unconscious_h==1 时：WAIT/安眠药 → sleep_level=2 规避吵醒；否则熟睡值 -= t×3（:458-459）；等级≤1 → judge_weak_up_in_sleep_h（:463-464）

### handle_npc_ai_in_h.py（无意识H AI）
- `judge_character_h_obscenity_unconscious`（:34-152）：睡奸时例外（SLEEP 行为不被锁 WAIT，:123-124）；6异常例外（:126-127）
- `recover_from_unconscious_h`（:155-256）：终止对方行为（end_now=2，:188）；睡眠中 → sleep_h_awake=True（:190-191）；玩家行为 5 分钟（:195）；settle_unconscious_semen_and_cloth（:198）；群交处理（:201-222）；handle_npc_instruct_condition 继续H判定（:225）；继续 → 装睡 pretend_sleep=True + unconscious_h=1 + unnormal 5,6（:238-243），目标行为 10 分钟（:237）；结束 → both_h_state_reset + 开门（:249-253）；时间推进 5 分钟（:256）
- `handle_npc_instruct_condition`（:258-325）：监禁→继续；高级性骚扰实行判定→陷落≥3 继续 / >0 LOW_OBSCENITY_ANUS / <0 愤怒+100 / =0 HIGH_OBSCENITY_ANUS；不满足→DO_H_FAIL
- `judge_weak_up_in_sleep_h`（:327-349）：weak_rate = 60 - sleep_point + max(30 - sleep_point, 0)；weak_rate ≥ randint(1,100) → 醒（tired=0、sleep_point=0、unnormal 5 清）→ recover
- `settle_unconscious_semen_and_cloth`（:352-387）：二段行为 in_unconscious_cum_on_body_* / in_unconscious_cum_on_cloth_*（穿着时）/ in_unconscious_stolen_panty / in_unconscious_stolen_socks；数据清零

### 睡觉指令效果链（06-指令集-攻略期.md:377，14 ID）
31 NOT_TIRED / 36 SLEEP_POINT_ZERO（熟睡值=0）/ 301 SHOWER_FLAG_TO_0 / 321 SLEEP_FLAG_TO_0 / 489 HYPNOSIS_FLAG_TO_0 / 457 MASTUREBATE_BEFORE_SLEEP_FLAG_TO_0 / 509 SLEEP_ADD_ADJUST（宿舍换睡衣+几率关门）/ 606 CLOTH_SEE_ZERO / 634 GET_SLEEP_CLOTH / 648 CLEAN_LOCKER_CLOTH_SEMEN（储物柜，TODO）/ 932 ADJUST_BODY_MANAGE_SLEEP_ITEM（身体管理道具，TODO）/ 1504 ADD_SMALL_SANITY_POINT（理智+小）/ 1505 ADD_SMALL_SEMEN_POINT（精液+小）/ 1751 FACILITY_DAMAGE_CHECK（设施，TODO）
（归档 _erark_source 的 sleep 效果链与此矛盾——已裁决以 06 文档 14 ID + constant_effect.py 为准）

### 睡眠时长与前提
- plan_to_wake_time 默认 [6,0]、plan_to_sleep_time 默认 [18,0]（game_type.py:601-603）
- NPC 默认 8h（handle_npc_ai.py:644 duration==480）
- 前提：IN_DORMITORY_OR_HOTEL / NOT_H / TIME_STOP_OFF / TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1
- 睡眠等级 get_sleep_level（attr_calculation.py:783-798）：`value > 阈值 → 下一级`，LV0-3

## 架构

```
core（通用数值，不认知睡眠语义）：
  realtime-settle.ts  导出 settleTired/settleUrine/settleHunger（修 per-tick broken import）
                      + settleSleepPass(entity, minutes)——settle_sleep 数值（疲劳2倍/熟睡积累/体力恢复公式）
                      isSleep 分支移除 wake 侧（G4/G5/精液）→ 迁移 sleep-system
  game-context.ts     advanceToHour(hour) 通用原语（循环 advanceTime，事件自然发射）
  mod-loader.ts       HInstruction schema：+ settle_mode（"rest"|"sleep"）+ advance_to_hour
  command-executor.ts isRest/isSleep 硬编码 → settle_mode 字段；advance_to_hour 推进；
                      NPC 循环保持（opts 不传——NPC 按各自行为由 npc-ai-system 结算）
sleep-system（新插件）：
  指令数据（sleep/ask_target_sleep + 睡奸系 5 条）
  默认数据（sleep.toml：plan_to_wake/sleep_time、睡眠等级阈值）
  前提注册 12 条
  状态管理（sp_flag.sleeping/unnormal_flag bit5,6/sleep_h_awake/pretend_sleep + 睡眠等级）
  updateSleepAll()——update_sleep 对全员
  settleSleepH()——监听 game:execution_end 睡奸实时结算
  judgeWeakUpInSleepH()——唤醒判定
npc-ai-system：windowSettle sleep 分支 → settleSleepPass；unnormal bit5,6（睡眠行为开始/结束）
h-npc-ai：无意识分支 ②④③（recover flow / 继续H判定 / 二段结算 / 行为锁定例外）
```

## 执行顺序

1. core 改造（realtime-settle / game-context / mod-loader / command-executor）
2. sleep-system 插件（骨架+数据 → 状态管理 → 前提 → updateSleepAll → settleSleepH/唤醒 → 睡奸指令数据）
3. npc-ai-system 对齐
4. h-npc-ai 无意识分支
5. 测试（core / sleep-system / h-npc-ai / 集成）
6. 文档（sleep-system.md / plugin-author-guide / character-schema / AGENTS §13 / master-todo）
7. 验证（typecheck + test + dev 冒烟）

## 执行时盘点项（API 对等）

- h-pregnancy：check_all_pregnancy 对等（现有 isPregnant/getDays API；无 → TODO 或最小实现）
- h-core：get_h_state_reset 对等（H 结束重置 API）
- save-system：自动存档 API（saveGame）
- h-time-stop：isActive API 名
- ability-progression：自动升级检测（无对等 → TODO）
- 理智成长：精力闲置无消费方 → TODO
- second-behavior 二段行为机制是否存在（睡奸二段结算）
