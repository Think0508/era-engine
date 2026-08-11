import { parse as parseTOML } from '@iarna/toml'
import type { Edge, EntityData, LocationData, MapLayout, MoveConfig } from './types'
import type { Effect } from './effect-type-registry'
import { resolveTemplate, deepMerge } from './template'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'
import { conditionRegistry } from './condition-registry'
import { errorReporter } from './error-reporter'
import { gameContext } from './game-context'
import { getCharacterValidators, validateTopLevelLayers } from './character-contract'

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
export interface HConfig {
  ability_lv_adjust?: number[]
  status_level_thresholds?: number[]
  favorability_thresholds?: number[]
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

// 注释：反应式口上条目
export interface ReactiveLine {
  scene: string
  condition?: string
  text: string
  effects?: Effect[]
  // 注释：权重（T1 权重系统）——静态权重，等价 erArk CVP_Weight|0 固定权重；缺省时权重 =
  // 前提权重（high_N 累加 + 满足前提数），无条件 = 1
  weight?: number
  // 注释：口上版本（T4 版本化）——同一场景多版本时按角色 character_text_version 选择
  version?: number
  // 注释：展示参数（[styles] 引用或行级覆盖）
  style?: string
  display?: string
  trigger?: string
  speed?: number
  pause?: number
  color?: string
  size?: string
  font?: string
}

// 注释：交互式对话
export interface ConversationNode {
  id: string
  lines: string[]
  choices?: { text: string; next: string; condition?: string }[]
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
  type: string          // weapon/armor/consumable/material/etc
  stackable: boolean
  effects?: any[]       // 使用效果（consumable 类）
  attack_bonus?: number
  defense_bonus?: number
  [key: string]: any    // 各 type 可扩展字段
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

// 注释：天赋自动习得条件
export interface TalentGain {
  condition: string        // 条件表达式，满足时自动获得
  replace?: string         // 获得时替换已有天赋 ID（升级类天赋用）
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
  // 注释：体位喜好标记（erArk talent 250-261 → 体位 1-12）——h-core settle/position.ts 消费：
  // 角色拥有该天赋 = 喜欢对应体位（体位修正 +0.5，erArk handle_talent.py:336-368）
  favorite_position?: number
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
  [key: string]: any
}

// 注释：任务定义
export interface ConversationRef {
  type: 'character' | 'global' | 'quest' | 'event'
  character?: string    // type=character 时：角色 ID
  name?: string         // type=character/global 时：文件名（不含.toml）
  path?: string         // type=quest/event 时：相对路径
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
  }
}

export interface QuestStep {
  id: string
  type: string          // dialogue/combat/objective/reward/spawn/condition/goto/scene
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
  objective?: { type: string; target?: string; count?: number; item?: string; character?: string }
  // reward
  effects?: any[]
  // condition
  condition?: string
  else?: string
  // goto
  target?: string
  // scene（嵌套子场景）
  scene_id?: string
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
  steps: QuestStep[]
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
  /** 前提 ID 列表（premiseRegistry 权重通道，0 淘汰，返回值即权重） */
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
  // 注释：加载画面素材（方案 B，2026-08-10）——mod 声明的 loading_video/loading_image
  // 路径相对 mod 根（如 "assets/loading.gif"）；未声明 → 引擎用 index.html 的闪烁文字 fallback
  loadingImage?: string
  loadingVideo?: string
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
  }
  // 注释：Phase 8-10 新增
  items: Record<string, ItemDef>
  sets: SetDef[]
  statusEffects: Record<string, StatusEffectDef>
  abilities: Record<string, AbilityDef>
  // 注释：任务
  quests: Map<string, Quest>
  // 注释：天赋定义
  talentDefs: Record<string, TalentDef>
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

  // 注释：指令（插件默认层 + mod 定义层，按 id 去重，mod 胜出）
  instructions: HInstruction[]
  effectBlocks?: Record<string, Effect>

  // 注释：地图移动配置（插件默认 + mod override）
  moveConfig: MoveConfig

  // 注释：待激活角色——spawn_condition 满足后才注册到 entity-system
  pendingSpawns?: PendingSpawn[]
}

export interface PendingSpawn {
  id: string
  data: EntityData
  condition: string
}

// TODO(phase-x): 当 UI 加载 mod 时把 equipmentSlots/calendar 同步到 game-store

type RawTomlMap = Record<string, string>

function parseFile(path: string, raw: string): Record<string, any> {
  try {
    return parseTOML(raw) as unknown as Record<string, any>
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`TOML 解析失败：${path}\n${reason}`)
  }
}

function loadEntriesByPrefix(
  rawTomlMap: RawTomlMap,
  prefix: string,
): Map<string, EntityData> {
  const result = new Map<string, EntityData>()
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (path.startsWith(prefix) && path.endsWith('.toml')) {
      const data = parseFile(path, raw) as EntityData
      const id = (data.id as string) ?? path.slice(prefix.length, -5)
      result.set(id, data)
    }
  }
  return result
}

function loadLocations(
  rawTomlMap: RawTomlMap,
  modName: string,
): Map<string, LocationData> {
  const result = new Map<string, LocationData>()
  const prefix = `/mods/${modName}/maps/locations/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(prefix) || !path.endsWith('.toml')) continue
    const data = parseFile(path, raw) as any
    // Support both [[locations]] array and single-object file
    const entries: any[] = data.locations ?? [data]
    for (const loc of entries) {
      if (!loc.id) {
        throw new Error(`${path}: location 缺少 id 字段`)
      }
      if (loc.parent === undefined) {
        loc.parent = null
      }
      // Silently ignore exits — new format uses parent chain + graph
      delete loc.exits
      result.set(loc.id, loc as LocationData)
    }
  }
  return result
}

function loadGraph(
  rawTomlMap: RawTomlMap,
  modName: string,
): Edge[] {
  const result: Edge[] = []
  const prefix = `/mods/${modName}/maps/graph/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(prefix) || !path.endsWith('.toml')) continue
    const data = parseFile(path, raw) as any
    const edges = (data.edges as Edge[]) ?? []
    for (const edge of edges) {
      if (!edge.from || !edge.to) {
        throw new Error(`${path}: edge 缺少 from 或 to 字段`)
      }
      result.push(edge)
    }
  }
  return result
}

/**
 * 将 attributes.toml 中定义的默认值同步到角色实体
 * 命名空间 = category 的值：
 *   category="ability" → entity.abilities[name] = { level, xp: 0 }
 *   category="parameter" → entity.params[name] = defaultValue
 *   其他 category → entity[category][name] = defaultValue
 */
