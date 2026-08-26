# 指令复刻 · 筛选速查表（Filter Quick Reference）

> 维护规则：每批筛选后即时更新。**状态由本表唯一提供**，查“某指令原本有没有、筛选后剩没剩、为什么去掉”都看这里，不靠 AI 翻代码。
> 配套：`instruction-master-list.md`（全量 404 留底）· `instruction-keep-list.md`（全局保留 228）· `completed-instructions.md`（完成表）。
> 筛选结论列：`保留`（待逐条下令复刻）/ `延后`（依赖系统未实装或暂缓）/ `剔除`（仅方舟世界观专属等真正不做）/ `存疑`（待定）/ `已完成`。

---

## B1 候选池（DAILY 17 + WORK 2 + PLAY 5 = 24）

> 2026-08-??：AI 预筛 + 用户手动复审后的当前状态。
> 筛选口径（用户明确）：**只有方舟世界观专属才算“剔除”**；因对应系统未实装而暂不能做的，一律归“延后”，不是剔除。
> 用户恢复：follow / end_follow（同行系统属通用原生）。
> 用户延后：make_food / singing / play_instrument / read_book / play_chess，以及系统未实装的 7 条（见下）。
> 用户延后：exercise（已查证：通用身体锻炼/体力气力上限成长，但依赖 has_gym 地点系统，待地点系统完善后再做）。

| 批次 | 分类 | 所属系统 | cid | id | 名称 | 筛选结论 | 延后/剔除原因 |
|---|---|---|---|---|---|---|---|
| B1 | daily | 通用（数据在 native-instructions） | 1004 | chat | 聊天 | 已完成 | — |
| B1 | daily | 通用 | 1005 | stroke | 身体接触 | 已完成 | — |
| B1 | daily | 食物/烹饪系统 | 1009 | make_food | 做饭 | 延后（用户） | 烹饪系统相关，暂缓 |
| B1 | daily | 食物背包系统 | 1010 | eat | 食物背包 | 延后（系统未实装） | 依赖食物背包系统 |
| B1 | daily | 食物存储系统 | 1011 | put_selfmade_food_in | 放入正常食物 | 延后（系统未实装） | 依赖食物存储系统 |
| B1 | daily | 睡眠/恢复系统（从 test-mod 迁入 native-instructions） | 1012 | rest | 休息 | 已完成 | 保留有意区别（recover_permil 恢复，不搬 21/325/1751） |
| B1 | daily | 睡眠系统（已实装，缺口上） | 1014 | sleep | 睡觉 | 已完成 | 已实装，补口上 |
| B1 | daily | 淋浴/清洁系统 | 1015 | take_shower | 淋浴 | 已完成 | — |
| B1 | daily | 商店系统 | 1016 | buy_h_item | 购买成人用品 | 延后（系统未实装） | 依赖商店系统 |
| B1 | daily | 商店系统 | 1017 | buy_food | 购买食物 | 延后（系统未实装） | 依赖商店系统 |
| B1 | daily | 地图/角色位置面板 | 1018 | all_npc_position | 角色位置一览 | 延后（系统未实装） | 依赖地图/位置面板 |
| B1 | daily | 跟随系统（用户确认属通用原生） | 1019 | follow | 邀请同行 | 已完成 | — |
| B1 | daily | 跟随系统（用户确认属通用原生） | 1020 | end_follow | 结束同行 | 已完成 | — |
| B1 | daily | NPC AI 行为系统 | 1021 | ask_target_rest | 让对方休息 | 已完成 | — |
| B1 | daily | NPC AI 行为系统（已实装） | 1022 | ask_target_sleep | 让对方去睡觉 | 已完成 | 已实装，erArk 无口上 |
| B1 | daily | 通用（成败双链） | 1023 | apologize | 道歉 | 已完成 | — |
| B1 | daily | 通用 | 1024 | listen_complaint | 听牢骚 | 已完成 | — |
| B1 | work | 种植/农场系统 | 2025 | plant_manage_crop | 种植与养护作物 | 延后（系统未实装） | 依赖种植/农场系统 |
| B1 | work | 调酒/饮品系统 | 2036 | mixology | 调酒 | 延后（系统未实装） | 依赖调酒/饮品系统，口上待核对 |
| B1 | play | 副职业·音乐 | 3001 | singing | 唱歌 | 延后（用户） | 涉及副职业音乐系统，较细 |
| B1 | play | 副职业·音乐 | 3002 | play_instrument | 演奏乐器 | 延后（用户） | 涉及副职业音乐系统，较细 |
| B1 | play | 锻炼/属性成长 | 3005 | exercise | 锻炼身体 | 延后（用户，查证后） | 通用锻炼/上限成长，依赖 has_gym 地点系统 |
| B1 | play | 读书/知识 | 3007 | read_book | 读书 | 延后（用户） | 较细 |
| B1 | play | 棋类娱乐 | 3012 | play_chess | 下棋 | 延后（用户） | 较细 |

