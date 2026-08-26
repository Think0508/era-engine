// 模组数据 schema 类型定义（2026-08-15 E1 拆分——mod-loader 类型段独立）
import type { Edge, EntityData, LocationData, MapLayout, MigrationStep, MoveConfig } from './types'
import type { Effect } from './effect-type-registry'
import type { StyledTalkDisplay } from './talk-display'
// 转导出（mod-parse/mod-validate/外部消费者统一从本文件或 mod-loader 导入）
export type { Edge, EntityData, LocationData, MapLayout, MigrationStep, MoveConfig } from './types'
export type { Effect } from './effect-type-registry'

export interface ModDependency {
  plugin: string
  version: string
}

export interface AttributeDefinition {
  type: string
  default: unknown
  category: string
  compute?: string
  display?: boolean
  display_group?: string
  daily_reset?: boolean
  level_thresholds?: number[]
  sex?: 'male' | 'female'
}

export interface EquipmentSlot {
  id: string
  name: string
  category: string
  // 注释：H 中是否可脱
  removable?: boolean
  // 注释：精液容量
  semen_capacity?: number
}

// 注释：H 指令定义（L1.6 指令复刻 schema）
export interface HInstruction {
  id: string
  label: string
  // 注释：category（spec §3 规范名）与 type（旧别名/测试数据）等价，loader 优先 category
  category?: string           // daily/obscenity/sex/system/arts/play/work（驱动 UI 开关行 + modes）
  type?: string               // 旧别名（test-mod 等既有数据用）
  sub_category?: string       // sex 子类：base/foreplay/wait_upon/insert/item/drug/sm/arts
  sub_type?: string           // 旧别名
  time_cost?: number          // 分钟；-1 = handler 自定义耗时（引擎不自动推进）
  // 注释：实时结算模式——"rest"（休息：不积累疲劳，恢复走 effects）/ "sleep"（睡眠：
  // 不积累疲劳 + 2 倍削减疲劳 + 熟睡值积累 + 体力/气力公式恢复，erArk settle_sleep）
  settle_mode?: 'rest' | 'sleep'
  // 注释：跨天推进到目标小时（0-23）——time_cost=-1 时配合使用（如睡觉到次日 6:00）。
  // 引擎按 minutesUntilHour 计算真实时长并推进（逐步发射 hour_changed/new_day 事件）
  advance_to_hour?: number
  priority?: number
  modes?: string[]
  premises?: string[]         // 前提（premiseRegistry 注册的 ID；位置前提已迁到 condition）
  condition?: string          // 条件表达式（location.tags.has_xxx 等）
  judge_base?: number         // 实行判定基准值（有判定才写）
  judge_class?: string        // 判定族名（hConfig [judge.adjustments] 表 key）
  erark_id?: string           // 迁移期追溯字段，全部批次验收后删除
  erark_behavior?: string     // 迁移期追溯字段，全部批次验收后删除
  // 迁移期追溯字段（2026-08-08 erArk 前提自动化更新）：InstructConfig.csv 的 h_mode_show_type/
  // tired_type 原始值——用于承接 erArk 后续更新（diff CSV 定位类型值变化）与
  // validateInstructionData 的"自动注入前提完整性"校验（SOP §4.1），全部批次验收后删除
  erark_h_mode_show_type?: number   // 0=全显示 1=非H显示 2=仅H内显示
  erark_tired_type?: number         // 0=无关 1=低疲劳 2=特定疲劳
  tags?: string[]             // 多标签（system:/kind:/part:）
  effects?: Effect[]
}

// 注释：H 系数配置
// 注释：hConfig [talk] 段（口上/地文配置，ADR 0017）——mod 作者用
export interface HConfigTalk {
  /** 混合率（0-100；0 = 只关混合、留兜底；默认 30，对齐 erArk draw_setting[13]×10） */
  common_mix_rate?: number
  /** 纸娃娃地文总开关：false = 混合 + 空池兜底全关（默认 true，对齐 erArk draw_setting[2] 的纸娃娃一侧） */
  behavior_text_enabled?: boolean
  /** 特殊情境加权（T6，erArk handle_special_talk_weight 数据化） */
  situations?: { premises?: string[]; multiplier?: number }[]
  [key: string]: any
}

export interface HConfig {
  ability_lv_adjust?: number[]
  status_level_thresholds?: number[]
  favorability_thresholds?: number[]
  talk?: HConfigTalk
  [key: string]: any
}

export interface CalendarConfig {
  month_names: string[]
  weekday_names: string[]
  hour_names?: string[]
}

