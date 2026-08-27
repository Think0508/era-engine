# L1.6 指令复刻 · 第 0 步粗筛结果（全量 404 条 master-list）

> 来源：`用来复刻的蓝本游戏 erArk 不要commit/data/csv/InstructConfig.csv`（全表 409 行 = 表头/元数据 5 行 + 指令 404 行，行号范围见各分类标题）
> 本清单是批次规划的权威依据（spec §8 第 0 步）。用户审阅确认后，进入前置改动阶段；批次的逐条 TOML 复刻不在此阶段。
> 建议值：**保留**（进入批次）/ **砍掉**（不复刻，含数据与判定类）/ **延后**（记 TODO，依赖系统实装后再做）
>
> ---
> **2026-08-07 用户复筛调整**：用户在 opencode 外修订了部分条目的建议值，本文件「统计总览 / 砍掉原因汇总 / 延后汇总」已按修订后的行标注同步重算（保留 **228** / 砍掉 **94** / 延后 **82**，3026 建议列异常值已按用户确认改为砍掉）。
> - **批次工作以 `instruction-keep-list.md`（保留 228 条工作副本）为准**；本文件为全量留底 + 维护用（砍掉/延后条目只在这里查）。
> - 下方「审阅需特别注意的标注」保留作历史记录，部分条目已被本次复筛覆盖（如 5042 改延后、chat_with_ai 仍延后）。

## 统计总览

| 分类 | 总条数 | 保留 | 砍掉 | 延后 |
|------|-------|------|------|------|
| SYSTEM | 18 | 8 | 7 | 3 |
| DAILY | 35 | 17 | 12 | 6 |
| WORK | 37 | 2 | 19 | 16 |
| PLAY | 30 | 5 | 17 | 8 |
| ARTS | 23 | 17 | 2 | 4 |
| OBSCENITY | 61 | 37 | 8 | 16 |
| SEX | 200 | 142 | 29 | 29 |
| **合计** | **404** | **228** | **94** | **82** |

> 2026-08-07 用户复筛后统计（保留 228 条的工作副本见 `instruction-keep-list.md`）。

> ⚠️ 与 spec 预估差异：spec 预计"砍 ~180、剩 ~220"。实际按既定维度筛出 **砍 119 / 保留 283**，差异主要来自：
> 1. **PLAY 设施类 23 条保留**——位置前提一律 tag 化（`has_*`），武侠地图不声明 tag 即天然不可用，活动本身通用（品茶/泡温泉/下棋/唱歌等）。若希望更激进，可把这 23 条中的现代设施类（健身房/泳池/桑拿/水疗/理发/造型/泡脚/舞剧/过家家等）一并砍掉，需用户定夺。
> 2. **SEX 保留 158 条**——spec 的 12 类判定基准与 8 子类批次本就把 SEX 主体列为复刻范围，仅尿道/已废弃/未实装/特征/依赖未实装系统被砍。
>
> > **尿道决策更新（2026-08-08，方案A）**：尿道=引擎层泛化支持（部位快感/感度映射/绝顶/pain 参数保留，
> > ORGASM_PART_ATTR 含 partId 6），但**默认数据不定义** 尿道感度/尿道扩张 能力、本清单中尿道指令保持
> > 砍掉、UI 隐藏（attributes.toml 尿道 display=false）。即"引擎支持、内容不做"——mod 想启用 = 写能力+指令
> > TOML，引擎零改动。详见 docs/adr/ 尿道方案A。

## 审阅需特别注意的标注（请逐一确认）

| # | 条目 | 标注 | 说明 |
|---|------|------|------|
| 1 | 特殊身体特征 | 砍 9 条 | spec/迁移SOP 均写"8 条"，但列举项实际为 **9 条**（摸角/摸尾/摸环/摸翅/摸触手/摸小车 + 尾交/蹭角/蹭耳），全部带 `TARGET_HAVE_*` 前提，已全部列入砍掉。文档数字"8"疑为笔误，以列举为准 |
| 2 | `chat_with_ai`（SYSTEM 12） | **延后**（非 spec 原定 1 条延后） | spec 只延后告白。本条是我新增的延后建议：前提仅 HAVE_TARGET，但功能依赖 LLM 对话能力（AGENTS.md 中为独立可选阶段）。若视为"依赖未实装系统"也可改砍掉，请定夺 |
| 3 | `all_npc_position`（DAILY 1018） | 保留（去方舟命名） | 名称含"干员"但功能是通用角色位置一览（地图面板）。若严格按"干员=方舟专属"口径可改砍掉 |
| 4 | `give_necklace`（OBSCENITY 5042） | 砍掉 | 依赖 `TARGET_OBEY_2` 服从值系统（与监禁调教同系，未实装）。不在 spec 明文砍单内，但按"依赖未实装系统"维度处理 |
| 5 | `ask_for_pan`/`ask_for_socks`（5017/5018） | 保留（前提待改） | 前提 `COLLECT_BONUS_102/202` 依赖收藏系统（已砍，源码 handle_premise_other.py:728/743 查证）。保留但批次时移除该前提、改好感度门槛，否则永久不可用 |
| 6 | `taste_coffee`（PLAY 3020） | 砍掉 | 前提 `IN_CAFÉ` 编码损坏（CSV 第 115 行），且对应设施"哥伦比亚咖啡馆"为方舟设施（Entertainment.csv 第 24 行） |
| 7 | SEX 各"已废弃/未实装" | 砍 15 条 | 名称自带标记：已废弃（6317 插入子宫口/6331 子宫姦/6510 肛塞）、未实装（6361 二穴插入/6501 打胸/6514 针/6901-6905 五条） |
| 8 | SEX 无 handler 条目 | 砍 6 条 | 源码查证：`big/huge_vibrator`（6413/6414/6417/6418）与 `birth_control_pills`（6101）在 Instruct.py 仅有常量定义、handle_instruct.py 无 `@add_instruct` handler（查证见下）；6018/6103 带 TO_DO/已废弃 |
| 9 | `change_top_and_bottom`（6010） | 保留 | 名称费解，源码查证为"交给对方"= 将 H 主导权交给 NPC（handle_instruct.py:3180，设 npc_active_h=True）。依赖 H 内 NPC 主动 AI，批次时评估 |
| 10 | DEBUG 指令（SYSTEM 13-15/17/18、DAILY 1002/1003） | 砍 7 条 | 调试专用（DEBUG_MODE_ON 前提或临时测试性质），引擎已有 @ 调试命令体系可替代 |

## 分类明细

