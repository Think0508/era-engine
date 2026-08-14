# 监禁调教系统（confinement-system）使用手册

> 复刻 erArk「监禁调教系统」（confinement_and_training.py / default.py / basement.py）
> 插件：`src/plugins/confinement-system/`
> 依赖（data_dependencies）：characters:initialized / combat:ready / dialogue:ready / h-npc-ai:ready

## 一、概念

监禁系统 = **装袋搬运 → 投入监牢 → 囚犯状态 → 日常管理（监狱长/训练/服装/生活条件）→ 逃脱/追捕/重囚 → 调教（准备/助手）→ 释放** 的完整闭环。

- 玩家用道具「携袋」把**完全无意识**的角色装袋搬走，到**牢房地点**投入监牢
- 囚犯被剥夺自主性：AI 停止（unnormal_flag 位2）、需求链阻断（`T_NORMAL_2`）、被监禁者无法拒绝任何指令（实行值 +9999）、H 无抗拒
- 每日结算逃脱概率，逃脱后生成**追捕委托**（藏匿点 + 战斗 + 抓回重囚），3 游戏日未抓回则永久脱逃
- 可任命**监狱长**（陷落≥3）进行日常训练，并配合调教助手协同 H

## 二、数据结构

### 2.1 角色字段（`sp_flag`，随实体存档）

| 字段 | 类型 | 说明 |
|------|------|------|
| `imprisonment` | boolean | 被监禁中（默认 false） |
| `escaping` | boolean | 逃跑中（默认 false） |
| `be_bagged` | boolean | 在袋中（默认 false） |
| `bagging_chara_id` | string | 仅玩家角色：正在搬运的角色ID（空串=无） |
| `pre_dormitory` | string | 入狱前的宿舍地点（释放时还原） |

> 铁律：所有 sp_flag 读取用 `?? 默认`，缺失字段按 erArk 语义给安全默认值，绝不抛错。

### 2.2 全局状态（save provider，id=`confinement-system`）

```ts
{
  prisoners: { [charId]: { imprisonedAt: GameTime, escapeProbability: number } },
  wardenId: string | null,
  settings: ConfinementSettings,
  facilityLevels: Record<string, number>,   // 设施接口预留
  fugitives: { [charId]: { hideout, escapedDay } },
}
```

### 2.3 位掩码

- `unnormal_flag` 位2（0x04）：入狱置位，释放清除（erArk 位2 = AI 行动停止）
- `T_NORMAL_2` 前提：真语义 = 目标未被监禁（confinement onEnable 注册，覆盖 sleep-system 恒 true 占位）

### 2.4 监禁调教设置（settings）

| 键 | 含义 | 取值 |
|----|------|------|
| `training` | 囚犯训练管理 | 0不训练/1部位快感/2部位扩张/3苦痛快感/4性爱技巧/5身体锻炼/6心理服从 |
| `clothing` | 囚犯服装 | 0全裸/1囚服/2正常衣服 |
| `underwear` | 内衣袜子 | 0无/1情趣/2正常 |
| `living_condition` | 生活条件 | 0艰苦/1标准/2舒适（影响回复与逃脱概率） |
| `prep_clean` / `prep_lube` | 调教前清洗/润滑 | boolean |
| `prep_tools` | 调教前道具 | { 道具id: boolean } |
| `assistant` | 调教助手 | 0关/1同部位/2异部位/3指定列表 |
| `assistant_list` / `assistant_ban` | 助手指定/禁止指令列表 | string[] |
| `target` | 调教目标 | 0仅囚犯/1全员 |

## 三、指令集

### 3.1 核心闭环（A 阶段）

| 指令 | 前提 | 效果 |
|------|------|------|
| `bagging_and_moving` 装袋搬走 | HAVE_TARGET + HAVE_BAG + T_IMPRISONMENT_0 + T_UNCONSCIOUS_FLAG_6 + T_UNCONSCIOUS_FLAG_0 + SCENE_ALL_UNCONSCIOUS_OR_SLEEP + PL_NOT_BAGGING_CHARA + NOT_CARRY_ANYBODY_IN_TIME_STOP | 目标 be_bagged + 玩家记录 + setOffline（10分钟） |
| `put_into_prison` 投入监牢 | IN_PRISON + SCENE_ONLY_ONE + PL_BAGGING_CHARA | 目标上线到牢房 → `charaBecomePrisoner()`（10分钟） |
| `set_free` 解除囚禁 | HAVE_TARGET + IN_PRISON + SCENE_ONLY_TWO + T_IMPRISONMENT_1 | 清 flag/记录 → 回 pre_dormitory → 取回衣服（10分钟） |
| `release_from_bag` 从袋中放出 | PL_BAGGING_CHARA + T_BE_BAGGED_1 | 目标上线回原处，不成为囚犯（10分钟） |

### 3.2 监狱长（C 阶段）