// 注释：NPC spawn 定义——首次进入地点时随机生成路人
export interface NpcSpawn {
  template: string
  at_locations: string[]
  count: { min: number; max: number }
  overrides?: Record<string, any>
  names?: string[]
  name_generator?: string
}

// 注释：反应式口上条目（展示字段来自 core 唯一源 StyledTalkDisplay，2026-08-23 收敛）
export interface ReactiveLine extends StyledTalkDisplay {
  scene: string
  condition?: string
  text: string
  effects?: Effect[]
  // 注释：权重（T1 权重系统）——静态权重，等价 erArk CVP_Weight|0 固定权重；缺省时权重 =
  // 前提权重（high_N 累加 + 满足前提数），无条件 = 1
  weight?: number
  // 注释：口上版本（T4 版本化）——同一场景多版本时按角色 character_text_version 选择
  version?: number
}

// 注释：交互式对话
export interface ConversationNode {
  id: string
  lines: string[]
  choices?: { text: string; next: string; condition?: string; effects?: any[] }[]
  effects?: any[]
  next?: string
}

export interface Conversation {
  id: string
  condition?: string
  nodes: ConversationNode[]
}

// 注释：物品定义
export interface ItemDef {
  id: string
  name: string
  type: string          // 五枚举：consumable|equipment|tool|material|key
  stackable: boolean
  effects?: any[]       // 使用效果（consumable 类）
  attack_bonus?: number
  defense_bonus?: number
  // 2026-08-12 schema 定稿新增（grill Q2/Q8 + erArk 字段）：
  use?: string | string[]   // 使用类别（self/target/equip/gift/key/h_drug/...插件可扩展，useRegistry 注册）
  consume?: boolean         // 默认 true：使用后扣 1；false = 非消耗品
  tags?: string[]           // 弹性分类（drug/alcohol/weapon/...自由扩展）
  price?: number            // erArk 字段：商店后续用
  level?: number            // 等级/品级
  time_cost?: number        // 使用耗时（分钟）
  description?: string      // 描述（erArk info）
  body_slot?: number        // 身体物品槽位（≥0 时必须声明 body_auto_remove）
  body_auto_remove?: string // manual/h_end/expiry——body_slot≥0 时必填（加载校验）
  [key: string]: any        // 各 type 可扩展字段
}

// 注释：天赋 modifier 声明
export interface TalentModifier {
  formula: string          // judge / combat_damage / favorability / trust / state_change
  when_tag?: string        // 按标签过滤（如 "sword", "anal"）
  when_type?: string       // 按 type 过滤（如 "anal", "kiss"）
  when_ability?: string    // 按能力 ID 过滤（如 "降龙十八掌"）
  condition?: string       // 额外条件表达式
  plus?: number            // 每级加法值
  multiply?: number         // 每级乘法系数（如 0.05 = +5%/级）
}

// 注释：能力升级需求（erArk need_string 语义化：A能力等级/T素质存在/J宝珠/E经验/F好感/X信赖）
// ability_sum：聚合判定——sum(带 tag 的能力等级) ≥ 当前等级 × per_level（玩家）/ per_level_npc（NPC）
export interface UpgradeNeed {
  type: 'ability' | 'talent' | 'juel' | 'experience' | 'favorability' | 'trust' | 'ability_sum'
  id?: string | number   // ability/talent 用名称；juel/experience 用 erArk 数字 id（直通）
  value?: number         // 需求值（talent 类型 = 存在性检查，无 value）
  tag?: string           // ability_sum 用
  per_level?: number     // ability_sum 用（玩家倍率）
  per_level_npc?: number // ability_sum 用（NPC 倍率）
}

// 注释：能力升级条目（per-level，erArk AbilityUp.csv）——第 i 项 = 从 i 级升 i+1 级的需求
export interface AbilityUpgradeEntry {
  needs: UpgradeNeed[]           // 主需求（全部满足才可升）
  backup_needs?: UpgradeNeed[]   // 备选需求（主不满足时，备选全满足也可升）
}

// 注释：天赋自动习得条件
export interface TalentGain {
  condition?: string     // 条件表达式，满足时自动获得（gain_type 0 随时检查用）
  replace?: string       // 获得时替换已有天赋 ID（升级类天赋用）
  // 注释：获得类型（erArk TalentGain.csv gain_type）——0 随时自动 / 1 手动面板 / 2 指令绑定 /
  // 3 睡觉自动。缺省 0（向后兼容，现有 gain.condition 数据不变）
  gain_type?: number
  // 注释：语义化获得需求（erArk gain_need 转换；A/T/E/F/X 同 UpgradeNeed，无 J）
  needs?: UpgradeNeed[]
}

