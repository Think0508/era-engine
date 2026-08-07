# L1.6 指令复刻 · 保留清单（批次工作副本）

> 从 `instruction-master-list.md`（留底版，全量 404 条含砍掉/延后）中筛选出「保留」条目，共 **228 条**。
> 后续批次（B1 daily / B2 obscenity / B3-B6 sex 等）以此清单为工作依据；砍掉 94 / 延后 82 条见留底版。
> 2026-08-07：用户复筛调整后由脚本生成。

## 统计总览

| 分类 | 保留 |
|------|------|
| SYSTEM | 8 |
| DAILY | 17 |
| WORK | 2 |
| PLAY | 5 |
| ARTS | 17 |
| OBSCENITY | 37 |
| SEX/base | 17 |
| SEX/drug | 5 |
| SEX/foreplay | 15 |
| SEX/insert | 58 |
| SEX/item | 21 |
| SEX/sm | 11 |
| SEX/wait_upon | 15 |
| SEX 小计 | 142 |
| **合计** | **228** |

## 分类明细

### SYSTEM（保留 8）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 1 | move | 移动 | SYSTEM | 保留 | 核心移动指令 |
| 2 | see_attr | 查看属性 | SYSTEM | 保留 | 通用 |
| 3 | item | 道具 | SYSTEM | 保留 | 通用背包 |
| 5 | target_to_self | 对自己交互 | SYSTEM | 保留 | 通用 |
| 8 | save | 读写存档 | SYSTEM | 保留 | 通用 |
| 9 | abl_up | 提升能力 | SYSTEM | 保留 | 通用 |
| 10 | owner_abl_up | 提升自身能力 | SYSTEM | 保留 | 通用 |
| 11 | system_setting | 系统设置 | SYSTEM | 保留 | 通用 |

### DAILY（保留 17）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 1004 | chat | 聊天 | DAILY | 保留 | 通用 |
| 1005 | stroke | 身体接触 | DAILY | 保留 | 通用 |
| 1009 | make_food | 做饭 | DAILY | 保留 | IN_KITCHEN → tag has_kitchen |
| 1010 | eat | 进食 | DAILY | 保留 | 通用（HAVE_FOOD） |
| 1011 | put_selfmade_food_in | 放入正常食物 | DAILY | 保留 | 源码查证=将自制食物放入食堂（food_shop_panel.py:22），食物系统 |
| 1012 | rest | 休息 | DAILY | 保留 | 通用 |
| 1014 | sleep | 睡觉 | DAILY | 保留 | 核心（特殊耗时：跨天跳转，批次时处理） |
| 1015 | take_shower | 淋浴 | DAILY | 保留 | 通用 |
| 1016 | buy_h_item | 购买成人用品 | DAILY | 保留 | IN_H_SHOP → tag has_h_shop |
| 1017 | buy_food | 购买食物 | DAILY | 保留 | 通用 |
| 1018 | all_npc_position | 干员位置一览 | DAILY | 保留 | 功能通用（角色位置一览，去方舟命名），见审阅 #3 |
| 1019 | follow | 邀请同行 | DAILY | 保留 | 通用 |
| 1020 | end_follow | 结束同行 | DAILY | 保留 | 通用 |
| 1021 | ask_target_rest | 让对方休息 | DAILY | 保留 | 通用 |
| 1022 | ask_target_sleep | 让对方去睡觉 | DAILY | 保留 | 通用 |
| 1023 | apologize | 道歉 | DAILY | 保留 | 通用 |
| 1024 | listen_complaint | 听牢骚 | DAILY | 保留 | 通用 |

### WORK（保留 2）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 2025 | plant_manage_crop | 种植与养护作物 | WORK | 保留 | spec §4 保留清单（并入 daily） |
| 2036 | mixology | 调酒 | WORK | 保留 | spec §4 保留清单（并入 daily，IN_BAR → tag） |

### PLAY（保留 5）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 3001 | singing | 唱歌 | PLAY | 保留 | spec B1 通用（并入 daily） |
| 3002 | play_instrument | 演奏乐器 | PLAY | 保留 | 通用 |
| 3005 | exercise | 锻炼身体 | PLAY | 保留 | 通用（IN_GYM_ROOM → tag has_gym） |
| 3007 | read_book | 读书 | PLAY | 保留 | spec B1 通用（并入 daily） |
| 3012 | play_chess | 下棋 | PLAY | 保留 | spec B1 通用 |