### SYSTEM（18 条，CSV 第 6–23 行）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 1 | move | 移动 | SYSTEM | 保留 | 核心移动指令 |
| 2 | see_attr | 查看属性 | SYSTEM | 保留 | 通用 |
| 3 | item | 道具 | SYSTEM | 保留 | 通用背包 |
| 4 | originium_arts | 源石技艺 | SYSTEM | 砍掉 | 方舟专属：源石技艺系统 |
| 5 | target_to_self | 对自己交互 | SYSTEM | 保留 | 通用 |
| 6 | door_lock_inner | 锁上门内侧锁 | SYSTEM | 砍掉 | 门前提保留地点字段（spec §6），不 tag 化 |
| 7 | door_unlock_inner | 解开门内侧锁 | SYSTEM | 砍掉 | 同上 |
| 8 | save | 读写存档 | SYSTEM | 保留 | 通用 |
| 9 | abl_up | 提升能力 | SYSTEM | 保留 | 通用 |
| 10 | owner_abl_up | 提升自身能力 | SYSTEM | 保留 | 通用 |
| 11 | system_setting | 系统设置 | SYSTEM | 保留 | 通用 |
| 12 | chat_with_ai | 与文本生成AI对话 | SYSTEM | **延后** | 依赖 LLM 对话系统（独立可选阶段），见审阅 #2 |
| 13 | debug_mode_on | 开启DEBUG模式 | SYSTEM | 砍掉 | 调试专用，@ 命令替代 |
| 14 | debug_mode_off | 关闭DEBUG模式 | SYSTEM | 砍掉 | 调试专用，@ 命令替代 |
| 15 | debug_adjust | debug数值调整 | SYSTEM | 砍掉 | 调试专用（@setattr 替代） |
| 16 | chara_diy_instruct | 角色特殊指令_特殊调用 | SYSTEM | 砍掉 | 标未实装（前提含 TO_DO） |
| 17 | test_instruct | 测试用临时指令 | SYSTEM | 延后 | 临时测试指令 |
| 18 | talk_quick_test | 快速测试口上 | SYSTEM | 延后 | 调试专用口上测试 |

### DAILY（35 条，CSV 第 24–58 行）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 1001 | wait | 等待五分钟 | DAILY | 延后 | 时间推进（特殊耗时 wait=5，批次时按 SOP §5 处理） |
| 1002 | wait_1_hour | 等待一个小时 | DAILY | 延后 | DEBUG_MODE_ON 专用，@ 命令替代 |
| 1003 | wait_6_hour | 等待六个小时 | DAILY | 延后 | DEBUG_MODE_ON 专用，@ 命令替代 |
| 1004 | chat | 聊天 | DAILY | 保留 | 通用 |
| 1005 | stroke | 身体接触 | DAILY | 保留 | 通用 |
| 1006 | massage | 按摩 | DAILY | 延后 | 通用 |
| 1007 | make_coffee | 泡咖啡 | DAILY | 砍掉 | 通用（家具前提保留地点字段） |
| 1008 | ask_make_coffee | 让对方泡咖啡 | DAILY | 砍掉 | 通用 |
| 1009 | make_food | 做饭 | DAILY | 保留 | IN_KITCHEN → tag has_kitchen |
| 1010 | eat | 进食 | DAILY | 保留 | 通用（HAVE_FOOD） |
| 1011 | put_selfmade_food_in | 放入正常食物 | DAILY | 保留 | 源码查证=将自制食物放入食堂（food_shop_panel.py:22），食物系统 |
| 1012 | rest | 休息 | DAILY | 保留 | 通用 |
| 1013 | diray | 日记 | DAILY | 砍掉 | 依赖日记系统，未实装（面板类） |
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
| 1025 | give_gift | 赠送礼物 | DAILY | 延后 | 通用 |
| 1026 | collcet_panty | 收起内裤_未实装 | DAILY | 砍掉 | 标未实装（前提 TO_DO） |
| 1027 | ask_date | 邀请约会_未实装 | DAILY | 砍掉 | 标未实装（前提 TO_DO） |
| 1028 | drink_alcohol | 劝酒_未实装 | DAILY | 砍掉 | 标未实装（前提 TO_DO） |
| 1029 | pee | 解手 | DAILY | 延后 | IN_TOILET_MAN → tag has_toilet（命令小便被砍，自理小便保留） |
| 1030 | collect | 摆放藏品 | DAILY | 砍掉 | 收藏系统未实装 |
| 1031 | take_care_baby | 照顾婴儿 | DAILY | 砍掉 | 育儿系统未实装（POSITION_IN_IN_NURSERY） |
| 1032 | order_hotel_room | 预定房间 | DAILY | 砍掉 | 爱情旅馆系统未实装（IN_LOVE_HOTEL） |
| 1033 | see_collection | 查看收藏品 | DAILY | 砍掉 | 收藏系统未实装 |
| 1034 | see_achievement | 查看蚀刻章 | DAILY | 砍掉 | 成就明确不做（spec 决策 #14） |
| 1035 | see_fridge | 查看冰箱 | DAILY | 砍掉 | 冰箱/食物存储面板未实装（handler=开 FRIDGE 面板，handle_instruct.py:1069） |

### WORK（37 条，CSV 第 59–95 行）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 2001 | official_work | 处理公务 | WORK | 砍掉 | 方舟专属：博士办公室公务 |
| 2002 | battle_command | 指挥作战（未实装） | WORK | 砍掉 | 标未实装（TO_DO）+ 方舟指挥系统 |
| 2003 | field_commission | 外勤委托 | WORK | 延后 | spec §4 保留清单（并入 daily，IN_FIELD_ASSEMBLY_POINT → tag） |
| 2004 | training | 战斗训练 | WORK | 延后 | spec §4 保留清单（并入 daily） |
| 2005 | cure_patient | 诊疗病人 | WORK | 延后 | spec §4 保留清单（并入 daily） |
| 2006 | manage_dedical_department | 管理医疗系统 | WORK | 砍掉 | 方舟基建管理面板 |
| 2007 | recruit | 招募干员 | WORK | 延后 | 方舟专属：干员招募 |
| 2008 | confim_recruit | 确认已招募干员 | WORK | 延后 | 方舟专属：招募 |
| 2009 | recruitment | 招募情况 | WORK | 延后 | 方舟专属：招募面板 |
| 2010 | teach | 授课 | WORK | 延后 | spec §4 保留清单（并入 daily） |
| 2011 | maintenance_facilities | 维护设施 | WORK | 砍掉 | 方舟基建维护 |
| 2012 | manage_facility_power | 调控设施供能 | WORK | 砍掉 | 方舟基建/能源 |
| 2013 | manage_power_system | 管理能源系统 | WORK | 砍掉 | 方舟能源系统 |
| 2014 | repair_equipment | 维修装备 | WORK | 延后 | spec §4 保留清单（并入 daily，铁匠铺通用） |
| 2015 | equipment_maintain | 管理装备维护 | WORK | 砍掉 | 方舟装备维护管理面板 |
| 2016 | assistant_adjustments | 助理相关调整 | WORK | 延后 | 助理系统未实装 |
| 2017 | building | 基建系统 | WORK | 砍掉 | 方舟基建 |
| 2018 | invite_visitor | 邀请访客 | WORK | 延后 | 方舟外交/访客系统 |
| 2019 | visitor_system | 访客系统 | WORK | 延后 | 方舟外交/访客系统 |
| 2020 | nation_diplomacy | 势力与外交 | WORK | 砍掉 | 方舟外交 |
| 2021 | deal_with_diplomacy | 处理外交事宜 | WORK | 砍掉 | 方舟外交 |
| 2022 | prts | 普瑞赛斯 | WORK | 砍掉 | 方舟专属 PRTS |
| 2023 | manage_library | 管理图书馆 | WORK | 砍掉 | 方舟岗位管理面板（图书馆管理） |
| 2024 | manage_assembly_line | 管理流水线 | WORK | 砍掉 | 方舟生产流水线 |
| 2025 | plant_manage_crop | 种植与养护作物 | WORK | 保留 | spec §4 保留清单（并入 daily） |
| 2026 | manage_agriculture | 管理农业生产 | WORK | 延后 | 方舟农业管理面板 |
| 2027 | manage_vehicle | 管理载具 | WORK | 砍掉 | 方舟专属：载具（spec 粗筛维度明列） |
| 2028 | physical_check_and_manage | 身体检查与管理 | WORK | 砍掉 | 身体检查系统未实装（面板类） |
| 2029 | manage_confinement_and_training | 管理监禁调教 | WORK | 延后 | 监禁调教系统未实装 |
| 2030 | investigate_resource_market | 研判资源市场 | WORK | 延后 | 方舟资源市场 |
| 2031 | manage_resource_exchange | 管理资源交易 | WORK | 延后 | 方舟资源交易 |
| 2032 | navigation | 导航 | WORK | 砍掉 | 方舟指挥室导航面板；移动已有 move 指令 |
| 2033 | organize_dormitory_opinion | 整理宿舍意见 | WORK | 砍掉 | 方舟宿舍管理 + DEBUG_MODE_ON |
| 2034 | handle_dormitory_problem | 处理宿舍问题 | WORK | 砍掉 | 方舟宿舍管理 + DEBUG_MODE_ON |
| 2035 | manage_dormitory | 宿舍管理系统 | WORK | 延后 | 方舟宿舍管理 |
| 2036 | mixology | 调酒 | WORK | 保留 | spec §4 保留清单（并入 daily，IN_BAR → tag） |
| 2051 | manage_basement | 管理罗德岛 | WORK | 砍掉 | 方舟专属：罗德岛基建 |

