# erArk 属性字段对账表（迁移期对照字典）

> **生命周期 = 迁移期**：spec §11 收尾与 `erark_id` 字段一并归档。
> **方向（权威）**：以我们迁移的属性字段为权威。erArk 字段我们可能 ①改名（映射表）②替代处理（换了机制表达）③有意删减（已筛掉，标注理由防误补——激素教训）④遗漏（迁移会撞墙，需补定义）。
> **骨架（A）** = erArk 定义全集（CharacterState / Experience / Ability / CharacterTalent + game_type.Character 结构体）。
> **遗漏抓取源（B）** = 228 保留指令效果链引用（经映射表归一；`保留指令引用` 列 = B 命中）。
> 生成：scripts/scan-erark-defs.cjs --ledger（2026-08-09）。脚本只自动标记，四类判定由人工确认后固化为本文。

## 统计

| 归类 | 数量 | 说明 |
|------|------|------|
| 已对齐 | 364 | 直接对应（含改名映射，指向 scripts/erark-name-map.json） |
| 替代处理 | 15 | 结构差异或换机制表达，指向实现位置 |
| 有意删减 | 45 | 手动过滤掉的（世界观/系统未实装/简化），标注理由 |
| 遗漏 | 0 | erArk 引用而我们无对应（人工确认后应为 0，需补的进 attributes/abilities） |

## 四类判定明细

### 1. 已对齐（含改名映射）

