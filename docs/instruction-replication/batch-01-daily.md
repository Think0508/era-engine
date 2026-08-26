# L1.6 指令复刻 · B1 批次清单（daily 24 条）

> 依据 SOP §8 每批工作流第 1 步产出。B1 = DAILY 17 + WORK 2 + PLAY 5 = **24 条**。
> 工作副本：`instruction-keep-list.md`；tag 总表：`location-tags.md`。
> **当前进度（2026-08-08）**：按用户要求先试点 `chat`（1004）——单独完整复刻 + 最小化验证，
> 其余 23 条状态 = `待筛选`（用户基于 master-list 确认后再逐条进行，不批量写 TOML）。

---

## 0. 批次总览

| # | cid | id | 名称 | 来源类型 | 状态 |
|---|-----|-----|------|---------|------|
| 1 | 1004 | chat | 聊天 | DAILY | ✅ 已复刻（试点） |
| 2 | 1005 | stroke | 身体接触 | DAILY | 待筛选 |
| 3 | 1009 | make_food | 做饭 | DAILY | 待筛选（IN_KITCHEN_OR_IN_DR_ROOM_AND_DR_ROOM_LEVEL_GE_2 → tag，DR_ROOM_LEVEL 无法 tag 化） |
| 4 | 1010 | eat | 进食 | DAILY | 待筛选（HAVE_FOOD） |
| 5 | 1011 | put_selfmade_food_in | 放入自制食物 | DAILY | 待筛选（IN_TAKE_FOOD → has_canteen） |
| 6 | 1012 | rest | 休息 | DAILY | ⚠️ test-mod 已有同名（恢复效果），B1 需对齐 erArk 值 |
| 7 | 1014 | sleep | 睡觉 | DAILY | 待筛选（特殊耗时：跨天跳转，需 handler，L1.7 处理；IN_DORMITORY_OR_HOTEL → has_bedroom） |
| 8 | 1015 | take_shower | 淋浴 | DAILY | 待筛选（IN_BATHROOM → has_bathroom） |
| 9 | 1016 | buy_h_item | 购买成人用品 | DAILY | 待筛选（IN_H_SHOP → has_h_shop） |
| 10 | 1017 | buy_food | 购买食物 | DAILY | 待筛选（IN_FOOD_SHOP → has_food_shop，**CSV 核对**） |
| 11 | 1018 | all_npc_position | 角色位置一览 | DAILY | 待筛选（功能指令） |
| 12 | 1019 | follow | 邀请同行 | DAILY | 跟随系统已做（2026-08-10），指令复刻延后——数据入 native-instructions 插件；效果走 `set_follow`（=erArk 363）；前提含 TARGET_NOT_FOLLOW/NO_TARGET_OR_TARGET_CAN_COOPERATE（已注册） |
| 13 | 1020 | end_follow | 结束同行 | DAILY | 跟随系统已做（2026-08-10），指令复刻延后——同上；效果走 `set_follow`（=erArk 365）；前提 TARGET_IS_FOLLOW（已注册） |
| 14 | 1021 | ask_target_rest | 让对方休息 | DAILY | 待筛选 |
| 15 | 1022 | ask_target_sleep | 让对方去睡觉 | DAILY | 待筛选 |
| 16 | 1023 | apologize | 道歉 | DAILY | 待筛选 |
| 17 | 1024 | listen_complaint | 听牢骚 | DAILY | 待筛选 |
| 18 | 2025 | plant_manage_crop | 种植与养护作物 | WORK | 待筛选（IN_HERB_GARDEN_OR_GREENHOUSE → has_herb_garden） |
| 19 | 2036 | mixology | 调酒 | WORK | 待筛选（IN_BAR → has_bar） |
| 20 | 3001 | singing | 唱歌 | PLAY | 待筛选 |
| 21 | 3002 | play_instrument | 演奏乐器 | PLAY | 待筛选 |
| 22 | 3005 | exercise | 锻炼身体 | PLAY | 待筛选（IN_GYM_ROOM → has_gym） |
| 23 | 3007 | read_book | 读书 | PLAY | 待筛选（IN_LIBRARY → has_library，**CSV 核对** cid 3006/3007 出入） |
| 24 | 3012 | play_chess | 下棋 | PLAY | 待筛选（IN_BOARD_GAMES_ROOM → has_board_games） |