| 指令 | 前提 | 效果 |
|------|------|------|
| `designate_warden` 任命监狱长 | HAVE_TARGET + PRISONER_IN_CUSTODY + FALL_LEVEL_GE_3 + T_IMPRISONMENT_0 | 换任先解除旧 → wardenId 更新 → 宿舍搬关押区休息室 |
| `remove_warden` 解除监狱长 | HAVE_WARDEN | 清 wardenId → 宿舍还原 |

### 3.3 调教（C 阶段）

| 指令 | 前提 | 效果 |
|------|------|------|
| `prepare_training` 调教前准备 | HAVE_TARGET + T_IMPRISONMENT_1 + HAVE_WARDEN | 三方移动调教室 → 清洗/润滑/道具 |

## 四、前提注册

| 前提 | 语义 |
|------|------|
| `T_IMPRISONMENT_1/0` | 目标被监禁/未监禁 |
| `IMPRISONMENT_1` | 自己（sourceId）被监禁 |
| `T_ESCAPING_1` | 目标逃跑中 |
| `HAVE_BAG` | 玩家背包有携袋（tag=confinement_bag） |
| `IN_PRISON` | 玩家所在地点是牢房（location.tags.prison） |
| `SCENE_ONLY_ONE` | 场景内只有玩家自己 |
| `PL_BAGGING_CHARA` / `PL_NOT_BAGGING_CHARA` | 玩家正在/未在搬运该目标 |
| `T_BE_BAGGED_1` | 目标在袋中 |
| `PRISONER_IN_CUSTODY` | 有囚犯在押 |
| `HAVE_WARDEN` | 已有监狱长 |
| `T_NORMAL_2` | 目标非临盆/产后/监禁（覆盖 sleep-system 占位） |

> ⚠️ 注册时机：**必须在 onEnable**（不在 onLoad）——`T_NORMAL_2` 由 sleep-system 在 onLoad 注册恒 true，后注册覆盖语义要求 confinement 晚于所有 onLoad。`T_IMPRISONMENT_1` 已从 h-core pendingFalse 列表移除（premise-instruct.ts ★1 修复）。

## 五、逃脱结算（每日 game:new_day）

- **累积**：`add = (战斗+学识) × 系数 / 设施效率`，系数 = `(生活条件+1)×0.5 − 屈服×0.1 + 反发×0.2 − 陷落×0.2`；单次上限 `(100−当前)×0.1`、下限 1
- **无监狱长**：概率 > 30 → 逃脱
- **有监狱长**：阈值 50+设施效果，且 `escape_value > warden_value`（囚犯 vs 监狱长 战斗×hp%×mp% 对抗）
- **逃脱成功**：escaping + setOffline + 删囚犯记录 + 生成追捕委托
- **逃脱失败**：概率清零（「监狱长加强了监视」）

## 六、追捕委托（B 阶段）

1. 逃脱成功 → 随机**藏匿点**（非监狱地点）→ 逃犯 setOnline 到藏匿点（escaping 拦截 AI）
2. 动态 scene（`quest.startDynamicScene`，id=`capture_{逃犯id}`）：
   `objective(reach_location 藏匿点) → combat(enemies=[逃犯]) → reward(重囚)`
3. 战斗胜利 → `confinement_recapture` effect → 需**空牢房**（`getUnusedPrisonCell`，tag=prison 且无囚犯）→ 重囚
4. **3 游戏日**未抓回 → 脱逃成功（清 escaping，永久自由）

## 七、监狱长与训练（C 阶段）

- **任命**：陷落≥3（FALL_LEVEL_GE_3）+ 有囚犯；换任先解除旧监狱长（宿舍还原）
- **训练结算**：每日 `game:new_day` 按设置1对所有囚犯结算一次（跳过 1 异常/睡眠中），消耗囚犯 HP/MP
- **6 模式数据驱动**：`data/default/training.toml`（mod 可 override——见下方扩展指南）

### 训练模式扩展指南

6 模式定义在插件默认层 `data/default/training.toml`，mod 覆盖 = 在 `mods/[模组名]/definitions/training.toml` 写同 id 的 `[[modes]]`。增/改模式只需改数据，引擎做通用结算：

```toml
[[modes]]
id = 6                        # 唯一 id（1-6 为默认，新增用 7+）
name = "心理服从训练"
state = "好意"                # h-core settleState 的状态名（可选）
stateBase = 20                # 状态基础值
experienceId = 2              # 经验 id（0-7 部位经验）
experienceValue = 1           # 每次加的经验
ability = "技巧"              # abilities.能力名.level +abilityValue（封顶 10）
abilityValue = 1
setFields = [{ path = "abilities.屈服刻印.level", value = 1 }]  # 直接字段
wardenAbility = "经验"        # 监狱长的该能力等级作为结算等级（abilityLevel）
interval = 60                 # 预留：结算间隔（工作系统落地后生效）
```