function applyAttributeDefaults(
  entity: EntityData,
  attributes: Record<string, AttributeDefinition>,
): void {
  for (const [attrName, def] of Object.entries(attributes)) {
    const defaultValue = def.default ?? 0
    if (def.category === 'ability') {
      if (!entity.abilities) entity.abilities = {}
      if (entity.abilities[attrName] === undefined) {
        entity.abilities[attrName] = { level: defaultValue as number, xp: 0 }
      }
    } else {
      const nsMap: Record<string, string> = { parameter: 'params', mark: 'marks', ability: 'abilities' }
      const ns = nsMap[def.category] ?? def.category
      if (!entity[ns]) entity[ns] = {}
      if (entity[ns][attrName] === undefined) {
        entity[ns][attrName] = defaultValue
      }
    }
  }
}

/**
 * 读档/运行时补齐缺失属性（标准角色契约 spec §10.1 决策 11b）：
 * 存档缺必需字段 → 用 attributes default 补齐 + warning（不静默）。
 * 先全命名空间查重——旧存档把属性存在 base（契约前写法）时不重复补 canonical 命名空间。
 * 供 save-system restoreFromSave 等恢复路径调用。
 */
export function fillMissingAttributes(
  char: EntityData,
  attributes: Record<string, AttributeDefinition>,
  source: string,
): void {
  if (!char || !attributes) return
  // 已有键查重：动态扫描角色全部对象命名空间（base/params/marks/abilities/flags/talents/
  // social/economy/combat/...）——任何位置存在即视为"已有"，兼容契约前存档（base 写法）
  // 与契约后存档（canonical 命名空间）。2026-08-09 第4轮修复：此前硬编码清单漏查
  // social/economy/combat → 契约后存档读档时好感度被默认值覆盖（玩家真实值丢失）+ 虚假 warning
  const nsMap: Record<string, string> = { parameter: 'params', mark: 'marks', ability: 'abilities' }
  const hasAnywhere = (name: string): boolean => {
    for (const container of Object.values(char)) {
      if (!container || typeof container !== 'object' || Array.isArray(container)) continue
      if (container[name] !== undefined) return true
    }
    return (char as any)[name] !== undefined
  }
  for (const [attrName, def] of Object.entries(attributes)) {
    const defaultValue = def.default ?? 0
    if (hasAnywhere(attrName)) continue
    if (def.category === 'ability') {
      if (!char.abilities) char.abilities = {}
      char.abilities[attrName] = { level: defaultValue as number, xp: 0 }
    } else {
      const ns = nsMap[def.category] ?? def.category
      if (!char[ns]) char[ns] = {}
      char[ns][attrName] = defaultValue
    }
    errorReporter.report({
      source: 'save-system',
      severity: 'warning',
      message: `${source}：角色 '${char.id}' 缺属性 '${attrName}'，已用默认值 ${defaultValue} 补齐（命名空间 ${def.category === 'ability' ? 'abilities' : (nsMap[def.category] ?? def.category)}）`,
      suggestion: '旧存档缺字段属正常（契约补齐）；如需自定义初始值请更新存档或迁移规则',
    })
  }
}

/**
 * 角色契约校验（标准角色契约 spec §10.1 决策 11a，加载时执行）：
 * ① 裸字段检查（通用机制，core 不认具体名）：属性承载命名空间（base/params/marks/abilities/talents）
 *    中的键必须在合并定义集（attributes/abilities/talents/status-effects/relations）中存在
 * ② 插件注册的校验器（如 h-core 的"最小必需集"）——具体字段名在插件层声明
 * 校验失败一律 warning+建议（errorReporter），不阻止加载
 */
function validateCharacterContract(mod: LoadedMod, modName: string): void {
  const characters = mod.entities.get('character')
  if (!characters) return

  const knownAttrs = new Set(Object.keys(mod.attributes))
  const knownAbilities = new Set(Object.keys(mod.abilities))
  const knownTalents = new Set(Object.keys(mod.talentDefs))
  const knownStatus = new Set(Object.keys(mod.statusEffects))
  const knownRelations = new Set(Object.keys(mod.relationTypes))

  // category 命名空间（social/economy/combat…）动态纳入分层已知集
  const categoryNamespaces = new Set<string>()
  const attrNsMap: Record<string, string> = { parameter: 'params', mark: 'marks', ability: 'abilities' }
  for (const def of Object.values(mod.attributes)) {
    categoryNamespaces.add(attrNsMap[def.category] ?? def.category)
  }

  // 属性承载命名空间：只允许已定义键（裸字段 = 契约违规）
  const attributeNamespaces: Array<[string, Set<string>]> = [
    ['base', knownAttrs],
    ['params', knownAttrs],
    ['marks', knownAttrs],
    ['abilities', new Set([...knownAbilities, ...knownAttrs])],
    ['talents', knownTalents],
  ]

  for (const [charId, rawChar] of characters) {
    const char = rawChar as Record<string, any>

    // ① 裸字段检查
    for (const [ns, known] of attributeNamespaces) {
      const container = char[ns]
      if (!container || typeof container !== 'object') continue
      for (const key of Object.keys(container)) {
        if (known.has(key)) continue
        errorReporter.report({
          source: 'mod-loader',
          severity: 'warning',
          file: `mods/${modName}/characters/`,
          message: `角色 '${charId}' 使用了未定义的属性 '${key}'（命名空间 ${ns}）`,
          suggestion: `契约铁律：角色数据禁止裸字段——请先在 definitions/attributes.toml（或 abilities/talents.toml）定义 '${key}'，或在角色数据中删除该键`,
        })
      }
    }
    // status_effects 引用定义
    for (const eff of (char.status_effects ?? []) as any[]) {
      if (eff?.id && !knownStatus.has(eff.id)) {
        errorReporter.report({
          source: 'mod-loader',
          severity: 'warning',
          file: `mods/${modName}/characters/`,
          message: `角色 '${charId}' 使用了未定义的状态效果 '${eff.id}'`,
          suggestion: '状态效果需在 definitions/status-effects.toml 定义',
        })
      }
    }
    // relations 引用定义
    if (char.relations && typeof char.relations === 'object') {
      for (const [targetId, relType] of Object.entries(char.relations)) {
        if (!relType || typeof relType !== 'object') continue
        for (const typeName of Object.keys(relType)) {
          if (!knownRelations.has(typeName)) {
            errorReporter.report({
              source: 'mod-loader',
              severity: 'warning',
              file: `mods/${modName}/characters/`,
              message: `角色 '${charId}' 使用了未定义的关系类型 '${typeName}'`,
              suggestion: '关系类型需在 definitions/relations.toml 定义',
            })
            continue
          }
          // 注释：reverse 不对称检查（关系系统 v2）——A 有 kind=relation 类型 T 对 B，
          // T.reverse（或同名换端自动推导）=R → 提示 B 侧是否应有 R（单方面关系合法——仅提示确认，不阻止）
          const def = mod.relationTypes[typeName]
          const rev = def?.kind === 'relation' ? resolveReverseType(typeName, def) : undefined
          if (rev) {
            const targetChar = characters.get(targetId) as Record<string, any> | undefined
            if (targetChar && !targetChar.relations?.[charId]?.[rev]) {
              errorReporter.report({
                source: 'mod-loader',
                severity: 'warning',
                file: `mods/${modName}/characters/`,
                message: `角色 '${charId}' 视 '${targetId}' 为 '${typeName}'，但 '${targetId}' 侧没有对 '${charId}' 的 '${rev}'`,
                suggestion: `若是单方面关系（如单恋/失散）可忽略；若应双向，请在 '${targetId}' 的 relations 中补写`,
              })
            }
          }
        }
      }
    }

    // ①.5 字段分层检查（ADR-0007：L3 引擎独占 / L2 非平凡 / 未知顶层键）
    validateTopLevelLayers(charId, rawChar, mod, categoryNamespaces)

    // ② 插件注册的校验器（具体字段契约在插件层）
    for (const validator of getCharacterValidators()) {
      try {
        validator.validate(charId, rawChar, mod)
      } catch (e) {
        // 校验器自身异常不允许拖垮加载（契约：校验失败 warning，不 throw）
        errorReporter.report({
          source: `character-contract:${validator.id}`,
          severity: 'warning',
          message: `角色 '${charId}' 契约校验异常：${e instanceof Error ? e.message : String(e)}`,
        })
      }
    }
  }
}