---

## 1. chat（cid 1004）——试点深度分析

### 1.1 数据源（全部查证，行号可追溯）

| 项 | 值 | 来源 |
|----|----|------|
| InstructConfig.csv | `1004,chat,聊天,DAILY,0,HAVE_TARGET\|NOT_H\|TIRED_LE_84\|HP_G_1\|NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1,CHAT,1,,mouth,mouth_talk,mouth` | InstructConfig.csv:27 |
| Behavior_Data.csv | duration = **5**（非 -1，直接使用） | Behavior_Data.csv:15 |
| Behavior_Effect.csv（成功链） | `21 - 12 - CVE_A2_E\|80_G_1 - CVE_A1_E\|80_G_1 - 53 - 55 - 501` | Behavior_Effect.csv:14 |
| Behavior_Effect.csv（失败链 102 chat_failed） | `12` | Behavior_Effect.csv:15 |
| handler | `handle_chat()`：`talk_count > 发起者ability[40]+1` → CHAT_FAILED，否则 CHAT；**无论成败 talk_count += 1** | handle_instruct.py:455-465 |
| 计数衰减 | `change_character_talkcount_for_time`：同日小时前进 → count -= 小时差；跨天 → count = 0；下限 0 | settle_behavior.py:560-581 + character_behavior.py:413（每次行动开始时结算） |

### 1.2 判定四列

| Q1 handler 有显式 judge 参数？ | Q2 判定族在 adjustments 表？ | Q3 judge_base / judge_class |
|---|---|---|
| ❌ 无（handle_chat 走 `chara_handle_instruct_common_settle` 无 judge 参数） | — | **不写**（SOP §6 三问决策，Q1=否） |

### 1.3 前提依赖状态（逐个查 premiseRegistry）

> 2026-08-08 erArk 更新对齐：新版 InstructConfig.csv 的 chat 行 premise_set 已精简为
> `HAVE_TARGET|NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1`——NOT_H/TIRED_LE_84/HP_G_1
> 移出 premise_set，改由 `h_mode_show_type=1`（非H显示）+ `tired_type=1`（低疲劳）运行时自动注入
> （handle_instruct.py:134-152）。我们引擎无运行时注入 → TOML 显式展开（见下），
> 并新增 NOT_SHOW_NON_H_IN_HIDDEN_SEX / DRUNK_LEVEL_NOT_3 两个注入前提。

| 前提 | 状态 | 说明 |
|------|------|------|
| HAVE_TARGET | ✅ 已注册 | premise-h.ts:37 |
| NOT_H | ✅ 已注册 | premise-h.ts:41 |
| TIRED_LE_84 | ✅ 已注册 | premise-h.ts:50（疲劳/160 ≤ 0.84 → ≤134，与 erArk `handle_t_tired_le_84` 一致） |
| HP_G_1 | ✅ 已注册 | premise-h.ts:57（体力 > 1 = erArk `handle_self_not_tired`） |
| NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1 | ✅ 已注册（C 类） | 语义：无目标 OR 目标可协同 OR 目标被监禁（handle_premise/__init__.py:834）。与 HAVE_TARGET 取 AND 后"无目标"分支实际失效，生效条件 = 目标存在 AND（可协同 OR 被监禁）。已注册 handler（见 §1.7），未实装子系统留 TODO 注释 |
| NOT_SHOW_NON_H_IN_HIDDEN_SEX | ✅ 已注册（2026-08-08 新增） | h_mode_show_type=1 自动注入：隐奸全局开关取反（handle_premise_other.py:1675-1687）；开关未实装 → 恒 true = erArk 默认值 |
| DRUNK_LEVEL_NOT_3 | ✅ 已注册（2026-08-08 新增） | tired_type=1 自动注入：醉酒等级≠3（handle_premise_base_value.py:1197）；醉酒系统未实装 → 恒 true = 语义正确降级 |

### 1.4 time_cost 核对