### PLAY（30 条，CSV 第 96–125 行）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 3001 | singing | 唱歌 | PLAY | 保留 | spec B1 通用（并入 daily） |
| 3002 | play_instrument | 演奏乐器 | PLAY | 保留 | 通用 |
| 3003 | listen_inflation | 听肚子里的动静 | PLAY | 砍掉 | 膨胀系统未实装（前提 T_INFLATION_1） |
| 3004 | play_with_child | 一起玩耍 | PLAY | 延后 | 儿童角色/育儿系统未实装（T_CHILD_OR_LOLI_1） |
| 3005 | exercise | 锻炼身体 | PLAY | 保留 | 通用（IN_GYM_ROOM → tag has_gym） |
| 3006 | borrow_book | 借阅书籍 | PLAY | 延后 | 通用（IN_LIBRARY → tag has_library） |
| 3007 | read_book | 读书 | PLAY | 保留 | spec B1 通用（并入 daily） |
| 3008 | watch_movie | 看电影 | PLAY | 砍掉 | 多媒体室/片源内容系统未实装，世界观不适配 |
| 3009 | photography | 摄影 | PLAY | 砍掉 | 摄影内容系统未实装 |
| 3010 | play_water | 玩水 | PLAY | 延后 | 通用（IN_AQUAPIT_EXPERIENTIORUM → tag has_water_play） |
| 3011 | play_gomoku | 下五子棋 | PLAY | 砍掉 | 通用棋类（CSV 无 behavior_id，面板类） |
| 3012 | play_chess | 下棋 | PLAY | 保留 | spec B1 通用 |
| 3013 | play_mahjong | 打麻将 | PLAY | 砍掉 | 通用 |
| 3014 | play_cards | 打牌 | PLAY | 砍掉 | 通用 |
| 3015 | rehearse_dance | 排演舞剧 | PLAY | 砍掉 | 通用演艺活动（IN_FAIRY_BANQUET → tag has_banquet_hall） |
| 3016 | play_arcade_game | 玩街机游戏 | PLAY | 砍掉 | 街机内容系统未实装，世界观不适配 |
| 3017 | swimming | 游泳 | PLAY | 砍掉 | 通用（IN_SWIMMING_POOL → tag has_swimming_pool） |
| 3018 | taste_wine | 品酒 | PLAY | 延后 | spec B1 通用（IN_BAR → tag has_bar） |
| 3019 | taste_tea | 品茶 | PLAY | 延后 | 通用（IN_TEAHOUSE → tag has_teahouse） |
| 3020 | taste_coffee | 品咖啡 | PLAY | 砍掉 | 前提 IN_CAFÉ 编码损坏（CSV 第 115 行）+ 哥伦比亚咖啡馆为方舟设施 |
| 3021 | taste_dessert | 品尝点心 | PLAY | 砍掉 | 通用（IN_WALYRIA_CAKE_SHOP → tag has_cake_shop） |
| 3022 | taste_food | 品尝美食 | PLAY | 延后 | 通用（IN_RESTAURANT → tag has_restaurant） |
| 3023 | play_house | 过家家 | PLAY | 砍掉 | 通用娱乐（IN_GOLDEN_GAME_ROOM → tag has_game_room） |
| 3024 | style_hair | 修整发型 | PLAY | 砍掉 | 通用服务（IN_HAIR_SALON → tag has_hair_salon） |
| 3025 | full_body_styling | 全身造型服务 | PLAY | 延后 | 通用服务（IN_STYLING_STUDIO → tag has_styling_studio） |
| 3026 | soak_feet | 泡脚 | PLAY | 砍掉 | 通用服务（IN_FOOT_BATH → tag has_foot_bath）；2026-08-07 用户确认砍掉 |
| 3027 | steam_sauna | 蒸桑拿 | PLAY | 砍掉 | 通用服务（IN_SAUNA → tag has_sauna） |
| 3028 | hydrotherapy_treatment | 水疗护理 | PLAY | 砍掉 | 通用服务（IN_SPA_ROOM → tag has_spa） |
| 3029 | onsen_bath | 泡温泉 | PLAY | 延后 | 通用（IN_ONSEN → tag has_onsen，武侠适配） |
| 3030 | aromatherapy | 香薰疗愈 | PLAY | 砍掉 | 香薰系统未实装（spec 粗筛维度明列） |