### ARTS（保留 17）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 4001 | hypnosis_one | 单人催眠 | ARTS | 保留 | system:hypnosis（spec §4：ARTS 归 H 插件 tag） |
| 4002 | deepening_hypnosis | 加深催眠 | ARTS | 保留 | system:hypnosis |
| 4003 | hypnosis_all | 集体催眠 | ARTS | 保留 | system:hypnosis |
| 4004 | hypnosis_cancel | 解除催眠 | ARTS | 保留 | system:hypnosis |
| 4005 | carry_target | 搬运对方 | ARTS | 保留 | system:time_stop |
| 4006 | stop_carry_target | 停止搬运对方 | ARTS | 保留 | system:time_stop |
| 4101 | change_hypnosis_mode | 切换催眠模式 | ARTS | 保留 | system:hypnosis |
| 4102 | hypnosis_increase_body_sensitivity | 体控-敏感度提升 | ARTS | 保留 | system:hypnosis |
| 4103 | hypnosis_force_climax | 体控-强制高潮 | ARTS | 保留 | system:hypnosis |
| 4104 | hypnosis_force_ovulation | 体控-强制排卵 | ARTS | 保留 | system:hypnosis（排卵/妊娠已实现） |
| 4105 | hypnosis_blockhead | 体控-木头人 | ARTS | 保留 | system:hypnosis |
| 4106 | hypnosis_active_h | 体控-逆推 | ARTS | 保留 | system:hypnosis |
| 4107 | hypnosis_roleplay | 心控-角色扮演 | ARTS | 保留 | system:hypnosis |
| 4108 | hypnosis_pain_as_pleasure | 心控-苦痛快感化 | ARTS | 保留 | system:hypnosis |
| 4113 | time_stop_on | 时间停止流动 | ARTS | 保留 | system:time_stop |
| 4114 | time_stop_off | 时间重新流动 | ARTS | 保留 | system:time_stop |
| 4115 | time_stop_off_in_h | 在H中取消时停 | ARTS | 保留 | system:time_stop |

### OBSCENITY（保留 37）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 5002 | touch_head | 摸头 | OBSCENITY | 保留 | 通用 |
| 5003 | touch_breast | 摸胸 | OBSCENITY | 保留 | 通用 |
| 5004 | touch_buttocks | 摸屁股 | OBSCENITY | 保留 | 通用 |
| 5012 | hand_in_hand | 牵手 | OBSCENITY | 保留 | 通用 |
| 5013 | embrace | 拥抱 | OBSCENITY | 保留 | 通用 |
| 5014 | kiss | 亲吻 | OBSCENITY | 保留 | 通用 |
| 5015 | lap_pillow | 膝枕 | OBSCENITY | 保留 | 通用 |
| 5016 | raise_skirt | 掀起裙子 | OBSCENITY | 保留 | 通用 |
| 5017 | ask_for_pan | 索要内裤 | OBSCENITY | 保留 | 前提 COLLECT_BONUS_102 依赖收藏系统（已砍，handle_premise_other.py:728 查证），批次时移除改好感度门槛，见审阅 #5 |
| 5019 | invite_to_bath | 一起洗澡 | OBSCENITY | 保留 | IN_BATHROOM → tag has_bathroom |
| 5020 | steal_pan | 偷走内裤 | OBSCENITY | 保留 | 通用 |
| 5022 | steal_scene_all_pan | 偷走所有人内裤 | OBSCENITY | 保留 | 通用（睡眠/无意识前提，L1.7 睡眠已规划） |
| 5024 | touch_clitoris | 阴蒂爱抚 | OBSCENITY | 保留 | 通用 |
| 5025 | touch_vagina | 手指插入（V） | OBSCENITY | 保留 | 通用 |
| 5026 | touch_anus | 手指插入（A） | OBSCENITY | 保留 | 通用 |
| 5027 | milk | 挤奶 | OBSCENITY | 保留 | 泌乳已实现（spec §12） |
| 5028 | remote_toy_on | 遥控启动玩具 | OBSCENITY | 保留 | 玩具系统 |
| 5029 | remote_toy_off | 遥控关闭玩具 | OBSCENITY | 保留 | 玩具系统 |
| 5030 | remote_toy_level_up | 调高玩具档位 | OBSCENITY | 保留 | 玩具系统 |
| 5031 | remote_toy_level_down | 降低玩具档位 | OBSCENITY | 保留 | 玩具系统 |
| 5032 | remote_toy_all_off | 遥控关闭全员玩具 | OBSCENITY | 保留 | 玩具系统 |
| 5033 | remote_all_set_sex_toy_weak | 全员玩具调到弱档 | OBSCENITY | 保留 | 玩具系统 |
| 5034 | remote_all_set_sex_toy_medium | 全员玩具调到中档 | OBSCENITY | 保留 | 玩具系统 |
| 5035 | remote_all_set_sex_toy_strong | 全员玩具调到强档 | OBSCENITY | 保留 | 玩具系统 |
| 5045 | sleep_obscenity | 睡眠猥亵 | OBSCENITY | 保留 | 睡眠系统已规划（L1.7，T_ACTION_SLEEP） |
| 5046 | stop_sleep_obscenity | 停止睡眠猥亵 | OBSCENITY | 保留 | 同上 |
| 5047 | do_h | 邀请H | OBSCENITY | 保留 | 核心 |
| 5049 | do_h_in_bathroom | 邀请在浴室H | OBSCENITY | 保留 | IN_BATHROOM → tag has_bathroom |
| 5052 | unconscious_h | 无意识奸 | OBSCENITY | 保留 | 睡眠/无意识状态（L1.7 已规划） |
| 5053 | ask_hidden_sex | 邀请隐奸 | OBSCENITY | 保留 | system:hidden |
| 5054 | ask_exhibitionism_sex | 邀请露出 | OBSCENITY | 保留 | system:hidden |
| 5055 | ask_group_sex | 邀请群交 | OBSCENITY | 保留 | system:group_sex |
| 5101 | remote_toy_level_down_in_h | 降低玩具档位 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5102 | remote_toy_all_off_in_h | 遥控关闭全员玩具 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5103 | remote_all_set_sex_toy_weak_in_h | 全员玩具调到弱档 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5104 | remote_all_set_sex_toy_medium_in_h | 全员玩具调到中档 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5105 | remote_all_set_sex_toy_strong_in_h | 全员玩具调到强档 | OBSCENITY | 保留 | 玩具系统（H 内版） |