/**
 * 角色契约校验补跑（启动顺序兼容，spec §10.1 决策 11a）：
 * main.ts 实际顺序 = loadMod（先）→ 插件 onLoad（后）——首次加载时插件校验器未注册，
 * 必需集校验永不执行。插件（h-core）注册校验器后调用本函数补跑已加载 mod 的角色。
 * 插件先行的启动顺序（AGENTS 文档序）无需补跑（parseModData 时校验器已注册）。
 */
export function revalidateCharacterContract(): void {
  const mod = modLoader.getMod()
  if (!mod) return
  validateCharacterContract(mod, mod.id)
}

export function parseModData(modName: string, rawTomlMap: RawTomlMap): LoadedMod {
  const metaPath = `/mods/${modName}/meta.toml`
  if (!(metaPath in rawTomlMap)) {
    throw new Error(
      `模组 '${modName}' 不存在：找不到 ${metaPath}（请检查 era-engine.config.toml 中的 active_mod 是否指向有效的模组目录）`,
    )
  }

  const meta = parseFile(metaPath, rawTomlMap[metaPath])
  const metaSection = meta.meta
  if (!metaSection) {
    throw new Error(
      `${metaPath}：缺少 [meta] 段，请添加 [meta] 并包含 id、name、version 字段`,
    )
  }

  const mod: LoadedMod = {
    id: (metaSection.id as string) ?? '',
    name: (metaSection.name as string) ?? '',
    version: (metaSection.version as string) ?? '',
    dependencies: (metaSection.dependencies as ModDependency[]) ?? [],
    startingLocation: (metaSection.starting_location as string) ?? undefined,
    playerCharacter: (metaSection.player_character as string) ?? undefined,
    loadingImage: (metaSection.loading_image as string) ?? undefined,
    loadingVideo: (metaSection.loading_video as string) ?? undefined,
    sleepConfig: {},
    entities: new Map(),
    locations: new Map(),
    graph: [],
    layouts: new Map(),
    bindings: {},
    theme: {},
    attributes: {},
    equipmentSlots: [],
    calendar: null,
    npcSpawns: [],
    sceneDialogue: [],
    characterDialogue: [],
    characterSpecificDialogue: new Map(),
    conversations: {
      character: new Map(),
      global: new Map(),
      quest: new Map(),
      event: new Map(),
    },
    // 注释：Phase 8-10 新增
    items: {},
    sets: [],
    statusEffects: {},
    abilities: {},
    quests: new Map(),
    talentDefs: {},
    styles: {},
    relationTypes: {},
    relationPairs: {},
    relationGroups: {},
    moveConfig: { parent_time_cost: 10, child_time_cost: 5, edge_default_time_cost: 10 },
    // 注释：Phase H
    hConfig: {},
    instructions: [],
    // 注释：NPC AI（npc-ai-system 消费）
    aiTargets: [],
    aiBehaviors: {},
    aiWorkTypes: {},
    aiEntertainmentTypes: {},
    // 注释：随机事件（random-event-system 消费）
    events: [],
  }

  // 注释：合并插件默认 + mod 定义的属性
  // Layer 1: /src/plugins/*/data/default/attributes.toml
  // Layer 3: /mods/${modName}/definitions/attributes.toml
  for (const path of Object.keys(rawTomlMap).filter(p => p.endsWith('/attributes.toml') && (p.startsWith('/src/plugins/') || p === `/mods/${modName}/definitions/attributes.toml`))) {
    const data = parseFile(path, rawTomlMap[path])
    mod.attributes = deepMerge(mod.attributes, (data.attributes as Record<string, AttributeDefinition>) ?? {}) as Record<string, AttributeDefinition>
  }

  const bindPath = `/mods/${modName}/bindings.toml`
  if (bindPath in rawTomlMap) {
    const data = parseFile(bindPath, rawTomlMap[bindPath])
    mod.bindings =
      (data.bindings as Record<string, Record<string, string>>) ?? {}
  }

  const charTemplatePrefix = `/mods/${modName}/templates/character/`
  mod.entities.set(
    '__templates_character__',
    loadEntriesByPrefix(rawTomlMap, charTemplatePrefix),
  )

  const itemTemplatePrefix = `/mods/${modName}/templates/item/`
  mod.entities.set(
    '__templates_item__',
    loadEntriesByPrefix(rawTomlMap, itemTemplatePrefix),
  )

  const rosterPath = `/mods/${modName}/characters/roster.toml`
  const characters = new Map<string, EntityData>()
  const pendingSpawns: PendingSpawn[] = []
  if (rosterPath in rawTomlMap) {
    const data = parseFile(rosterPath, rawTomlMap[rosterPath])
    const roster = (data.roster as EntityData[]) ?? []
    const templates = mod.entities.get('__templates_character__')!
    for (const entry of roster) {
      const spawnCondition = entry.spawn_condition as string | undefined
      let resolved: EntityData = { ...entry }
      if (entry.template) {
        try {
          const parentTemplate = resolveTemplate(
            entry.template as string,
            templates,
          )
          resolved = deepMerge(parentTemplate, entry)
        } catch (e) {
          throw new Error(
            `${rosterPath}: 角色 '${entry.id}' 的模板 '${entry.template}' 解析失败: ${(e as Error).message}`,
          )
        }
      }
      // 注释：契约最终化（默认值 + abilities 展开 + talents 初始化）——
      // pendingSpawns 也在此完成（spawn 激活时数据已完整）
      finalizeCharacterData(resolved, mod)

      if (spawnCondition) {
        // 注释：条件激活角色——暂不注册，等待条件满足后动态创建
        delete resolved.spawn_condition
        pendingSpawns.push({ id: entry.id as string, data: resolved, condition: spawnCondition })
      } else {
        characters.set(entry.id as string, resolved)
      }
    }
  }
  // 注释：加载 named 角色（characters/named/{charId}/base.toml）
  // 同名 ID 覆盖 roster 条目（升级路径：roster → named）
  const namedPrefix = `/mods/${modName}/characters/named/`
  const templates = mod.entities.get('__templates_character__')!
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    const rest = path.startsWith(namedPrefix) ? path.slice(namedPrefix.length) : ''
    if (!rest.endsWith('/base.toml')) continue
    const charId = rest.split('/')[0]
    if (!charId) continue
    const data = parseFile(path, raw) as EntityData
    let resolved: EntityData = { ...data }
    if (data.template) {
      try {
        const parentTemplate = resolveTemplate(data.template as string, templates)
        resolved = deepMerge(parentTemplate, data)
      } catch (e) {
        throw new Error(
          `${path}: 角色 '${charId}' 的模板 '${data.template}' 解析失败: ${(e as Error).message}`,
        )
      }
    }
    // 注释：契约最终化（默认值 + abilities 展开 + talents 初始化）
    finalizeCharacterData(resolved, mod)
    characters.set(charId, resolved)
  }

  mod.entities.set('character', characters)
  if (pendingSpawns.length > 0) mod.pendingSpawns = pendingSpawns

  mod.locations = loadLocations(rawTomlMap, modName)
  mod.graph = loadGraph(rawTomlMap, modName)

  // 注释：加载视觉地图 layout JSON
  const layoutPrefix = `/mods/${modName}/maps/layout/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(layoutPrefix) || !path.endsWith('.json')) continue
    const data = parseFile(path, raw) as MapLayout
    const layoutId = path.slice(layoutPrefix.length).replace(/\.json$/, '')
    mod.layouts.set(layoutId, data)
  }

  // 注释：加载移动配置（插件默认 + mod override）
  const moveData = loadMerged<{ move: MoveConfig }>('move.toml', 'move')
  if (moveData?.move) mod.moveConfig = moveData.move

  const themePath = `/mods/${modName}/theme.toml`
  if (themePath in rawTomlMap) {
    mod.theme = parseFile(themePath, rawTomlMap[themePath]) as Record<
      string,
      Record<string, string>
    >
  }

  // 注释：加载定义数据——插件默认（Layer 1）+ mod 定义（Layer 3）
  // 插件默认在 /src/plugins/*/data/default/ 下，mod 定义在 /mods/${modName}/definitions/
  // 同名字段：mod 覆盖插件默认
  function loadMerged<T>(file: string, key: string, skipDeepMerge?: boolean): T | undefined {
    const paths = Object.keys(rawTomlMap).filter(p => p.endsWith('/' + file) || p === `/mods/${modName}/definitions/${file}`)
    if (paths.length === 0) return undefined
    let result: any = {}
    for (const path of paths) {
      const data = parseFile(path, rawTomlMap[path])
      if (skipDeepMerge) {
        result[key] = data[key] ?? result[key]
      } else {
        result = deepMerge(result, (data as any)[key] ?? {})
      }
    }
    return result as T
  }

  // 注释：equipment.toml 和 calendar.toml 是 mod 文化/显示层定义
  const equipmentData = loadMerged<{ slots: EquipmentSlot[] }>('equipment.toml', 'slots', true)
  if (equipmentData?.slots) mod.equipmentSlots = equipmentData.slots

  const calendarPath = `/mods/${modName}/definitions/calendar.toml`
  if (calendarPath in rawTomlMap) {
    const data = parseFile(calendarPath, rawTomlMap[calendarPath])
    const cal = data.calendar as CalendarConfig | undefined
    if (cal) {
      mod.calendar = {
        month_names: cal.month_names ?? [],
        weekday_names: cal.weekday_names ?? [],
        hour_names: cal.hour_names,
      }
    }
  }

  // 注释：加载 npc.toml（spawns）
  const npcPath = `/mods/${modName}/characters/npc.toml`
  if (npcPath in rawTomlMap) {
    const data = parseFile(npcPath, rawTomlMap[npcPath])
    mod.npcSpawns = (data.spawns as NpcSpawn[]) ?? []
  }

  // 注释：加载场景通用口上
  const sceneDialoguePath = `/mods/${modName}/definitions/scene-dialogue.toml`
  if (sceneDialoguePath in rawTomlMap) {
    const data = parseFile(sceneDialoguePath, rawTomlMap[sceneDialoguePath])
    mod.sceneDialogue = (data.scene_lines as ReactiveLine[]) ?? []
  }

  // 注释：加载角色通用口上
  const charDialoguePath = `/mods/${modName}/definitions/character-dialogue.toml`
  if (charDialoguePath in rawTomlMap) {
    const data = parseFile(charDialoguePath, rawTomlMap[charDialoguePath])
    mod.characterDialogue = (data.character_lines as ReactiveLine[]) ?? []
  }

  // 注释：加载角色专属口上
  function loadDialogueForPrefix(prefix: string): void {
    for (const [path, raw] of Object.entries(rawTomlMap)) {
      if (!path.startsWith(prefix) || !path.endsWith('.toml')) continue
      const rest = path.slice(prefix.length)
      const parts = rest.split('/')
      if (parts.length < 2) continue
      const charId = parts[0]
      if (parts.length === 2 && parts[1] === 'dialogue.toml') {
        const data = parseFile(path, raw)
        const lines = (data.lines as ReactiveLine[]) ?? []
        mod.characterSpecificDialogue.set(charId, lines)
      }
    }
  }
  loadDialogueForPrefix(`/mods/${modName}/characters/dialogue/`)
  loadDialogueForPrefix(`/mods/${modName}/characters/named/`)

  // 注释：加载 conversation（4 种来源）
  function parseConversation(path: string, raw: string, name: string): Conversation {
    const data = parseFile(path, raw)
    return {
      id: (data.id as string) ?? name.replace(/\.toml$/, ''),
      condition: data.condition as string | undefined,
      nodes: (data.nodes as ConversationNode[]) ?? [],
    }
  }

  // 注释：1. 角色 conversation（characters/{charId}/conversations/[{subdir}/]{name}.toml）
  for (const prefix of [`/mods/${modName}/characters/dialogue/`, `/mods/${modName}/characters/named/`]) {
    for (const [path, raw] of Object.entries(rawTomlMap)) {
      if (!path.startsWith(prefix) || !path.endsWith('.toml')) continue
      const rest = path.slice(prefix.length)
      const convIdx = rest.indexOf('/conversations/')
      if (convIdx < 0) continue
      const charId = rest.slice(0, convIdx)
      const name = rest.slice(convIdx + '/conversations/'.length).replace(/\.toml$/, '')
      if (!charId || !name) continue
      const conv = parseConversation(path, raw, name)
      if (!mod.conversations.character.has(charId)) {
        mod.conversations.character.set(charId, new Map())
      }
      mod.conversations.character.get(charId)!.set(name, conv)
    }
  }

  // 注释：2. 全局 conversation（conversations/{name}.toml）
  const globalConvPrefix = `/mods/${modName}/conversations/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(globalConvPrefix) || !path.endsWith('.toml')) continue
    const name = path.slice(globalConvPrefix.length).replace(/\.toml$/, '')
    const conv = parseConversation(path, raw, name)
    mod.conversations.global.set(name, conv)
  }

  // 注释：3. quest/event conversation（quests/munu/**/conversations/{path}.toml）
  for (const type of ['quest', 'event'] as const) {
    const convDir = `/mods/${modName}/${type}s/`
    for (const [path, raw] of Object.entries(rawTomlMap)) {
      if (!path.startsWith(convDir) || !path.endsWith('.toml')) continue
      if (!path.includes('/conversations/')) continue
      const relPath = path.slice(convDir.length)
      const convPath = relPath.replace(/\.toml$/, '')
      const conv = parseConversation(path, raw, convPath.split('/').pop()!)
      mod.conversations[type].set(convPath, conv)
    }
  }

  // 注释：加载 items.toml
  const itemsPath = `/mods/${modName}/definitions/items.toml`
  if (itemsPath in rawTomlMap) {
    const data = parseFile(itemsPath, rawTomlMap[itemsPath])
    mod.items = (data.items as Record<string, ItemDef>) ?? {}
  }

  // 注释：加载 sets.toml
  const setsPath = `/mods/${modName}/definitions/sets.toml`
  if (setsPath in rawTomlMap) {
    const data = parseFile(setsPath, rawTomlMap[setsPath])
    mod.sets = (data.sets as SetDef[]) ?? []
  }

  // 注释：加载 status-effects.toml
  const statusData = loadMerged<Record<string, StatusEffectDef>>('status-effects.toml', 'status-effects')
  if (statusData) mod.statusEffects = statusData

  // 注释：加载 abilities.toml（插件默认 + mod 定义 deepMerge）
  const ablData = loadMerged<Record<string, AbilityDef>>('abilities.toml', 'abilities')
  if (ablData) mod.abilities = ablData

  // 注释：加载 relations.toml 三段（types/pairs/groups，关系系统 v2）
  const relData = loadMerged<Record<string, any>>('relations.toml', 'types')
  if (relData) mod.relationTypes = relData
  const pairData = loadMerged<Record<string, any>>('relations.toml', 'pairs')
  if (pairData) mod.relationPairs = pairData
  const groupData = loadMerged<Record<string, any>>('relations.toml', 'groups')
  if (groupData) mod.relationGroups = normalizeRelationGroups(mod, groupData)
  validateRelations(mod, modName)
  // 注释：关系三档转换补全（关系系统 v2）——roster/named 角色在 finalize 时 relations.toml
  // 尚未加载（loadCharacters 先于本段），此处补转换（幂等：数值不变，字符串 "正面"→1 等）
  for (const [, char] of mod.entities.get('character') ?? []) {
    normalizeRelations(char as any, mod.relationTypes, `mods/${modName}/characters/`)
  }

  // 注释：加载 talents.toml（插件默认 + mod 定义 deepMerge）
  const talentData = loadMerged<Record<string, TalentDef>>('talents.toml', 'talents')
  if (talentData) mod.talentDefs = talentData

  // 注释：加载 styles.toml（命名样式注册表）
  const stylesPath = `/mods/${modName}/definitions/talk/styles.toml`
  if (stylesPath in rawTomlMap) {
    const data = parseFile(stylesPath, rawTomlMap[stylesPath])
    mod.styles = (data.styles as Record<string, Record<string, any>>) ?? {}
  }

  // 注释：加载 scenes（quests/ + events/ 下所有 toml，子目录自动支持）
  // scene 是统一单位，type=main/side/event 只影响 UI 显示
  const scenePrefixes = [`/mods/${modName}/quests/`, `/mods/${modName}/events/`]
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.endsWith('.toml')) continue
    if (!scenePrefixes.some(p => path.startsWith(p))) continue
    const data = parseFile(path, raw) as any
    const scene = data as Quest
    if (!scene.id) {
      errorReporter.report({ source: 'mod-loader', severity: 'warning', file: path, message: 'Scene 缺少 id 字段，跳过' })
      continue
    }
    if (mod.quests.has(scene.id)) {
      errorReporter.report({ source: 'mod-loader', severity: 'error', file: path, message: `Scene ID '${scene.id}' 重复` })
      continue
    }
    mod.quests.set(scene.id, scene)
  }
  // 注释：校验 scene 引用（scene_id 必须存在）
  for (const [id, scene] of mod.quests) {
    for (const step of scene.steps ?? []) {
      if (step.type === 'scene' && step.scene_id && !mod.quests.has(step.scene_id)) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', message: `Scene '${id}' 的 step 引用了不存在的 scene_id '${step.scene_id}'`,
          suggestion: `检查 ${scenePrefixes.map(p => p.replace(`/mods/${modName}/`, '')).join(' 或 ')} 下是否有该 id 的文件`,
        })
      }
    }
  }

  // 注释：展开角色 abilities 简写——数字 → { level, xp: 0 }
  // TODO(phase-6): ability-progression 插件 onEnable 时用 max_level 做升级逻辑，不用于展开
  expandCharacterAbilities(mod)
  initializeTalents(mod)
  // 注释：契约最终化补全——pendingSpawns 的 abilities 默认条目/talents 初始化
  // （roster 循环里 finalize 时 abilities.toml 尚未加载，此处补全；幂等）
  if (mod.pendingSpawns) {
    for (const p of mod.pendingSpawns) {
      finalizeCharacterData(p.data, mod)
    }
  }

  // 注释：加载 h-config.toml（插件默认 + mod 覆盖，字段级 deepMerge）
  for (const path of Object.keys(rawTomlMap).filter(p => p.endsWith('/h-config.toml'))) {
    const data = parseFile(path, rawTomlMap[path])
    mod.hConfig = deepMerge(mod.hConfig, data) as HConfig
  }

  // 注释：加载指令——单路径 instructions/，插件默认层（Layer 1）+ mod 定义层（Layer 3）
  // 按 id 去重：mod 覆盖插件默认（rawTomlMap 中插件默认先插入，mod 后插入，Map.set 后写胜出）
  const instructionsMap = new Map<string, HInstruction>()
  let effectBlocks: Record<string, Effect> = {}
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    const isPluginDefault = path.startsWith('/src/plugins/')
    const isModData = path.startsWith(`/mods/${modName}/`)
    if (!isPluginDefault && !isModData) continue
    if (!path.includes('/instructions/') || !path.endsWith('.toml')) continue
    const data = parseFile(path, raw)
    const blocks = (data as any).effect_blocks as Record<string, Effect> | undefined
    if (blocks) effectBlocks = { ...effectBlocks, ...blocks }
    const instructions = (data.instructions as HInstruction[]) ?? []
    for (const inst of instructions) {
      if (!inst?.id) continue
      if (instructionsMap.has(inst.id)) {
        // 注释：同层重复 id → 后读文件胜出，警告提示作者（跨层覆盖是预期行为，不警告）
        errorReporter.report({
          source: 'mod-loader',
          severity: 'warning',
          file: path,
          message: `指令 id '${inst.id}' 重复（已在其他 instructions/ 文件中定义），后读文件覆盖`,
          suggestion: '同层指令 id 必须唯一；mod 覆盖插件默认请用同 id 但只在 mod 层定义',
        })
      }
      instructionsMap.set(inst.id, inst)
    }
  }
  mod.instructions = [...instructionsMap.values()]
  mod.effectBlocks = effectBlocks

  // 注释：加载 NPC AI 数据（npc-ai-system 消费）——插件默认（Layer 1）+ mod 定义（Layer 3）
  // ai-targets：累积式追加（插件默认 + mod 定义全部并入——erArk config_target 单表语义；
  // 注意与 loadMerged"后写胜出"不同，目标表是注册表不是覆盖表）
  const aiTargets: AITargetDef[] = []
  for (const path of Object.keys(rawTomlMap)) {
    if (!path.endsWith('/ai-targets.toml')) continue
    const data = parseFile(path, rawTomlMap[path])
    const targets = (data.targets as AITargetDef[]) ?? []
    for (const t of targets) {
      if (!t?.id) {
        errorReporter.report({ source: 'mod-loader', severity: 'error', file: path, message: 'ai-targets.toml 目标缺少 id 字段，跳过' })
        continue
      }
      if (aiTargets.some(existing => existing.id === t.id)) {
        errorReporter.report({ source: 'mod-loader', severity: 'warning', file: path, message: `AI 目标 id '${t.id}' 重复，后者覆盖` })
        aiTargets.splice(aiTargets.findIndex(e => e.id === t.id), 1)
      }
      aiTargets.push(t)
    }
  }
  mod.aiTargets = aiTargets
  // 注释：ai-behaviors/ai-work/ai-entertainment：字段级 deepMerge（mod 覆盖插件默认）
  const aiBehaviorsData = loadMerged<Record<string, AIBehaviorSpec>>('ai-behaviors.toml', 'behaviors')
  if (aiBehaviorsData) mod.aiBehaviors = aiBehaviorsData
  const aiWorkData = loadMerged<Record<string, AIWorkTypeDef>>('ai-work.toml', 'work_types')
  if (aiWorkData) mod.aiWorkTypes = aiWorkData
  const aiEntertainmentData = loadMerged<Record<string, AIEntertainmentTypeDef>>('ai-entertainment.toml', 'entertainment_types')
  if (aiEntertainmentData) mod.aiEntertainmentTypes = aiEntertainmentData

  // 注释：加载睡眠配置（sleep-system 消费）——顶层字段，字段级 deepMerge（mod 覆盖插件默认）
  for (const path of Object.keys(rawTomlMap).filter(p => p.endsWith('/sleep.toml'))) {
    const data = parseFile(path, rawTomlMap[path])
    mod.sleepConfig = deepMerge(mod.sleepConfig, data) as SleepConfig
  }

  // 注释：加载随机事件（random-event-system 消费）——累积式追加（插件默认层 +
  // mod 定义全部并入，同 ai-targets 注册表语义；文件按行为分：definitions/events/*.toml）
  const events: RandomEventDef[] = []
  for (const path of Object.keys(rawTomlMap)) {
    const isEventsFile = path.endsWith('/events.toml') || path.includes('/events/')
    if (!isEventsFile || !path.endsWith('.toml')) continue
    const data = parseFile(path, rawTomlMap[path])
    const list = (data.events as RandomEventDef[]) ?? []
    for (const ev of list) {
      if (!ev?.id) {
        errorReporter.report({ source: 'mod-loader', severity: 'error', file: path, message: 'events 文件条目缺 id 字段，跳过' })
        continue
      }
      if (!ev?.behavior) {
        errorReporter.report({ source: 'mod-loader', severity: 'error', file: path, message: `事件 '${ev.id}' 缺 behavior 字段，跳过` })
        continue
      }
      if (events.some(existing => existing.id === ev.id)) {
        errorReporter.report({ source: 'mod-loader', severity: 'warning', file: path, message: `事件 id '${ev.id}' 重复，后者覆盖` })
        events.splice(events.findIndex(e => e.id === ev.id), 1)
      }
      events.push(ev)
    }
  }
  mod.events = events

  // 注释：校验 locations——exit.target 和 parent 必须存在
  validateLocations(mod, modName)
  validateTalents(mod, modName)
  // 注释：角色契约校验（裸字段 warning + 插件注册的必需集校验器）
  validateCharacterContract(mod, modName)

  return mod
}