### ARTS（23 条，CSV 第 126–148 行）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 4001 | hypnosis_one | 单人催眠 | ARTS | 保留 | system:hypnosis（spec §4：ARTS 归 H 插件 tag） |
| 4002 | deepening_hypnosis | 加深催眠 | ARTS | 保留 | system:hypnosis |
| 4003 | hypnosis_all | 集体催眠 | ARTS | 保留 | system:hypnosis |
| 4004 | hypnosis_cancel | 解除催眠 | ARTS | 保留 | system:hypnosis |
| 4005 | carry_target | 搬运对方 | ARTS | 保留 | system:time_stop |
| 4006 | stop_carry_target | 停止搬运对方 | ARTS | 保留 | system:time_stop |
| 4007 | target_free_in_time_stop | 在时停中正常行动_未实装 | ARTS | 砍掉 | 标未实装（前提 TO_DO） |
| 4008 | target_stop_in_time_stop | 在时停中再次停止_未实装 | ARTS | 砍掉 | 标未实装（前提 TO_DO） |
| 4101 | change_hypnosis_mode | 切换催眠模式 | ARTS | 保留 | system:hypnosis |
| 4102 | hypnosis_increase_body_sensitivity | 体控-敏感度提升 | ARTS | 保留 | system:hypnosis |
| 4103 | hypnosis_force_climax | 体控-强制高潮 | ARTS | 保留 | system:hypnosis |
| 4104 | hypnosis_force_ovulation | 体控-强制排卵 | ARTS | 保留 | system:hypnosis（排卵/妊娠已实现） |
| 4105 | hypnosis_blockhead | 体控-木头人 | ARTS | 保留 | system:hypnosis |
| 4106 | hypnosis_active_h | 体控-逆推 | ARTS | 保留 | system:hypnosis |
| 4107 | hypnosis_roleplay | 心控-角色扮演 | ARTS | 保留 | system:hypnosis |
| 4108 | hypnosis_pain_as_pleasure | 心控-苦痛快感化 | ARTS | 保留 | system:hypnosis |
| 4109 | penetrating_vision_on | 开启透视 | ARTS | 延后 | 透视系统未实装（spec 粗筛维度明列） |
| 4110 | penetrating_vision_off | 关闭透视 | ARTS | 延后 | 透视系统未实装 |
| 4111 | hormone_on | 开启信息素 | ARTS | 延后 | system:hypnosis（信息素） |
| 4112 | hormone_off | 关闭信息素 | ARTS | 延后 | system:hypnosis |
| 4113 | time_stop_on | 时间停止流动 | ARTS | 保留 | system:time_stop |
| 4114 | time_stop_off | 时间重新流动 | ARTS | 保留 | system:time_stop |
| 4115 | time_stop_off_in_h | 在H中取消时停 | ARTS | 保留 | system:time_stop |

### OBSCENITY（61 条，CSV 第 149–209 行）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 5001 | make_coffee_add | 泡咖啡（加料） | OBSCENITY | 延后 | 通用（精液属性已实现） |
| 5002 | touch_head | 摸头 | OBSCENITY | 保留 | 通用 |
| 5003 | touch_breast | 摸胸 | OBSCENITY | 保留 | 通用 |
| 5004 | touch_buttocks | 摸屁股 | OBSCENITY | 保留 | 通用 |
| 5005 | touch_ears | 摸耳朵 | OBSCENITY | 砍掉 | 无 TARGET_HAVE_EARS 前提，普通指令 |
| 5006 | touch_horn | 摸角 | OBSCENITY | 砍掉 | 特殊身体特征不做（TARGET_HAVE_HORN） |
| 5007 | touch_tail | 摸尾巴 | OBSCENITY | 砍掉 | 特殊身体特征不做（TARGET_HAVE_TAIL） |
| 5008 | touch_ring | 摸光环 | OBSCENITY | 砍掉 | 特殊身体特征不做（TARGET_HAVE_RING） |
| 5009 | touch_wing | 摸翅膀 | OBSCENITY | 砍掉 | 特殊身体特征不做（TARGET_HAVE_WING） |
| 5010 | touch_tentacle | 摸触手 | OBSCENITY | 砍掉 | 特殊身体特征不做（TARGET_HAVE_TENTACLE） |
| 5011 | touch_car | 摸小车 | OBSCENITY | 砍掉 | 特殊身体特征不做（TARGET_HAVE_CAR） |
| 5012 | hand_in_hand | 牵手 | OBSCENITY | 保留 | 通用 |
| 5013 | embrace | 拥抱 | OBSCENITY | 保留 | 通用 |
| 5014 | kiss | 亲吻 | OBSCENITY | 保留 | 通用 |
| 5015 | lap_pillow | 膝枕 | OBSCENITY | 保留 | 通用 |
| 5016 | raise_skirt | 掀起裙子 | OBSCENITY | 保留 | 通用 |
| 5017 | ask_for_pan | 索要内裤 | OBSCENITY | 保留 | 前提 COLLECT_BONUS_102 依赖收藏系统（已砍，handle_premise_other.py:728 查证），批次时移除改好感度门槛，见审阅 #5 |
| 5018 | ask_for_socks | 索要袜子 | OBSCENITY | 延后 | 同上（COLLECT_BONUS_202，handle_premise_other.py:743） |
| 5019 | invite_to_bath | 一起洗澡 | OBSCENITY | 保留 | IN_BATHROOM → tag has_bathroom |
| 5020 | steal_pan | 偷走内裤 | OBSCENITY | 保留 | 通用 |
| 5021 | steal_socks | 偷走袜子 | OBSCENITY | 延后 | 通用 |
| 5022 | steal_scene_all_pan | 偷走所有人内裤 | OBSCENITY | 保留 | 通用（睡眠/无意识前提，L1.7 睡眠已规划） |
| 5023 | steal_scene_all_socks | 偷走所有人袜子 | OBSCENITY | 延后 | 同上 |
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
| 5036 | bagging_and_moving | 装袋搬走 | OBSCENITY | 延后 | 监禁/装袋系统未实装（T_IMPRISONMENT_0 + HAVE_BAG） |
| 5037 | release_from_bag | 从袋中放出来 | OBSCENITY | 延后 | 监禁/装袋系统未实装 |
| 5038 | put_into_prison | 投入监牢 | OBSCENITY | 延后 | 监禁系统未实装 |
| 5039 | set_free | 解除囚禁 | OBSCENITY | 延后 | 监禁系统未实装 |
| 5040 | check_locker | 检查衣柜 | OBSCENITY | 延后 | 服装/衣柜系统已规划（L1.4） |
| 5041 | confession | 告白 | OBSCENITY | 延后 | 恋爱系统未实装（前提 TARGET_LOVE_2 + HAVE_RING，spec 明示延后） |
| 5042 | give_necklace | 戴上项圈 | OBSCENITY | 延后 | 依赖 TARGET_OBEY_2 服从值系统（与监禁调教同系，未实装），见审阅 #4 |
| 5043 | prepare_training | 调教前准备 | OBSCENITY | 延后 | 监禁调教系统未实装（T_IMPRISONMENT_1 + HAVE_WARDEN） |
| 5044 | switch_to_h_interface | 切换到H | OBSCENITY | 延后 | 标未实装（前提 TO_DO） |
| 5045 | sleep_obscenity | 睡眠猥亵 | OBSCENITY | 保留 | 睡眠系统已规划（L1.7，T_ACTION_SLEEP） |
| 5046 | stop_sleep_obscenity | 停止睡眠猥亵 | OBSCENITY | 保留 | 同上 |
| 5047 | do_h | 邀请H | OBSCENITY | 保留 | 核心 |
| 5048 | do_h_in_love_hotel | 邀请在爱情旅馆H | OBSCENITY | 延后 | 爱情旅馆系统未实装（IN_LOVE_HOTEL + LIVE_IN_LOVE_HOTEL） |
| 5049 | do_h_in_bathroom | 邀请在浴室H | OBSCENITY | 保留 | IN_BATHROOM → tag has_bathroom |
| 5050 | do_h_with_daughter | 邀请乱伦H | OBSCENITY | 延后 | 女儿/后代系统未实装（TARGET_IS_PLAYER_DAUGHTER，育儿已砍） |
| 5051 | imprisonment_h | 监禁奸 | OBSCENITY | 延后 | 监禁系统未实装 |
| 5052 | unconscious_h | 无意识奸 | OBSCENITY | 保留 | 睡眠/无意识状态（L1.7 已规划） |
| 5053 | ask_hidden_sex | 邀请隐奸 | OBSCENITY | 保留 | system:hidden |
| 5207 | ask_exhibitionism_sex | 邀请露出 | OBSCENITY | 已完成 | system:hidden |
| 5055 | ask_group_sex | 邀请群交 | OBSCENITY | 保留 | system:group_sex |
| 5101 | remote_toy_level_down_in_h | 降低玩具档位 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5102 | remote_toy_all_off_in_h | 遥控关闭全员玩具 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5103 | remote_all_set_sex_toy_weak_in_h | 全员玩具调到弱档 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5104 | remote_all_set_sex_toy_medium_in_h | 全员玩具调到中档 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5105 | remote_all_set_sex_toy_strong_in_h | 全员玩具调到强档 | OBSCENITY | 保留 | 玩具系统（H 内版） |
| 5106 | ask_copy_key | 要求复制钥匙 | OBSCENITY | 砍掉 | 方舟宿舍管理员/钥匙系统 |