| 项 | 值 | 来源 |
|----|----|------|
| Behavior_Data duration | 5 | 非 -1，照抄 |
| handler 特殊耗时 | 无 | handle_chat 无 duration 覆写 |

→ `time_cost = 5`

### 1.5 效果 ID 映射（两步路径，逐条翻译）

| erArk 效果 ID | 常量名 | 公式（default.py / common_default.py） | 我们的 effect |
|---------------|--------|-----------------------------------------|---------------|
| 21 | ADD_INTERACTION_FAVORABILITY | `base_chara_favorability_and_trust_common_settle(id, add_time, True, 0, 0)` → add = calculation_favorability(add_time)，无额外系数（default.py:124） | `{ type = "settle_favorability" }`（target） |
| 12 | DOWN_BOTH_SMALL_MANA_POINT | `base_chara_hp_mp_common_settle(id, add_time, mp_value=-1, target_flag=True)`：MP -= add_time×3，双方；MP 触 0 → HP 等值扣（下限1）（default.py:222） | `{ type = "settle_hp_mp", params = { mpValue = -1, degree = 0 } }` ×2（self + selected，复刻 target_flag 双目标） |
| CVE_A2_E\|80_G_1 | 综合数值结算（A2=对方, E\|80=经验80, G=加, 1=值） | settle_behavior.py:702-797：对方 对话经验 +1 | `{ type = "h_experience", params = { expId = "80", value = 1 } }`（target） |
| CVE_A1_E\|80_G_1 | 同上（A1=自己） | 自己 对话经验 +1 | `{ type = "h_experience", params = { expId = "80", value = 1 } }`（self） |
| 53 | TARGET_ADD_SMALL_FRIENDLY | `base_chara_state_common_settle(target, add_time, 11, ability_level = target.ability[32])`（好意，亲密修正）（default.py:3402） | `{ type = "settle_state", params = { state = "好意", baseValue = 30 } }`（hConfig state_ability 好意→亲密，精确对应 ability[32]） |
| 55 | TARGET_ADD_SMALL_HAPPY | `base_chara_state_common_settle(target, add_time, 13, ability_level = target.ability[13])`（快乐，快乐刻印修正）（default.py:3450） | `{ type = "settle_state", params = { state = "快乐", baseValue = 30 } }`（hConfig state_ability 快乐→快乐刻印，精确对应 ability[13]） |
| 501 | TALK_ADD_ADJUST | ① adjust = ability_lv_adjust[发起者.话术技能]；② 好感 = int(calcFavorability × adjust)，>0 再乘连续减值；③ 好意 += base_chara_state_common_settle(target, tc, 11, ability_level=话术)（全管线：tenths/素质/攻略/连续减值）；④ 快乐 同上（state 13 属刻印状态 → get_mark_debuff_adjust(话术)）；⑤ 记录 talk_time（default.py:5894-5900：有目标且任一方为玩家才结算 → NPC→NPC 跳过；NPC→玩家 也会结算） | 🔴 **新注册 `talk_add_adjust`**（精确复刻，见 §1.6） |
| （handler 分支） | handle_chat 的 talk_count 判定 | 失败链 [12] / 成功链全链；talk_count 递增与时间衰减 | 🔴 **新注册 `chat_settle`**（见 §1.6） |

> 经验 80 = 对话经验（Experience.csv:82）。CVE 无阈值条件——`_G_1` 的 1 是增加值（settle_behavior.py:702-797 解析），SOP §8 速查表的 condition 解读不适用于 erArk 解析器，按源码为准。

### 1.6 需新增的引擎效果（h-core 注册，均精确复刻 erArk）

**`chat_settle`**（= handle_instruct.py handle_chat + settle_behavior.py 计数衰减）：
- 时间衰减：用（当前时间 − time_cost，即本次行动开始时刻）比对 `target.action_info.talk_time`（{day, hour}）：同日且小时前进 → count -= 小时差；跨天 → count = 0；下限 0
- 分支：`talk_count > 发起者.话术技能.level + 1` → 执行 `failEffects`（失败链 [12]）；否则执行 `successEffects`（成功链 21-12-CVE_A2-CVE_A1-53-55-501）
- 无论如何 `talk_count += 1`（存 `char.action_info.talk_count`）
- 两条链通过 TOML params 传入（保持"效果链逐条翻译"可见、mod 可覆写）