// 注释：条件→获得 规则（gain-rule-system 消费）——通用「满足条件后获得xx」管线数据格式
// scope：作用实体——player（玩家）/ all（逐角色扫描，条件用 {self} 占位符代入）/
//        固定角色 ID（直接作用于该角色）/ manual（UI 候选，selected 为作用对象）
// when：触发时机——auto（行为结算后增量检查 / 睡觉全量）/ event:{事件名}（事件触发）/
//        manual（手动确认面板候选）
// once：达成后不再检查（默认 true；false = 条件保持满足会反复执行，多用于持续效果）
export interface GainRuleDef {
  id: string
  scope?: string         // player | all | manual | 固定角色 ID；缺省 player
  when?: string          // auto | event:xxx | manual；缺省 auto
  condition?: string     // 条件表达式（scope=all 时 {self} 在求值前替换为当前角色 ID）
  needs?: UpgradeNeed[]  // 语义化需求（同天赋 gain.needs，与 condition 二选一或并用）
  lose_condition?: string // 可选：满足即失去（作用对象已有该天赋/效果时移除）
  lose_effects?: Effect[]  // 可选：失去条件满足时执行的效果（如 remove_talent）
  once?: boolean         // 缺省 true
  effects?: Effect[]     // 满足时执行的效果（复用 effect-system）
  role_mapping?: Record<string, string>  // 事件触发时：payload 字段 → selected/self 等执行上下文角色
}

// 注释：成就定义（gain-rule-system 消费）——成就是带元数据的规则（编译为 GainRule）
export interface AchievementDef {
  id: string
  name: string
  description?: string
  difficulty?: number    // 难度分级 1-6（仅显示元数据）
  hidden?: boolean       // 隐藏成就：达成前不显示（不参与全量重算）
  pre_id?: string        // 前置成就（面板显示链用；条件本身表达真正的前置校验）
  scope?: string         // player | character（固定角色ID）| global；缺省 player
  when?: string
  condition?: string
  needs?: UpgradeNeed[]
  effects?: Effect[]     // 可选：达成时附带奖励
  role_mapping?: Record<string, string>  // 事件触发时：payload 字段 → selected/self（与规则同义）
}

// 注释：计数器定义（counter-system 消费）——声明式计数器，三种类型：
// number（数值）/ list（去重名单+初始数字）/ group_table（嵌套分组表：dim1 → dim2 → 字段）
export interface CounterDimDef {
  id: string                // 维度 id（如 part / character）
  from: string              // 事件 payload 字段路径（如 payload.position）
}

export interface CounterFieldDef {
  id: string                // 字段 id（如 semen）
  label: string
  unit?: string
  event: string             // 驱动事件名（如 h:shoot）
  add: string | number      // 增量：数字常量 或 payload 字段路径（如 payload.amount）
  pending?: boolean         // 半成品：依赖未实现事件 → 加载 warning + 条件路径不注册 + 监听跳过
}

export interface CounterDef {
  id: string
  label: string
  scope: 'player' | 'character' | 'global'
  type: 'number' | 'list' | 'group_table'
  unit?: string
  // number/list 通用：
  event?: string            // 驱动事件名
  add?: string | number     // number：增量；list：加入名单的 payload 字段路径
  target_from?: string      // 计数目标角色：payload 字段路径（默认 payload.target）
  filter_gender?: 'male' | 'female'  // list 专用：加入名单前查目标角色 base.性别（1=男 2=女）
  // 初始值（创建时快照自角色实体字段；快照后与角色字段脱钩）：
  initial_from?: string     // 数字初始：实体字段路径（如 base.初始H过男人数）
  initial_named_from?: string // 具名初始：实体字段路径（数组，如 base.初始H过男人）
  initial_fields?: Record<string, string> // 分组表字段初始：field → 实体字段路径
  // group_table 专用：
  dims?: CounterDimDef[]
  fields?: CounterFieldDef[]
}

// 注释：计数器视图定义（counter-system 消费）——只读：映射实体字段 / 聚合分组表 / 查询关系
export interface CounterViewDef {
  id: string
  label: string
  unit?: string
  source?: { path: string; initial_from?: string }  // 只读映射（相对角色实体；可减初始）
  map?: { path: string; table: Record<string, string> } // 枚举映射：维度值 → 实体字段段
                                         // （如 orgasm_count：部位 cid → experience 绝顶 id）
  aggregate?: {           // 派生聚合：分组表/名单 求和或计数
    counter: string       // 目标计数器 id
    field?: string        // sum 的字段；缺省 = 条目计数（count）
    keep_dims?: string[]  // 元数据：保留维度语义说明（UI 渲染/文档用）。
                          // 当前求值按声明 dims 顺序 + 条件路径 rest（如下钻部位）确定维度，未消费此字段
    op: 'sum' | 'count'
  }
  relation?: { type: string }  // 关系查询视图：读角色关系系统，返回 type 匹配且正面的对象数量
}