// 注释：展开角色 abilities 简写（数字→{level, xp:0}），已是对象则保持
// per-char 版本（运行时生成角色也走同一逻辑，见 finalizeCharacterData）
function expandCharacterAbilitiesForChar(char: any, abilityDefs: Record<string, AbilityDef>): void {
  if (!char) return
  if (!char.abilities) char.abilities = {}
  const expanded: Record<string, { level: number; xp: number | null }> = {}
  // 注释：先填入 abilities.toml 中定义的所有能力默认值
  for (const abilityId of Object.keys(abilityDefs)) {
    expanded[abilityId] = { level: 0, xp: 0 }
  }
  // 注释：再用角色已有数据覆盖（roster 简写 → {level, xp}）
  for (const [abilityId, value] of Object.entries(char.abilities)) {
    if (typeof value === 'number') {
      expanded[abilityId] = { level: value, xp: 0 }
    } else if (typeof value === 'object' && value !== null) {
      expanded[abilityId] = value as { level: number; xp: number | null }
    }
  }
  char.abilities = expanded
}

function expandCharacterAbilities(mod: LoadedMod): void {
  const characters = mod.entities.get('character')
  if (!characters) return
  for (const [, char] of characters) {
    expandCharacterAbilitiesForChar(char as any, mod.abilities)
  }
}

