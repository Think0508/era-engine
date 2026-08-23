# 指令复刻 · 完成速查表（Completed Instructions）

> 维护规则：每条指令经用户检查确认后**立即追加一行**；查“做过没有 / 在哪 / 属于哪批哪系统 / 口上有没有”都看这里，不靠 AI 翻代码。
> 状态：`✅ 已确认`（用户检查通过）· `🟡 存量已实现`（未走本流程或待补口上/待核对）· `📝 待完成`。
> 批次：B1（日常）· B2（ARTS）· B3（OBSCENITY）· B4-B7（SEX）· 核对项（SYSTEM）。

## 统计看板

| 批次 | ✅ 已确认 | 🟡 存量已实现 | 📝 待完成 |
|------|-----------|---------------|-----------|
| B1 | 3 | 2 | 19（保留 6 + 延后 13） |
| B2 | 0 | 5 | 12（催眠） |
| B3 | 0 | 1 | 36 |
| B4-B7 | 0 | 0 | 142 |
| 核对项（SYSTEM） | 0 | 0 | 8 |

> 说明：B1 候选池原 24 条，chat / stroke / rest 已确认；sleep / ask_target_sleep 为存量已实现（未走本流程）；剩余 19 条 = 保留待下令 6 + 延后 13。

---

## 已确认（✅）

| 批次 | 分类/子类 | cid | id | 名称 | 所属系统 | 通用口上 | 测试 | 特殊处理 | 状态 |
|------|-----------|-----|-----|------|----------|----------|------|----------|------|
| B1 | daily | 1004 | chat | 聊天 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/chat.toml + chat_failed.toml（骨架：各 1 示例 + 1 占位） | instruction-chat.test.ts | 成败双链 chat_settle；世界观占位已移除；只影响口上叙事，不影响 effect 数值 | ✅ 已确认 |
| B1 | daily | 1005 | stroke | 身体接触 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/stroke.toml | instruction-stroke.test.ts | 口上骨架（示例+占位符 5 条）；AI 长文本/源石/博士全部移除；新前提 T_NORMAL_56_OR_UNCONSCIOUS_FLAG / NPC_INITIATED / TARGET_IS_PLAYER / TARGET_NOT_FALLEN | ✅ 已确认 |
| B1 | daily | 1012 | rest | 休息 | 数据：native-instructions（从 test-mod 迁入并移除覆盖）；口上：talk-common-system | 有：behavior/daily/rest.toml（骨架 2 组） | instruction-rest.test.ts | 用户确认的有意区别：recover_permil 恢复，不搬 erArk 21/325/1751；前提全量迁移 | ✅ 已确认 |

## 存量已实现（🟡，未走本流程 / 待补口上 / 待核对）

| 批次 | 分类/子类 | cid | id | 名称 | 所属系统 | 通用口上 | 测试 | 特殊处理 | 状态 |
|------|-----------|-----|-----|------|----------|----------|------|----------|------|
| B1 | daily | 1014 | sleep | 睡觉 | 数据：sleep-system；口上：talk-common-system | 无（待补：talk/daily/sleep.csv） | 待补指令级测试 | 特殊耗时：跨天 advance_to_hour=6 | 🟡 待补口上/核对 |
| B1 | daily | 1022 | ask_target_sleep | 让对方去睡觉 | 数据：sleep-system | 无（erArk 无口上 CSV，不编造） | 待补指令级测试 | 效果走 NPC setBehavior | 🟡 待核对 |
| B2 | arts/time_stop | 4113 | time_stop_on | 时间停止流动 | 数据：h-time-stop | 无（待补） | 待核对 | 已实装 | 🟡 待补口上/核对 |
| B2 | arts/time_stop | 4114 | time_stop_off | 时间重新流动 | 数据：h-time-stop | 无（待补） | 待核对 | 已实装 | 🟡 待补口上/核对 |
| B2 | arts/time_stop | 4115 | time_stop_off_in_h | 在H中取消时停 | 数据：h-time-stop | 无（待补） | 待核对 | 已实装 | 🟡 待补口上/核对 |
| B2 | arts/time_stop | 4005 | carry_target | 搬运对方 | 数据：h-time-stop | 无（待补） | 待核对 | 已实装 | 🟡 待补口上/核对 |
| B2 | arts/time_stop | 4006 | stop_carry_target | 停止搬运对方 | 数据：h-time-stop | 无（待补） | 待核对 | 已实装 | 🟡 待补口上/核对 |
| B3 | obscenity/exposure | 5054 | ask_exhibitionism_sex | 邀请露出 | 数据：h-exposure | 无（待核对） | 待核对 | 已实装（exposure 系统） | 🟡 待补口上/核对 |

---

## 维护提示

- 复刻完成 + 用户确认后：把该行从“待完成/待筛”心智移到本表，状态改为 ✅；同屏更新 `batch-01-daily.md` 状态列。
- 筛选后：`filter-quick-reference.md` 的筛选结论列同步更新，被剔除条目原因留底。
- 涉及口上世界观占位符时，登记占位符条数（如「XX 指令通用口上 1-5」），原文对照保存在批次清单。