**`talk_add_adjust`**（= default.py:5875 TALK_ADD_ADJUST）：
- 结算条件（:5894-5900）：有目标 且（发起者或目标任一为玩家）——NPC→NPC 跳过；NPC→玩家 也会结算
  （2026-08-08 修正：原文"仅玩家→NPC 生效"为误读）
- adjust = ability_lv_adjust[发起者.话术技能.level]（hConfig 表 = Ability_Lv_Adjust.csv:0-10 逐行一致）
- target 好感度 += int(calcFavorability(target, tc) × adjust)；>0 时再乘连续重复减值
  （base_chara_favorability_and_trust_common_settle，common_default.py:616-618；难度修正 TODO）
- target 好意/快乐：完整 base_chara_state_common_settle 管线（ability_level = 发起者.话术技能）：
  tenths_add（+min(3×base, 当前/10)）/ 素质修正 / 攻略进度 / 连续减值 / max(0) 钳制；
  快乐为刻印状态 → 系数 = get_mark_debuff_adjust(话术)（erArk state 13 ∈ [13,15,17,18,20]）
  （2026-08-08 审查修复：原实现只算 floor((tc+30)×adjust)，缺 tenths/连续减值/素质——违反"禁止简化"，
  已补全；chat 测试断言同步更新：话术0 → 好意/快乐 73（原 70）、话术5 → 好意 101（原 98））
- 记录 `target.action_info.talk_time = { day, hour }`

> 判定四列/前提/耗时的决策记录见上；**未知效果 ID：无**（本链 7 个 ID 全部翻译完毕）。

### 1.7 需注册的前提 handler（premise-h.ts）

`NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1`（语义：handle_premise/__init__.py:834 + :811）：
- 无目标 → true（与 HAVE_TARGET AND 后实际不触发）
- 目标可协同：体力 > 1 且 疲劳 ≤ 134 且 未睡眠 且 状态2/6/7正常
  - 状态2（临盆/产后/监禁）→ 未实装 → 恒正常（TODO）
  - 状态6（睡眠/无意识/时停/空气）→ 睡眠/无意识未实装（L1.7）；时停可查 `h-time-stop.isActive` API → 已接入
  - 状态7（装袋/外勤/婴儿/外交/逃跑）→ 未实装 → 恒正常（TODO）
- 目标被监禁 → 监狱系统未实装 → 恒 false（TODO）

### 1.8 位置 tag 对照

chat 无 IN_* 前提 → **不写 condition**（默认全地点可用）。无新增 tag 登记。

### 1.9 引擎级近似（结算保真补全 2026-08-08）

| erArk 逻辑 | 我们现状 |
|-----------|---------|
| base_chara_state_common_settle 的 tenths_add（当前值/10 加成，≤3×） | ✅ **已实现**（settle_state + tech_adjust 全局生效，含测试） |
| 连续重复指令减值（第 3 次起 1−0.15×(n−1)，下限 0.4） | ✅ **已实现**（引擎记录执行历史 behaviorHistory；settle_state/tech_adjust/favorability/trust 全部生效，仅正收益、非负面、非自己；含测试） |
| 无意识/时停门控（心智状态与心理快感跳过；好感/信赖/气力不结算） | ✅ **已实现时停部分**（sp_flag.unconscious_h===3，per-id 多目标正确；睡眠/无意识留 TODO，L1.7 补一行） |
| tech_adjust 公式与能力映射 | ✅ **审查修复**：欲情 = base×ability表[目标.部位感度]（原误用 sqrt）；部位感度按名查（PART_ABILITY 映射，原查 '皮肤' 恒 undefined 静默失效） |
| 系统难度修正（difficulty_setting[1] 系数） | 📝 TODO——依赖全局难度设置系统（未实装，同 spec §5.3 处理） |
| 信物修正（eqip_token，好感+0.1~0.5 / 状态×数量） | 📝 TODO——依赖收藏/信物系统（粗筛已砍），留 TODO |
| calcFavorability 亲密项死键 bug | ✅ **已修复**（改按名查 `亲密`，erArk ability[32]） |