/**
 * 角色数据最终化（标准角色契约：任何进入 entity-system 的角色都必须经过）：
 * ① applyAttributeDefaults（attributes.toml 默认值落位）② abilities 简写展开
 * ③ talents 初始化 0。加载（roster/named/pendingSpawns）与运行时生成
 * （npc.toml 路人/pending 激活）统一走此函数——防止"生成路径漏初始化"静默缺口。
 * G5 决策 2026-08-09：新角色愤怒初始化 rand(1,35)（erArk character.py:99）——
 * 原始数据无愤怒键 → 随机；有键（模板/roster 显式写/存档权威）→ 保留。
 */
export function finalizeCharacterData(char: EntityData, mod: LoadedMod): void {
  if (!char) return
  const hasAngry = (char as any).base?.['愤怒'] !== undefined
  applyAttributeDefaults(char, mod.attributes)
  expandCharacterAbilitiesForChar(char as any, mod.abilities)
  normalizeMarksToAbilities(char as any)
  normalizeInventoryToArray(char as any)
  normalizeRelations(char as any, mod.relationTypes)
  initializeTalentsForChar(char as any, mod.talentDefs)
  if (!hasAngry) {
    if (!(char as any).base) (char as any).base = {}
    ;(char as any).base['愤怒'] = 1 + Math.floor(Math.random() * 35)
  }
}

