# 指令复刻 · 完成速查表（Completed Instructions）

> 维护规则：每条指令经用户检查确认后**立即追加一行**；查“做过没有 / 在哪 / 属于哪批哪系统 / 口上有没有”都看这里，不靠 AI 翻代码。
> 状态：`✅ 已确认`（用户检查通过）· `🟡 存量已实现`（未走本流程或待补口上/待核对）· `📝 待完成`。
> 批次：B1（日常）· B2（ARTS）· B3（OBSCENITY）· B4-B7（SEX）· 核对项（SYSTEM）。

## 统计看板

| 批次 | ✅ 已确认 | 🟡 存量已实现 | 📝 待完成 |
|------|-----------|---------------|-----------|
| B1 | 11 | 0 | 13（延后 13） |
| B2 | 5 | 0 | 12（催眠，延后待 grill） |
| B3 | 11 | 1 | 25 |
| B4-B7 | 33 | 0 | 109 |
| 核对项（SYSTEM） | 0 | 0 | 8 |

> 说明：B1 候选池原 24 条，chat / stroke / rest / take_shower / sleep / ask_target_sleep / follow / end_follow / listen_complaint / apologize / ask_target_rest 已确认；剩余 13 条全部为延后。

---

## 已确认（✅）

| 批次 | 分类/子类 | cid | id | 名称 | 所属系统 | 通用口上 | 测试 | 特殊处理 | 状态 |
|------|-----------|-----|-----|------|----------|----------|------|----------|------|
| B1 | daily | 1004 | chat | 聊天 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/chat.toml + chat_failed.toml（骨架：各 1 示例 + 1 占位） | instruction-chat.test.ts | 成败双链 chat_settle；世界观占位已移除；只影响口上叙事，不影响 effect 数值 | ✅ 已确认 |
| B1 | daily | 1005 | stroke | 身体接触 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/stroke.toml | instruction-stroke.test.ts | 口上骨架（示例+占位符 5 条）；AI 长文本/源石/博士全部移除；新前提 T_NORMAL_56_OR_UNCONSCIOUS_FLAG / NPC_INITIATED / TARGET_IS_PLAYER / TARGET_NOT_FALLEN | ✅ 已确认 |
| B1 | daily | 1012 | rest | 休息 | 数据：native-instructions（从 test-mod 迁入并移除覆盖）；口上：talk-common-system | 有：behavior/daily/rest.toml（骨架 2 组） | instruction-rest.test.ts | 用户确认的有意区别：recover_permil 恢复，不搬 erArk 21/325/1751；前提全量迁移 | ✅ 已确认 |
| B1 | daily | 1015 | take_shower | 淋浴 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/take_shower.toml（1 示例 + 1 占位） | instruction-take-shower.test.ts | 位置 has_bathroom；新效果 dirty_reset_in_shower / record_shower_time；1751 设施损坏（方舟/基建）不搬 TODO；口上骨架无世界观残留 | ✅ 已确认 |
| B1 | daily | 1014 | sleep | 睡觉 | 数据：sleep-system；口上：talk-common-system | 有：behavior/daily/sleep.toml（4 组骨架：high_1/夜晚/白天/疲劳爆表） | sleep-system.test.ts 指令级口上 + 全流程（31 passed） | 特殊耗时：跨天 advance_to_hour=6；口上骨架无世界观残留 | ✅ 已确认 |
| B1 | daily | 1022 | ask_target_sleep | 让对方去睡觉 | 数据：sleep-system | 无（erArk 无口上 CSV，不编造） | sleep-system.test.ts ask_target_sleep 全指令（目标入睡/时间+10） | 效果走 NPC setBehavior；无口上不编造 | ✅ 已确认 |
| B1 | daily | 1019 | follow | 邀请同行 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/follow.toml（1 示例 + 1 占位） | instruction-follow.test.ts | 耗时 5；效果 set_follow mode=1（=erArk 363）；前提 TARGET_NOT_FOLLOW 互斥 | ✅ 已确认 |
| B1 | daily | 1020 | end_follow | 结束同行 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/end_follow.toml（1 示例 + 1 占位） | instruction-follow.test.ts | 耗时 5；效果 set_follow mode=0（=erArk 365）；前提 TARGET_IS_FOLLOW 互斥 | ✅ 已确认 |
| B1 | daily | 1024 | listen_complaint | 听牢骚 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/listen_complaint.toml（1 示例 + 1 占位） | instruction-listen-complaint.test.ts | 前置 anger-system 已完成；新前提 TARGET_ABD_OR_ANGRY_MOOD / TARGET_NOT_ANGRY_WITH_PLAYER；listen_complaint_settle 减怒 | ✅ 已确认 |
| B1 | daily | 1023 | apologize | 道歉 | 数据：native-instructions；口上：talk-common-system | 有：behavior/daily/apologize.toml + apologize_failed.toml（各 1 示例 + 1 占位） | instruction-apologize.test.ts | 成败双链 apologize_settle；成功链含 341 清 angry_with_player；前置 anger-system 依赖完成 | ✅ 已确认 |
| B1 | daily | 1021 | ask_target_rest | 让对方休息 | 数据：native-instructions；口上：无（erArk 无 CSV，不编造） | instruction-ask-target-rest.test.ts | 新增 TARGET_HP_OR_MP_LOW；ask_rest → npc-ai rest 行为块；耗时 1 | ✅ 已确认 |
| B2 | arts/time_stop | 4113 | time_stop_on | 时间停止流动 | 数据：h-time-stop；口上：talk-common-system | 有：behavior/arts/time_stop_on.toml | h-time-stop.test.ts 指令级补测 | 已实装；指令级口上/测试补齐 | ✅ 已确认 |
| B2 | arts/time_stop | 4114 | time_stop_off | 时间重新流动 | 数据：h-time-stop；口上：talk-common-system | 有：behavior/arts/time_stop_off.toml | h-time-stop.test.ts 指令级补测 | 已实装；指令级口上/测试补齐 | ✅ 已确认 |
| B2 | arts/time_stop | 4115 | time_stop_off_in_h | 在H中取消时停 | 数据：h-time-stop；口上：talk-common-system | 有：behavior/arts/time_stop_off_in_h.toml | h-time-stop.test.ts 指令级补测 | 已实装；指令级口上/测试补齐 | ✅ 已确认 |
| B2 | arts/time_stop | 4005 | carry_target | 搬运对方 | 数据：h-time-stop；口上：talk-common-system | 有：behavior/arts/carry_target.toml | h-time-stop.test.ts 指令级补测 | 已实装；指令级口上/测试补齐 | ✅ 已确认 |
| B2 | arts/time_stop | 4006 | stop_carry_target | 停止搬运对方 | 数据：h-time-stop；口上：talk-common-system | 有：behavior/arts/stop_carry_target.toml | h-time-stop.test.ts 指令级补测 | 已实装；指令级口上/测试补齐 | ✅ 已确认 |
| B3 | obscenity/touch | 5002 | touch_head | 摸头 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/touch_head.toml | instruction-touch-trio.test.ts | 基础触摸试点 | ✅ 已确认 |
| B3 | obscenity/touch | 5003 | touch_breast | 摸胸 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/touch_breast.toml | instruction-touch-trio.test.ts | 含 tech_adjust 胸部 | ✅ 已确认 |
| B3 | obscenity/touch | 5004 | touch_buttocks | 摸屁股 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/touch_buttocks.toml | instruction-touch-trio.test.ts | 含欲情/屈服/苦痛 | ✅ 已确认 |
| B3 | obscenity/touch | 5012 | hand_in_hand | 牵手 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/hand_in_hand.toml | instruction-touch-rest.test.ts | 基础链 | ✅ 已确认 |
| B3 | obscenity/touch | 5013 | embrace | 拥抱 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/embrace.toml | instruction-touch-rest.test.ts | 基础链 | ✅ 已确认 |
| B3 | obscenity/touch | 5014 | kiss | 亲吻 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/kiss.toml | instruction-touch-rest.test.ts | first_kiss_check + 口喉 | ✅ 已确认 |
| B3 | obscenity/touch | 5015 | lap_pillow | 膝枕 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/lap_pillow.toml | instruction-touch-rest.test.ts | 需家具 | ✅ 已确认 |
| B3 | obscenity/touch | 5016 | raise_skirt | 掀起裙子 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/raise_skirt.toml | instruction-touch-rest.test.ts | 需穿裙；cloth_set_visible | ✅ 已确认 |
| B3 | obscenity/touch | 5024 | touch_clitoris | 阴蒂爱抚 | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/touch_clitoris.toml | instruction-touch-rest.test.ts | tech_adjust 阴蒂 | ✅ 已确认 |
| B3 | obscenity/touch | 5025 | touch_vagina | 手指插入（V） | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/touch_vagina.toml | instruction-touch-rest.test.ts | tech_adjust 阴道 | ✅ 已确认 |
| B3 | obscenity/touch | 5026 | touch_anus | 手指插入（A） | 数据：native-instructions；口上：talk-common-system | 有：behavior/obscenity/touch_anus.toml | instruction-touch-rest.test.ts | tech_adjust 后穴 | ✅ 已确认 |
| B4 | sex/base | 6001 | wait_5_min_in_h | 等待五分钟 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/wait_5_min_in_h.toml | instruction-sex-base-b.test.ts | 无其他 H 角色自动结束 H | ✅ 已确认 |
| B4 | sex/base | 6002 | h_end | 结束H | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/h_end.toml | instruction-sex-base-a.test.ts | h_end_h | ✅ 已确认 |
| B4 | sex/base | 6005 | unconscious_h_end | 结束无意识奸 | 数据：sleep-system；口上：talk-common-system | 有：behavior/sex/unconscious_h_end?（sleep-system 自带） | sleep-system.test.ts | 存量已实装 | ✅ 已确认 |
| B4 | sex/base | 6006 | hidden_sex_end | 结束隐奸 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/hidden_sex_end.toml | instruction-sex-base-a.test.ts | hidden_sex_clear + h_end_h | ✅ 已确认 |
| B4 | sex/base | 6007 | exhibitionism_sex_end | 结束露出 | 数据：h-exposure；口上：talk-common-system | 有：behavior/sex/exhibitionism_sex_end.toml（已有） | exposure-system.test.ts | 存量已实装 | ✅ 已确认 |
| B4 | sex/base | 6009 | undress | 脱衣服 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/undress.toml | instruction-sex-base-b.test.ts | 简化 cloth_remove_all | ✅ 已确认 |
| B4 | sex/base | 6010 | change_top_and_bottom | 交给对方 | 数据：h-npc-ai；口上：无（已有） | 有：behavior/sex/change_top_and_bottom.toml（h-npc-ai 自带） | h-npc-ai.test.ts | 存量已实装 | ✅ 已确认 |
| B4 | sex/base | 6011 | keep_enjoy | 继续享受 | 数据：h-npc-ai；口上：无（已有） | 有：behavior/sex/keep_enjoy.toml（h-npc-ai 自带） | h-npc-ai.test.ts | 存量已实装 | ✅ 已确认 |
| B4 | sex/base | 6012 | try_pl_active_h | 尝试掌握主动权 | 数据：h-npc-ai；口上：无（已有） | 有：behavior/sex/try_pl_active_h.toml（h-npc-ai 自带） | h-npc-ai.test.ts | 存量已实装 | ✅ 已确认 |
| B4 | sex/base | 6013 | orgasm_edge_on | 绝顶寸止 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/orgasm_edge_on.toml | instruction-sex-base-a.test.ts | orgasm_edge_on 效果 | ✅ 已确认 |
| B4 | sex/base | 6014 | orgasm_edge_off | 绝顶解放 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/orgasm_edge_off.toml | instruction-sex-base-a.test.ts | orgasm_edge_off 效果 | ✅ 已确认 |
| B4 | sex/base | 6019 | pull_out_penis | 拔出阴茎 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/pull_out_penis.toml | instruction-sex-base-b.test.ts | 简化清除插入部位 | ✅ 已确认 |
| B4 | sex/base | 6020 | stop_endure | 停止忍耐 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/stop_endure.toml | instruction-sex-base-b.test.ts | eja_climax force | ✅ 已确认 |
| B4-B7 | sex/drug | 6102 | philter | 媚药 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/philter.toml | instruction-philter.test.ts | judge_base=600；HAVE_PHILTER 修复为查自己背包数组 | ✅ 已确认 |
| B4-B7 | sex/drug | 6106 | sleeping_pills | 安眠药 | 数据：sleep-system；口上：talk-common-system | 有：behavior/sex/sleeping_pills.toml | instruction-sleeping-pills.test.ts | 新增 target_add_tired_to_sleep；疲劳/熟睡/body_item[9]/入睡 | ✅ 已确认 |
| B4-B7 | sex/drug | 6107 | clomid | 排卵促进药 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/clomid.toml | instruction-clomid.test.ts | 新增 target_add_ovulation_promoting_drug；HAVE_CLOMID 物品名修正 | ✅ 已确认 |
| B4-B7 | sex/drug | 6108 | birth_control_pills_before | 事前避孕药 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/birth_control_pills_before.toml | instruction-birth-control-pills.test.ts | 无 judge；target_add_contraceptive_before | ✅ 已确认 |
| B4-B7 | sex/drug | 6109 | birth_control_pills_after | 事后避孕药 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/birth_control_pills_after.toml | instruction-birth-control-pills.test.ts | 无 judge；target_add_contraceptive_after | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6201 | making_out | 身体爱抚 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/making_out.toml | instruction-foreplay-a.test.ts | 无 judge；tech_adjust 皮肤 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6203 | breast_caress | 胸爱抚 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/breast_caress.toml | instruction-foreplay-a.test.ts | 无 judge；tech_adjust 胸部 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6204 | twiddle_nipples | 玩弄乳头 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/twiddle_nipples.toml | instruction-foreplay-a.test.ts | 无 judge；tech_adjust 胸部 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6205 | breast_sucking | 舔吸乳头 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/breast_sucking.toml | instruction-foreplay-a.test.ts | 无 judge；tech_adjust 胸部；口经验 42 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6206 | clit_caress | 阴蒂爱抚 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/clit_caress.toml | instruction-foreplay-b.test.ts | 无 judge；tech_adjust 阴蒂 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6207 | open_labia | 掰开阴唇观察 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/open_labia.toml | instruction-foreplay-b.test.ts | 无 judge；tech_adjust 阴蒂 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6209 | cunnilingus | 舔阴 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/cunnilingus.toml | instruction-foreplay-b.test.ts | 无 judge；阴蒂+阴道；口经验 42 按源码重复 2 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6211 | finger_insertion | 手指插入(V) | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/finger_insertion.toml | instruction-foreplay-b.test.ts | 无 judge；快乐/羞耻/反感 + 阴道 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6213 | external_womb_massage | 体外子宫按摩 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/external_womb_massage.toml | instruction-foreplay-b.test.ts | 无 judge；duration=5；子宫快感 + 习得 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6208 | open_anus | 掰开肛门观察 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/open_anus.toml | instruction-foreplay-c.test.ts | 无 judge；后穴 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6210 | lick_anal | 舔肛 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/lick_anal.toml | instruction-foreplay-c.test.ts | 无 judge；后穴；口经验 42 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6212 | anal_caress | 手指插入(A) | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/anal_caress.toml | instruction-foreplay-c.test.ts | 无 judge；羞耻/恐怖/反感 + 后穴 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6215 | make_masturebate | 命令对方自慰 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/make_masturebate.toml | instruction-foreplay-d.test.ts | 无 judge；T_NORMAL_5_6 新增；自慰状态链 | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6216 | make_lick_anal | 命令对方舔自己肛门 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/make_lick_anal.toml | instruction-foreplay-d.test.ts | 无 judge；口喉 + pl_p_adjust；新增 TARGET_NOT_GAG / T_NORMAL_5_6_OR… | ✅ 已确认 |
| B4-B7 | sex/foreplay | 6202 | kiss_h | 接吻 | 数据：native-instructions；口上：talk-common-system | 有：behavior/sex/kiss_h.toml | instruction-kiss-h.test.ts | judge 亲吻 250；first_kiss_check；840 取消口/脸插入；经验 40/153 | ✅ 已确认 |

## 存量已实现（🟡，未走本流程 / 待补口上 / 待核对）

| 批次 | 分类/子类 | cid | id | 名称 | 所属系统 | 通用口上 | 测试 | 特殊处理 | 状态 |
|------|-----------|-----|-----|------|----------|----------|------|----------|------|

| B3 | obscenity/exposure | 5054 | ask_exhibitionism_sex | 邀请露出 | 数据：h-exposure | 无（待核对） | 待核对 | 已实装（exposure 系统） | 🟡 待补口上/核对 |

---

## 维护提示

- 复刻完成 + 用户确认后：把该行从“待完成/待筛”心智移到本表，状态改为 ✅；同屏更新 `batch-01-daily.md` 状态列。
- 筛选后：`filter-quick-reference.md` 的筛选结论列同步更新，被剔除条目原因留底。
- 涉及口上世界观占位符时，登记占位符条数（如「XX 指令通用口上 1-5」），原文对照保存在批次清单。
