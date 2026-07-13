import { parse as parseTOML } from '@iarna/toml'
import type { EntityData, LocationData } from './types'
import type { Effect } from './effect-type-registry'
import { resolveTemplate, deepMerge } from './template'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'
import { conditionRegistry } from './condition-registry'

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

// 注释：H 指令定义
export interface HInstruction {
  id: string
  label: string
  type: string
  sub_type?: string
  time_cost?: number
  priority?: number
  modes?: string[]
  premises?: string[]
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
export interface QuestStep {
  id: string
  type: string          // dialogue/combat/objective/reward/spawn/condition/goto
  next?: string
  // dialogue
  character?: string
  conversation?: string
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
}

export interface Quest {
  id: string
  title: string
  description?: string
  type: string          // main/side/event
  prerequisites?: string[]
  auto_start_condition?: string
  // 注释：event 专用字段
  display?: string      // "current" 显示剧情面板 / "hidden" 全程隐藏 / "log" 只记大事志
  visible?: string      // 可选：条件——满足时 quest 在 UI 中可见
  steps: QuestStep[]
}

export interface LoadedMod {
  id: string
  name: string
  version: string
  dependencies: ModDependency[]
  entities: Map<string, Map<string, EntityData>>
  locations: Map<string, LocationData>
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
  conversations: Map<string, Conversation[]>
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
  // 注释：关系类型定义
  relationTypes: Record<string, { min: number; max: number; default: number; name: string }>
  // 注释：Phase H — H 系统
  hConfig: HConfig
  hInstructions: HInstruction[]

  // 注释：通用指令（非 H 专属）
  instructions?: HInstruction[]
  effectBlocks?: Record<string, Effect>

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
    if (path.startsWith(prefix) && path.endsWith('.toml')) {
      const data = parseFile(path, raw) as LocationData
      if (data.parent === undefined) {
        data.parent = null
      }
      result.set(data.id, data)
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
    entities: new Map(),
    locations: new Map(),
    bindings: {},
    theme: {},
    attributes: {},
    equipmentSlots: [],
    calendar: null,
    npcSpawns: [],
    sceneDialogue: [],
    characterDialogue: [],
    characterSpecificDialogue: new Map(),
    conversations: new Map(),
    // 注释：Phase 8-10 新增
    items: {},
    sets: [],
    statusEffects: {},
    abilities: {},
    quests: new Map(),
    talentDefs: {},
    styles: {},
    relationTypes: {},
    // 注释：Phase H
    hConfig: {},
    hInstructions: [],
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
      applyAttributeDefaults(resolved, mod.attributes)

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
    applyAttributeDefaults(resolved, mod.attributes)
    characters.set(charId, resolved)
  }

  mod.entities.set('character', characters)
  if (pendingSpawns.length > 0) mod.pendingSpawns = pendingSpawns

  mod.locations = loadLocations(rawTomlMap, modName)

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

  // 注释：加载角色专属口上 + 交互式对话
  // 优先级：characters/dialogue/{charId}/（低）← characters/named/{charId}/（高）
  // 同名 charId 时 named 覆盖，方便从 roster 升级到 named
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
      } else if (parts.length === 3 && parts[1] === 'conversations') {
        const data = parseFile(path, raw)
        const conv: Conversation = {
          id: (data.id as string) ?? parts[2].replace(/\.toml$/, ''),
          condition: data.condition as string | undefined,
          nodes: (data.nodes as ConversationNode[]) ?? [],
        }
        const list = mod.conversations.get(charId) ?? []
        const existingIdx = list.findIndex(c => c.id === conv.id)
        if (existingIdx >= 0) {
          list[existingIdx] = conv
        } else {
          list.push(conv)
        }
        mod.conversations.set(charId, list)
      }
    }
  }
  loadDialogueForPrefix(`/mods/${modName}/characters/dialogue/`)
  loadDialogueForPrefix(`/mods/${modName}/characters/named/`)

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

  // 注释：加载 relations.toml
  const relData = loadMerged<Record<string, any>>('relations.toml', 'types')
  if (relData) mod.relationTypes = relData

  // 注释：加载 talents.toml
  const talentsPath = `/mods/${modName}/definitions/talents.toml`
  if (talentsPath in rawTomlMap) {
    const data = parseFile(talentsPath, rawTomlMap[talentsPath])
    mod.talentDefs = (data.talents as Record<string, TalentDef>) ?? {}
  }

  // 注释：加载 styles.toml（命名样式注册表）
  const stylesPath = `/mods/${modName}/definitions/talk/styles.toml`
  if (stylesPath in rawTomlMap) {
    const data = parseFile(stylesPath, rawTomlMap[stylesPath])
    mod.styles = (data.styles as Record<string, Record<string, any>>) ?? {}
  }

  // 注释：加载 quests（main/ + side/）
  const questMainPrefix = `/mods/${modName}/quests/main/`
  const questSidePrefix = `/mods/${modName}/quests/side/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.endsWith('.toml')) continue
    if (path.startsWith(questMainPrefix) || path.startsWith(questSidePrefix)) {
      const data = parseFile(path, raw)
      const quest = data as any as Quest
      if (quest.id) {
        mod.quests.set(quest.id, quest)
      }
    }
  }

  // 注释：展开角色 abilities 简写——数字 → { level, xp: 0 }
  // TODO(phase-6): ability-progression 插件 onEnable 时用 max_level 做升级逻辑，不用于展开
  expandCharacterAbilities(mod)

  // 注释：加载 h-config.toml（H 系数表，mod 可配）
  const hConfigPath = `/mods/${modName}/h-config.toml`
  if (hConfigPath in rawTomlMap) {
    mod.hConfig = parseFile(hConfigPath, rawTomlMap[hConfigPath]) as HConfig
  }

  // 注释：加载 h-instructions/ 目录下所有 TOML
  const hInstrPrefix = `/mods/${modName}/definitions/h-instructions/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(hInstrPrefix) || !path.endsWith('.toml')) continue
    const data = parseFile(path, raw)
    const instructions = (data.instructions as HInstruction[]) ?? []
    mod.hInstructions.push(...instructions)
  }

  // 注释：加载通用 instructions/ 目录下所有 TOML
  const instrPrefix = `/mods/${modName}/definitions/instructions/`
  const allInstructions: HInstruction[] = []
  let effectBlocks: Record<string, Effect> = {}
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(instrPrefix) || !path.endsWith('.toml')) continue
    const data = parseFile(path, raw)
    const blocks = (data as any).effect_blocks as Record<string, Effect> | undefined
    if (blocks) effectBlocks = { ...effectBlocks, ...blocks }
    const instructions = (data.instructions as HInstruction[]) ?? []
    allInstructions.push(...instructions)
  }
  if (allInstructions.length > 0 || Object.keys(effectBlocks).length > 0) {
    mod.instructions = allInstructions
    mod.effectBlocks = effectBlocks
  }

  // 注释：校验 locations——exit.target 和 parent 必须存在
  validateLocations(mod, modName)
  validateTalents(mod, modName)

  return mod
}