// 注释：reverse 自动推导（关系系统 v2）——未显式声明 reverse 时按"同名换端"：
// "父母子女（为大）" ↔ "父母子女（为小）"；无（为大/为小）后缀 → 无反向
export function resolveReverseType(typeName: string, def: RelationTypeDef | undefined): string | undefined {
  if (def?.reverse) return def.reverse
  if (typeName.endsWith('（为大）')) return `${typeName.slice(0, -4)}（为小）`
  if (typeName.endsWith('（为小）')) return `${typeName.slice(0, -4)}（为大）`
  return undefined
}

// 注释：关系三档转换（关系系统 v2，2026-08-10）——
// kind=relation 类型：角色数据写 "正面"/"中立"/"负面"（推荐）或 1/0/-1（脚本用），
// 统一存 -1/0/1。非法值 → errorReporter error（禁止静默失败），值原样保留。
const SENTIMENT_MAP: Record<string, number> = { '正面': 1, '中立': 0, '负面': -1 }

function normalizeRelations(char: any, relationTypes: Record<string, RelationTypeDef>, file?: string): void {
  if (!char.relations || typeof char.relations !== 'object') return
  const reportFile = file ?? ''
  for (const rels of Object.values(char.relations) as Record<string, any>[]) {
    if (!rels || typeof rels !== 'object') continue
    for (const [type, value] of Object.entries(rels)) {
      const def = relationTypes[type]
      // kind 未声明 = 默认 sentiment（数值型，兼容现有好感度）——不转换
      if (!def || (def.kind ?? 'sentiment') === 'sentiment') continue
      if (typeof value === 'string') {
        const num = SENTIMENT_MAP[value]
        if (num !== undefined) {
          rels[type] = num
        } else {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'error',
            file: reportFile,
            message: `关系 '${type}' 的档位值 '${value}' 非法（kind=relation 类型只接受 正面/中立/负面 或 1/0/-1）`,
            suggestion: '修正角色数据中的关系档位值',
          })
        }
      } else if (typeof value === 'number' && value !== -1 && value !== 0 && value !== 1) {
        errorReporter.report({
          source: 'mod-loader',
          severity: 'error',
          file: reportFile,
          message: `关系 '${type}' 的档位值 ${value} 非法（kind=relation 类型只接受 正面/中立/负面 或 1/0/-1）`,
          suggestion: '修正角色数据中的关系档位值',
        })
      }
    }
  }
}