### SEX/base（保留 17）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6001 | wait_5_min_in_h | 等待五分钟 | SEX/base | 保留 | H 内等待（特殊耗时 wait=5） |
| 6002 | h_end | 结束H | SEX/base | 保留 | 核心 |
| 6005 | unconscious_h_end | 结束无意识奸 | SEX/base | 保留 | 睡眠/无意识系统 |
| 6006 | hidden_sex_end | 结束隐奸 | SEX/base | 保留 | system:hidden |
| 6007 | exhibitionism_sex_end | 结束露出 | SEX/base | 保留 | system:hidden |
| 6008 | group_sex_end | 结束群交 | SEX/base | 保留 | system:group_sex |
| 6009 | undress | 脱衣服 | SEX/base | 保留 | 服装系统（L1.4） |
| 6010 | change_top_and_bottom | 交给对方 | SEX/base | 保留 | 源码查证=将 H 主导权交给 NPC（handle_instruct.py:3180），批次评估 npc_active_h，见审阅 #9 |
| 6011 | keep_enjoy | 继续享受 | SEX/base | 保留 | H 内 NPC 主导（handle_instruct.py:3189 查证） |
| 6012 | try_pl_active_h | 尝试掌握主动权 | SEX/base | 保留 | H 内主导权切换（handle_instruct.py:3195 查证） |
| 6013 | orgasm_edge_on | 绝顶寸止 | SEX/base | 保留 | 已实现（spec §12） |
| 6014 | orgasm_edge_off | 绝顶解放 | SEX/base | 保留 | 已实现（spec §12） |
| 6015 | run_group_sex_temple | 进行一次当前群交 | SEX/base | 保留 | system:group_sex |
| 6016 | run_all_group_sex_temple | 进行一次轮流群交 | SEX/base | 保留 | system:group_sex |
| 6017 | edit_group_sex_temple | 编辑群交行动 | SEX/base | 保留 | system:group_sex |
| 6019 | pull_out_penis | 拔出阴茎 | SEX/base | 保留 | 核心 |
| 6020 | stop_endure | 停止忍耐 | SEX/base | 保留 | 射精忍耐已实现（spec §12） |