| erArk 字段 | erArk id | 来源 | 处理方式（我们的字段） | 保留指令引用 |
|-----------|----------|------|------------------------|--------------|
| 皮肤 | 0 | CharacterState | `皮肤` | making_out, make_masturebate, safe_candles, handjob, blowjob, footjob, axillajob, rub_buttock |
| 胸部 | 1 | CharacterState | `胸部` | touch_breast, milk, breast_caress, twiddle_nipples, breast_sucking, nipples_love_egg, nipple_clamp_on, milking_machine_on |
| 阴蒂 | 2 | CharacterState | `阴蒂` | touch_clitoris, clit_caress, open_labia, cunnilingus, clit_love_egg, clit_clamp_on, electric_message_stick, rub_buttock |
| 阴茎 | 3 | CharacterState | `阴茎` |  |
| 阴道 | 4 | CharacterState | `阴道` | touch_vagina, cunnilingus, finger_insertion, vibrator_insertion, sixty_nine |
| 肛肠 | 5 | CharacterState | `后穴` |  |
| 尿道 | 6 | CharacterState | `尿道` |  |
| 子宫 | 7 | CharacterState | `子宫` | external_womb_massage, womb_os_caress |
| 润滑 | 8 | CharacterState | `润滑` | stroke, touch_head, touch_breast, touch_buttocks, embrace, kiss, lap_pillow, raise_skirt |
| 习得 | 9 | CharacterState | `习得` | plant_manage_crop, singing, play_instrument, exercise, play_chess, external_womb_massage, bondage, clyster |
| 恭顺 | 10 | CharacterState | `恭顺` | touch_head, hand_in_hand, face_seat_sex, back_seat_sex, face_seat_cervix_sex, back_seat_cervix_sex, face_seat_womb_sex, back_seat_womb_sex |
| 好意 | 11 | CharacterState | `好意` | chat, listen_complaint, singing, play_instrument, play_chess, touch_head, embrace, kiss |
| 欲情 | 12 | CharacterState | `欲情` | chat, take_shower, touch_head, touch_breast, touch_buttocks, hand_in_hand, embrace, kiss |
| 快乐 | 13 | CharacterState | `快乐` | kiss, make_masturebate, make_lick_anal, vaginal_sex, change_vaginal_sex_position, normal_sex, back_sex, riding_sex |
| 先导 | 14 | CharacterState | `先导` | lap_pillow, make_lick_anal, riding_sex, back_riding_sex, riding_cervix_sex, back_riding_cervix_sex, riding_womb_sex, back_riding_womb_sex |
| 屈服 | 15 | CharacterState | `屈服` | chat, stroke, touch_head, touch_buttocks, hand_in_hand, embrace, ask_for_pan, touch_clitoris |
| 羞耻 | 16 | CharacterState | `羞耻` | stroke, touch_buttocks, raise_skirt, milk, make_masturebate, face_hug_sex, back_hug_sex, face_hug_cervix_sex |
| 苦痛 | 17 | CharacterState | `苦痛` | stroke, apologize, touch_head, touch_breast, touch_buttocks, hand_in_hand, embrace, kiss |
| 恐怖 | 18 | CharacterState | `恐怖` | touch_clitoris, touch_vagina, touch_anus, anal_caress, patch_on, patch_off, gag_on, gag_off |
| 抑郁 | 19 | CharacterState | `抑郁` |  |
| 反感 | 20 | CharacterState | `反感` |  |
| 口喉 | 21 | CharacterState | `口喉` | kiss, kiss_h, make_lick_anal, blowjob, hand_blowjob, tits_blowjob, focus_blowjob, deep_throat |
| 心理 | 23 | CharacterState | `心理` |  |
| 皮肤感度 | 0 | Ability | `皮肤感度` |  |
| 胸部感度 | 1 | Ability | `胸部感度` |  |
| 阴蒂感度 | 2 | Ability | `阴蒂感度` |  |
| 阴茎感度 | 3 | Ability | `阴茎感度` |  |
| 阴道感度 | 4 | Ability | `阴道感度` |  |
| 肛肠感度 | 5 | Ability | `后穴感度` |  |
| 子宫感度 | 7 | Ability | `子宫感度` |  |
| 阴道扩张 | 9 | Ability | `阴道扩张` |  |
| 肛肠扩张 | 10 | Ability | `后穴扩张` |  |
| 子宫扩张 | 12 | Ability | `子宫扩张` |  |
| 快乐刻印 | 13 | Ability | `快乐刻印` |  |
| 屈服刻印 | 14 | Ability | `屈服刻印` |  |
| 苦痛刻印 | 15 | Ability | `苦痛刻印` |  |
| 时姦刻印 | 16 | Ability | `时姦刻印` |  |
| 恐怖刻印 | 17 | Ability | `恐怖刻印` |  |
| 反发刻印 | 18 | Ability | `反发刻印` |  |
| 无觉刻印 | 19 | Ability | `无觉刻印` |  |
| 技巧 | 30 | Ability | `技巧` |  |
| 顺从 | 31 | Ability | `顺从` |  |
| 亲密 | 32 | Ability | `亲密` |  |
| 欲望 | 33 | Ability | `欲望` |  |
| 露出 | 34 | Ability | `露出` |  |
| 施虐 | 35 | Ability | `施虐` |  |
| 受虐 | 36 | Ability | `受虐` |  |
| 话术技能 | 40 | Ability | `话术技能` |  |
| 指技 | 70 | Ability | `指技` |  |
| 舌技 | 71 | Ability | `舌技` |  |
| 足技 | 72 | Ability | `足技` |  |
| 胸技 | 73 | Ability | `胸技` |  |
| 膣技 | 74 | Ability | `膣技` |  |
| 肛技 | 75 | Ability | `肛技` |  |
| 腰技 | 76 | Ability | `腰技` |  |
| 榨精 | 77 | Ability | `榨精` |  |
| 隐蔽 | 90 | Ability | `隐蔽` |  |
| 口喉感度 | 100 | Ability | `口喉感度` |  |
| 心理感度 | 102 | Ability | `心理感度` |  |
| 皮肤经验 | 0 | Experience | `experience.0（数值 id 直通，显示名 皮肤经验）` | touch_buttocks, making_out, safe_candles |
| 胸部经验 | 1 | Experience | `experience.1（数值 id 直通，显示名 胸部经验）` | touch_breast, milk, breast_caress, twiddle_nipples, breast_sucking, nipples_love_egg, nipple_clamp_on, vibrator_insertion_anal |
| 阴蒂经验 | 2 | Experience | `experience.2（数值 id 直通，显示名 阴蒂经验）` | touch_clitoris, clit_caress, open_labia, clit_love_egg, clit_clamp_on, electric_message_stick |
| 阴茎经验 | 3 | Experience | `experience.3（数值 id 直通，显示名 阴茎经验）` |  |
| 阴道经验 | 4 | Experience | `experience.4（数值 id 直通，显示名 阴道经验）` | touch_vagina, cunnilingus, finger_insertion, vaginal_sex, change_vaginal_sex_position, normal_sex, back_sex, riding_sex |
| 肛肠经验 | 5 | Experience | `experience.5（数值 id 直通，显示名 肛肠经验）` | touch_anus, open_anus, lick_anal, anal_caress, anal_sex, change_anal_sex_position, normal_anal_sex, back_anal_sex |
| 子宫经验 | 7 | Experience | `experience.7（数值 id 直通，显示名 子宫经验）` | external_womb_massage, womb_os_caress, change_cervix_sex_position, normal_cervix_sex, back_cervix_sex, riding_cervix_sex, back_riding_cervix_sex, face_seat_cervix_sex |
| 皮肤绝顶经验 | 10 | Experience | `experience.10（数值 id 直通，显示名 皮肤绝顶经验）` |  |
| 胸部绝顶经验 | 11 | Experience | `experience.11（数值 id 直通，显示名 胸部绝顶经验）` |  |
| 阴蒂绝顶经验 | 12 | Experience | `experience.12（数值 id 直通，显示名 阴蒂绝顶经验）` |  |
| 阴茎绝顶经验 | 13 | Experience | `experience.13（数值 id 直通，显示名 阴茎绝顶经验）` |  |
| 阴道绝顶经验 | 14 | Experience | `experience.14（数值 id 直通，显示名 阴道绝顶经验）` |  |
| 肛肠绝顶经验 | 15 | Experience | `experience.15（数值 id 直通，显示名 肛肠绝顶经验）` |  |
| 子宫绝顶经验 | 17 | Experience | `experience.17（数值 id 直通，显示名 子宫绝顶经验）` |  |
| 绝顶经验 | 20 | Experience | `experience.20（数值 id 直通，显示名 绝顶经验）` |  |
| 射精经验 | 21 | Experience | `experience.21（数值 id 直通，显示名 射精经验）` |  |
| 喷乳经验 | 22 | Experience | `experience.22（数值 id 直通，显示名 喷乳经验）` | milk |
| 放尿经验 | 23 | Experience | `experience.23（数值 id 直通，显示名 放尿经验）` |  |
| 精液经验 | 24 | Experience | `experience.24（数值 id 直通，显示名 精液经验）` |  |
| 饮精经验 | 25 | Experience | `experience.25（数值 id 直通，显示名 饮精经验）` |  |
| 膣射经验 | 26 | Experience | `experience.26（数值 id 直通，显示名 膣射经验）` |  |
| 肛射经验 | 27 | Experience | `experience.27（数值 id 直通，显示名 肛射经验）` |  |
| 奉仕经验 | 30 | Experience | `experience.30（数值 id 直通，显示名 奉仕经验）` | make_lick_anal, handjob, blowjob, paizuri, footjob, hairjob, axillajob, rub_buttock |
| 爱情经验 | 31 | Experience | `experience.31（数值 id 直通，显示名 爱情经验）` |  |
| 苦痛快乐经验 | 32 | Experience | `experience.32（数值 id 直通，显示名 苦痛快乐经验）` | spanking, whip, deep_throat |
| 嗜虐快乐经验 | 33 | Experience | `experience.33（数值 id 直通，显示名 嗜虐快乐经验）` | spanking, safe_candles, whip |
| 露出经验 | 34 | Experience | `experience.34（数值 id 直通，显示名 露出经验）` | ask_exhibitionism_sex, safe_candles |
| 隐奸经验 | 35 | Experience | `experience.35（数值 id 直通，显示名 隐奸经验）` | ask_hidden_sex |
| 逆推经验 | 36 | Experience | `experience.36（数值 id 直通，显示名 逆推经验）` |  |
| 被逆推经验 | 37 | Experience | `experience.37（数值 id 直通，显示名 被逆推经验）` |  |
| 接吻经验 | 40 | Experience | `experience.40（数值 id 直通，显示名 接吻经验）` | kiss, kiss_h |
| 手交经验 | 41 | Experience | `experience.41（数值 id 直通，显示名 手交经验）` | touch_breast, touch_clitoris, touch_vagina, touch_anus, making_out, breast_caress, twiddle_nipples, clit_caress |
| 口交经验 | 42 | Experience | `experience.42（数值 id 直通，显示名 口交经验）` | breast_sucking, cunnilingus, lick_anal, make_lick_anal, blowjob, hand_blowjob, focus_blowjob, deep_throat |
| 乳交经验 | 43 | Experience | `experience.43（数值 id 直通，显示名 乳交经验）` | paizuri, tits_blowjob |
| 足交经验 | 44 | Experience | `experience.44（数值 id 直通，显示名 足交经验）` | footjob |
| 发交经验 | 45 | Experience | `experience.45（数值 id 直通，显示名 发交经验）` | hairjob |
| 腋交经验 | 46 | Experience | `experience.46（数值 id 直通，显示名 腋交经验）` | axillajob |
| 服装交经验 | 47 | Experience | `experience.47（数值 id 直通，显示名 服装交经验）` | make_masturebate |
| 异常经验 | 50 | Experience | `experience.50（数值 id 直通，显示名 异常经验）` |  |
| 道具使用经验 | 51 | Experience | `experience.51（数值 id 直通，显示名 道具使用经验）` | nipples_love_egg, nipple_clamp_on, clit_love_egg, clit_clamp_on, electric_message_stick, vibrator_insertion, vibrator_insertion_anal, anal_beads |
| 紧缚经验 | 52 | Experience | `experience.52（数值 id 直通，显示名 紧缚经验）` | bondage |
| 灌肠经验 | 53 | Experience | `experience.53（数值 id 直通，显示名 灌肠经验）` | clyster, continue_clyster |
| 自慰经验 | 54 | Experience | `experience.54（数值 id 直通，显示名 自慰经验）` |  |
| 调教自慰经验 | 55 | Experience | `experience.55（数值 id 直通，显示名 调教自慰经验）` |  |
| 群交经验 | 56 | Experience | `experience.56（数值 id 直通，显示名 群交经验）` |  |
| 助手经验 | 57 | Experience | `experience.57（数值 id 直通，显示名 助手经验）` |  |
| 插入经验 | 60 | Experience | `experience.60（数值 id 直通，显示名 插入经验）` | vaginal_sex, change_vaginal_sex_position, normal_sex, back_sex, riding_sex, back_riding_sex, face_seat_sex, back_seat_sex |
| 阴道性交经验 | 61 | Experience | `experience.61（数值 id 直通，显示名 阴道性交经验）` | vaginal_sex, change_vaginal_sex_position, normal_sex, back_sex, riding_sex, back_riding_sex, face_seat_sex, back_seat_sex |
| 肛肠性交经验 | 62 | Experience | `experience.62（数值 id 直通，显示名 肛肠性交经验）` | anal_sex, change_anal_sex_position, normal_anal_sex, back_anal_sex, riding_anal_sex, back_riding_anal_sex, face_seat_anal_sex, back_seat_anal_sex |
| 子宫性交经验 | 64 | Experience | `experience.64（数值 id 直通，显示名 子宫性交经验）` | change_cervix_sex_position, normal_cervix_sex, back_cervix_sex, riding_cervix_sex, back_riding_cervix_sex, face_seat_cervix_sex, back_seat_cervix_sex, face_stand_cervix_sex |
| 阴道扩张经验 | 65 | Experience | `experience.65（数值 id 直通，显示名 阴道扩张经验）` | touch_vagina, finger_insertion, vaginal_sex, change_vaginal_sex_position, normal_sex, back_sex, riding_sex, back_riding_sex |
| 肛肠扩张经验 | 66 | Experience | `experience.66（数值 id 直通，显示名 肛肠扩张经验）` | touch_anus, anal_caress, anal_sex, change_anal_sex_position, normal_anal_sex, back_anal_sex, riding_anal_sex, back_riding_anal_sex |
| 子宫扩张经验 | 68 | Experience | `experience.68（数值 id 直通，显示名 子宫扩张经验）` | womb_os_caress, change_cervix_sex_position, normal_cervix_sex, back_cervix_sex, riding_cervix_sex, back_riding_cervix_sex, face_seat_cervix_sex, back_seat_cervix_sex |
| 无意识皮肤经验 | 70 | Experience | `experience.70（数值 id 直通，显示名 无意识皮肤经验）` | bondage |
| 无意识胸部经验 | 71 | Experience | `experience.71（数值 id 直通，显示名 无意识胸部经验）` |  |
| 无意识阴蒂经验 | 72 | Experience | `experience.72（数值 id 直通，显示名 无意识阴蒂经验）` |  |
| 无意识阴茎经验 | 73 | Experience | `experience.73（数值 id 直通，显示名 无意识阴茎经验）` |  |
| 无意识阴道经验 | 74 | Experience | `experience.74（数值 id 直通，显示名 无意识阴道经验）` |  |
| 无意识肛肠经验 | 75 | Experience | `experience.75（数值 id 直通，显示名 无意识肛肠经验）` |  |
| 无意识子宫经验 | 77 | Experience | `experience.77（数值 id 直通，显示名 无意识子宫经验）` |  |
| 无意识绝顶经验 | 78 | Experience | `experience.78（数值 id 直通，显示名 无意识绝顶经验）` |  |
| 无意识性交经验 | 79 | Experience | `experience.79（数值 id 直通，显示名 无意识性交经验）` |  |
| 对话经验 | 80 | Experience | `experience.80（数值 id 直通，显示名 对话经验）` | chat, apologize, listen_complaint |
| 战斗经验 | 81 | Experience | `experience.81（数值 id 直通，显示名 战斗经验）` |  |
| 学识经验 | 82 | Experience | `experience.82（数值 id 直通，显示名 学识经验）` | play_chess |
| 料理经验 | 83 | Experience | `experience.83（数值 id 直通，显示名 料理经验）` |  |
| 约会经验 | 84 | Experience | `experience.84（数值 id 直通，显示名 约会经验）` |  |
| 音乐经验 | 85 | Experience | `experience.85（数值 id 直通，显示名 音乐经验）` | singing, play_instrument |
| 妊娠经验 | 86 | Experience | `experience.86（数值 id 直通，显示名 妊娠经验）` |  |
| 指挥经验 | 87 | Experience | `experience.87（数值 id 直通，显示名 指挥经验）` |  |
| 医疗经验 | 88 | Experience | `experience.88（数值 id 直通，显示名 医疗经验）` |  |
| 农业经验 | 89 | Experience | `experience.89（数值 id 直通，显示名 农业经验）` | plant_manage_crop |
| 制造经验 | 90 | Experience | `experience.90（数值 id 直通，显示名 制造经验）` |  |
| 绘画经验 | 91 | Experience | `experience.91（数值 id 直通，显示名 绘画经验）` |  |
| 阅读经验 | 92 | Experience | `experience.92（数值 id 直通，显示名 阅读经验）` |  |
| H书阅读经验 | 93 | Experience | `experience.93（数值 id 直通，显示名 H书阅读经验）` |  |
| 饮酒经验 | 94 | Experience | `experience.94（数值 id 直通，显示名 饮酒经验）` |  |
| 饮精绝顶经验 | 111 | Experience | `experience.111（数值 id 直通，显示名 饮精绝顶经验）` |  |
| 睡姦经验 | 120 | Experience | `experience.120（数值 id 直通，显示名 睡姦经验）` |  |
| 被睡姦经验 | 121 | Experience | `experience.121（数值 id 直通，显示名 被睡姦经验）` |  |
| 催眠经验 | 122 | Experience | `experience.122（数值 id 直通，显示名 催眠经验）` | hypnosis_one, hypnosis_all |
| 被催眠经验 | 123 | Experience | `experience.123（数值 id 直通，显示名 被催眠经验）` | hypnosis_one |
| 时姦经验 | 124 | Experience | `experience.124（数值 id 直通，显示名 时姦经验）` |  |
| 被时姦经验 | 125 | Experience | `experience.125（数值 id 直通，显示名 被时姦经验）` |  |
| 催眠姦经验 | 126 | Experience | `experience.126（数值 id 直通，显示名 催眠姦经验）` |  |
| 被催眠姦经验 | 127 | Experience | `experience.127（数值 id 直通，显示名 被催眠姦经验）` |  |
| 正常位经验 | 141 | Experience | `experience.141（数值 id 直通，显示名 正常位经验）` |  |
| 後背位经验 | 142 | Experience | `experience.142（数值 id 直通，显示名 後背位经验）` |  |
| 对面骑乘位经验 | 143 | Experience | `experience.143（数值 id 直通，显示名 对面骑乘位经验）` |  |
| 背面骑乘位经验 | 144 | Experience | `experience.144（数值 id 直通，显示名 背面骑乘位经验）` |  |
| 对面座位经验 | 145 | Experience | `experience.145（数值 id 直通，显示名 对面座位经验）` |  |
| 背面座位经验 | 146 | Experience | `experience.146（数值 id 直通，显示名 背面座位经验）` |  |
| 对面立位经验 | 147 | Experience | `experience.147（数值 id 直通，显示名 对面立位经验）` |  |
| 背面立位经验 | 148 | Experience | `experience.148（数值 id 直通，显示名 背面立位经验）` |  |
| 对面抱位经验 | 149 | Experience | `experience.149（数值 id 直通，显示名 对面抱位经验）` |  |
| 背面抱位经验 | 150 | Experience | `experience.150（数值 id 直通，显示名 背面抱位经验）` |  |
| 对面卧位经验 | 151 | Experience | `experience.151（数值 id 直通，显示名 对面卧位经验）` |  |
| 背面卧位经验 | 152 | Experience | `experience.152（数值 id 直通，显示名 背面卧位经验）` |  |
| 口喉经验 | 153 | Experience | `experience.153（数值 id 直通，显示名 口喉经验）` | kiss, kiss_h, blowjob, hand_blowjob, tits_blowjob, focus_blowjob, deep_throat, clean_blowjob |
| 心理经验 | 155 | Experience | `experience.155（数值 id 直通，显示名 心理经验）` |  |
| 口喉绝顶经验 | 156 | Experience | `experience.156（数值 id 直通，显示名 口喉绝顶经验）` |  |
| 心理绝顶经验 | 158 | Experience | `experience.158（数值 id 直通，显示名 心理绝顶经验）` |  |
| 无意识口喉经验 | 159 | Experience | `experience.159（数值 id 直通，显示名 无意识口喉经验）` |  |
| 无意识心理经验 | 161 | Experience | `experience.161（数值 id 直通，显示名 无意识心理经验）` |  |
| 手交理论经验 | 170 | Experience | `experience.170（数值 id 直通，显示名 手交理论经验）` |  |
| 口交理论经验 | 171 | Experience | `experience.171（数值 id 直通，显示名 口交理论经验）` |  |
| 足交理论经验 | 172 | Experience | `experience.172（数值 id 直通，显示名 足交理论经验）` |  |
| 乳交理论经验 | 173 | Experience | `experience.173（数值 id 直通，显示名 乳交理论经验）` |  |
| 性交理论经验 | 174 | Experience | `experience.174（数值 id 直通，显示名 性交理论经验）` |  |
| 肛交理论经验 | 175 | Experience | `experience.175（数值 id 直通，显示名 肛交理论经验）` |  |
| 榨精理论经验 | 176 | Experience | `experience.176（数值 id 直通，显示名 榨精理论经验）` |  |
| 阴道处女 | 0 | CharacterTalent | `阴道处女` |  |
| 肛门处女 | 1 | CharacterTalent | `肛门处女` |  |
| 尿道处女 | 2 | CharacterTalent | `尿道处女` |  |
| 子宫处女 | 3 | CharacterTalent | `子宫处女` |  |
| 无接吻经验 | 4 | CharacterTalent | `无接吻经验` |  |
| 童贞 | 5 | CharacterTalent | `童贞` |  |
| 未初潮 | 6 | CharacterTalent | `未初潮` |  |
| 未成年 | 7 | CharacterTalent | `未成年` |  |
| 亲吻合意 | 11 | CharacterTalent | `亲吻合意` |  |
| 本番合意 | 12 | CharacterTalent | `本番合意` |  |
| 避孕中出合意 | 13 | CharacterTalent | `避孕中出合意` |  |
| 妊娠合意 | 14 | CharacterTalent | `妊娠合意` |  |
| 肛门性交合意 | 15 | CharacterTalent | `肛门性交合意` |  |
| 尿道性交合意 | 16 | CharacterTalent | `尿道性交合意` |  |
| 受精 | 20 | CharacterTalent | `受精` |  |
| 妊娠 | 21 | CharacterTalent | `妊娠` |  |
| 临盆 | 22 | CharacterTalent | `临盆` |  |
| 产后 | 23 | CharacterTalent | `产后` |  |
| 育儿 | 24 | CharacterTalent | `育儿` |  |
| 孕肚 | 26 | CharacterTalent | `孕肚` |  |
| 泌乳 | 27 | CharacterTalent | `泌乳` |  |
| 精爱味觉 | 31 | CharacterTalent | `精爱味觉` |  |
| 精液膨腹 | 32 | CharacterTalent | `精液膨腹` |  |
| 浓厚精液 | 33 | CharacterTalent | `浓厚精液` |  |
| 漏尿 | 34 | CharacterTalent | `漏尿` |  |
| 无意识妊娠 | 35 | CharacterTalent | `无意识妊娠` |  |
| 淫乱 | 40 | CharacterTalent | `淫乱` |  |
| 淫体 | 41 | CharacterTalent | `淫体` |  |
| 淫乳 | 42 | CharacterTalent | `淫乳` |  |
| 淫核 | 43 | CharacterTalent | `淫核` |  |
| 淫茎 | 44 | CharacterTalent | `淫茎` |  |
| 淫膣 | 45 | CharacterTalent | `淫膣` |  |
| 淫肛 | 46 | CharacterTalent | `淫肛` |  |
| 淫胱 | 47 | CharacterTalent | `淫胱` |  |
| 淫宫 | 48 | CharacterTalent | `淫宫` |  |
| 真·淫魔 | 49 | CharacterTalent | `真·淫魔` |  |
| 精液中毒 | 51 | CharacterTalent | `精液中毒` |  |
| 自慰中毒 | 52 | CharacterTalent | `自慰中毒` |  |
| 膣射中毒 | 53 | CharacterTalent | `膣射中毒` |  |
| 肛射中毒 | 54 | CharacterTalent | `肛射中毒` |  |
| 饮精中毒 | 55 | CharacterTalent | `饮精中毒` |  |
| 周期性发情 | 61 | CharacterTalent | `周期性发情` |  |
| 发情期中 | 62 | CharacterTalent | `发情期中` |  |
| 不易湿 | 63 | CharacterTalent | `不易湿` |  |
| 容易湿 | 64 | CharacterTalent | `容易湿` |  |
| 已催眠·浅 | 71 | CharacterTalent | `已催眠·浅` |  |
| 已催眠·深 | 72 | CharacterTalent | `已催眠·深` |  |
| 已催眠·极 | 73 | CharacterTalent | `已催眠·极` |  |
| 皮肤钝感 | 81 | CharacterTalent | `皮肤钝感` |  |
| 皮肤敏感 | 82 | CharacterTalent | `皮肤敏感` |  |
| 乳房钝感 | 83 | CharacterTalent | `乳房钝感` |  |
| 乳房敏感 | 84 | CharacterTalent | `乳房敏感` |  |
| 阴蒂钝感 | 85 | CharacterTalent | `阴蒂钝感` |  |
| 阴蒂敏感 | 86 | CharacterTalent | `阴蒂敏感` |  |
| 阴茎钝感 | 87 | CharacterTalent | `阴茎钝感` |  |
| 阴茎敏感 | 88 | CharacterTalent | `阴茎敏感` |  |
| 阴道钝感 | 89 | CharacterTalent | `阴道钝感` |  |
| 阴道敏感 | 90 | CharacterTalent | `阴道敏感` |  |
| 肛门钝感 | 91 | CharacterTalent | `肛门钝感` |  |
| 肛门敏感 | 92 | CharacterTalent | `肛门敏感` |  |
| 尿道钝感 | 93 | CharacterTalent | `尿道钝感` |  |
| 尿道敏感 | 94 | CharacterTalent | `尿道敏感` |  |
| 子宫钝感 | 95 | CharacterTalent | `子宫钝感` |  |
| 子宫敏感 | 96 | CharacterTalent | `子宫敏感` |  |
| 兽部钝感 | 97 | CharacterTalent | `兽部钝感` |  |
| 兽部敏感 | 98 | CharacterTalent | `兽部敏感` |  |
| 婴儿 | 101 | CharacterTalent | `婴儿` |  |
| 幼女 | 102 | CharacterTalent | `幼女` |  |
| 萝莉 | 103 | CharacterTalent | `萝莉` |  |
| 少女 | 104 | CharacterTalent | `少女` |  |
| 大姐姐 | 105 | CharacterTalent | `大姐姐` |  |
| 熟女 | 106 | CharacterTalent | `熟女` |  |
| 人妻 | 107 | CharacterTalent | `人妻` |  |
| 长生者 | 108 | CharacterTalent | `长生者` |  |
| 兽耳 | 111 | CharacterTalent | `兽耳` |  |
| 兽角 | 112 | CharacterTalent | `兽角` |  |
| 兽尾 | 113 | CharacterTalent | `兽尾` |  |
| 光环 | 114 | CharacterTalent | `光环` |  |
| 翅膀 | 115 | CharacterTalent | `翅膀` |  |
| 触手 | 116 | CharacterTalent | `触手` |  |
| 小车 | 117 | CharacterTalent | `小车` |  |
| 绝壁 | 121 | CharacterTalent | `绝壁` |  |
| 贫乳 | 122 | CharacterTalent | `贫乳` |  |
| 普乳 | 123 | CharacterTalent | `普乳` |  |
| 巨乳 | 124 | CharacterTalent | `巨乳` |  |
| 爆乳 | 125 | CharacterTalent | `爆乳` |  |
| 小臀 | 126 | CharacterTalent | `小臀` |  |
| 普臀 | 127 | CharacterTalent | `普臀` |  |
| 巨臀 | 128 | CharacterTalent | `巨臀` |  |
| 细腿 | 129 | CharacterTalent | `细腿` |  |
| 肉腿 | 130 | CharacterTalent | `肉腿` |  |
| 小足 | 131 | CharacterTalent | `小足` |  |
| 长足 | 132 | CharacterTalent | `长足` |  |
| 嗜睡 | 151 | CharacterTalent | `嗜睡` |  |
| 高温体质 | 152 | CharacterTalent | `高温体质` |  |
| 低温体质 | 153 | CharacterTalent | `低温体质` |  |
| 带电体质 | 154 | CharacterTalent | `带电体质` |  |
| 带毒体质 | 155 | CharacterTalent | `带毒体质` |  |
| 视力障碍 | 156 | CharacterTalent | `视力障碍` |  |
| 听力障碍 | 157 | CharacterTalent | `听力障碍` |  |
| 失忆 | 158 | CharacterTalent | `失忆` |  |
| 人格障碍 | 159 | CharacterTalent | `人格障碍` |  |
| 行动不便 | 160 | CharacterTalent | `行动不便` |  |
| 低存在感 | 161 | CharacterTalent | `低存在感` |  |
| 义肢 | 163 | CharacterTalent | `义肢` |  |
| 毒抗性 | 164 | CharacterTalent | `毒抗性` |  |
| 大胃王 | 165 | CharacterTalent | `大胃王` |  |
| 昼伏夜出 | 166 | CharacterTalent | `昼伏夜出` |  |
| 猫舌 | 167 | CharacterTalent | `猫舌` |  |
| 思慕 | 201 | CharacterTalent | `思慕` |  |
| 恋慕 | 202 | CharacterTalent | `恋慕` |  |
| 恋人 | 203 | CharacterTalent | `恋人` |  |
| 爱侣 | 204 | CharacterTalent | `爱侣` |  |
| 戒指 | 205 | CharacterTalent | `戒指` |  |
| 屈从 | 211 | CharacterTalent | `屈从` |  |
| 驯服 | 212 | CharacterTalent | `驯服` |  |
| 宠物 | 213 | CharacterTalent | `宠物` |  |
| 奴隶 | 214 | CharacterTalent | `奴隶` |  |
| 项圈 | 215 | CharacterTalent | `项圈` |  |
| 性好奇 | 220 | CharacterTalent | `性好奇` |  |
| 性冷漠 | 221 | CharacterTalent | `性冷漠` |  |
| 性无知 | 222 | CharacterTalent | `性无知` |  |
| 感情缺乏 | 223 | CharacterTalent | `感情缺乏` |  |
| 难以越过的底线 | 224 | CharacterTalent | `难以越过的底线` |  |
| 献身 | 225 | CharacterTalent | `献身` |  |
| 倒错 | 226 | CharacterTalent | `倒错` |  |
| 讨厌男性 | 227 | CharacterTalent | `讨厌男性` |  |
| 讨厌女性 | 228 | CharacterTalent | `讨厌女性` |  |
| 施虐狂 | 229 | CharacterTalent | `施虐狂` |  |
| 受虐狂 | 230 | CharacterTalent | `受虐狂` |  |
| 正常位喜好 | 250 | CharacterTalent | `正常位喜好` |  |
| 背后位喜好 | 251 | CharacterTalent | `背后位喜好` |  |
| 对面骑乘位喜好 | 252 | CharacterTalent | `对面骑乘位喜好` |  |
| 背面骑乘位喜好 | 253 | CharacterTalent | `背面骑乘位喜好` |  |
| 对面座位喜好 | 254 | CharacterTalent | `对面座位喜好` |  |
| 背面座位喜好 | 255 | CharacterTalent | `背面座位喜好` |  |
| 对面立位喜好 | 256 | CharacterTalent | `对面立位喜好` |  |
| 背面立位喜好 | 257 | CharacterTalent | `背面立位喜好` |  |
| 对面抱位喜好 | 258 | CharacterTalent | `对面抱位喜好` |  |
| 背面抱位喜好 | 259 | CharacterTalent | `背面抱位喜好` |  |
| 对面卧位喜好 | 260 | CharacterTalent | `对面卧位喜好` |  |
| 背面卧位喜好 | 261 | CharacterTalent | `背面卧位喜好` |  |
| 勤劳 | 271 | CharacterTalent | `勤劳` |  |
| 懒散 | 272 | CharacterTalent | `懒散` |  |
| 脆弱 | 273 | CharacterTalent | `脆弱` |  |
| 坚强 | 274 | CharacterTalent | `坚强` |  |
| 热情 | 275 | CharacterTalent | `热情` |  |
| 孤僻 | 276 | CharacterTalent | `孤僻` |  |
| 羞耻 | 277 | CharacterTalent | `羞耻` | stroke, touch_buttocks, raise_skirt, milk, make_masturebate, face_hug_sex, back_hug_sex, face_hug_cervix_sex |
| 开放 | 278 | CharacterTalent | `开放` |  |
| 内衣透视 | 307 | CharacterTalent | `内衣透视` |  |
| 腔内透视 | 308 | CharacterTalent | `腔内透视` |  |
| 生理透视 | 309 | CharacterTalent | `生理透视` |  |
| 隔衣触摸 | 310 | CharacterTalent | `隔衣触摸` |  |
| 透衣触摸 | 311 | CharacterTalent | `透衣触摸` |  |
| 隔空插入 | 312 | CharacterTalent | `隔空插入` |  |
| 窄域时停 | 316 | CharacterTalent | `窄域时停` |  |
| 广域时停 | 317 | CharacterTalent | `广域时停` |  |
| 精确时停 | 318 | CharacterTalent | `精确时停` |  |
| 猥亵催眠 | 331 | CharacterTalent | `猥亵催眠` |  |
| 性爱催眠 | 332 | CharacterTalent | `性爱催眠` |  |
| 集体催眠 | 333 | CharacterTalent | `集体催眠` |  |
| 心体催眠 | 334 | CharacterTalent | `心体催眠` |  |
| 回复慢 | 351 | CharacterTalent | `回复慢` |  |
| 回复快 | 352 | CharacterTalent | `回复快` |  |
| 酒量差 | 353 | CharacterTalent | `酒量差` |  |
| 酒量好 | 354 | CharacterTalent | `酒量好` |  |
| 千杯不醉 | 355 | CharacterTalent | `千杯不醉` |  |
| 灵活手指 | 356 | CharacterTalent | `灵活手指` |  |
| 灵活舌头 | 357 | CharacterTalent | `灵活舌头` |  |
| 教官 | 358 | CharacterTalent | `教官` |  |
| 厨艺 | 359 | CharacterTalent | `厨艺` |  |
| 持有博士把柄 | 401 | CharacterTalent | `持有博士把柄` |  |
| 被博士持有把柄 | 402 | CharacterTalent | `被博士持有把柄` |  |
| 信物 | 411 | CharacterTalent | `信物` |  |
| 女儿 | 451 | CharacterTalent | `女儿` |  |
| hit_point | hit_point | Character | `体力` — 体力（当前） |  |
| hit_point_max | hit_point_max | Character | `体力上限` — 体力上限 |  |
| mana_point | mana_point | Character | `气力` — 气力（当前） |  |
| mana_point_max | mana_point_max | Character | `气力上限` — 气力上限 |  |
| sanity_point | sanity_point | Character | `精力` — 理智（当前）→ 精力（语义近似，精力为闲置属性） |  |
| eja_point | eja_point | Character | `射精欲` — 射精槽（当前） |  |
| eja_point_max | eja_point_max | Character | `射精欲上限` — 射精槽上限 |  |
| semen_point | semen_point | Character | `精液量` — 精液槽（当前） |  |
| semen_point_max | semen_point_max | Character | `精液量上限` — 精液槽上限（上限 999，erArk 同） |  |
| tem_extra_semen_point | tem_extra_semen_point | Character | `额外精液量` — 临时最大精液槽 |  |
| angry_point | angry_point | Character | `愤怒` — 愤怒槽 |  |
| tired_point | tired_point | Character | `疲劳度` — 疲劳值（erArk 6m=1点，16h=160 max） |  |
| urinate_point | urinate_point | Character | `尿意` — 尿意值（erArk 1m=1点，4h=240 max） |  |
| hunger_point | hunger_point | Character | `饥饿值` — 饥饿值（erArk 1m=1点，4h=240 max） |  |
| sleep_point | sleep_point | Character | `熟睡值` — 熟睡值（erArk 1m=10点，10min=100 max） |  |
| desire_point | desire_point | Character | `欲望值` — 欲望值（百分比 100 max） |  |
| drunk_point | drunk_point | Character | `酒气` — 醉酒度（百分比 100 max） |  |
| trust | trust | Character | `信赖度` — 信赖度（float，封顶 300 进 SettlementContext 钳制） |  |