// 注释：关系组展开（关系系统 v2）——组元素 { pair } 引用展开为引用该 pair 的
// 所有已定义类型名（这样内置组（血亲等）不依赖 mod 的具体类型命名）。
// 未知 pair 引用 → throw（阻止加载）。
function normalizeRelationGroups(mod: LoadedMod, rawGroups: Record<string, RelationGroupDef>): Record<string, string[]> {
  const file = `mods/${mod.id}/definitions/relations.toml`
  const result: Record<string, string[]> = {}
  for (const [groupName, items] of Object.entries(rawGroups)) {
    const flat: string[] = []
    for (const item of items ?? []) {
      if (typeof item === 'string') {
        flat.push(item)
      } else if (item && typeof item === 'object' && typeof item.pair === 'string') {
        if (!mod.relationPairs[item.pair]) {
          throw new Error(`${file}: 关系组 '${groupName}' 引用了不存在的 pair '${item.pair}'`)
        }
        for (const [typeName, def] of Object.entries(mod.relationTypes)) {
          if (def.pair === item.pair) flat.push(typeName)
        }
      }
    }
    result[groupName] = flat
  }
  return result
}

// 注释：关系定义校验（关系系统 v2）——引用错误 throw（阻止加载，同 validateTalents）
// ① kind/side 取值合法 ② relation 型的 pair 引用存在 ③ reverse 指向存在 ④ 组内类型/pair 存在
function validateRelations(mod: LoadedMod, modName: string): void {
  const file = `mods/${modName}/definitions/relations.toml`
  for (const [typeName, def] of Object.entries(mod.relationTypes)) {
    if (def.kind !== undefined && def.kind !== 'sentiment' && def.kind !== 'relation') {
      throw new Error(`${file}: 关系类型 '${typeName}' 的 kind='${def.kind}' 非法（sentiment 数值型 / relation 三档型）`)
    }
    if (def.side !== undefined && def.side !== 'big' && def.side !== 'small') {
      throw new Error(`${file}: 关系类型 '${typeName}' 的 side='${def.side}' 非法（big 大端 / small 小端；对称类型省略）`)
    }
    if (def.pair !== undefined && !mod.relationPairs[def.pair]) {
      throw new Error(`${file}: 关系类型 '${typeName}' 引用了不存在的 pair '${def.pair}'（请先在 [pairs] 段定义）`)
    }
    if (def.reverse !== undefined && !mod.relationTypes[def.reverse]) {
      throw new Error(`${file}: 关系类型 '${typeName}' 的 reverse 指向了不存在的类型 '${def.reverse}'`)
    }
  }
  for (const [pairName] of Object.entries(mod.relationPairs)) {
    // pairs 是称呼词表资源——不强制被类型引用（mod 可先定义词表后定义类型）
    void pairName
  }
  // 注释：组校验——展开后的组是纯类型名列表（{pair} 引用已在 normalizeRelationGroups 校验）
  for (const [groupName, typeNames] of Object.entries(mod.relationGroups)) {
    for (const typeName of typeNames) {
      if (!mod.relationTypes[typeName]) {
        throw new Error(`${file}: 关系组 '${groupName}' 引用了不存在的类型 '${typeName}'`)
      }
    }
  }
}

// 注释：inventory 归一化（2026-08-09 example-mod 验证暴露的真问题）——
// 运行时 API（inventory-system add/remove/use、hunger、set-system、h-bondage）全部用
// 数组形式 [{itemId, count}]；角色数据/旧文档的对象写法 { 物品ID: count } 加载时不转换
// → addItem/removeItem/饥饿/套装检查对对象调用 .find/.some 抛 TypeError（崩溃链），
// 且条件路径 inventory.{item}.count 恒 false。加载时统一转为数组（幂等）。
function normalizeInventoryToArray(char: any): void {
  const inv = char.inventory
  if (!inv || Array.isArray(inv)) return
  const arr: { itemId: string; count: number }[] = []
  for (const [itemId, count] of Object.entries(inv)) {
    if (typeof count === 'number' && count > 0) arr.push({ itemId, count })
  }
  char.inventory = arr
}