// 注释：展开角色 abilities 简写（数字→{level, xp:0}），已是对象则保持
function expandCharacterAbilities(mod: LoadedMod): void {
  const characters = mod.entities.get('character')
  if (!characters) return
  // 注释：给所有角色初始化 abilities.toml 中定义的默认能力（level=0, xp=0）
  for (const [, char] of characters) {
    const c = char as any
    if (!c.abilities) c.abilities = {}
    const expanded: Record<string, { level: number; xp: number | null }> = {}
    // 注释：先填入 abilities.toml 中定义的所有能力默认值
    for (const abilityId of Object.keys(mod.abilities)) {
      expanded[abilityId] = { level: 0, xp: 0 }
    }
    // 注释：再用角色已有数据覆盖（roster 简写 → {level, xp}）
    for (const [abilityId, value] of Object.entries(c.abilities)) {
      if (typeof value === 'number') {
        expanded[abilityId] = { level: value, xp: 0 }
      } else if (typeof value === 'object' && value !== null) {
        expanded[abilityId] = value as { level: number; xp: number | null }
      }
    }
    c.abilities = expanded
  }
}

// 注释：校验所有 location 的 exit.target 和 parent 存在
// 不存在 → 报错（文件名+行号+不存在的 target+建议）
// 不可达 → warning（无 exit 指向且无 parent）
function validateLocations(mod: LoadedMod, modName: string): void {
  // 注释：收集所有被引用的 target
  const referencedByOthers = new Set<string>()
  for (const [, loc] of mod.locations) {
    for (const exit of loc.exits) {
      referencedByOthers.add(exit.target)
    }
  }

  for (const [id, loc] of mod.locations) {
    // 注释：校验 exit.target 存在
    for (const exit of loc.exits) {
      if (!mod.locations.has(exit.target)) {
        throw new Error(
          `mods/${modName}/maps/locations/: 地点 '${id}' 的 exit 目标 '${exit.target}' 不存在（可用：${[...mod.locations.keys()].slice(0, 5).join(', ')}...）`,
        )
      }
    }
    // 注释：校验 parent 存在
    if (loc.parent !== null && !mod.locations.has(loc.parent)) {
      throw new Error(
        `mods/${modName}/maps/locations/: 地点 '${id}' 的 parent '${loc.parent}' 不存在`,
      )
    }
    // 注释：不可达 warning——无 exit 指向且无 parent
    if (!referencedByOthers.has(id) && loc.parent === null) {
      console.warn(
        `mods/${modName}/maps/locations/: 地点 '${id}' 不可达（无其他地点的 exit 指向它，也无 parent）——可能是设计遗漏`,
      )
    }
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
    const mod = parseModData(modName, rawTomlMap)
    this.registerEntities(mod)
    bindingResolver.loadBindings(mod.bindings)
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)
    this.loadedMod = mod
    return mod
  }

  private registerEntities(mod: LoadedMod): void {
    const characters = mod.entities.get('character')
    if (!characters) return
    for (const [id, data] of characters) {
      entitySystem.register('character', id, data)
    }
  }

  getMod(): LoadedMod | null {
    return this.loadedMod
  }
}

export const modLoader = new ModLoader()
