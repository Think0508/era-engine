# 成长系统完整复刻：结算点升级链 + 宝珠三通道（能力/素质/精力）

2026-08-11 决策。用户要求完整、准确复刻 erArk 成长系统（不擅自简化），grill 10 问定稿后落地。

## 背景

erArk 的"成长"不是单一系统，而是多条独立机制（此前对账表把宝珠归"有意删减"只留清零、能力升级检测标 TODO）：

1. **能力升级**（`handle_ability.py` + `AbilityUp.csv`）：条件驱动——per-level 需求（A能力/T素质/J宝珠/E经验/F好感/X信赖 + 主/备选），睡眠结算与 H 结束触发（`base_setting[1]/[2]` 开关）
2. **素质获得**（`handle_talent.py` + `TalentGain.csv`）：gain_type 0 随时/1 手动/2 指令绑定/3 睡觉
3. **宝珠链路**（`settle_character_juel`）：daily_reset 状态值 → 按状态等级衰减 → 宝珠；特殊珠 17/18/19 分流；反感珠抵消（1 好珠灭 2 反感珠）
4. **精力成长**（`sanity_point_grow`）：今日消耗 ≥50 → 精力上限 += round/50（cap 9999）
5. **H 结束上限成长**（528 `END_H_ADD_HPMP_MAX`）：绝顶次数 → 体力/气力上限

## 决策

### 1. 升级判定双模式并存
- `mode = "xp"`（缺省，向后兼容）：`gain_ability_xp` 即时升级（既有行为不变）
- `mode = "condition"`：per-level `upgrades[]`，**仅结算点**（睡眠/H结束）检测；缺条 = 不可升（upgrades 长度即值域上限，不硬编码等级上限）
- condition 模式能力拒绝 gain_ability_xp（双通道会混乱）

### 2. needs 语义化 + 特殊判定数据化
- need 类型：`ability`/`talent`/`juel`/`experience`/`favorability`/`trust` + `ability_sum`（tag 聚合，per_level/per_level_npc 倍率）
- erArk 硬编码的 `extra_ability_check` 数据化：顺从/欲望/受虐刻印门槛并入对应升级条目 needs；技巧聚合 → `extra_needs`
- 宝珠升级**消耗**（jule_dict 全量扣减，多 J 需求完整支持）

### 3. 宝珠系统恢复（三通道完整）
- 23 种宝珠定义（`juels.toml`，id 直通）+ `entity.juel` 命名空间
- 睡眠转换链（`core/juel-settle.ts`）：衰减率表（LV0-10 → 100%..10%）、特殊 17/18/19（1/4 自身 + 1/2 反感）、反感抵消（优先级 屈服→恭顺→好意→欲情→快乐）
- 升级扣珠 + 手动面板检查（批 2）

### 4. 精力 = erArk 理智（删"精神"）
- h-hypnosis 自研"精神"属性删除（对账表重对账），催眠/体控系指令消耗改走 `consume_sanity` effect（sanity 绑定）
- `action_info.today_sanity_point_cost` 今日消耗计数 → 睡眠成长公式
- 新增"精力上限"属性（erArk sanity_point_max，默认 100，成长 cap 9999）
- 删 game:new_day 精神复位（非 erArk 机制）

### 5. 结算点
- 睡眠：玩家+NPC 分支 checkUpgrade（开关 `upgrade_on_player_sleep`/`upgrade_on_npc_sleep`）；NPC 素质获得 gain_type=3
- H 结束：参与 NPC checkUpgrade（开关 `upgrade_on_npc_h_end`）+ 528 上限成长（清 h_state 前执行）
- 跨插件协作走 `apiSystem.call('abilities', 'checkUpgrade')`（通信铁律）

### 6. gain_type 过滤（对齐 erArk）
- `checkTalentGain(charId, gainType)`：缺省 0（随时，向后兼容）；睡眠只查 gain_type=3；手动面板走 `gainTalentManual`（批 2，跳过条件）
- gain_type=2（指令绑定）**零调用方**（erArk 死代码——告白/戴上项圈指令效果链直接给素质），机制不实现（复刻铁律：数据零使用不实现）

### 7. 三开关
- mod `meta.toml` 三项（缺省全开）：`upgrade_on_player_sleep` / `upgrade_on_npc_sleep` / `upgrade_on_npc_h_end`（erArk base_setting[1]/[2] 语义）；完整设置面板后置

### 8. 校验分层
- upgrades 超 max_level → error；needs 引用能力/素质不存在 → error；ability_sum tag 无匹配 → warning；experience 数字 id（直通无定义文件）不报

### 9. 值域软约束
- 条件模式：upgrades 长度封顶；xp 模式：max_level；存档直写不 clamp（存档权威）；h-core 默认层 max_level 对齐 erArk（感度/ABL/性技 8、刻印 3、无觉 6）

## 与既有决策的关系

- 撤销：对账表"juel 有意删减"（宝珠系统恢复）、sleep-system "理智成长/能力升级检测 TODO"（已实现）、"精神(hypnosis 精神力)"（属性删除）、master-todo 值域约束项（max_level 对齐完成）
- 保留：永久感度增长 = 感度能力升级（被本系统覆盖，无独立机制）

## 数据源

- `AbilityUp.csv`/`TalentGain.csv`/`Juel.csv`/`Ability.csv`/`Talent.csv`/`Experience.csv` → `复刻攻略-猥亵-H系统专用/src/data/csv/`（提取）
- 转换脚本 `scripts/convert-erark-growth.cjs`（幂等，产物入库）→ h-core 默认层 `ability-upgrades.toml`/`juels.toml`/`talent-gains.toml`
- `talent_up_panel.py` → `复刻攻略-猥亵-H系统专用/src/UI/Panel/`（批 2 复刻依据）

## 后续（批 2 / 排期）

- 手动面板（talent_up_panel 复刻：陷落系素质二选一路线、共通/路线前提、needs 显示、gainTalentManual）
- 动态失去类素质（精液膨腹/未初潮失去/罩杯变化/饮精绝顶——handle_talent.py 硬编码分支）
- 告白/戴上项圈指令迁移（恋人/宠物获得途径）
- 设置面板系统（base_setting 全数组承载）