### SEX/drug（保留 5）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6102 | philter | 媚药 | SEX/drug | 保留 | 通用药物 |
| 6106 | sleeping_pills | 安眠药 | SEX/drug | 保留 | 睡眠系统（L1.7） |
| 6107 | clomid | 排卵促进药 | SEX/drug | 保留 | 排卵/妊娠已实现（spec §12） |
| 6108 | birth_control_pills_before | 事前避孕药 | SEX/drug | 保留 | 有 handler（handle_instruct.py:2719 查证） |
| 6109 | birth_control_pills_after | 事后避孕药 | SEX/drug | 保留 | 有 handler（handle_instruct.py:2725 查证） |

### SEX/foreplay（保留 15）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6201 | making_out | 身体爱抚 | SEX/foreplay | 保留 | 通用 |
| 6202 | kiss_h | 接吻 | SEX/foreplay | 保留 | 通用 |
| 6203 | breast_caress | 胸爱抚 | SEX/foreplay | 保留 | 通用 |
| 6204 | twiddle_nipples | 玩弄乳头 | SEX/foreplay | 保留 | 通用 |
| 6205 | breast_sucking | 舔吸乳头 | SEX/foreplay | 保留 | 通用 |
| 6206 | clit_caress | 阴蒂爱抚 | SEX/foreplay | 保留 | 通用 |
| 6207 | open_labia | 掰开阴唇观察 | SEX/foreplay | 保留 | 通用 |
| 6208 | open_anus | 掰开肛门观察 | SEX/foreplay | 保留 | 通用 |
| 6209 | cunnilingus | 舔阴 | SEX/foreplay | 保留 | 通用 |
| 6210 | lick_anal | 舔肛 | SEX/foreplay | 保留 | 通用 |
| 6211 | finger_insertion | 手指插入(V) | SEX/foreplay | 保留 | 通用 |
| 6212 | anal_caress | 手指插入(A) | SEX/foreplay | 保留 | 通用 |
| 6213 | external_womb_massage | 体外子宫按摩 | SEX/foreplay | 保留 | 通用 |
| 6215 | make_masturebate | 命令对方自慰 | SEX/foreplay | 保留 | 通用 |
| 6216 | make_lick_anal | 命令对方舔自己肛门 | SEX/foreplay | 保留 | 通用 |