### SEX（200 条，CSV 第 210–409 行）

#### SEX/base（6001–6020）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6001 | wait_5_min_in_h | 等待五分钟 | SEX/base | 保留 | H 内等待（特殊耗时 wait=5） |
| 6002 | h_end | 结束H | SEX/base | 保留 | 核心 |
| 6003 | h_with_daughter_end | 结束乱伦H | SEX/base | 延后 | 女儿/后代系统未实装 |
| 6004 | imprisonment_h_end | 结束监禁奸 | SEX/base | 延后 | 监禁系统未实装 |
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
| 6018 | switch_to_non_h_interface | 切换到非H | SEX/base | 延后 | 标未实装（前提 TO_DO） |
| 6019 | pull_out_penis | 拔出阴茎 | SEX/base | 保留 | 核心 |
| 6020 | stop_endure | 停止忍耐 | SEX/base | 保留 | 射精忍耐已实现（spec §12） |

#### SEX/drug（6101–6109）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6101 | birth_control_pills | 避孕药 | SEX/drug | 砍掉 | 源码无 handler（Instruct.py:555 仅常量，handle_instruct.py 无 @add_instruct），前提为空，未实装 |
| 6102 | philter | 媚药 | SEX/drug | 保留 | 通用药物 |
| 6103 | enemas | 灌肠液_已废弃 | SEX/drug | 砍掉 | 标已废弃（前提 TO_DO），灌肠以 SM 版（6508/6509）为准 |
| 6104 | diuretics_once | 一次性利尿剂 | SEX/drug | 延后 | 尿液属性（pee 保留同系），批次评估 |
| 6105 | diuretics_persistent | 持续性利尿剂 | SEX/drug | 延后 | 同上 |
| 6106 | sleeping_pills | 安眠药 | SEX/drug | 保留 | 睡眠系统（L1.7） |
| 6107 | clomid | 排卵促进药 | SEX/drug | 保留 | 排卵/妊娠已实现（spec §12） |
| 6108 | birth_control_pills_before | 事前避孕药 | SEX/drug | 保留 | 有 handler（handle_instruct.py:2719 查证） |
| 6109 | birth_control_pills_after | 事后避孕药 | SEX/drug | 保留 | 有 handler（handle_instruct.py:2725 查证） |

#### SEX/foreplay（6201–6217）

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
| 6214 | urethral_finger_insertion | 尿道指姦 | SEX/foreplay | 砍掉 | 尿道不做（spec 决策 #13） |
| 6215 | make_masturebate | 命令对方自慰 | SEX/foreplay | 保留 | 通用 |
| 6216 | make_lick_anal | 命令对方舔自己肛门 | SEX/foreplay | 保留 | 通用 |
| 6217 | ask_pee | 命令对方小便 | SEX/foreplay | 砍掉 | 尿道不做（spec 决策 #13） |

#### SEX/insert（6301–6375）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6301 | vaginal_sex | 阴道性交 | SEX/insert | 已完成（待复核） | 核心 |
| 6302 | change_vaginal_sex_position | 换阴道性交体位 | SEX/insert | 已完成（待复核） | 体位切换 |
| 6303 | normal_sex | 正常位 | SEX/insert | 已完成（待复核） | 体位 |
| 6304 | back_sex | 背后位 | SEX/insert | 已完成（待复核） | 体位 |
| 6305 | riding_sex | 对面骑乘位 | SEX/insert | 已完成（待复核） | 体位 |
| 6306 | back_riding_sex | 背面骑乘位 | SEX/insert | 已完成（待复核） | 体位 |
| 6307 | face_seat_sex | 对面座位 | SEX/insert | 已完成（待复核） | 体位 |
| 6308 | back_seat_sex | 背面座位 | SEX/insert | 已完成（待复核） | 体位 |
| 6309 | face_stand_sex | 对面立位 | SEX/insert | 已完成（待复核） | 体位 |
| 6310 | back_stand_sex | 背面立位 | SEX/insert | 已完成（待复核） | 体位 |
| 6311 | face_hug_sex | 对面抱位 | SEX/insert | 已完成（待复核） | 体位 |
| 6312 | back_hug_sex | 背面抱位 | SEX/insert | 已完成（待复核） | 体位 |
| 6313 | face_lay_sex | 对面卧位 | SEX/insert | 已完成（待复核） | 体位 |
| 6314 | back_lay_sex | 背面卧位 | SEX/insert | 已完成（待复核） | 体位 |
| 6315 | stimulate_g_point | 刺激G点 | SEX/insert | 已完成（待复核） | 通用 |
| 6316 | womb_os_caress | 玩弄子宫口 | SEX/insert | 已完成（待复核） | 通用 |
| 6317 | womb_insertion | 插入子宫口_旧指令已废弃 | SEX/insert | 砍掉 | 标已废弃（由宫颈/子宫姦体位链取代） |
| 6318 | change_cervix_sex_position | 换子宫姦口体位 | SEX/insert | 已完成（待复核） | 体位切换 |
| 6319 | normal_cervix_sex | 正常位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6320 | back_cervix_sex | 后背位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6321 | riding_cervix_sex | 对面骑乘位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6322 | back_riding_cervix_sex | 背面骑乘位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6323 | face_seat_cervix_sex | 对面座位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6324 | back_seat_cervix_sex | 背面座位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6325 | face_stand_cervix_sex | 对面立位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6326 | back_stand_cervix_sex | 背面立位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6327 | face_hug_cervix_sex | 对面抱位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6328 | back_hug_cervix_sex | 背面抱位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6329 | face_lay_cervix_sex | 对面卧位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6330 | back_lay_cervix_sex | 背面卧位子宫口姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6331 | womb_sex | 子宫姦_旧指令已废弃 | SEX/insert | 砍掉 | 标已废弃（由 6332 体位链取代） |
| 6332 | change_womb_sex_position | 换子宫姦体位 | SEX/insert | 已完成（待复核） | 体位切换 |
| 6333 | normal_womb_sex | 正常位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6334 | back_womb_sex | 后背位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6335 | riding_womb_sex | 对面骑乘位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6336 | back_riding_womb_sex | 背面骑乘位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6337 | face_seat_womb_sex | 对面座位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6338 | back_seat_womb_sex | 背面座位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6339 | face_stand_womb_sex | 对面立位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6340 | back_stand_womb_sex | 背面立位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6341 | face_hug_womb_sex | 对面抱位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6342 | back_hug_womb_sex | 背面抱位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6343 | face_lay_womb_sex | 对面卧位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6344 | back_lay_womb_sex | 背面卧位子宫姦 | SEX/insert | 已完成（待复核） | 体位 |
| 6345 | anal_sex | 肛门性交 | SEX/insert | 已完成（待复核） | 核心 |
| 6346 | change_anal_sex_position | 换肛交体位 | SEX/insert | 已完成（待复核） | 体位切换 |
| 6347 | normal_anal_sex | 正常位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6348 | back_anal_sex | 后背位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6349 | riding_anal_sex | 对面骑乘位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6350 | back_riding_anal_sex | 背面骑乘位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6351 | face_seat_anal_sex | 对面座位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6352 | back_seat_anal_sex | 背面座位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6353 | face_stand_anal_sex | 对面立位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6354 | back_stand_anal_sex | 背面立位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6355 | face_hug_anal_sex | 对面抱位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6356 | back_hug_anal_sex | 背面抱位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6357 | face_lay_anal_sex | 对面卧位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6358 | back_lay_anal_sex | 背面卧位肛交 | SEX/insert | 已完成（待复核） | 体位 |
| 6359 | stimulate_sigmoid_colon | 玩弄s状结肠 | SEX/insert | 已完成（待复核） | 通用 |
| 6360 | stimulate_vagina | 隔着刺激阴道 | SEX/insert | 已完成（待复核） | 通用 |
| 6361 | double_penetration | 二穴插入_未实装 | SEX/insert | 延后 | 标未实装（前提 TO_DO） |
| 6362 | urethral_sex | 尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6363 | change_urethral_sex_position | 换尿道姦体位 | SEX/insert | 砍掉 | 尿道不做 |
| 6364 | normal_urethral_sex | 正常位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6365 | back_urethral_sex | 后背位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6366 | riding_urethral_sex | 对面骑乘位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6367 | back_riding_urethral_sex | 背面骑乘位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6368 | face_seat_urethral_sex | 对面座位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6369 | back_seat_urethral_sex | 背面座位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6370 | face_stand_urethral_sex | 对面立位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6371 | back_stand_urethral_sex | 背面立位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6372 | face_hug_urethral_sex | 对面抱位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6373 | back_hug_urethral_sex | 背面抱位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6374 | face_lay_urethral_sex | 对面卧位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |
| 6375 | back_lay_urethral_sex | 背面卧位尿道姦 | SEX/insert | 砍掉 | 尿道不做 |