// 注释：天赋定义
export interface TalentDef {
  name: string
  description?: string
  max: number              // 最大等级，0=无等级
  modifiers?: TalentModifier[]
  gain?: TalentGain
  tags?: string[]
  // 注释：结算修正（数据化，h-core settle/talent-adjust.ts 消费）
  // state_adjusts：状态系数加法修正（erArk chara_base_state_adjust），states=["*"]=全部状态
  // favorability_adjusts：好感/信赖系数加法修正（erArk calculation_favorability），同 group 取最大
  state_adjusts?: { states: string[]; value: number }[]
  favorability_adjusts?: { group?: string; value: number }[]
}

// 注释：身材系统（body-shape-system 消费）——body-shape.toml 档位表
// 维度（胸/臀）内多个连续档位，天赋名 = 人际可读的标签（须与现有胸/臀天赋名逐一对应）；
// 数值为唯一真相：数值落档 → 重算天赋；只有档没数值 → 落该档最小值；两者皆无 → 默认档。
export interface BodyShapeTierDef {
  min: number        // 闭区间下界
  max: number        // 开区间上界（min ≤ value < max；越界收边）
}
export interface BodyShapeDimDef {
  default: string    // 默认档天赋名（无数值无天赋时使用）
  tiers: Record<string, BodyShapeTierDef>
  sex?: 'female' | 'male'   // 维度级性别闸（缺省 = body_shape.sex_to_apply；胸/臀/身高=女，阴茎=男）
}
export interface BodyShapeDef {
  sex_to_apply?: 'female' | 'male'   // 性别闸（缺省 female）；本引擎 性别 1=男 2=女
  chest?: BodyShapeDimDef
  hip?: BodyShapeDimDef
  height?: BodyShapeDimDef   // 身高：纯派生档（不写天赋，与胸/臀语义不同）
  penis?: BodyShapeDimDef    // 阴茎长度：男用、纯派生档；base.阴茎大小(0-3) 降级为派生镜像
}

// 注释：套装定义
export interface SetBonus {
  required_count: number
  effects?: any[]
  talent?: string       // 凑齐给的天赋
}

export interface SetDef {
  id: string
  name: string
  members: { abilities?: string[]; items?: string[]; talents?: string[] }
  bonuses: SetBonus[]
}

// 注释：状态效果定义
export interface StatusEffectDef {
  id: string
  name: string
  description: string
  category: string      // debuff/buff/neutral
  duration: number      // 分钟，-1=永久
  tick_interval: number // 分钟，0=不 tick
  stackable: boolean
  max_stack: number
  tick_effects?: any[]
  on_apply_effects?: any[]
  on_remove_effects?: any[]
}

// 注释：能力定义（扩展）
export interface AbilityDef {
  id: string
  name: string
  description?: string
  type: string          // active/passive
  max_level: number     // 0=无等级
  tags: string[]
  effects?: any[]
  time_cost?: number
  condition?: string
  xp_curve?: string     // linear/exponential/custom
  xp_per_level?: number | number[]
  unlocks?: { at_level: number; ability?: string; talent?: string }[]
  // 注释：升级模式（2026-08-11 成长系统）——"xp"（缺省：gain_ability_xp 即时升级）/
  // "condition"（erArk 式：结算点按 upgrades 逐级检查 needs）
  mode?: 'xp' | 'condition'
  // 注释：是否在角色面板显示（2026-08-11）——缺省 true；display=false 的能力参与结算/
  // 条件/查询但不出现在面板（如 mod 用不到的默认能力）
  display?: boolean
  // 注释：条件升级路径（mode=condition）——第 i 项 = 从 i 级升 i+1 级；缺项 = 不可升
  upgrades?: AbilityUpgradeEntry[]
  // 注释：能力级附加判定（每级升级前都检查；erArk extra_ability_check 数据化）
  extra_needs?: UpgradeNeed[]
  // 注释：性别限定（erArk Ability.csv sex_need 原值）——-1 通用 / 0 男限定 / 1 女限定
  sex_need?: number
  [key: string]: any
}

// 注释：宝珠定义（erArk Juel.csv id 直通）
export interface JuelDef {
  name: string
  // 注释：对应 daily_reset 参数属性名——睡眠转珠时该状态值 → 此宝珠
  status_attr?: string
}