### SEX/insert（保留 58）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6301 | vaginal_sex | 阴道性交 | SEX/insert | 保留 | 核心 |
| 6302 | change_vaginal_sex_position | 换阴道性交体位 | SEX/insert | 保留 | 体位切换 |
| 6303 | normal_sex | 正常位 | SEX/insert | 保留 | 体位 |
| 6304 | back_sex | 背后位 | SEX/insert | 保留 | 体位 |
| 6305 | riding_sex | 对面骑乘位 | SEX/insert | 保留 | 体位 |
| 6306 | back_riding_sex | 背面骑乘位 | SEX/insert | 保留 | 体位 |
| 6307 | face_seat_sex | 对面座位 | SEX/insert | 保留 | 体位 |
| 6308 | back_seat_sex | 背面座位 | SEX/insert | 保留 | 体位 |
| 6309 | face_stand_sex | 对面立位 | SEX/insert | 保留 | 体位 |
| 6310 | back_stand_sex | 背面立位 | SEX/insert | 保留 | 体位 |
| 6311 | face_hug_sex | 对面抱位 | SEX/insert | 保留 | 体位 |
| 6312 | back_hug_sex | 背面抱位 | SEX/insert | 保留 | 体位 |
| 6313 | face_lay_sex | 对面卧位 | SEX/insert | 保留 | 体位 |
| 6314 | back_lay_sex | 背面卧位 | SEX/insert | 保留 | 体位 |
| 6315 | stimulate_g_point | 刺激G点 | SEX/insert | 保留 | 通用 |
| 6316 | womb_os_caress | 玩弄子宫口 | SEX/insert | 保留 | 通用 |
| 6318 | change_cervix_sex_position | 换子宫姦口体位 | SEX/insert | 保留 | 体位切换 |
| 6319 | normal_cervix_sex | 正常位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6320 | back_cervix_sex | 后背位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6321 | riding_cervix_sex | 对面骑乘位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6322 | back_riding_cervix_sex | 背面骑乘位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6323 | face_seat_cervix_sex | 对面座位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6324 | back_seat_cervix_sex | 背面座位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6325 | face_stand_cervix_sex | 对面立位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6326 | back_stand_cervix_sex | 背面立位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6327 | face_hug_cervix_sex | 对面抱位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6328 | back_hug_cervix_sex | 背面抱位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6329 | face_lay_cervix_sex | 对面卧位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6330 | back_lay_cervix_sex | 背面卧位子宫口姦 | SEX/insert | 保留 | 体位 |
| 6332 | change_womb_sex_position | 换子宫姦体位 | SEX/insert | 保留 | 体位切换 |
| 6333 | normal_womb_sex | 正常位子宫姦 | SEX/insert | 保留 | 体位 |
| 6334 | back_womb_sex | 后背位子宫姦 | SEX/insert | 保留 | 体位 |
| 6335 | riding_womb_sex | 对面骑乘位子宫姦 | SEX/insert | 保留 | 体位 |
| 6336 | back_riding_womb_sex | 背面骑乘位子宫姦 | SEX/insert | 保留 | 体位 |
| 6337 | face_seat_womb_sex | 对面座位子宫姦 | SEX/insert | 保留 | 体位 |
| 6338 | back_seat_womb_sex | 背面座位子宫姦 | SEX/insert | 保留 | 体位 |
| 6339 | face_stand_womb_sex | 对面立位子宫姦 | SEX/insert | 保留 | 体位 |
| 6340 | back_stand_womb_sex | 背面立位子宫姦 | SEX/insert | 保留 | 体位 |
| 6341 | face_hug_womb_sex | 对面抱位子宫姦 | SEX/insert | 保留 | 体位 |
| 6342 | back_hug_womb_sex | 背面抱位子宫姦 | SEX/insert | 保留 | 体位 |
| 6343 | face_lay_womb_sex | 对面卧位子宫姦 | SEX/insert | 保留 | 体位 |
| 6344 | back_lay_womb_sex | 背面卧位子宫姦 | SEX/insert | 保留 | 体位 |
| 6345 | anal_sex | 肛门性交 | SEX/insert | 保留 | 核心 |
| 6346 | change_anal_sex_position | 换肛交体位 | SEX/insert | 保留 | 体位切换 |
| 6347 | normal_anal_sex | 正常位肛交 | SEX/insert | 保留 | 体位 |
| 6348 | back_anal_sex | 后背位肛交 | SEX/insert | 保留 | 体位 |
| 6349 | riding_anal_sex | 对面骑乘位肛交 | SEX/insert | 保留 | 体位 |
| 6350 | back_riding_anal_sex | 背面骑乘位肛交 | SEX/insert | 保留 | 体位 |
| 6351 | face_seat_anal_sex | 对面座位肛交 | SEX/insert | 保留 | 体位 |
| 6352 | back_seat_anal_sex | 背面座位肛交 | SEX/insert | 保留 | 体位 |
| 6353 | face_stand_anal_sex | 对面立位肛交 | SEX/insert | 保留 | 体位 |
| 6354 | back_stand_anal_sex | 背面立位肛交 | SEX/insert | 保留 | 体位 |
| 6355 | face_hug_anal_sex | 对面抱位肛交 | SEX/insert | 保留 | 体位 |
| 6356 | back_hug_anal_sex | 背面抱位肛交 | SEX/insert | 保留 | 体位 |
| 6357 | face_lay_anal_sex | 对面卧位肛交 | SEX/insert | 保留 | 体位 |
| 6358 | back_lay_anal_sex | 背面卧位肛交 | SEX/insert | 保留 | 体位 |
| 6359 | stimulate_sigmoid_colon | 玩弄s状结肠 | SEX/insert | 保留 | 通用 |
| 6360 | stimulate_vagina | 隔着刺激阴道 | SEX/insert | 保留 | 通用 |