#### SEX/item（6401–6428）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6401 | body_lubricant | 润滑液 | SEX/item | 已完成（待复核） | 通用 |
| 6402 | put_condom | 戴上避孕套 | SEX/item | 已完成（待复核） | 通用 |
| 6403 | take_condom_out | 摘掉避孕套 | SEX/item | 已完成（待复核） | 通用 |
| 6404 | urethral_swab | 尿道棉棒 | SEX/item | 砍掉 | 尿道不做 |
| 6405 | nipples_love_egg | 乳头跳蛋 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6406 | nipple_clamp_on | 戴上乳头夹 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6407 | nipple_clamp_off | 取下乳头夹 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6408 | clit_love_egg | 阴蒂跳蛋 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6409 | clit_clamp_on | 戴上阴蒂夹 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6410 | clit_clamp_off | 取下阴蒂夹 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6411 | electric_message_stick | 电动按摩棒 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6412 | vibrator_insertion | 插入震动棒 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6413 | big_vibrator_insertion | 加粗震动棒 | SEX/item | 延后 | 源码无 handler（仅 Instruct.py:595 常量），未实装 |
| 6414 | huge_vibrator_insertion | 巨型震动棒 | SEX/item | 延后 | 源码无 handler（Instruct.py:597），未实装 |
| 6415 | vibrator_insertion_off | 拔出震动棒 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6416 | vibrator_insertion_anal | 肛门插入震动棒 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6417 | big_vibrator_insertion_anal | 加粗肛门震动棒 | SEX/item | 延后 | 源码无 handler（Instruct.py:603），未实装 |
| 6418 | huge_vibrator_insertion_anal | 巨型肛门震动棒 | SEX/item | 延后 | 源码无 handler（Instruct.py:605），未实装 |
| 6419 | vibrator_insertion_anal_off | 拔出肛门震动棒 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6420 | anal_beads | 塞入肛门拉珠 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6421 | anal_beads_off | 拔出肛门拉珠 | SEX/item | 已完成（待复核） | 玩具系统 |
| 6422 | milking_machine_on | 装上搾乳机 | SEX/item | 延后 | 泌乳已实现；IN_HUMILIATION_ROOM_OR_DR_ROOM → tag has_humiliation_room |
| 6423 | milking_machine_off | 取下搾乳机 | SEX/item | 延后 | 同上 |
| 6424 | urine_collector_on | 装上采尿器 | SEX/item | 砍掉 | 尿道不做 |
| 6425 | urine_collector_off | 取下采尿器 | SEX/item | 砍掉 | 尿道不做 |
| 6426 | remote_toy_on_in_h | 遥控启动玩具 | SEX/item | 已完成（待复核） | 玩具系统（H 内版） |
| 6427 | remote_toy_off_in_h | 遥控关闭玩具 | SEX/item | 已完成（待复核） | 玩具系统（H 内版） |
| 6428 | remote_toy_level_up_in_h | 调高玩具档位 | SEX/item | 已完成（待复核） | 玩具系统（H 内版） |

#### SEX/sm（6501–6514）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6501 | beat_breast | 打胸部_未实装 | SEX/sm | 延后 | 标未实装（前提 TO_DO） |
| 6502 | spanking | 打屁股 | SEX/sm | 延后 | 通用 |
| 6503 | bondage | 绳艺 | SEX/sm | 已完成（待复核） | system:bondage |
| 6504 | patch_on | 戴上眼罩 | SEX/sm | 延后 | 通用（IN_HUMILIATION_ROOM → tag） |
| 6505 | patch_off | 摘下眼罩 | SEX/sm | 延后 | 同上 |
| 6506 | gag_on | 戴上口球 | SEX/sm | 已完成（待复核） | 通用 |
| 6507 | gag_off | 摘下口球 | SEX/sm | 已完成（待复核） | 通用 |
| 6508 | clyster | 灌肠 | SEX/sm | 延后 | 通用（IN_HUMILIATION_ROOM → tag） |
| 6509 | continue_clyster | 继续灌肠 | SEX/sm | 延后 | 同上 |
| 6510 | anal_plug | 肛塞_已废弃 | SEX/sm | 延后 | 标已废弃（前提 TO_DO） |
| 6511 | clyster_end | 拔出肛塞 | SEX/sm | 延后 | 灌肠结束 |
| 6512 | safe_candles | 滴蜡 | SEX/sm | 延后 | 通用 |
| 6513 | whip | 鞭子 | SEX/sm | 延后 | 通用 |
| 6514 | needle | 针_未实装 | SEX/sm | 延后 | 标未实装（前提 TO_DO） |