// 注释：任务定义
export interface ConversationRef {
  type: 'character' | 'global' | 'quest' | 'event' | 'scene'
  character?: string    // type=character 时：角色 ID
  name?: string         // type=character/global 时：文件名（不含.toml）；type=scene 时：对话树 ID
  path?: string         // type=quest/event 时：相对路径
  scene?: string        // type=scene 时：任务 ID（sceneId，内嵌对话归属）
}

// 注释：解析 ConversationRef → Conversation 数据
// 字符串简写格式: "type:参数" → 自动转为 ConversationRef 对象
export function parseConversationRef(ref: string | ConversationRef): ConversationRef {
  if (typeof ref === 'string') {
    const colonIdx = ref.indexOf(':')
    if (colonIdx < 0) return { type: 'global', name: ref }
    const type = ref.slice(0, colonIdx) as ConversationRef['type']
    const rest = ref.slice(colonIdx + 1)

    if (type === 'character') {
      const slashIdx = rest.indexOf('/')
      if (slashIdx < 0) return { type: 'character', character: rest, name: '' }
      return { type: 'character', character: rest.slice(0, slashIdx), name: rest.slice(slashIdx + 1) }
    }
    if (type === 'global') return { type: 'global', name: rest }
    if (type === 'quest' || type === 'event') return { type, path: rest }
    if (type === 'scene') {
      // 格式 "scene:{sceneId}/{dialogueId}"
      const slashIdx = rest.indexOf('/')
      return { type: 'scene', scene: rest.slice(0, slashIdx), name: rest.slice(slashIdx + 1) }
    }
    return { type: 'global', name: ref }
  }
  return ref
}

// 注释：根据 ConversationRef 查找 Conversation 数据
export function resolveConversation(
  conversations: LoadedMod['conversations'],
  ref: ConversationRef,
): Conversation | undefined {
  switch (ref.type) {
    case 'character':
      if (!ref.character || !ref.name) return undefined
      return conversations.character.get(ref.character)?.get(ref.name)
    case 'global':
      return ref.name ? conversations.global.get(ref.name) : undefined
    case 'quest':
      return ref.path ? conversations.quest.get(ref.path) : undefined
    case 'event':
      return ref.path ? conversations.event.get(ref.path) : undefined
    case 'scene':
      // C5：任务内嵌对话——sceneId（任务 ID）→ dialogueId → Conversation
      return ref.scene ? conversations.scene.get(ref.scene)?.get(ref.name ?? '') : undefined
  }
}

// 注释：objective 目标定义（C4 扩展——事件驱动的脚本化目标）
// 既有类型（reach_location/kill_count/collect_items/talk_to）：target/item/count/character
// C4 custom 类型：event（监听的事件名）+ script（scripts/ 下 .js）+ params（脚本参数）
// + fail_event（失败事件，脚本返回 'pending' 时触发 on_fail 步骤；缺省 = 继续挂起）
export interface QuestObjective {
  type: string
  // C4：custom objective
  event?: string
  script?: string
  params?: Record<string, any>
  fail_event?: string
  on_fail?: string
  // 既有类型字段保持
  target?: string
  item?: string
  count?: number
  character?: string
}

export interface QuestStep {
  id: string
  type: string          // dialogue/combat/objective/reward/spawn/condition/goto/scene/script
  next?: string
  // dialogue
  conversation?: ConversationRef | string  // 对象或字符串简写 "type:参数"
  speaker?: string                          // 可选：默认说话者
  lines?: string[]
  // combat
  enemies?: string[]
  on_win?: string
  on_lose?: string
  // objective
  objective?: QuestObjective
  // reward
  effects?: any[]
  // condition
  condition?: string
  else?: string
  // goto
  target?: string
  // scene（嵌套子场景）
  scene_id?: string
  // spawn（2026-08-14 A-I-3 接线——template/at_location/count → 实例化角色）
  template?: string          // templates/character/ 下的模板 id
  at_location?: string       // 生成放置地点（缺省 = 当前地点）
  count?: number             // 生成数量（缺省 1）
  // C1：步骤执行上下文（quest-script C' 模型 Task 1）
  // 注意：target 为 goto 步骤的下一步 step id；在 reward 步骤里是执行目标角色
  // （'player' | 'selected' | 角色ID，默认 UI 选中）——按 step.type 区分语义
  source?: string             // 'player' | 'selected' | 角色ID，默认 'player'
  // C3：script 步骤（Task 3 使用，先定义字段）
  script?: string             // mod scripts/ 下的 .js 文件名
  params?: Record<string, any>
}