### 2. 替代处理

| erArk 字段 | erArk id | 来源 | 处理方式（实现位置） | 保留指令引用 |
|-----------|----------|------|----------------------|--------------|
| favorability | favorability | Character | 好感度字典 → 单值属性 好感度（entity.base.好感度） |  |
| ability | ability | Character | 能力字典 → entity.abilities.{名} = {level, xp} |  |
| experience | experience | Character | 经验字典 → entity.experience（数值 id 直通） |  |
| talent | talent | Character | 素质字典 → entity.talents.{名} |  |
| status_data | status_data | Character | 状态字典 → entity.params（attributes.toml category=parameter） |  |
| sp_flag | sp_flag | Character | 特殊 flag → entity.sp_flag（字段名一致） |  |
| h_state | h_state | Character | H 状态 → entity.h_state（字段名一致） |  |
| dirty | dirty | Character | 污浊 → entity.dirty（body_semen/cloth_semen/penis_dirty_dict 等） |  |
| first_record | first_record | Character | 初次记录 → entity.first_record（h-first-time 维护） |  |
| pregnancy | pregnancy | Character | 怀孕 → entity.pregnancy（h-pregnancy 维护；排卵周期在 base） |  |
| hypnosis | hypnosis | Character | 催眠 → entity.hypnosis（h-hypnosis 维护；精神在 base） |  |
| action_info | action_info | Character | 行动记录 → entity.action_info（字段名一致） |  |
| body_item | body_item | Character | 身体道具 → entity.body_items（h-core 读取） |  |
| cloth | cloth | Character | 服装 → entity.cloth（clothing-system） |  |
| relationship | relationship | Character | 社会关系 → entity.relations（relations.toml 定义关系类型） |  |