#### SEX/wait_upon（6601–6632）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6601 | handjob | 手交 | SEX/wait_upon | 已完成（待复核） | 通用（无 judge，SOP §6 已注明） |
| 6602 | blowjob | 口交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6603 | paizuri | 乳交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6604 | footjob | 足交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6605 | hairjob | 发交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6606 | axillajob | 腋交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6607 | rub_buttock | 素股 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6608 | hand_blowjob | 手交口交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6609 | tits_blowjob | 乳交口交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6610 | focus_blowjob | 真空口交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6611 | deep_throat | 深喉插入 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6612 | clean_blowjob | 清洁口交 | SEX/wait_upon | 已完成（待复核） | 通用（精液系统已实现） |
| 6613 | sixty_nine | 六九式 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6614 | legjob | 腿交 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6615 | tailjob | 尾交 | SEX/wait_upon | 砍掉 | 特殊身体特征不做（TARGET_HAVE_TAIL） |
| 6616 | face_rub | 阴茎蹭脸 | SEX/wait_upon | 已完成（待复核） | 通用 |
| 6617 | horn_rub | 阴茎蹭角 | SEX/wait_upon | 砍掉 | 特殊身体特征不做（TARGET_HAVE_HORN） |
| 6618 | ears_rub | 阴茎蹭耳朵 | SEX/wait_upon | 砍掉 | 特殊身体特征不做（TARGET_HAVE_EARS） |
| 6619 | hat_job | 帽子交 | SEX/wait_upon | 延后 | 服装系统（L1.4） |
| 6620 | glasses_job | 眼镜交 | SEX/wait_upon | 延后 | 服装系统 |
| 6621 | ear_ornament_job | 耳饰交 | SEX/wait_upon | 砍掉 | 服装系统 |
| 6622 | neck_ornament_job | 脖饰交 | SEX/wait_upon | 砍掉 | 服装系统 |
| 6623 | mouth_ornament_job | 口罩交 | SEX/wait_upon | 延后 | 服装系统 |
| 6624 | top_job | 上衣交 | SEX/wait_upon | 延后 | 服装系统 |
| 6625 | corset_job | 胸衣交 | SEX/wait_upon | 延后 | 服装系统 |
| 6626 | gloves_job | 手套交 | SEX/wait_upon | 延后 | 服装系统 |
| 6627 | skirt_job | 裙子交 | SEX/wait_upon | 延后 | 服装系统 |
| 6628 | trousers_job | 裤子交 | SEX/wait_upon | 延后 | 服装系统 |
| 6629 | underwear_job | 内裤交 | SEX/wait_upon | 延后 | 服装系统 |
| 6630 | socks_job | 袜子交 | SEX/wait_upon | 延后 | 服装系统 |
| 6631 | shoes_job | 鞋子交 | SEX/wait_upon | 延后 | 服装系统 |
| 6632 | weapons_job | 武器交 | SEX/wait_upon | 砍掉 | 服装/装备系统（武侠适配） |

#### SEX 尾段 6901–6905（全部标未实装）

| cid | id | 名称 | 类型 | 建议 | 理由 |
|-----|-----|------|------|------|------|
| 6901 | sedecu | 诱惑对方_未实装 | SEX | 延后 | 标未实装（CSV 名称；源码有 handler 但标注为准，handle_instruct.py:2242） |
| 6902 | shame_play | 羞耻play_未实装 | SEX | 延后 | 标未实装（前提 TO_DO） |
| 6903 | take_shower_h | 淋浴_未实装 | SEX | 延后 | 标未实装（前提 TO_DO） |
| 6904 | bubble_bath | 泡泡浴_未实装 | SEX | 延后 | 标未实装（前提 TO_DO） |
| 6905 | give_blowjob | 给对方口交_未实装 | SEX | 延后 | 标未实装（前提 TO_DO） |

---

## 砍掉原因汇总（94 条，互斥分配；2026-08-07 用户复筛后重算）

| 原因 | 数量 | 覆盖条目 |
|------|------|----------|
| 方舟世界观专属 | 19 | originium_arts、WORK 17 条（2001/2006/2011-2013/2015/2017/2020-2024/2027/2032-2034/2051）、5106 |
| 依赖未实装系统（监狱/育儿/香薰/膨胀/透视/日记/收藏/成就/冰箱/身体检查） | 13 | 1013、1030-1035、2028、3003、3008、3009、3016、3030 |
| 标"未实装"（TO_DO） | 7 | chara_diy_instruct、1026-1028、2002、4007、4008 |
| 标"已废弃" | 3 | 6103、6317、6331 |
| 尿道不做 | 19 | 6214、6217、6362-6375（14）、6404、6424、6425 |
| 特殊身体特征不做 | 9 | 5006-5011、6615、6617、6618（spec/迁移SOP 称"8 条"但列举为 9 条） |
| 源码无 handler（未实装） | 1 | 6101（仅常量+空前提） |
| 调试专用（@ 命令替代） | 3 | SYSTEM 13-15 |
| 编码损坏 | 1 | 3020（IN_CAFÉ） |
| 用户复筛新增砍除（原保留 → 砍掉） | 19 | 门锁 6/7、1007、1008、5005、3011、3013、3014、3015、3017、3021、3023、3024、3026、3027、3028、6621、6622、6632 |

## 延后汇总（82 条，2026-08-07 用户复筛后重算）

> 延后 = 记 TODO，依赖系统实装后再评估进入批次。已按用户复筛结果归入延后（含原砍掉的 46 条：监禁/爱情旅馆/乱伦/服从值/透视/激素/未实装标记类等）。

### SYSTEM（3）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 12 | chat_with_ai | 与文本生成AI对话 | LLM 对话系统（独立可选阶段） |
| 17 | test_instruct | 测试用临时指令 | 临时测试指令（DEBUG） |
| 18 | talk_quick_test | 快速测试口上 | 调试专用口上测试 |

### DAILY（6）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 1001 | wait | 等待五分钟 | 时间推进（特殊耗时 wait=5） |
| 1002 | wait_1_hour | 等待一个小时 | DEBUG_MODE_ON 专用 |
| 1003 | wait_6_hour | 等待六个小时 | DEBUG_MODE_ON 专用 |
| 1006 | massage | 按摩 | 通用（用户复筛延后） |
| 1025 | give_gift | 赠送礼物 | 通用（用户复筛延后） |
| 1029 | pee | 解手 | 尿液属性/如厕系统（用户复筛延后） |