// 注释：C6——scene 触发声明（triggers 字段）
// type=command：指定指令执行时（condition 满足）改道启动本场景（指令自身行为不执行）
// type=dialogue_end：与指定角色对话结束时启动本场景
// location_enter/item_used/time：Phase 2 计划类型（本次未实现——数据里出现报 error，
// 防止作者以为已生效）
export type QuestTriggerType = 'command' | 'dialogue_end' | 'location_enter' | 'item_used' | 'time'

export interface QuestTrigger {
  type: QuestTriggerType
  command?: string    // type=command：指令 id
  character?: string  // type=dialogue_end：对话角色 id
  condition?: string  // 可选触发条件（条件引擎表达式，type=command 常用）
}

export interface Quest {
  id: string
  title?: string
  description?: string
  type: string          // main/side/event
  parent?: string       // 可选：父 scene ID，UI 显示层级用
  prerequisites?: string[]
  auto_start_condition?: string
  condition?: string    // 可选：自动触发条件（event 和 quest 通用）
  display?: string      // "current" 显示剧情面板 / "hidden" 全程隐藏 / "log" 只记大事志
  visible?: string      // 可选：条件——满足时 quest 在 UI 中可见
  vars?: Record<string, any>  // C2：场景变量初始值（任务间通信走数据）
  steps: QuestStep[]
  // C5：任务内嵌对话树（[[dialogues]] 段，与独立 conversation 文件同格式）——
  // 引用写法 conversation = "scene:{sceneId}/{dialogueId}" 或 {type="scene", scene, name}
  dialogues?: { id: string; nodes: ConversationNode[] }[]
  // C6：触发声明（command 拦截 / dialogue_end）——条件满足时自动启动本场景
  triggers?: QuestTrigger[]
}

// 注释：关系类型定义（关系系统 v2，2026-08-10 grill 定稿）
// 两个正交维度：种类（类型名，方向编码）+ 档位（正面/中立/负面 = 1/0/-1）
// kind = "sentiment"（数值型，0-100，现有好感度）/ "relation"（三档型）
// 端对（pair）承载称呼词表；类型声明 pair + side（大端/小端；对称类型省略）
export type RelationKind = 'sentiment' | 'relation'
export type RelationSide = 'big' | 'small'

export interface RelationTypeDef {
  name: string
  kind?: RelationKind          // 默认 sentiment（数值型，兼容现有）
  min?: number                 // sentiment 型：数值区间
  max?: number
  default?: number
  pair?: string                // relation 型：端对（称呼词表，pairs 段定义）
  side?: RelationSide          // relation 型：本类型是端对的哪一端（对称类型省略）
  reverse?: string             // 反向类型（默认自动=同名换端；显式覆盖）
}

// 端对词表：panel（成对名，关系面板显示）+ address（单方称呼，口上 {relation_display}）
// 端对型按 端 × 性别 运行时组合（父子/父女/母子/母女…）；对称型固定名/按自己性别
export interface RelationPairDef {
  panel?: string | { big_male: string; big_female: string; small_male: string; small_female: string }
  address?: { male: string; female: string } | { big_male: string; big_female: string; small_male: string; small_female: string }
}

// 关系组（[groups] 段，集中定义）：元素 = 类型名（字符串）或 { pair } 引用
// （{ pair } 加载时展开为引用该 pair 的所有已定义类型名）
export type RelationGroupDef = (string | { pair: string })[]

// ── NPC AI 数据定义（npc-ai-system 插件消费；core 仅作通用数据加载，不认知语义）──

// 目标定义（ai-targets.toml [[targets]]）——erArk config_target（前提集合 + state_machine_id）
export interface AITargetDef {
  id: string
  name?: string
  /** 优先级层（升序搜索，首个有候选的层胜出——erArk config_target_type_index 分层） */
  layer: number
  /** 前提 ID 列表（premiseRegistry，权重求和语义） */
  premises?: string[]
  /** 可选布尔条件（现有条件引擎） */
  condition?: string
  /** 决策结果：{ type: <行为规格ID>, params } */
  behavior: { type: string; params?: Record<string, any> }
  /** 本层只取第一个通过目标（erArk get_first_only） */
  get_first_only?: boolean
}

// 行为规格（ai-behaviors.toml [behaviors.xxx]）——固定常量侧（时长/效果/显示名）
export interface AIBehaviorSpec {
  /** 行为类型（处理器注册表 key）——状态依赖计算由处理器覆盖 */
  type: string
  name: string
  /** 固定或随机时长（分钟）——处理器不覆盖时使用 */
  duration?: { fixed?: number; min?: number; max?: number }
  /** 行为完成时执行的效果 */
  on_complete_effects?: Effect[]
  /** 行为开始叙事模板（{name}/{place} 占位；仅玩家同地点时输出） */
  narrative?: string
}