### SEX/item（保留 21）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6401 | body_lubricant | 润滑液 | SEX/item | 保留 | 通用 |
| 6402 | put_condom | 戴上避孕套 | SEX/item | 保留 | 通用 |
| 6403 | take_condom_out | 摘掉避孕套 | SEX/item | 保留 | 通用 |
| 6405 | nipples_love_egg | 乳头跳蛋 | SEX/item | 保留 | 玩具系统 |
| 6406 | nipple_clamp_on | 戴上乳头夹 | SEX/item | 保留 | 玩具系统 |
| 6407 | nipple_clamp_off | 取下乳头夹 | SEX/item | 保留 | 玩具系统 |
| 6408 | clit_love_egg | 阴蒂跳蛋 | SEX/item | 保留 | 玩具系统 |
| 6409 | clit_clamp_on | 戴上阴蒂夹 | SEX/item | 保留 | 玩具系统 |
| 6410 | clit_clamp_off | 取下阴蒂夹 | SEX/item | 保留 | 玩具系统 |
| 6411 | electric_message_stick | 电动按摩棒 | SEX/item | 保留 | 玩具系统 |
| 6412 | vibrator_insertion | 插入震动棒 | SEX/item | 保留 | 玩具系统 |
| 6415 | vibrator_insertion_off | 拔出震动棒 | SEX/item | 保留 | 玩具系统 |
| 6416 | vibrator_insertion_anal | 肛门插入震动棒 | SEX/item | 保留 | 玩具系统 |
| 6419 | vibrator_insertion_anal_off | 拔出肛门震动棒 | SEX/item | 保留 | 玩具系统 |
| 6420 | anal_beads | 塞入肛门拉珠 | SEX/item | 保留 | 玩具系统 |
| 6421 | anal_beads_off | 拔出肛门拉珠 | SEX/item | 保留 | 玩具系统 |
| 6422 | milking_machine_on | 装上搾乳机 | SEX/item | 保留 | 泌乳已实现；IN_HUMILIATION_ROOM_OR_DR_ROOM → tag has_humiliation_room |
| 6423 | milking_machine_off | 取下搾乳机 | SEX/item | 保留 | 同上 |
| 6426 | remote_toy_on_in_h | 遥控启动玩具 | SEX/item | 保留 | 玩具系统（H 内版） |
| 6427 | remote_toy_off_in_h | 遥控关闭玩具 | SEX/item | 保留 | 玩具系统（H 内版） |
| 6428 | remote_toy_level_up_in_h | 调高玩具档位 | SEX/item | 保留 | 玩具系统（H 内版） |

### SEX/sm（保留 11）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6502 | spanking | 打屁股 | SEX/sm | 保留 | 通用 |
| 6503 | bondage | 绳艺 | SEX/sm | 保留 | system:bondage |
| 6504 | patch_on | 戴上眼罩 | SEX/sm | 保留 | 通用（IN_HUMILIATION_ROOM → tag） |
| 6505 | patch_off | 摘下眼罩 | SEX/sm | 保留 | 同上 |
| 6506 | gag_on | 戴上口球 | SEX/sm | 保留 | 通用 |
| 6507 | gag_off | 摘下口球 | SEX/sm | 保留 | 通用 |
| 6508 | clyster | 灌肠 | SEX/sm | 保留 | 通用（IN_HUMILIATION_ROOM → tag） |
| 6509 | continue_clyster | 继续灌肠 | SEX/sm | 保留 | 同上 |
| 6511 | clyster_end | 拔出肛塞 | SEX/sm | 保留 | 灌肠结束 |
| 6512 | safe_candles | 滴蜡 | SEX/sm | 保留 | 通用 |
| 6513 | whip | 鞭子 | SEX/sm | 保留 | 通用 |

### SEX/wait_upon（保留 15）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6601 | handjob | 手交 | SEX/wait_upon | 保留 | 通用（无 judge，SOP §6 已注明） |
| 6602 | blowjob | 口交 | SEX/wait_upon | 保留 | 通用 |
| 6603 | paizuri | 乳交 | SEX/wait_upon | 保留 | 通用 |
| 6604 | footjob | 足交 | SEX/wait_upon | 保留 | 通用 |
| 6605 | hairjob | 发交 | SEX/wait_upon | 保留 | 通用 |
| 6606 | axillajob | 腋交 | SEX/wait_upon | 保留 | 通用 |
| 6607 | rub_buttock | 素股 | SEX/wait_upon | 保留 | 通用 |
| 6608 | hand_blowjob | 手交口交 | SEX/wait_upon | 保留 | 通用 |
| 6609 | tits_blowjob | 乳交口交 | SEX/wait_upon | 保留 | 通用 |
| 6610 | focus_blowjob | 真空口交 | SEX/wait_upon | 保留 | 通用 |
| 6611 | deep_throat | 深喉插入 | SEX/wait_upon | 保留 | 通用 |
| 6612 | clean_blowjob | 清洁口交 | SEX/wait_upon | 保留 | 通用（精液系统已实现） |
| 6613 | sixty_nine | 六九式 | SEX/wait_upon | 保留 | 通用 |
| 6614 | legjob | 腿交 | SEX/wait_upon | 保留 | 通用 |
| 6616 | face_rub | 阴茎蹭脸 | SEX/wait_upon | 保留 | 通用 |