### 3. 有意删减（标注理由，防误补）

| erArk 字段 | erArk id | 来源 | 删减理由 |
|-----------|----------|------|----------|
| 兽部 | 22 | CharacterState | 兽部全砍（tech_adjust/settle_state 遇 part/state=兽部 → warning+跳过；master-list 标注；转换脚本不产出） |
| 尿道感度 | 6 | Ability | 尿道方案A（ADR-0004）：默认不定义尿道感度/扩张（指令全砍），仅保留尿道 status 属性 display=false |
| 尿道扩张 | 11 | Ability | 尿道方案A（ADR-0004）：默认不定义（同上） |
| 指挥技能 | 41 | Ability | 技能系列（erArk ability 41-49）L2.13 记录不做实现——通用生活技能不迁移；chat 例外补定义话术技能(40)因 TALK_ADD_ADJUST 需要等级；其余 9 个无任何保留指令效果链引用（B 扫描确认），需要时按 ability-progression 机制补定义 |
| 战斗技能 | 42 | Ability | 同上（L2.13：技能系列不迁移） |
| 料理技能 | 43 | Ability | 同上（L2.13：技能系列不迁移） |
| 音乐技能 | 44 | Ability | 同上（L2.13：技能系列不迁移） |
| 学识技能 | 45 | Ability | 同上（L2.13：技能系列不迁移） |
| 医术技能 | 46 | Ability | 同上（L2.13：技能系列不迁移） |
| 农业技能 | 47 | Ability | 同上（L2.13：技能系列不迁移） |
| 制造技能 | 48 | Ability | 同上（L2.13：技能系列不迁移） |
| 绘画技能 | 49 | Ability | 同上（L2.13：技能系列不迁移） |
| 兽部感度 | 101 | Ability | 兽部全砍（ability 101，不定义） |
| 尿道经验 | 6 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 尿道绝顶经验 | 16 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 兽部交经验 | 48 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 尿道性交经验 | 63 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 尿道扩张经验 | 67 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 无意识尿道经验 | 76 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 兽部经验 | 154 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 兽部绝顶经验 | 157 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 无意识兽部经验 | 160 | Experience | 部位全砍（兽部/尿道），经验不迁移 |
| 源石病感染者 | 150 | CharacterTalent | 方舟世界观（矿石病）不迁移 |
| 体表源石结晶 | 162 | CharacterTalent | 方舟世界观（矿石病）不迁移 |
| 水分身 | 168 | CharacterTalent | 方舟世界观/未实装系统不迁移 |
| 生育模组 | 171 | CharacterTalent | 未实装系统不迁移 |
| 博士信息素 | 304 | CharacterTalent | 方舟世界观激素系统砍掉（master-list:543，激素教训：已撤销 3 个补回的定义） |
| 博士信息素集组 | 305 | CharacterTalent | 同上 |
| 博士信息素阵列 | 306 | CharacterTalent | 同上 |
| 一杯就倒 | 360 | CharacterTalent | 未实装系统（饮酒）不迁移 |
| sanity_point_max | sanity_point_max | Character | 理智上限——未迁移（精力无上限属性；h-hypnosis 精神 100 钳制为自研机制） |
| juel | juel | Character | 宝珠 → 收藏系统砍掉，不迁移 |
| collection_character | collection_character | Character | 收藏角色 → 收藏系统砍掉，不迁移 |
| pl_ability | pl_ability | Character | 玩家能力 → 玩家技能树（激素/透视/催眠/时停），随 B 批次评估（h-hypnosis/h-time-stop 已有运行时字段） |
| pl_collection | pl_collection | Character | 玩家收藏品 → 收藏系统砍掉，不迁移 |
| work | work | Character | 工作信息 → 方舟基建系统砍掉，不迁移 |
| entertainment | entertainment | Character | 娱乐信息 → 随 B 批次评估（唱歌/读书等指令仅用经验，无娱乐结构） |
| author_flag | author_flag | Character | 口上作者变量 → 不迁移（口上系统用独立机制） |
| profession | profession | Character | 职业 → 世界观数据，不迁移 |
| race | race | Character | 种族 → 世界观数据（兽人等），不迁移 |
| token_text | token_text | Character | 信物文本 → 收藏系统砍掉，不迁移 |
| assistant_character_id | assistant_character_id | Character | 助理 → 助理系统砍掉，不迁移 |
| chara_setting | chara_setting | Character | 角色个人设置 → 设置面板未迁移 |
| assistant_services | assistant_services | Character | 助理服务 → 助理系统砍掉，不迁移 |
| body_manage | body_manage | Character | 身体管理 → 体检系统砍掉，不迁移 |

### 4. 遗漏（人工确认后应为 0；有遗漏时列出待补项）

无。所有 erArk 字段均有对应处理。

## 附：保留指令效果链中未映射的 effect id

| effect id | 被指令使用 | 待办 |
|-----------|------------|------|
| 1723 | carry_target | **已查证（default.py:2707）**：`action_info.carry_chara_id = target_character_id`——ARTS 搬运指令（B2+ 批次）迁移时需专用 handler（set_field 只写 _targetIds，无法表达"玩家写自己"；不可用 set_field 替代） |
| 1724 | stop_carry_target | **已查证（default.py:2730）**：`action_info.carry_chara_id = 0`——同上，需专用 handler |