// 工种定义（ai-work.toml [work_types.xxx]）——erArk config_work_type
export interface AIWorkTypeDef {
  name?: string
  place: string
  time_slots: [number, number][]
  auto_ai: boolean
}

// 娱乐类型定义（ai-entertainment.toml [entertainment_types.xxx]）——erArk config_entertainment
export type AIEntertainmentPeriod = 'morning' | 'afternoon' | 'evening'

export interface AIEntertainmentTypeDef {
  name?: string
  place: string
  period: AIEntertainmentPeriod
}

// ── 随机事件定义（events.toml / events/*.toml [[events]]）——random-event-system 插件消费；
// core 仅作通用数据桶，不认识事件语义——behavior 挂载键是任意字符串（玩家指令 id /
// NPC 行为块 id / move / wait），语义与校验在插件层。erArk Character_Event.json 等价物
export interface RandomEventDef {
  /** 事件唯一 id（英文 kebab） */
  id: string
  /** 挂载键：玩家指令 id / NPC 行为块 id / move / wait（字符串，引擎不预设） */
  behavior: string
  /** 0|1 结算事件（合并语义）；2 = 静默事件 */
  type: number
  /** 空=通用；非空=角色专属（角色 id） */
  adv?: string
  /** 分桶（erArk sys_1/sys_0/any/both）：self=匹配触发者 adv；target=匹配交互对象 adv */
  side?: 'self' | 'target' | 'any' | 'both'
  /** "选项文本|正文"（父/子事件用分隔） */
  text?: string
  /** 前提 ID 列表（conditionEngine 权重通道，0 淘汰，返回值即权重） */
  premises?: string[]
  /** 现有条件表达式（布尔门） */
  condition?: string
  /** 触发记录守卫：seen/unseen × once/today */
  trigger_guard?: 'seen_once' | 'unseen_once' | 'seen_today' | 'unseen_today'
  /** 子事件标记（父子匹配：子前提 ⊇ 父前提） */
  option_son?: boolean
  /** 效果列表（effectTypeRegistry） */
  effects?: Effect[]
  comment?: string
}

// 注释：睡眠配置（sleep-system 插件消费；core 仅作通用数据桶，不认知语义）
export interface SleepConfig {
  /** 计划醒来时刻 [时, 分]（erArk plan_to_wake_time 默认 [6,0]）——睡觉跨天目标时刻 */
  plan_to_wake_time?: [number, number]
  /** 计划睡觉时刻 [时, 分]（erArk plan_to_sleep_time 默认 [18,0]）——睡眠窗口起点 */
  plan_to_sleep_time?: [number, number]
  /** 睡眠等级阈值（升序，LV0 起；get_sleep_level 语义：值 ≤ 阈值 → 该级，否则下一级；
   *  最后一项为封顶级。erArk Sleep_Level.csv：LV0 30 / LV1 60 / LV2 80 / LV3 100） */
  sleep_levels?: { name: string; sleep_point: number }[]
}

