# 露出系统复刻与成就结构契约（ADR 0014）

2026-08-15 决策。完整复刻 erArk 露出系统（h-exposure 插件），含砍门决策、has_indoor 约定、动态切换规则、前提命名对齐，以及**成就记录结构契约**（用户要求：成就可能增删改，须记录在案）。

## 背景

`src/plugins/h-exposure/` 原为骨架（3 API + 2 effect + 9 个自造名前提），露出运行时逻辑散落：持续快感 tick 在 h-hidden/scene.ts、判定修正已在 h-core/settle/judge.ts（保持不动）。两条指令（邀请露出 5054 / 结束露出 6007）未复刻。

## 决策

### D1 露出逻辑归属：全部收拢到 h-exposure，自 h-hidden 迁出

露出持续快感 tick（realtime_settle.py:610-613 露出块）从 h-hidden 的 `applyHiddenSexTick` 迁至 h-exposure（h-hidden 只留隐奸块）；execution_end 监听器各管各的模式角色（`hidden_sex_mode` vs `exhibitionism_sex_mode` 互不重叠）。职责单一；测试断言不变，仅归属变化。

### D2 门未锁条件砍掉（世界观解耦）

erArk mode 1 条件含"门未锁"，但门是**运行时状态**（关门/锁门指令 + 753 重置效果），且门概念限定世界观（通用 mod 无门模型，武侠/哈利波特 mod 不会建门）。决策：

- **门条件删除**，753 DOOR_CLOSE_RESET 效果不实现（结束露出效果链注释标注）
- 这是**设计决策**而非 TODO——将来门系统落地也不建议加回（保持世界观中立）
- 门静态数据（location.door 字符串）仍保留给既有 PLACE_DOOR_* 前提使用，不扩展

### D3 室内/室外判定：单 tag `has_indoor`（缺省=室外）

- 地点打 `tags = ["has_indoor"]` = 室内；**缺省 = 室外**（二元互斥天然成立，不需第二个 tag）
- 与 location-tags.md 惯例一致（`location.tags.has_indoor == true` 条件直接可用）
- 后果：无任何 has_indoor 地点的 mod，mode 1（室内露出）不可达，2 人场景恒为 mode 2——**静默降级**；配套**加载期卫生检查**（h-exposure onEnable 扫描，无 has_indoor 地点 → 一次性 warning，让作者知晓而非静默）
- 数值影响评估：露出 tick/判定修正均不读 mode 数值（模式只做 ≥1 门槛）→ 砍门对**所有公式零影响**

### D4 动态模式切换（update_exhibitionism_sex_mode 等价）

- 触发：h-exposure 自注册 `game:execution_end`（h_scene 模式），遍历所有 `exhibitionism_sex_mode ≥ 1` 角色各自重评估（erArk 无参调用的全量语义；只更新玩家会产生"玩家 mode3/目标 mode1"分裂叙事）
- 规则：场景>2 → 有清醒旁观者?3:4；场景=2 → 室内tag?1:2（场景<2 防御保持）
- 场景 = 同地点角色数（`current_location` 过滤）；意识 = `unconscious_h===0 && !sleeping`

### D5 前提命名对齐 erArk 原名（适配统一条件引擎）

- 注册 erArk 原名 11 个：`EXHIBITIONISM_SEX_MODE_0/GE_1/1~4`（自己）、`TARGET_EXHIBITIONISM_SEX_MODE_GE_1/1~4`、`TARGET_NOT_IN_EXHIBITIONISM_SEX_MODE`（目标）、`PLAYER_NOT_IN_EXHIBITIONISM_SEX_MODE`（玩家）
- h-core `premise-instruct.ts` pendingFalse 列表移除 `EXHIBITIONISM_SEX_MODE_1~4` 占位（语义所有者在 h-exposure 注册；遵循 confinement 先例）
- 删除自造名 `EXPOSURE_SEX_MODE_*`/`SELF_*`/`TARGET_EXPOSURE_*`（零消费方）；h-config talk.situations 前提名同步
- 注册方式：`conditionEngine.registerPremise` 直注册（适配统一条件引擎，handler 收完整 GameContext；不复刻旧 api.call + uiStore 缝合写法）

### D6 指令效果链映射

- 邀请露出（5054）：`exposure_set_level(params={} auto)×2(selected+self)` + `h_start_h` + `h_experience×2(expId=34)` + `trigger_dialogue`。405/462/464/603/605 由 h_start_h 引擎封装覆盖；704/1409 半成品注释（不建字段）
- 结束露出（6007）：`h_end_h` + `trigger_dialogue`；526/528/404/631 由 endHScene 覆盖；露出模式清除挂 `h:end` 事件统一遍历（与 h-hidden 对称）；753 随 D2 砍
- `exposure_set_level` level 缺省 = 按场景自动计算初始模式（复用 computeModeByScene——邀请模式选择面板不做）

### D7 成就记录结构契约（exhibitionism_sex_record）

**结构（不可随意变更，改动须先更新本 ADR）**：`achievement.exhibitionism_sex_record: Dict[number, number]`

| 键 | 含义 | 写入点 |
|----|------|--------|
| 1 | 进入露出时的模式 | exposure_set_level 执行时（mode≥1）|
| 2 | 进入时的场景其他人数（同地点，场景-2）| 同上 |
| 3 | 露出中射精次数 | h:shoot（挂玩家=露出发起方）|
| 4 | 露出中绝顶次数 | h:orgasm（挂玩家）|

成就判定（`checkAchievements` API）：

| ID | 名称 | 条件 |
|----|------|------|
| 931 | 展示自我 | rec[1] 存在 + rec[3] ≥ 1 |
| 932 | 光天化日 | rec[1] ∈ {3,4} + rec[2] ≥ 1 + rec[3] ≥ 1 + rec[4] ≥ 1 |
| 933 | 众目睽睽 | rec[2] ≥ 10 + rec[3] ≥ 3 + rec[4] ≥ 3 |
| 934 | 看清楚了吗 | 依赖被发现系统——未实现（TODO）|

与 h-hidden 的 `hidden_sex_record`（rec[1..5]）同构不同键，互不干扰。

### D8 推迟项（半成品标记，非简化替代）

- **被发现处理**（Sex_Be_Discovered_Panel 5 选项：话术支开判定200/转隐奸/转露出判定500/邀请群交判定600/结束H）：面板级 UI 推迟，`exposure_discovered` effect 仅占位；检测事件（NPC 进入场景+目睹）随面板一并推迟（与 h-hidden settleDiscovered 的 TODO 对齐）
- 邀请模式选择面板（exhibitionism_sex_panel）
- UI 标签 `<露>`（ExposureTag 组件，与 HiddenSexTag 同批落地）

## 影响

- 测试：exposure-system.test.ts 23 例；hidden-sex-realtime.test.ts 露出块迁出；talk-common-data/instruction-chat 测试补注册露出相关前提
- 数据：test-mod tavern、example-mod 集市打 has_indoor（演示新约定）
- 文档：docs/h-exposure.md 重写为完整手册