**效果字段可自由组合**（state/experienceId/ability/setFields 任意搭配）。引擎执行顺序：HP/MP 消耗 → state 结算（h-core settleState）→ 经验 → 能力 → setFields。

## 八、调教助手（C 阶段）

职责切分（erArk 一比一）：
- **confinement**（`assistant.ts`）：`h:start` 时判定（设置12≠0 + 目标被监禁（target=0 时）+ 监狱长在场非H中）→ 监狱长 `is_h=true` + `h_state.sex_assist=true` → 注册行为源
- **h-npc-ai**（`sex-assist.ts`）：per-tick 识别 `sex_assist` 参与者 → 向行为源取指令 → `executeInstructionForNpc`

行为选择（`sexAssistBehaviorSource`）：
- 设置12=1 同部位：选与玩家当前部位（insert_position）一致的指令
- 设置12=2 异部位：选不同的
- 设置12=3 指定列表：从 `assistant_list` 选（空列表 = 全部随机）
- `assistant_ban` 禁止列表始终排除
- 监狱长 6 异常（无意识）/无候选 → 不行动（只是陪着）

## 九、与其他系统的交互

| 系统 | 交互 |
|------|------|
| h-core | 被监禁目标实行值 +9999（judge_check）；h_state.sex_assist 由 h-core 会话管理 |
| h-npc-ai | 被监禁目标 continue_h 直通；sex_assist 行为源消费 |
| h-mark | 强制刻印（屈服2/恐怖1/反发1-3 视陷落）；逃脱公式读刻印等级 |
| npc-ai-system | `sp_flag.imprisonment` pre-check 原地等待；escaping 跳过规则（skip-registry） |
| character-system | setOffline/setOnline/moveTo；pre_dormitory 还原 |
| quest-system | `startDynamicScene`/`registerDynamicScene`/`unregisterDynamicScene`（追捕委托） |
| sleep-system | `T_NORMAL_2` 占位被覆盖；`SCENE_ALL_UNCONSCIOUS_OR_SLEEP` 装袋前提 |
| inventory-system | `getByTag` 查携袋 |
| map-system | `location.tags.prison` 牢房 / `humiliation_room` 调教室 / `warden_rest` 监狱长宿舍 |

## 十、内容归属与默认数据（ADR：confinement-0004）

| 内容 | 归属 | 说明 |
|------|------|------|
| 牢房/调教室/监狱长办公室 | **mod 地图** | 插件只消费 tag 约定（prison/humiliation_room/warden_office/warden_rest），mod 自行建模 |
| 携袋道具 | **插件默认层** `data/default/items/bag.toml` | tag=confinement_bag，mod 可 override 改名/图标/描述 |
| 训练模式 | **插件默认层** `data/default/training.toml` | mod 可 override |
| 设置初始值 | 插件代码 DEFAULT_SETTINGS | 运行时值存 provider |

**tag 词表**（地点建模要求）：
- `prison`：牢房（投牢目标点、getUnusedPrisonCell 扫描）
- `detention`：关押区区域标记（藏匿点排除）
- `humiliation_room`：调教室（调教前准备移动目标）
- `warden_office`：监狱长办公室（预留）
- `warden_rest`：监狱长宿舍（任命时搬入）

## 十一、设计注记与演进预留

> 自研 mod 时可能针对性地改框架——此处记录决策考虑与细节（ADR：confinement-0003）。

1. **逃脱公式的技能来源**：当前用 erArk 迁移的能力（tag 聚合 combat/knowledge，optional_ability_tags）。非通用——TODO 注明自研 mod 时按我们的公式与技能改（可能换 tag/换权重）。改动点集中在 `escape.ts getSkillTotal`。
2. **设施效率**：A 阶段恒 1（`getFacilityEfficiency`），公式留变量 + provider 留 `facilityLevels` 字段。接入设施后按等级查效果表（erArk Facility_effect.csv：升级降低逃脱阈值至 99）。
3. **追捕形式**：藏匿点（随机非监狱地点）+ 动态 scene（objective→combat→重囚）。erArk 是抽象委托（3人/3天/需求=战斗×4）——本引擎无派干员系统，改为玩家亲自追。3 日时限在 `checkFugitiveDeadline`（FUGITIVE_TIMEOUT_DAYS）。
4. **监狱长训练频率**：每日一次（erArk 是监狱长 60 分钟工作行为一次）。数据留 `interval` 字段 + 半成品标记——通用工作系统落地后切回工作行为链（docs/master-todo.md 有记录）。
5. **监狱长 AI 移动**：不做（任命即生效）。工作系统落地后应移动至关押区并执行训练行为块。
6. **战斗/学识能力名**：h-core 角色契约的 abilities 按名存储；`combat`/`knowledge` tag 由 mod 能力定义（abilities.toml tags），未配 tag → warning + 按 0 处理。