// 注释：marks 归一化（标准角色契约分层，ADR-0007，2026-08-09）——
// 刻印 canonical 存储 = entity.abilities（h-mark 升级写、calcJudge 读，SEARCH_ORDER abilities 在前）；
// 角色数据写 marks = {快乐刻印 = 2} 是直观写法（UI 分组即「刻印」），加载时拷贝进 abilities。
// 规则：值 > 0 才拷贝；两者都写则 abilities 优先（marks 只补缺）。marks 镜像字段本身保留不动。
// 导出供 save-system restoreFromSave 恢复路径复用（旧存档 marks 值不静默丢失）。
export function normalizeMarksToAbilities(char: any): void {
  const rawMarks = char.marks
  if (!rawMarks || typeof rawMarks !== 'object') return
  if (!char.abilities) char.abilities = {}
  for (const [markName, value] of Object.entries(rawMarks) as [string, any][]) {
    if (typeof value !== 'number' || value <= 0) continue
    const existing = char.abilities[markName]
    if (existing && typeof existing === 'object' && (existing.level ?? 0) > 0) continue
    char.abilities[markName] = { level: value, xp: 0 }
  }
}

// 注释：校验 location parent 和 graph edge 引用存在
function validateLocations(mod: LoadedMod, modName: string): void {
  // Validate parent exists
  for (const [id, loc] of mod.locations) {
    if (loc.parent !== null && !mod.locations.has(loc.parent)) {
      throw new Error(
        `mods/${modName}/maps/locations/: 地点 '${id}' 的 parent '${loc.parent}' 不存在`,
      )
    }
  }

  // Validate graph edges reference existing locations
  for (const edge of mod.graph) {
    if (!mod.locations.has(edge.from)) {
      throw new Error(
        `maps/graph/: edge from='${edge.from}' 引用的地点不存在（可用：${[...mod.locations.keys()].slice(0, 5).join(', ')}...）`,
      )
    }
    if (!mod.locations.has(edge.to)) {
      throw new Error(
        `maps/graph/: edge to='${edge.to}' 引用的地点不存在`,
      )
    }
  }

  // Unreachable warning
  const referencedByOthers = new Set<string>()
  for (const edge of mod.graph) {
    referencedByOthers.add(edge.to)
  }
  for (const [, loc] of mod.locations) {
    if (loc.parent !== null) {
      referencedByOthers.add(loc.id)
    }
  }
  for (const [id, loc] of mod.locations) {
    if (!referencedByOthers.has(id) && loc.parent === null) {
      console.warn(
        `mods/${modName}/maps/locations/: 地点 '${id}' 不可达（无 graph 边指向它，也无 parent）——可能是设计遗漏`,
      )
    }
  }
}

// per-char 版本（运行时生成角色也走同一逻辑，见 finalizeCharacterData）
function initializeTalentsForChar(char: any, talentDefs: Record<string, TalentDef>): void {
  if (!char) return
  if (Object.keys(talentDefs).length === 0) return
  if (!char.talents) char.talents = {}
  for (const talentId of Object.keys(talentDefs)) {
    if (char.talents[talentId] === undefined) {
      char.talents[talentId] = 0
    }
  }
}

function initializeTalents(mod: LoadedMod): void {
  const defs = mod.talentDefs
  if (Object.keys(defs).length === 0) return
  const characters = mod.entities.get('character')
  if (!characters) return
  for (const [, char] of characters) {
    initializeTalentsForChar(char as any, defs)
  }
}

function validateTalents(mod: LoadedMod, modName: string): void {
  const defs = mod.talentDefs
  if (Object.keys(defs).length === 0) return
  const characters = mod.entities.get('character')
  if (!characters) return
  for (const [charId, char] of characters) {
    const charTalents = (char as any).talents as Record<string, number> | undefined
    if (!charTalents) continue
    for (const talentId of Object.keys(charTalents)) {
      if (!defs[talentId]) {
        throw new Error(
          `mods/${modName}/characters/: 角色 '${charId}' 使用了未定义的天赋 '${talentId}'（可用：${Object.keys(defs).slice(0, 10).join(', ')}）`,
        )
      }
    }
  }
}

const tomlModules = import.meta.glob('/mods/**/*.toml', {
  query: '?raw',
  import: 'default',
  eager: false,
})

const pluginDefaultModules = import.meta.glob('/src/plugins/*/data/default/**/*.toml', {
  query: '?raw',
  import: 'default',
  eager: false,
})

const layoutModules = import.meta.glob('/mods/**/maps/layout/*.json', {
  query: '?raw',
  import: 'default',
  eager: false,
})

export class ModLoader {
  private loadedMod: LoadedMod | null = null

  async loadMod(modName: string): Promise<LoadedMod> {
    const rawTomlMap: RawTomlMap = {}
    // 注释：Layer 1——插件默认数据（优先级最低）
    for (const [path, loader] of Object.entries(pluginDefaultModules)) {
      rawTomlMap[path] = await loader()
    }
    // 注释：Layer 3——mod 定义数据（优先级最高，同名覆盖 plugin defaults）
    const prefix = `/mods/${modName}/`
    for (const [path, loader] of Object.entries(tomlModules)) {
      if (path.startsWith(prefix)) {
        rawTomlMap[path] = await loader()
      }
    }
    // 注释：加载 layout JSON 文件
    for (const [path, loader] of Object.entries(layoutModules)) {
      if (path.startsWith(prefix)) {
        rawTomlMap[path] = await loader()
      }
    }
    const mod = parseModData(modName, rawTomlMap)
    this.registerEntities(mod)
    bindingResolver.loadBindings(mod.bindings)
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)
    // 注释：关系组注入（关系系统 v2）——条件引擎聚合路径 any(group:xxx) 求值用
    gameContext.setRelationGroups(mod.relationGroups)
    // 注释：关系数据注入条件注册器（聚合路径参数校验用）
    conditionRegistry.setRelationData(mod.relationTypes, mod.relationGroups)
    this.loadedMod = mod
    return mod
  }

  private registerEntities(mod: LoadedMod): void {
    const characters = mod.entities.get('character')
    if (characters) {
      for (const [id, data] of characters) {
        entitySystem.register('character', id, data)
      }
    }
    // Also register locations so map plugin can query them
    for (const [id, data] of mod.locations) {
      entitySystem.register('location', id, data as any)
    }
  }

  getMod(): LoadedMod | null {
    return this.loadedMod
  }
}

export const modLoader = new ModLoader()