**本批统计（当前）**：原 24 → 已完成 11（1004/1005/1012/1015/1014/1022/1019/1020/1024/1023/1021）→ 保留（待下令）0 → 延后 13（1009/1010/1011/1016/1017/1018/2025/2036/3001/3002/3005/3007/3012）→ 存疑 0 → **剔除 0**（B1 无方舟世界观专属指令；世界观口上内容按批次决策处理：chat 占位 / stroke 移除，均不保留原文）。

---

## B2 候选池（ARTS 17）

> 2026-08-25：进入 B2 筛选流程。统计：原 17 → 已完成 5（时停）→ 时停 5（已完成）→ 催眠 12（延后，用户：后续 grill）→ 剔除 0。
> 筛选口径沿用 B1：**只有方舟世界观专属才算剔除**；系统未实装/暂缓归延后；用户最终筛选。

| 批次 | 分类 | 所属系统 | cid | id | 名称 | 筛选结论 | 延后/剔除原因 |
|---|---|---|---|---|---|---|---|
| B2 | arts/hypnosis | h-hypnosis | 4001 | hypnosis_one | 单人催眠 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4002 | deepening_hypnosis | 加深催眠 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4003 | hypnosis_all | 集体催眠 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4004 | hypnosis_cancel | 解除催眠 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/time_stop | h-time-stop（已实装） | 4005 | carry_target | 搬运对方 | 已完成 | 已实装 |
| B2 | arts/time_stop | h-time-stop（已实装） | 4006 | stop_carry_target | 停止搬运对方 | 已完成 | 已实装 |
| B2 | arts/hypnosis | h-hypnosis | 4101 | change_hypnosis_mode | 切换催眠模式 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4102 | hypnosis_increase_body_sensitivity | 体控-敏感度提升 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4103 | hypnosis_force_climax | 体控-强制高潮 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4104 | hypnosis_force_ovulation | 体控-强制排卵 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4105 | hypnosis_blockhead | 体控-木头人 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4106 | hypnosis_active_h | 体控-逆推 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4107 | hypnosis_roleplay | 心控-角色扮演 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/hypnosis | h-hypnosis | 4108 | hypnosis_pain_as_pleasure | 心控-苦痛快感化 | 延后（用户：后续 grill） | 催眠系统需后续细 grill |
| B2 | arts/time_stop | h-time-stop（已实装） | 4113 | time_stop_on | 时间停止流动 | 已完成 | 已实装 |
| B2 | arts/time_stop | h-time-stop（已实装） | 4114 | time_stop_off | 时间重新流动 | 已完成 | 已实装 |
| B2 | arts/time_stop | h-time-stop（已实装） | 4115 | time_stop_off_in_h | 在H中取消时停 | 已完成 | 已实装 |

## B3 候选池（OBSCENITY 37）

> 2026-08-25：进入 B3 筛选流程。统计：原 37 → 基础已完成 11（5002-5016/5024-5026）→ 延后 25（5017/5020 + 其余依赖类 23，用户：后续再看）→ 剔除 1（5027）。
> 筛选口径沿用 B1/B2：**只有方舟世界观专属才算剔除**；系统未实装/暂缓归延后；用户最终筛选。

