# h-time-stop — 时停系统

> 完全对齐 erArk 时停语义（realtime_settle.py / default.py / character_behavior.py），素质门槛决策见 ADR-0015。

## 概念

- **资源**：精力。⚠️ **双绑定键**（2026-08-15 审计）：读取走 `[bindings.h-time-stop].sanity`，扣费通道走 `[bindings.sleep-system].sanity`（consume_sanity）——**两个键都必须绑定**（通常同值 `"精力"`），漏绑时插件加载期 warning + 时停指令不可用：
  ```toml
  [bindings.h-time-stop]
  sanity = "精力"
  [bindings.sleep-system]
  sanity = "精力"
  ```
- **激活**：`time_stop_on` 指令（前提：精力>0、疲劳≤84、未时停）。激活时全场 `sp_flag.unconscious_h=3`，游戏时间冻结。
- **行动扣费**：时停中任何行动按耗时×2 扣精力（至少 1，截断到当前值），归零自动解除时停。
- **绝顶累积**：H 中绝顶在时停期间累积到 `h_state.time_stop_orgasm_count`（h-core settleOrgasm 门控承担），解除时一次性释放（累积≥3 触发超强绝顶）。
- **搬运/自由**：carry_target（搬运目标随玩家移动）、free（目标自由活动，扣 50 精力）。⚠️ **free 为半成品**（2026-08-15 标注）：效果+前提已注册，但 NPC 侧"自由活动"的 AI 豁免未实现（npc-ai 跳过集无 freeTargetId 豁免，目标仍被冻结）；无默认指令暴露本效果（erArk 原指令未实装已砍）。
- **自动时停移动**：UI 开关（指令栏 Ex_COM）。开启后普通场景移动自动 时停on→瞬移→时停off（完全静默，时间不前进，扣精力）。

## 数据

- 指令：插件默认层 `data/default/instructions/time-stop.toml`（5 条：time_stop_on/off/off_in_h/carry_target/stop_carry_target），mod 可 override
- 前提：TIME_STOP_ON/OFF、SANITY_POINT_G_0、PRIMARY/INTERMEDIATE/ADVANCED_TIME_STOP（恒 true，无门槛，见 ADR-0015）、搬运/自由全套、时停解放前提（self/target_time_stop_orgasm_relase）
- 存档：时停开关/冻结时刻/无意识快照/时长统计随存档（gameState provider `h-time-stop`）

## 与其他系统交互

| 系统 | 交互 |
|------|------|
| h-core | 时停门控（settle-gate）、judge_check +9999、绝顶释放 effect |
| sleep-system | consume_sanity 扣费（计入今日消耗→睡眠精力成长）、add_small_sanity_point 恢复 |
| map-system | moveStart 瞬移改道（可选集成，try/catch 降级） |
| npc-ai-system | 跳过集（unconscious 冻结，不结算）；时停中不生成路人（spawn 守卫） |
| random-event-system | 时停中不触发玩家随机事件（守卫） |
| follow-system | 冻结角色不跟随；搬运目标随玩家移动 |
| dialogue-system | 无意识屏蔽（时停目标只出 unconscious 口上）；时停中 enter/greet 口上静默 |
| combat-base | 时停中拒战（冻结敌人不可战） |
| status/hunger | hour_changed tick/进食时停守卫（冻结世界不被污染） |
| h-ejaculation/h-pregnancy | 精液吸收/涨奶时停守卫（realtime 家族冻结） |
| realtimeSettle | core 冻结规则（插件谓词注册）——时停中疲劳/饥饿/尿意等不结算（erArk realtime_settle.py:306） |

## 已知缺口（半成品标注）

- **spawn pending 路径**（2026-08-15 复查轮 3 登记）：`command-executor.processPendingSpawns`（任务/脚本生成的待生成角色）无时停守卫——时停中 spawn_condition 满足时会生成清醒角色。当前无 mod 数据触发该路径；触发需 mod 自定义 spawn_condition。
- **时停中结束 H 丢绝顶累计**：endHScene 清 h_state 整包（master-todo 已登记，修复方向=endHScene 时停守卫转存）。
- **时停中射精不冻结**（既有登记）：eja_climax 实时结算。
- **群交 applyGroupSexRealtimeTick 无守卫**（2026-08-15 登记）：需群交模式在时停中开启才可达（群交模式当前仅脚本可开），直写羞耻/心理绕过心理门控。

## 前提速查（mod 作者）

| 前提 | 语义 |
|------|------|
| TIME_STOP_ON / TIME_STOP_OFF | 时停激活 / 未激活 |
| SANITY_POINT_G_0 | 精力 > 0 |
| NOT_CARRY_ANYBODY_IN_TIME_STOP / CARRY_SOMEBODY_IN_TIME_STOP / TARGET_IS_CARRIED_IN_TIME_STOP | 搬运状态 |
| NOBODY_FREE_IN_TIME_STOP / SOMEBODY_FREE_IN_TIME_STOP / SELF_FREE_IN_TIME_STOP / TARGET_FREE_IN_TIME_STOP（+ NOT 变体） | 自由活动状态 |
| self_time_stop_orgasm_relase / target_time_stop_orgasm_relase | 时停解放状态（口上情境加权） |