export interface LoadedMod {  id: string
  name: string
  version: string
  dependencies: ModDependency[]
  // 注释：meta.toml 可选字段（AGENTS §39）——起始地点/玩家实体，main.ts 启动用
  startingLocation?: string
  playerCharacter?: string
  // 注释：标题画面素材（2026-08-14 审查补——此前 TitleScreen 用 (mod as any).meta 取
  // title/description/title_image 恒 undefined，标题文字/描述/图片永不显示）
  title?: string
  description?: string
  titleImage?: string
  // 注释：加载画面素材（方案 B，2026-08-10）——mod 声明的 loading_video/loading_image
  // 路径相对 mod 根（如 "assets/loading.gif"）；未声明 → 引擎用 index.html 的闪烁文字 fallback
  loadingImage?: string
  loadingVideo?: string
  // 注释：升级结算开关（2026-08-11 成长系统，erArk base_setting[1]/[2] 语义，mod 级配置）——
  // 玩家睡眠 / NPC 睡眠 / NPC H结束 时是否执行能力升级+素质获得结算；缺省全开
  upgradeSettings: {
    player_sleep: boolean
    npc_sleep: boolean
    npc_h_end: boolean
  }
  // 注释：世界观文案（meta.toml [ui_text] 段）——引擎通用默认值由 core/ui-text.ts 提供，
  // mod 按 key 覆盖（如"存档"→"神经连接柜"）。core 不认具体世界观词
  uiTexts: Record<string, string>
  entities: Map<string, Map<string, EntityData>>
  locations: Map<string, LocationData>
  graph: Edge[]
  layouts: Map<string, MapLayout>
  bindings: Record<string, Record<string, string>>
  theme: Record<string, Record<string, string>>
  attributes: Record<string, AttributeDefinition>
  equipmentSlots: EquipmentSlot[]
  calendar: CalendarConfig | null
  // 注释：Phase 6-7
  npcSpawns: NpcSpawn[]
  sceneDialogue: ReactiveLine[]
  characterDialogue: ReactiveLine[]
  characterSpecificDialogue: Map<string, ReactiveLine[]>
  // 注释：conversation 数据——按 type 分组存储
  conversations: {
    character: Map<string, Map<string, Conversation>>   // characterId → name → Conversation
    global: Map<string, Conversation>                    // name → Conversation
    quest: Map<string, Conversation>                     // path → Conversation
    event: Map<string, Conversation>                     // path → Conversation
    scene: Map<string, Map<string, Conversation>>        // C5：sceneId（任务 ID）→ dialogueId → Conversation（任务内嵌对话树）
  }
  // 注释：Phase 8-10 新增
  items: Record<string, ItemDef>
  sets: SetDef[]
  statusEffects: Record<string, StatusEffectDef>
  abilities: Record<string, AbilityDef>
  // 注释：宝珠定义（2026-08-11 成长系统，erArk Juel.csv id 直通）
  juelDefs: Record<string, JuelDef>
  // 注释：任务
  quests: Map<string, Quest>
  // 注释：C3：mod 自定义脚本（scripts/*.js 的 raw 文本，按文件名索引）——script 步骤用
  scripts: Map<string, string>
  // 注释：天赋定义
  talentDefs: Record<string, TalentDef>
  // 注释：条件→获得 规则（gain-rule-system 消费）——插件默认层 + mod 定义层，按 id 去重（mod 胜出）
  gainRules: Record<string, GainRuleDef>
  // 注释：成就定义（gain-rule-system 消费）——插件默认层 + mod 定义层，按 id 去重（mod 胜出）
  achievements: Record<string, AchievementDef>
  // 注释：计数器定义（counter-system 消费）——插件默认层 + mod 定义层，按 id 去重（mod 胜出）
  counterDefs: Record<string, CounterDef>
  counterViews: Record<string, CounterViewDef>
  // 注释：命名样式——[styles] 注册表
  styles: Record<string, Record<string, any>>
  // 注释：关系类型定义（关系系统 v2）
  relationTypes: Record<string, RelationTypeDef>
  // 注释：端对词表（pairs 段）——称呼生成（panel 成对名 / address 单方称呼）
  relationPairs: Record<string, RelationPairDef>
  // 注释：关系组（groups 段）——展开后的 组名 → 类型名列表（pair 引用已展开）
  relationGroups: Record<string, string[]>
  // 注释：Phase H — H 系统
  hConfig: HConfig

    // 注释：NPC AI（npc-ai-system 消费）
    aiTargets: AITargetDef[]
    aiBehaviors: Record<string, AIBehaviorSpec>
    aiWorkTypes: Record<string, AIWorkTypeDef>
    aiEntertainmentTypes: Record<string, AIEntertainmentTypeDef>

    // 注释：随机事件（random-event-system 消费）
    events: RandomEventDef[]

    // 注释：睡眠配置（sleep-system 消费）——plan_to_wake_time/plan_to_sleep_time/睡眠等级
    sleepConfig: SleepConfig

    // 注释：身材档位表（body-shape-system 消费）——插件默认层 + mod 定义层，按 维度+档 合并
    bodyShape?: BodyShapeDef

  // 注释：指令（插件默认层 + mod 定义层，按 id 去重，mod 胜出）
  instructions: HInstruction[]
  effectBlocks?: Record<string, Effect>

  // 注释：地图移动配置（插件默认 + mod override）
  moveConfig: MoveConfig

  // 注释：待激活角色——spawn_condition 满足后才注册到 entity-system
  pendingSpawns?: PendingSpawn[]

  // 注释：mod 层文件定义的物品 id（revalidateItemUses 用）——use 未注册检查只在插件
  // 注册 use 后对 mod 层补跑（插件默认层物品的 use 由各自插件负责，不参与）
  modItemLayerIds?: Set<string>

  // 注释：存档迁移 steps（audit-f 修复，2026-08-12）——mods/[mod]/migrations/*.toml 的
  // [[migrations]] 条目平铺合并；读档时 migrateSaveData 执行（此前零生产调用=迁移从未生效）
  migrations?: MigrationStep[]
}

export interface PendingSpawn {
  id: string
  data: EntityData
  condition: string
}

// TODO(phase-x): 当 UI 加载 mod 时把 equipmentSlots/calendar 同步到 game-store

export type RawTomlMap = Record<string, string>