| 批次 | 分类 | 所属系统 | cid | id | 名称 | 筛选结论 | 延后/剔除原因 |
|---|---|---|---|---|---|---|---|
| B3 | obscenity | h-core | 5002 | touch_head | 摸头 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5003 | touch_breast | 摸胸 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5004 | touch_buttocks | 摸屁股 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5012 | hand_in_hand | 牵手 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5013 | embrace | 拥抱 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5014 | kiss | 亲吻 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5015 | lap_pillow | 膝枕 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5016 | raise_skirt | 掀起裙子 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5017 | ask_for_pan | 索要内裤 | 延后（用户） | 收藏系统可能加回，先延后 |
| B3 | obscenity | h-core | 5019 | invite_to_bath | 一起洗澡 | 延后（用户：暂缓，后续再看） | 位置 has_bathroom |
| B3 | obscenity | h-core | 5020 | steal_pan | 偷走内裤 | 延后（用户） | 同索要内裤，收藏系统相关 |
| B3 | obscenity | h-core | 5022 | steal_scene_all_pan | 偷走所有人内裤 | 延后（用户：暂缓，后续再看） | 睡眠/无意识前提 |
| B3 | obscenity | h-core | 5024 | touch_clitoris | 阴蒂爱抚 | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5025 | touch_vagina | 手指插入（V） | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5026 | touch_anus | 手指插入（A） | 已完成（待确认） | — |
| B3 | obscenity | h-core | 5027 | milk | 挤奶 | 剔除（用户） | 用户明确不做 |
| B3 | obscenity | h-toy/remote | 5028 | remote_toy_on | 遥控启动玩具 | 延后（用户：暂缓，后续再看） | 玩具系统 |
| B3 | obscenity | h-toy/remote | 5029 | remote_toy_off | 遥控关闭玩具 | 延后（用户：暂缓，后续再看） | 玩具系统 |
| B3 | obscenity | h-toy/remote | 5030 | remote_toy_level_up | 调高玩具档位 | 延后（用户：暂缓，后续再看） | 玩具系统 |
| B3 | obscenity | h-toy/remote | 5031 | remote_toy_level_down | 降低玩具档位 | 延后（用户：暂缓，后续再看） | 玩具系统 |
| B3 | obscenity | h-toy/remote | 5032 | remote_toy_all_off | 遥控关闭全员玩具 | 延后（用户：暂缓，后续再看） | 玩具系统 |
| B3 | obscenity | h-toy/remote | 5033 | remote_all_set_sex_toy_weak | 全员玩具调到弱档 | 延后（用户：暂缓，后续再看） | 玩具系统 |
| B3 | obscenity | h-toy/remote | 5034 | remote_all_set_sex_toy_medium | 全员玩具调到中档 | 延后（用户：暂缓，后续再看） | 玩具系统 |
| B3 | obscenity | h-toy/remote | 5035 | remote_all_set_sex_toy_strong | 全员玩具调到强档 | 延后（用户：暂缓，后续再看） | 玩具系统 |
| B3 | obscenity | sleep-system | 5045 | sleep_obscenity | 睡眠猥亵 | 延后（用户：暂缓，后续再看） | 睡眠系统已存在 |
| B3 | obscenity | sleep-system | 5046 | stop_sleep_obscenity | 停止睡眠猥亵 | 延后（用户：暂缓，后续再看） | 同上 |
| B3 | obscenity | h-core | 5047 | do_h | 邀请H | 延后（用户：暂缓，后续再看） | 核心 |
| B3 | obscenity | h-core | 5049 | do_h_in_bathroom | 邀请在浴室H | 延后（用户：暂缓，后续再看） | 位置 has_bathroom |
| B3 | obscenity | sleep-system | 5052 | unconscious_h | 无意识奸 | 延后（用户：暂缓，后续再看） | 睡眠/无意识状态 |
| B3 | obscenity | h-hidden | 5053 | ask_hidden_sex | 邀请隐奸 | 延后（用户：暂缓，后续再看） | system:hidden |
| B3 | obscenity | h-exposure | 5054 | ask_exhibitionism_sex | 邀请露出 | 延后（用户：暂缓，后续再看） | system:hidden（已实装 exposure） |
| B3 | obscenity | h-group-sex | 5055 | ask_group_sex | 邀请群交 | 延后（用户：暂缓，后续再看） | system:group_sex |
| B3 | obscenity | h-toy/remote | 5101 | remote_toy_level_down_in_h | 降低玩具档位 | 延后（用户：暂缓，后续再看） | 玩具系统（H 内版） |
| B3 | obscenity | h-toy/remote | 5102 | remote_toy_all_off_in_h | 遥控关闭全员玩具 | 延后（用户：暂缓，后续再看） | 玩具系统（H 内版） |
| B3 | obscenity | h-toy/remote | 5103 | remote_all_set_sex_toy_weak_in_h | 全员玩具调到弱档 | 延后（用户：暂缓，后续再看） | 玩具系统（H 内版） |
| B3 | obscenity | h-toy/remote | 5104 | remote_all_set_sex_toy_medium_in_h | 全员玩具调到中档 | 延后（用户：暂缓，后续再看） | 玩具系统（H 内版） |
| B3 | obscenity | h-toy/remote | 5105 | remote_all_set_sex_toy_strong_in_h | 全员玩具调到强档 | 延后（用户：暂缓，后续再看） | 玩具系统（H 内版） |