### 1.10 能力依赖

- 话术技能（erArk ability 40，Ability.csv:36）——chat 分支与 501 依赖。**h-core 默认 abilities.toml 缺该能力，本次已补**（max_level=10，tags=["abl"]）

### 1.11 自审清单

- [x] 每个数值/效果 ID 有 erArk 来源（上表行号）
- [x] 无判定判断正确（Q1 查过 handle_chat 无 judge 参数）
- [x] judge_base/judge_class 不写
- [x] time_cost = 5（Behavior_Data.csv 非 -1，handler 无覆写）
- [x] 无位置前提 → 不写 condition、无 tag 登记
- [x] 未注册前提 NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1 已注册（C 类，语义查证）
- [x] 效果链 7 ID + 失败链 1 ID 无合并/省略；无未知 ID
- [x] 未在 TOML 手写 judge_check/高潮/刻印结算
- [x] TOML 内中文属性名正常（TS 代码用 ATTR 常量/按名查 abilities）

---

## 2. 前提注册需求汇总（全批）

| 前提 | 出现指令 | 状态 |
|------|---------|------|
| NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1 | chat(1004) 等 | ✅ 已注册（chat 试点时） |
| HAVE_FOOD / 其余 | 待各条筛选后逐条核对 | 待批次 |

**2026-08-08 自动注入前提展开（erArk 新版 CSV h_mode_show_type/tired_type 两列）**：
- 逐条迁移时除 premise_set 显式前提外，按 §4.1 规则补写自动注入前提：
  - `h_mode_show_type=1` → +`NOT_H` +`NOT_SHOW_NON_H_IN_HIDDEN_SEX`（且 modes 默认 exploration）
  - `h_mode_show_type=2` → +`TARGET_IS_H`（modes=['h_scene']）
  - `tired_type=1` → +`TIRED_LE_84` +`HP_G_1` +`DRUNK_LEVEL_NOT_3`
  - `tired_type=2` → +`TIRED_LE_74` +`HP_G_1` +`DRUNK_LEVEL_NOT_3`（TIRED_LE_74 已注册，疲劳≤118）
- 已注册：NOT_SHOW_NON_H_IN_HIDDEN_SEX（恒 true+TODO）、DRUNK_LEVEL_NOT_3（恒 true+TODO）、TIRED_LE_74（≤118）
- 待批次：TARGET_IS_H（H 内指令，检查 premise-h.ts 是否已注册）

## 3. 位置 tag 登记（累积到 location-tags.md）

本次无新增（chat 无位置前提）。

## 4. 待办

- [ ] 用户筛选其余 20 条 → 逐条按 SOP 复刻（每条约 30 分钟分析+实现；take_shower 已完成待用户确认）
- [ ] sleep 特殊耗时（跨天跳转，需 handler）→ L1.7 已处理
- [ ] 批末验收：`npm run typecheck && npm run test` + dev 实测（指令栏出现/点击执行/数值变化/口上触发）
  - 口上触发 ✅ 已接入（2026-08-17）：chat_settle success_scene="chat"/fail_scene="chat_failed" + 插件默认层原生通用口上（talk-common behavior/ 目录），测试覆盖；dev 实测仍待做
- [ ] 全部完成后再批量删除 erark_id/erark_behavior 迁移字段

---

## 5. take_shower（1015）——深度分析

### 5.1 数据源（全部查证，行号可追溯）

| 项 | 值 | 来源 |
|----|----|------|
| InstructConfig.csv | `1015,take_shower,淋浴,DAILY,0,1,1,IN_BATHROOM,TAKE_SHOWER,1,,hand,hand_daily,` | InstructConfig.csv:38 |
| Behavior_Data.csv | duration = **30**（行为 cid 112，非 -1） | Behavior_Data.csv:21 |
| Behavior_Effect.csv（成功链） | `12 - 304 - 525 - 702 - 1751` | Behavior_Effect.csv:20 |
| handler | `handle_take_shower()` → `chara_handle_instruct_common_settle(Behavior.TAKE_SHOWER)`，无 judge 参数 | handle_instruct.py:837-840 |
| 效果公式 | 12=default.py:223-238 / 304=default.py:4618-4637 / 525=default.py:6685-6733 / 702=default.py:9594-9612 / 1751=default.py:2753-2784 | Script/Settle/default.py |

