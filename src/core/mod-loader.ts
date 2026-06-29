import { parse as parseTOML } from '@iarna/toml'
import type { EntityData, LocationData } from './types'
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
}

export interface EquipmentSlot {
  id: string
  name: string
  category: string
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
  type: string          // main/side
  prerequisites?: string[]
  auto_start_condition?: string
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
  }

  const attrPath = `/mods/${modName}/definitions/attributes.toml`
  if (attrPath in rawTomlMap) {
    const data = parseFile(attrPath, rawTomlMap[attrPath])
    mod.attributes =
      (data.attributes as Record<string, AttributeDefinition>) ?? {}
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
  if (rosterPath in rawTomlMap) {
    const data = parseFile(rosterPath, rawTomlMap[rosterPath])
    const roster = (data.roster as EntityData[]) ?? []
    const templates = mod.entities.get('__templates_character__')!
    for (const entry of roster) {
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
      characters.set(entry.id as string, resolved)
    }
  }
  mod.entities.set('character', characters)

  mod.locations = loadLocations(rawTomlMap, modName)

  const themePath = `/mods/${modName}/theme.toml`
  if (themePath in rawTomlMap) {
    mod.theme = parseFile(themePath, rawTomlMap[themePath]) as Record<
      string,
      Record<string, string>
    >
  }

  // 注释：equipment.toml 和 calendar.toml 是 mod 文化/显示层定义，
  // 非实体数据，不进存档。engine UI 读取它们用于渲染装备槽和日期显示。
  const equipmentPath = `/mods/${modName}/definitions/equipment.toml`
  if (equipmentPath in rawTomlMap) {
    const data = parseFile(equipmentPath, rawTomlMap[equipmentPath])
    mod.equipmentSlots = (data.slots as EquipmentSlot[]) ?? []
  }

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
  // 路径：characters/dialogue/{charId}/dialogue.toml + conversations/*.toml
  const dialoguePrefix = `/mods/${modName}/characters/dialogue/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(dialoguePrefix) || !path.endsWith('.toml')) continue
    // 注释：提取 charId——characters/dialogue/{charId}/dialogue.toml 或 .../{charId}/conversations/{convId}.toml
    const rest = path.slice(dialoguePrefix.length)
    const parts = rest.split('/')
    if (parts.length < 2) continue
    const charId = parts[0]

    if (parts.length === 2 && parts[1] === 'dialogue.toml') {
      // 注释：角色专属口上
      const data = parseFile(path, raw)
      const lines = (data.lines as ReactiveLine[]) ?? []
      mod.characterSpecificDialogue.set(charId, lines)
    } else if (parts.length === 3 && parts[1] === 'conversations') {
      // 注释：交互式对话
      const data = parseFile(path, raw)
      const conv: Conversation = {
        id: (data.id as string) ?? parts[2].replace(/\.toml$/, ''),
        condition: data.condition as string | undefined,
        nodes: (data.nodes as ConversationNode[]) ?? [],
      }
      const list = mod.conversations.get(charId) ?? []
      list.push(conv)
      mod.conversations.set(charId, list)
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
  const statusPath = `/mods/${modName}/definitions/status-effects.toml`
  if (statusPath in rawTomlMap) {
    const data = parseFile(statusPath, rawTomlMap[statusPath])
    // 注释：status-effects.toml 格式 [status-effects.中毒] → Record<string, StatusEffectDef>
    mod.statusEffects = (data['status-effects'] as Record<string, StatusEffectDef>) ?? data.statusEffects ?? {}
  }

  // 注释：加载 abilities.toml（扩展字段）
  const abilitiesPath = `/mods/${modName}/definitions/abilities.toml`
  if (abilitiesPath in rawTomlMap) {
    const data = parseFile(abilitiesPath, rawTomlMap[abilitiesPath])
    mod.abilities = (data.abilities as Record<string, AbilityDef>) ?? {}
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

  // 注释：校验 locations——exit.target 和 parent 必须存在
  validateLocations(mod, modName)

  return mod
}

// 注释：展开角色 abilities 简写（数字→{level, xp:0}），已是对象则保持
function expandCharacterAbilities(mod: LoadedMod): void {
  const characters = mod.entities.get('character')
  if (!characters) return
  for (const [, char] of characters) {
    const c = char as any
    if (!c.abilities) continue
    const expanded: Record<string, { level: number; xp: number | null }> = {}
    for (const [abilityId, value] of Object.entries(c.abilities)) {
      if (typeof value === 'number') {
        // 注释：简写数字 → { level: 数字, xp: 0 }
        expanded[abilityId] = { level: value, xp: 0 }
      } else if (typeof value === 'object' && value !== null) {
        // 注释：已是 { level, xp } 对象 → 保持
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

const tomlModules = import.meta.glob('/mods/**/*.toml', {
  query: '?raw',
  import: 'default',
  eager: false,
})

export class ModLoader {
  private loadedMod: LoadedMod | null = null

  async loadMod(modName: string): Promise<LoadedMod> {
    const prefix = `/mods/${modName}/`
    const rawTomlMap: RawTomlMap = {}
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