### WORK（16）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 2003 | field_commission | 外勤委托 | spec §4 保留清单，用户复筛延后 |
| 2004 | training | 战斗训练 | 同上 |
| 2005 | cure_patient | 诊疗病人 | 同上 |
| 2007 | recruit | 招募干员 | 方舟干员招募（用户复筛延后） |
| 2008 | confim_recruit | 确认已招募干员 | 方舟招募 |
| 2009 | recruitment | 招募情况 | 方舟招募面板 |
| 2010 | teach | 授课 | spec §4 保留清单，用户复筛延后 |
| 2014 | repair_equipment | 维修装备 | 同上 |
| 2016 | assistant_adjustments | 助理相关调整 | 助理系统未实装 |
| 2018 | invite_visitor | 邀请访客 | 方舟外交/访客系统 |
| 2019 | visitor_system | 访客系统 | 方舟外交/访客系统 |
| 2026 | manage_agriculture | 管理农业生产 | 方舟农业管理面板 |
| 2029 | manage_confinement_and_training | 管理监禁调教 | 监禁调教系统未实装 |
| 2030 | investigate_resource_market | 研判资源市场 | 方舟资源市场 |
| 2031 | manage_resource_exchange | 管理资源交易 | 方舟资源交易 |
| 2035 | manage_dormitory | 宿舍管理系统 | 方舟宿舍管理 |

### PLAY（8）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 3004 | play_with_child | 一起玩耍 | 儿童/育儿系统未实装 |
| 3006 | borrow_book | 借阅书籍 | 通用（用户复筛延后） |
| 3010 | play_water | 玩水 | 通用（用户复筛延后） |
| 3018 | taste_wine | 品酒 | 通用（用户复筛延后） |
| 3019 | taste_tea | 品茶 | 通用（用户复筛延后） |
| 3022 | taste_food | 品尝美食 | 通用（用户复筛延后） |
| 3025 | full_body_styling | 全身造型服务 | 通用服务（用户复筛延后） |
| 3029 | onsen_bath | 泡温泉 | 通用（用户复筛延后） |

### ARTS（4）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 4109 | penetrating_vision_on | 开启透视 | 透视系统未实装 |
| 4110 | penetrating_vision_off | 关闭透视 | 透视系统未实装 |
| 4111 | hormone_on | 开启信息素 | 信息素系统（用户复筛延后） |
| 4112 | hormone_off | 关闭信息素 | 信息素系统 |

### OBSCENITY（16）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 5001 | make_coffee_add | 泡咖啡（加料） | 通用（用户复筛延后） |
| 5018 | ask_for_socks | 索要袜子 | 前提 COLLECT_BONUS_202 依赖收藏系统（已砍），需改前提 |
| 5021 | steal_socks | 偷走袜子 | 通用（用户复筛延后） |
| 5023 | steal_scene_all_socks | 偷走所有人袜子 | 同上 |
| 5036 | bagging_and_moving | 装袋搬走 | 监禁/装袋系统未实装 |
| 5037 | release_from_bag | 从袋中放出来 | 监禁/装袋系统未实装 |
| 5038 | put_into_prison | 投入监牢 | 监禁系统未实装 |
| 5039 | set_free | 解除囚禁 | 监禁系统未实装 |
| 5040 | check_locker | 检查衣柜 | 服装/衣柜系统（L1.4，用户复筛延后） |
| 5041 | confession | 告白 | 恋爱系统（TARGET_LOVE_2 + HAVE_RING） |
| 5042 | give_necklace | 戴上项圈 | 服从值系统（TARGET_OBEY_2，未实装） |
| 5043 | prepare_training | 调教前准备 | 监禁调教系统未实装 |
| 5044 | switch_to_h_interface | 切换到H | 标未实装（TO_DO） |
| 5048 | do_h_in_love_hotel | 邀请在爱情旅馆H | 爱情旅馆系统未实装 |
| 5050 | do_h_with_daughter | 邀请乱伦H | 女儿/后代系统未实装 |
| 5051 | imprisonment_h | 监禁奸 | 监禁系统未实装 |

### SEX/base（3）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 6003 | h_with_daughter_end | 结束乱伦H | 女儿/后代系统未实装 |
| 6004 | imprisonment_h_end | 结束监禁奸 | 监禁系统未实装 |
| 6018 | switch_to_non_h_interface | 切换到非H | 标未实装（TO_DO） |

### SEX/drug（2）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 6104 | diuretics_once | 一次性利尿剂 | 尿液属性（用户复筛延后） |
| 6105 | diuretics_persistent | 持续性利尿剂 | 同上 |

### SEX/insert（1）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 6361 | double_penetration | 二穴插入_未实装 | 标未实装（TO_DO） |

### SEX/item（4）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 6413 | big_vibrator_insertion | 加粗震动棒 | 源码无 handler（Instruct.py:595） |
| 6414 | huge_vibrator_insertion | 巨型震动棒 | 源码无 handler（Instruct.py:597） |
| 6417 | big_vibrator_insertion_anal | 加粗肛门震动棒 | 源码无 handler（Instruct.py:603） |
| 6418 | huge_vibrator_insertion_anal | 巨型肛门震动棒 | 源码无 handler（Instruct.py:605） |

### SEX/sm（3）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 6501 | beat_breast | 打胸部_未实装 | 标未实装（TO_DO） |
| 6510 | anal_plug | 肛塞_已废弃 | 标已废弃（TO_DO） |
| 6514 | needle | 针_未实装 | 标未实装（TO_DO） |

### SEX/wait_upon（11）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 6619 | hat_job | 帽子交 | 服装系统（L1.4，用户复筛延后） |
| 6620 | glasses_job | 眼镜交 | 服装系统 |
| 6623 | mouth_ornament_job | 口罩交 | 服装系统 |
| 6624 | top_job | 上衣交 | 服装系统 |
| 6625 | corset_job | 胸衣交 | 服装系统 |
| 6626 | gloves_job | 手套交 | 服装系统 |
| 6627 | skirt_job | 裙子交 | 服装系统 |
| 6628 | trousers_job | 裤子交 | 服装系统 |
| 6629 | underwear_job | 内裤交 | 服装系统 |
| 6630 | socks_job | 袜子交 | 服装系统 |
| 6631 | shoes_job | 鞋子交 | 服装系统 |

### SEX 尾段（5）
| cid | id | 名称 | 依赖 |
|-----|-----|------|------|
| 6901 | sedecu | 诱惑对方_未实装 | 标未实装 |
| 6902 | shame_play | 羞耻play_未实装 | 标未实装 |
| 6903 | take_shower_h | 淋浴_未实装 | 标未实装 |
| 6904 | bubble_bath | 泡泡浴_未实装 | 标未实装 |
| 6905 | give_blowjob | 给对方口交_未实装 | 标未实装 |

## 数据依据说明

- 全部 404 条的 id/名称/类型/前提集/行为ID 均直接取自 `InstructConfig.csv`（各分类的行号范围见分类标题）
- 源码查证点：6010（handle_instruct.py:3180）、6011/6012（:3189/:3195）、6108/6109（:2719/:2725）、6101（Instruct.py:555 无对应 handler）、6413/6414/6417/6418（Instruct.py:595-605 无对应 handler）、1011（food_shop_panel.py:22）、1035（handle_instruct.py:1069）、6901（handle_instruct.py:2242 有 handler 但 CSV 标注未实装，按标注为准）、5017/5018 前提（handle_premise_other.py:728/743）、3020 编码与设施（InstructConfig.csv 第 115 行 + Entertainment.csv 第 24 行）
- 本清单只做"做不做"决策；time_cost/judge/前提注册/效果链等逐条细节全部留给批次阶段（SOP §3-§9）