### 5.2 判定四列

| Q1 handler 有显式 judge 参数？ | Q2 判定族在 adjustments 表？ | Q3 judge_base / judge_class |
|---|---|---|
| ❌ 无（无 judge 参数） | — | **不写**（SOP §6 Q1=否） |

### 5.3 前提迁移

| 原前提 | 处理 | 最终形式 |
|--------|------|----------|
| IN_BATHROOM | 位置 → condition（location-tags.md：has_bathroom） | `condition = "location.tags.has_bathroom == true"` |
| h_mode_show_type=1 自动注入 | 显式展开 | `NOT_H` + `NOT_SHOW_NON_H_IN_HIDDEN_SEX` |
| tired_type=1 自动注入 | 显式展开 | `TIRED_LE_84` + `HP_G_1` + `DRUNK_LEVEL_NOT_3` |

→ premises = `["NOT_H", "NOT_SHOW_NON_H_IN_HIDDEN_SEX", "TIRED_LE_84", "HP_G_1", "DRUNK_LEVEL_NOT_3"]`，无 HAVE_TARGET（自洗指令）。

### 5.4 耗时

| 项 | 值 | 来源 |
|----|----|------|
| Behavior_Data duration | 30 | 非 -1，照抄 |
| handler 特殊耗时 | 无 | handle_instruct.py:837-840 |

→ `time_cost = 30`

### 5.5 效果 ID 映射（逐条翻译，无合并省略）

| erArk 效果 ID | 常量名 | 我们的 effect | 说明 |
|---------------|--------|---------------|------|
| 12 | DOWN_BOTH_SMALL_MANA_POINT | `settle_hp_mp` × 2：`target = "self"` + `target = "selected_optional"`（params 同 `{ mpValue = -1, degree = 0 }`） | 气力 -3/分；erArk `target_flag=True` 会连带当前选中目标，无目标时 `selected_optional` 为空 → 只扣自己（rest 同款 target 语义） |
| 304 | SHOWER_FLAG_TO_3 | `{ type = "set_field", target = "self", params = { path = "sp_flag.shower_state", value = 3 } }` | erArk 另调 settle_chara_unnormal_flag(1) 重算 bit1；T_NORMAL_1 未注册/无消费方 → TODO 不同步 |
| 525 | DIRTY_RESET_IN_SHOWER | `{ type = "dirty_reset_in_shower", target = "self" }` | 🔴 新效果：保留 6/7/8/15 比例（0.2/0.7/0.3/1），其余 body_semen/cloth_semen/penis_dirty_dict/a_clean/enema_capacity 清零；body_manage[21] 未实装 TODO |
| 702 | RECORD_SHOWER_TIME | `{ type = "record_shower_time", target = "self" }` | 🔴 新效果：`action_info.last_shower_time = 当前时间` |
| 1751 | FACILITY_DAMAGE_CHECK | **不搬 TODO** | 基建/方舟世界观专属，与 rest(1012)/sleep(1014) 一致；default.py:2753-2784 |

### 5.6 通用口上

- erArk `data/talk/daily/take_shower.csv`：全部 `high_1` 权重前提、~18 条 AI 生成长文本 → 不照搬。
- 落 `talk-common-system/data/default/talk-common/behavior/daily/take_shower.toml`：1 示例 + 1 占位符（`淋浴指令通用口上 1`），条件 `premise(high_1)`，无世界观残留。

### 5.7 测试

- `src/plugins/instruction-take-shower.test.ts`（5 例）：成功链数值（时间/MP/HP/shower_state/body_semen 保留比例/dirty 清零/record_time）、无目标自洗、位置+前提门控、口上触发与无世界观、无 error。
- 全量 `npm run typecheck` + `npm run test` 已绿（1229 passed）。