## B4-B7 SEX/base（17）

> 2026-08-25：用户筛选。统计：原 17 → 保留 13（6001/6002/6005/6006/6007/6009/6010/6011/6012/6013/6014/6019/6020）→ 延后 4（6008/6015/6016/6017，群交未接好）→ 剔除 0。

| 批次 | 分类 | 所属系统 | cid | id | 名称 | 筛选结论 | 延后/剔除原因 |
|---|---|---|---|---|---|---|---|
| B4 | sex/base | h-core | 6001 | wait_5_min_in_h | 等待五分钟 | 保留 | H 内等待 |
| B4 | sex/base | h-core | 6002 | h_end | 结束H | 保留 | 核心 |
| B4 | sex/base | sleep-system | 6005 | unconscious_h_end | 结束无意识奸 | 保留 | 睡眠/无意识系统 |
| B4 | sex/base | h-hidden | 6006 | hidden_sex_end | 结束隐奸 | 保留 | h-hidden 系统在，补结束 TOML |
| B4 | sex/base | h-exposure | 6007 | exhibitionism_sex_end | 结束露出 | 保留 | 已实装 |
| B4 | sex/base | h-group-sex | 6008 | group_sex_end | 结束群交 | 延后（用户） | group_sex_end TODO |
| B4 | sex/base | h-core/cloth | 6009 | undress | 脱衣服 | 保留 | 服装系统 |
| B4 | sex/base | h-npc-ai | 6010 | change_top_and_bottom | 交给对方 | 保留 | NPC 主导已接好 |
| B4 | sex/base | h-npc-ai | 6011 | keep_enjoy | 继续享受 | 保留 | NPC 主导已接好 |
| B4 | sex/base | h-npc-ai | 6012 | try_pl_active_h | 尝试掌握主动权 | 保留 | NPC 主导已接好 |
| B4 | sex/base | h-core | 6013 | orgasm_edge_on | 绝顶寸止 | 保留 | 效果已实现 |
| B4 | sex/base | h-core | 6014 | orgasm_edge_off | 绝顶解放 | 保留 | 效果已实现 |
| B4 | sex/base | h-group-sex | 6015 | run_group_sex_temple | 进行一次当前群交 | 延后（用户） | 群交未接好 |
| B4 | sex/base | h-group-sex | 6016 | run_all_group_sex_temple | 进行一次轮流群交 | 延后（用户） | 群交未接好 |
| B4 | sex/base | h-group-sex | 6017 | edit_group_sex_temple | 编辑群交行动 | 延后（用户） | 群交未接好 |
| B4 | sex/base | h-core | 6019 | pull_out_penis | 拔出阴茎 | 保留 | 核心 |
| B4 | sex/base | h-core | 6020 | stop_endure | 停止忍耐 | 保留 | 已实现 |

## 后续批次（占位，筛选后填充）

- B4-B7 其余：SEX/drug 5 / foreplay 15 / insert 58 / item 21 / sm 11 / wait_upon 15（待筛选）
- 核对项：SYSTEM 8（不按 TOML 复刻，逐项核对引擎等价能力）
