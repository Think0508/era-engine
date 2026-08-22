// 模组数据解析（2026-08-15 E1 拆分——mod-loader 解析段独立）
// 依赖方向：mod-types ← mod-validate ← mod-parse ← mod-loader（无环）
import { parse as parseTOML } from '@iarna/toml'
import type { Edge, EntityData, LocationData, MapLayout, MoveConfig } from './types'
import type { Effect } from './effect-type-registry'
import { resolveTemplate, deepMerge } from './template'
import { ATTR } from './entity-utils'
import { errorReporter } from './error-reporter'
import { parseConversationRef, resolveConversation } from './mod-types'
import type {
  LoadedMod, RawTomlMap, Quest, Conversation, ConversationRef, HConfig, HInstruction,
  MigrationStep, AITargetDef, AIBehaviorSpec, AIWorkTypeDef, AIEntertainmentTypeDef,
  SleepConfig, RandomEventDef, AbilityDef, TalentDef, EquipmentSlot, CalendarConfig,
  NpcSpawn, ReactiveLine, ConversationNode, ItemDef, SetDef, StatusEffectDef, JuelDef,
  AttributeDefinition, ModDependency, PendingSpawn, GainRuleDef, AchievementDef,
  CounterDef, CounterViewDef, BodyShapeDef, BodyShapeDimDef,
} from './mod-types'
import {
  validateCharacterContract,
  validateSceneSteps,
  validateRelations,
  validateAbilityUpgrades,
  validateLocations,
  validateTalents,
  normalizeRelationGroups,
  normalizeRelations,
  normalizeMarksToAbilities,
} from './mod-validate'

function parseFile(path: string, raw: string): Record<string, any> {
  try {
    return parseTOML(raw) as unknown as Record<string, any>
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`TOML 解析失败：${path}\n${reason}`)
  }
}

// 注释：解析 meta.toml [ui_text] 段（key → 文本；空值视为未配置，回退引擎默认）
function parseUiTexts(metaSection: Record<string, any>): Record<string, string> {
  const raw = metaSection.ui_text
  if (!raw || typeof raw !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value !== '') {
      result[key] = value
    }
  }
  return result
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
 * 返回补齐的属性个数（读档汇总行统计用）。
 */
export function fillMissingAttributes(
  char: EntityData,
  attributes: Record<string, AttributeDefinition>,
  source: string,
): number {
  if (!char || !attributes) return 0
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
  let filledCount = 0
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
    filledCount++
    errorReporter.report({
      source: 'save-system',
      severity: 'warning',
      message: `${source}：角色 '${char.id}' 缺属性 '${attrName}'，已用默认值 ${defaultValue} 补齐（命名空间 ${def.category === 'ability' ? 'abilities' : (nsMap[def.category] ?? def.category)}）`,
      suggestion: '旧存档缺字段属正常（契约补齐）；如需自定义初始值请更新存档或迁移规则',
    })
  }
  return filledCount
}

/**
 * 角色契约校验（标准角色契约 spec §10.1 决策 11a，加载时执行）：
 * ① 裸字段检查（通用机制，core 不认具体名）：属性承载命名空间（base/params/marks/abilities/talents）
 *    中的键必须在合并定义集（attributes/abilities/talents/status-effects/relations）中存在
 * ② 插件注册的校验器（如 h-core 的"最小必需集"）——具体字段名在插件层声明
 * 校验失败一律 warning+建议（errorReporter），不阻止加载
 */
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
    title: (metaSection.title as string) ?? undefined,
    description: (metaSection.description as string) ?? undefined,
    titleImage: (metaSection.title_image as string) ?? undefined,
    // 注释：counter-system 消费（counters.toml；插件默认层 + mod 层按 id 合并）
    counterDefs: {},
    counterViews: {},
    loadingImage: (metaSection.loading_image as string) ?? undefined,
    loadingVideo: (metaSection.loading_video as string) ?? undefined,
    // 注释：升级结算开关（erArk base_setting[1]/[2] 语义）——缺省全开
    upgradeSettings: {
      player_sleep: (metaSection.upgrade_on_player_sleep as boolean | undefined) ?? true,
      npc_sleep: (metaSection.upgrade_on_npc_sleep as boolean | undefined) ?? true,
      npc_h_end: (metaSection.upgrade_on_npc_h_end as boolean | undefined) ?? true,
    },
    // 注释：世界观文案（顶层 [ui_text] 段，key → 文本；空值视为未配置回退默认）
    uiTexts: parseUiTexts(meta),
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
      scene: new Map(),
    },
    // 注释：Phase 8-10 新增
    items: {},
    sets: [],
    statusEffects: {},
    juelDefs: {},
    abilities: {},
    quests: new Map(),
    // 注释：C3：mod 自定义脚本（parseModData 只给空 Map——脚本 glob 加载在 loadMod 副作用区）
    scripts: new Map(),
    talentDefs: {},
    gainRules: {},
    achievements: {},
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

  // 注释：mod 层文件定义的物品 id（revalidateItemUses 用——只重校验 mod 层，
  // 插件默认层物品的 use 由各自插件负责，不重复警告）
  const modLayerIds = new Set<string>()

  // 注释：加载 items——单文件 items.toml（插件默认 + mod definitions）+ 目录拆分
  // definitions/items/*.toml 与 data/default/items/*.toml（2026-08-12：物品按类别分文件）；
  // 合并规则：插件默认先合并（同 id 覆盖合法），mod 文件间同 id 重复 → error（文件名+行号）
  function loadItemDefs(): Record<string, ItemDef> {
    let result: Record<string, ItemDef> = {}
    // 注释：插件默认层已合并过的 id——mod 覆盖插件默认合法（deepMerge mod 优先），不触发重复 error
    const pluginIds = new Set<string>()
    const isItemFile = (path: string) =>
      path.endsWith('/items.toml')
      || path.includes('/definitions/items/')
      || path.includes('/data/default/items/')
    const mergeInto = (path: string, raw: string, checkDuplicate: boolean) => {
      const data = parseFile(path, raw)
      const items = (data as any).items as Record<string, ItemDef> | undefined
      if (!items) return
      // 注释：字段校验只对 mod 层生效（插件默认数据假设自检合格）——与 checkDuplicate 独立
      const shouldValidate = path.startsWith('/mods/')
      for (const [id, def] of Object.entries(items)) {
        if (!def || typeof def !== 'object') continue
        if (checkDuplicate && !pluginIds.has(id) && id in result) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'error',
            message: `物品 '${id}' 重复定义（${path}）——物品 id 必须在整个模组内唯一`,
            suggestion: '检查 definitions/items/ 下多个文件是否定义了同名物品，合并或改名',
          })
          continue
        }
        // 注释：mod 层首个定义后从 pluginIds 移除——后续 mod 文件再定义同一 id 视为 mod 间重复
        // （插件默认 + 一个 mod 文件 = 合法覆盖；插件默认 + 两个 mod 文件 = 第二个报重复 error）
        if (checkDuplicate) pluginIds.delete(id)
        if (checkDuplicate) modLayerIds.add(id)
        result[id] = deepMerge(result[id] ?? {}, def) as ItemDef
        if (!checkDuplicate) pluginIds.add(id)
        if (!shouldValidate) continue
        // 注释：物品字段校验（grill Q8 定案）——用合并结果判断（mod 覆盖插件默认时继承未覆盖字段）
        const merged = result[id] as ItemDef | undefined
        if (typeof merged?.body_slot === 'number' && merged.body_slot >= 0 && !merged.body_auto_remove) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'error',
            message: `物品 '${id}' 缺少 body_auto_remove（${path}）——body_slot≥0 的物品必须声明 manual/h_end/expiry`,
          })
        }
        // 注释：use 兼容字符串与数组两种写法（grill Q2：use 数组化；旧数据有字符串写法）
        if (def.use !== undefined && !Array.isArray(def.use) && typeof def.use !== 'string') {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'warning',
            message: `物品 '${id}' 的 use 必须是 string 或数组（${path}）`,
          })
        }
        // 注释：use 未注册检查不在此处（时序——插件自定义 use 在插件 onLoad 注册，晚于
        // mod 数据加载；见 revalidateItemUses()：插件注册后对 mod 层物品补跑，防误报）
        if (def.consume !== undefined && typeof def.consume !== 'boolean') {
          errorReporter.report({ source: 'mod-loader', severity: 'warning', message: `物品 '${id}' 的 consume 必须是 boolean（${path}）` })
        }
        for (const f of ['price', 'level', 'time_cost'] as const) {
          const v = (def as any)[f]
          if (v !== undefined && typeof v !== 'number') {
            errorReporter.report({ source: 'mod-loader', severity: 'warning', message: `物品 '${id}' 的 ${f} 必须是 number（${path}）` })
          }
        }
      }
    }
    // 插件默认层（data/default/items/*.toml + 插件内 items.toml）——同 id 覆盖合法
    for (const [path, raw] of Object.entries(rawTomlMap)) {
      if (!path.startsWith('/src/plugins/')) continue
      if (!isItemFile(path)) continue
      mergeInto(path, raw, false)
    }
    // mod 层（definitions/items.toml + definitions/items/*.toml）——文件间重复 error
    for (const [path, raw] of Object.entries(rawTomlMap)) {
      if (!path.startsWith(`/mods/${modName}/`)) continue
      if (!isItemFile(path)) continue
      mergeInto(path, raw, true)
    }
    return result
  }
  mod.items = loadItemDefs()
  // 注释：mod 层物品 id 集合——revalidateItemUses 补跑用（use 校验时序：插件注册后执行）
  mod.modItemLayerIds = modLayerIds

  // 注释：角色 equipment 引用物品存在性校验（2026-08-12 第三轮审计）——
  // roster/named 穿不存在的物品 → 服装前提恒显示"已穿"但物品定义缺失（静默），精准报错
  // 注意：放在 items 合并之后（角色加载先于 items，此处补校验）
  for (const [, char] of mod.entities.get('character') ?? []) {
    const equip = (char as any)?.equipment as Record<string, string> | undefined
    if (!equip) continue
    for (const [slot, itemId] of Object.entries(equip)) {
      if (!mod.items[itemId]) {
        errorReporter.report({
          source: 'mod-loader',
          severity: 'error',
          message: `角色 '${(char as any).id ?? '?'}' 的 equipment.${slot} 引用了不存在的物品 '${itemId}'`,
          suggestion: `检查 items.toml / definitions/items/ 是否定义了该物品（可用物品示例：${Object.keys(mod.items).slice(0, 5).join('、')}）`,
        })
      }
    }
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

  // 注释：加载 abilities——单文件 abilities.toml（插件默认 + mod definitions）+ 目录拆分
  // definitions/abilities/*.toml 与 data/default/abilities/*.toml（2026-08-11：几百技能按
  // 类别/门派分文件维护）；同名字段 mod 覆盖插件默认（rawTomlMap 插件默认先插入）
  function loadAbilityDefs(): Record<string, AbilityDef> {
    let result: Record<string, AbilityDef> = {}
    for (const [path, raw] of Object.entries(rawTomlMap)) {
      const isPluginDefault = path.startsWith('/src/plugins/')
      const isModData = path.startsWith(`/mods/${modName}/`)
      if (!isPluginDefault && !isModData) continue
      const isAbilityFile = path.endsWith('/abilities.toml')
        || path.includes('/definitions/abilities/')
        || path.includes('/data/default/abilities/')
      if (!isAbilityFile || !path.endsWith('.toml')) continue
      const data = parseFile(path, raw)
      result = deepMerge(result, (data as any).abilities ?? {})
    }
    return result
  }

  // 注释：加载 abilities.toml（插件默认 + mod 定义 deepMerge；支持目录拆分）
  mod.abilities = loadAbilityDefs()

  // 注释：加载 juels.toml（宝珠定义，插件默认 + mod 覆盖）
  const juelData = loadMerged<Record<string, JuelDef>>('juels.toml', 'juels')
  if (juelData) mod.juelDefs = juelData

  // 注释：加载 ability-upgrades.toml（condition 模式升级路径）——只并入升级相关字段
  const upgradeData = loadMerged<Record<string, Partial<AbilityDef>>>('ability-upgrades.toml', 'abilities')
  if (upgradeData) {
    for (const [abilityId, patch] of Object.entries(upgradeData)) {
      if (!patch || typeof patch !== 'object') continue
      if (!mod.abilities[abilityId]) {
        errorReporter.report({
          source: 'mod-loader',
          severity: 'warning',
          message: `ability-upgrades.toml 定义了未声明的能力 '${abilityId}' 的升级路径（abilities.toml 无此能力），跳过`,
        })
        continue
      }
      const target = mod.abilities[abilityId]
      // 注释：patch 只在 mod（abilities.toml）未显式写该字段时应用——否则 mod override 失效
      // （插件默认层 ability-upgrades.toml 无条件覆盖 mod 的 mode/upgrades 会违反三层 override 铁律）
      if (patch.mode !== undefined && target.mode === undefined) target.mode = patch.mode
      if (patch.upgrades !== undefined && target.upgrades === undefined) target.upgrades = patch.upgrades
      if (patch.extra_needs !== undefined && target.extra_needs === undefined) target.extra_needs = patch.extra_needs
      if (patch.sex_need !== undefined && target.sex_need === undefined) target.sex_need = patch.sex_need
    }
  }

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

  // 注释：加载 talent-gains.toml（素质获得：gain_type + needs）——并入已有天赋定义的 gain 字段
  const talentGainData = loadMerged<Record<string, Partial<TalentDef>>>('talent-gains.toml', 'talents')
  if (talentGainData) {
    for (const [talentId, patch] of Object.entries(talentGainData)) {
      if (!patch || typeof patch !== 'object' || !patch.gain) continue
      if (!mod.talentDefs[talentId]) {
        errorReporter.report({
          source: 'mod-loader',
          severity: 'warning',
          message: `talent-gains.toml 定义了未声明的素质 '${talentId}' 的获得条件（talents.toml 无此素质），跳过`,
        })
        continue
      }
      const target = mod.talentDefs[talentId]
      // 注释：字段级"已定义则不覆盖"——mod 在 talents.toml 写的 gain 优先于
      // talent-gains.toml（插件默认层无条件覆盖会违反三层 override 铁律）
      target.gain = { ...target.gain }
      if (patch.gain.needs !== undefined && target.gain.needs === undefined) target.gain.needs = patch.gain.needs
      if (patch.gain.gain_type !== undefined && target.gain.gain_type === undefined) target.gain.gain_type = patch.gain.gain_type
      if (patch.gain.replace !== undefined && target.gain.replace === undefined) target.gain.replace = patch.gain.replace
    }
  }

  // 注释：加载 gain-rules.toml（条件→获得 规则；gain-rule-system 消费）——
  // 按 id 去重合并（插件默认层 + mod 定义层；mod 同名 id 覆盖插件默认）
  // 数组语义：[[rules]] 平铺；同文件内重复 id → 加载期 error（数据错误）
  function loadGainRules(): Record<string, GainRuleDef> {
    const result: Record<string, GainRuleDef> = {}
    const paths = Object.keys(rawTomlMap).filter(p =>
      p.endsWith('/gain-rules.toml') || p === `/mods/${modName}/definitions/gain-rules.toml`)
    const seen = new Map<string, string>() // id → 首次定义文件（同文件内重复 id 报错）
    for (const path of paths) {
      const data = parseFile(path, rawTomlMap[path])
      const rules = data.rules
      // 注释：2026-08-16 三轮审查——结构错误显式报错（原 as any[] 对对象结构
      // for...of 抛无文件名的 TypeError，违反"文件名+行号"铁律）
      if (rules !== undefined && !Array.isArray(rules)) {
        throw new Error(`${path}: [[rules]] 必须是数组（TOML 用 [[rules]] 声明规则列表）`)
      }
      for (const rule of (rules as any[]) ?? []) {
        if (!rule || typeof rule !== 'object' || !rule.id) {
          throw new Error(`${path}: gain-rules.toml 的 [[rules]] 条目缺少 id 字段`)
        }
        if (seen.has(rule.id) && seen.get(rule.id) === path) {
          throw new Error(`${path}: 规则 '${rule.id}' 重复定义（同文件内 id 必须唯一）`)
        }
        seen.set(rule.id, path)
        result[rule.id] = rule as GainRuleDef
      }
    }
    return result
  }
  mod.gainRules = loadGainRules()

  // 注释：加载 achievements.toml（成就定义；gain-rule-system 消费）——同上按 id 去重合并
  function loadAchievements(): Record<string, AchievementDef> {
    const result: Record<string, AchievementDef> = {}
    const paths = Object.keys(rawTomlMap).filter(p =>
      p.endsWith('/achievements.toml') || p === `/mods/${modName}/definitions/achievements.toml`)
    const seen = new Map<string, string>()
    for (const path of paths) {
      const data = parseFile(path, rawTomlMap[path])
      const list = data.achievements
      if (list !== undefined && !Array.isArray(list)) {
        throw new Error(`${path}: [[achievements]] 必须是数组（TOML 用 [[achievements]] 声明成就列表）`)
      }
      for (const a of (list as any[]) ?? []) {
        if (!a || typeof a !== 'object' || !a.id) {
          throw new Error(`${path}: achievements.toml 的 [[achievements]] 条目缺少 id 字段`)
        }
        if (seen.has(a.id) && seen.get(a.id) === path) {
          throw new Error(`${path}: 成就 '${a.id}' 重复定义（同文件内 id 必须唯一）`)
        }
        seen.set(a.id, path)
        result[a.id] = a as AchievementDef
      }
    }
    return result
  }
  mod.achievements = loadAchievements()

  // 注释：加载 counters.toml（计数器+视图定义；counter-system 消费）——同上按 id 去重合并。
  // 文件含 [[counters]]（计数器声明）与 [[views]]（只读视图声明）两个数组段
  function loadCounters(): { defs: Record<string, CounterDef>; views: Record<string, CounterViewDef> } {
    const defs: Record<string, CounterDef> = {}
    const views: Record<string, CounterViewDef> = {}
    const paths = Object.keys(rawTomlMap).filter(p =>
      p.endsWith('/counters.toml') || p === `/mods/${modName}/definitions/counters.toml`)
    const seenD = new Map<string, string>()
    const seenV = new Map<string, string>()
    for (const path of paths) {
      const data = parseFile(path, rawTomlMap[path])
      const counters = data.counters
      if (counters !== undefined && !Array.isArray(counters)) {
        throw new Error(`${path}: [[counters]] 必须是数组（TOML 用 [[counters]] 声明计数器列表）`)
      }
      for (const c of (counters as any[]) ?? []) {
        if (!c || typeof c !== 'object' || !c.id) {
          throw new Error(`${path}: counters.toml 的 [[counters]] 条目缺少 id 字段`)
        }
        const scope = (c.scope as string) || 'character'
        if (!['player', 'character', 'global'].includes(scope)) {
          throw new Error(`${path}: 计数器 '${c.id}' 的 scope '${scope}' 非法（player/character/global）`)
        }
        // 去重键 = scope:id——同一 id 可分别声明 player/character 两个 scope（不同实体方向），
        // 同 scope 同 id 才冲突
        const dedupKey = `${scope}:${c.id}`
        if (seenD.has(dedupKey) && seenD.get(dedupKey) === path) {
          throw new Error(`${path}: 计数器 '${c.id}'（scope=${scope}）重复定义（同文件内同 scope 下 id 必须唯一）`)
        }
        seenD.set(dedupKey, path)
        defs[dedupKey] = c as CounterDef
      }
      const viewList = data.views
      if (viewList !== undefined && !Array.isArray(viewList)) {
        throw new Error(`${path}: [[views]] 必须是数组（TOML 用 [[views]] 声明视图列表）`)
      }
      for (const v of (viewList as any[]) ?? []) {
        if (!v || typeof v !== 'object' || !v.id) {
          throw new Error(`${path}: counters.toml 的 [[views]] 条目缺少 id 字段`)
        }
        if (seenV.has(v.id) && seenV.get(v.id) === path) {
          throw new Error(`${path}: 视图 '${v.id}' 重复定义（同文件内 id 必须唯一）`)
        }
        seenV.set(v.id, path)
        views[v.id] = v as CounterViewDef
      }
    }
    return { defs, views }
  }
  const loadedCounters = loadCounters()
  mod.counterDefs = loadedCounters.defs
  mod.counterViews = loadedCounters.views

  // 注释：加载 body-shape.toml（身材档位表；body-shape-system 消费）——
  // 插件默认层（data/default/） + mod definitions 层，按 维度(chest/hip)→档位名 deepMerge
  // （mod 可覆盖默认层的 min/max/default）。结构错误（非数组/缺字段）→ error（文件名+行号）；
  // 档位表本身不单调/缺默认档 → warning（运行时按 min 排序收边兜底）。
  function loadBodyShape(): BodyShapeDef {
    const result: BodyShapeDef = {}
    const paths = Object.keys(rawTomlMap).filter(p =>
      p.endsWith('/body-shape.toml') || p === `/mods/${modName}/definitions/body-shape.toml`)
    for (const path of paths) {
      const data = parseFile(path, rawTomlMap[path])
      const raw = data.body_shape
      if (raw === undefined) continue
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`${path}: body-shape.toml 缺少 [body_shape] 段（或不是表）`)
      }
      for (const dim of ['chest', 'hip', 'height', 'penis'] as const) {
        const dimRaw = raw[dim]
        if (dimRaw === undefined) continue
        if (!dimRaw || typeof dimRaw !== 'object' || Array.isArray(dimRaw)) {
          throw new Error(`${path}: [body_shape.${dim}] 必须是表`)
        }
        if (!dimRaw.tiers || typeof dimRaw.tiers !== 'object' || Array.isArray(dimRaw.tiers)) {
          throw new Error(`${path}: [body_shape.${dim}.tiers] 必须是表（档位名 → {min,max}）`)
        }
        if (dimRaw.sex !== undefined && dimRaw.sex !== 'female' && dimRaw.sex !== 'male') {
          throw new Error(`${path}: [body_shape.${dim}] 的 sex 仅支持 female/male`)
        }
        const dimDef: BodyShapeDimDef = { default: dimRaw.default ?? '', tiers: {} }
        for (const [tierName, tierRaw] of Object.entries(dimRaw.tiers as Record<string, any>)) {
          if (!tierRaw || typeof tierRaw !== 'object' || Array.isArray(tierRaw) ||
              typeof tierRaw.min !== 'number' || typeof tierRaw.max !== 'number' ||
              !(tierRaw.min < tierRaw.max)) {
            throw new Error(`${path}: [body_shape.${dim}.tiers] 档 '${tierName}' 需含数字 min<max`)
          }
          const prev = result[dim]?.tiers?.[tierName]
          dimDef.tiers[tierName] = {
            ...(prev ?? {}),
            min: tierRaw.min,
            max: tierRaw.max,
          }
        }
        result[dim] = {
          ...(result[dim] ?? {}),
          default: dimRaw.default !== undefined ? dimRaw.default : (result[dim]?.default ?? ''),
          sex: dimRaw.sex !== undefined ? dimRaw.sex : (result[dim]?.sex),
          tiers: { ...(result[dim]?.tiers ?? {}), ...dimDef.tiers },
        }
      }
    }
    for (const dim of ['chest', 'hip'] as const) {
      const dimDef = result[dim]
      if (!dimDef) continue
      const sorted = Object.entries(dimDef.tiers).sort((a, b) => a[1].min - b[1].min)
      // 默认档校验：缺失 → warning + 取最小下界档兜底
      if (!dimDef.default || !dimDef.tiers[dimDef.default]) {
        dimDef.default = sorted[0]?.[0] ?? ''
      }
      // 单调性校验：乱序 → warning（运行时仍按 min 排序，行为确定）
      for (let i = 1; i < sorted.length; i++) {
        if (!(sorted[i - 1][1].min < sorted[i][1].min)) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'warning',
            message: `body-shape.toml [body_shape.${dim}] 档位区间非严格递增（${sorted[i - 1][0]}→${sorted[i][0]}），已按 min 排序处理`,
          })
          break
        }
      }
      // 连续性校验：相邻档区间出现空隙（上一档 max < 下一档 min）→ warning。
      // 空隙内的数值没有档归属，tierOf 会静默收边到末档——作者应保持区间连续。
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i - 1][1].max < sorted[i][1].min) {
          errorReporter.report({
            source: 'mod-loader',
            severity: 'warning',
            message: `body-shape.toml [body_shape.${dim}] 档位区间存在空隙（${sorted[i - 1][0]} max=${sorted[i - 1][1].max} < ${sorted[i][0]} min=${sorted[i][1].min}），空隙内数值将静默收边到末档，建议区间连续`,
          })
        }
      }
    }
    return result
  }
  mod.bodyShape = loadBodyShape()

  // 注释：升级路径校验（须在 talents 加载之后——needs 引用 talent 名需要 talentDefs 就绪）
  validateAbilityUpgrades(mod, modName)

  // 注释：加载 styles.toml（命名样式注册表）
  const stylesPath = `/mods/${modName}/definitions/talk/styles.toml`
  if (stylesPath in rawTomlMap) {
    const data = parseFile(stylesPath, rawTomlMap[stylesPath])
    mod.styles = (data.styles as Record<string, Record<string, any>>) ?? {}
  }

  // 注释：加载 scenes（quests/ + events/ 下所有 toml，子目录自动支持）
  // scene 是统一单位，type=main/side/event 只影响 UI 显示
  const scenePrefixes = [`/mods/${modName}/quests/`, `/mods/${modName}/events/`]
  // C5：任务内嵌对话 → conversations.scene（sceneId 全局唯一，冲突即报错）
  const sceneConversations = new Map<string, Map<string, Conversation>>()
  // B-I-1：scene 文件路径记录（后续引用校验报错带文件路径）
  const scenePaths = new Map<string, string>()
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
    // 注释：B-M-4（audit-b M-4）——scene id 含 '.' → error + 拒绝注册——条件路径
    // 以 '.' 分段（quest.{id}.status），含点 id 在加载期误报未知字段、运行期把
    // sceneId 解析成前半段（错误场景）
    if (typeof scene.id === 'string' && scene.id.includes('.')) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error', file: path,
        message: `Scene ID '${scene.id}' 含 '.' 字符（会破坏 quest 条件路径，如 quest.${scene.id}.status）`,
        suggestion: '场景 id 避免使用点号——条件引擎以 "." 分段解析路径',
      })
      continue
    }
    mod.quests.set(scene.id, scene)
    scenePaths.set(scene.id, path)
    // 注释：C2-M（audit-c2 其他发现）——triggers/dialogues 非数组防护——作者误写
    // 单表（triggers = { ... }）时 for...of 抛裸 TypeError 崩溃 loadMod（无兜底 catch，
    // 非精准报错格式）→ error + 跳过该字段
    const triggersRaw = (scene as any).triggers
    if (triggersRaw !== undefined && !Array.isArray(triggersRaw)) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error', file: path,
        message: `任务 '${scene.id}' 的 triggers 字段必须是数组（当前是 ${typeof triggersRaw}）`,
        suggestion: '触发声明用 [[triggers]] 表数组，不是 [triggers]',
      })
    }
    const dialoguesRaw = (scene as any).dialogues
    if (dialoguesRaw !== undefined && !Array.isArray(dialoguesRaw)) {
      errorReporter.report({
        source: 'mod-loader', severity: 'error', file: path,
        message: `任务 '${scene.id}' 的 dialogues 字段必须是数组（当前是 ${typeof dialoguesRaw}）`,
        suggestion: '内嵌对话声明用 [[dialogues]] 表数组，不是 [dialogues]',
      })
    }
    const triggers = Array.isArray(triggersRaw) ? triggersRaw : []
    // 注释：C6——trigger 声明校验（type 合法值）。非法 type → error；
    // 已定义但未实现（location_enter/item_used/time，Phase 2 计划）→ error——
    // 防止作者以为已生效而静默失效。含 scene id + 文件路径
    const VALID_TRIGGER_TYPES = ['command', 'dialogue_end', 'location_enter', 'item_used', 'time']
    const IMPLEMENTED_TRIGGER_TYPES = ['command', 'dialogue_end']
    for (const trig of triggers) {
      if (!trig || typeof trig !== 'object') {
        // 注释：B-I-3（audit-b M-8）——非法 trigger 条目（null/字符串）→ error
        //（原静默 continue：与 events/ai-targets 加载的报错风格对齐）
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file: path,
          message: `任务 '${scene.id}' 的 triggers 含有非法条目（非表对象，已跳过）`,
          suggestion: 'triggers 数组的每个条目必须是表（{ type, ... }）',
        })
        continue
      }
      if (!VALID_TRIGGER_TYPES.includes(trig.type)) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file: path,
          message: `任务 '${scene.id}' 的 trigger type '${String(trig.type)}' 非法（合法值：command/dialogue_end/location_enter/item_used/time）`,
          suggestion: '检查 triggers 声明拼写——非法 type 的任务不会触发',
        })
      } else if (!IMPLEMENTED_TRIGGER_TYPES.includes(trig.type)) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file: path,
          message: `任务 '${scene.id}' 的 trigger type '${trig.type}' 尚未实现，暂不生效`,
          suggestion: '请使用 command/dialogue_end，其余类型（location_enter/item_used/time）将在后续版本支持',
        })
      } else {
        // 注释：B-I-3（audit-b M-9）——按 type 校验必填字段（原 buildTriggerIndex
        // 静默跳过——触发器失效零诊断）→ 加载期 error
        if (trig.type === 'command' && !trig.command) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error', file: path,
            message: `任务 '${scene.id}' 的 command 触发器缺少 command 字段（触发器不会触发）`,
            suggestion: 'triggers = [{ type = "command", command = "指令id", ... }]',
          })
        }
        if (trig.type === 'dialogue_end' && !trig.character) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error', file: path,
            message: `任务 '${scene.id}' 的 dialogue_end 触发器缺少 character 字段（触发器不会触发）`,
            suggestion: 'triggers = [{ type = "dialogue_end", character = "角色ID" }]',
          })
        }
      }
    }
    // C5：任务内嵌对话树收集（[[dialogues]] 段，与独立 conversation 文件同格式）
    const inlineDialogues = Array.isArray(dialoguesRaw) ? dialoguesRaw : []
    for (const dlg of inlineDialogues) {
      if (!dlg?.id) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file: path,
          message: `任务 '${scene.id}' 的内嵌对话缺少 id 字段，跳过`,
          suggestion: '每个 [[dialogues]] 条目必须有唯一 id',
        })
        continue
      }
      // 注释：B-I-2（audit-b I-2）——内嵌对话结构校验——nodes 非空 + 每节点有 id +
      // 有 start 节点 + choices[].next 指向存在的节点（原零校验：坏引用运行期
      // renderNode 静默 return → 玩家点击后对话卡死且零诊断，违反 §37）
      const nodes = Array.isArray(dlg.nodes) ? dlg.nodes : []
      if (nodes.length === 0) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file: path,
          message: `任务 '${scene.id}' 内嵌对话 '${dlg.id}' 没有节点（nodes 为空）`,
          suggestion: '内嵌对话至少需要一个 start 节点',
        })
        continue
      }
      const nodeIds = new Set<string>()
      let hasStart = false
      for (const node of nodes) {
        if (!node?.id) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error', file: path,
            message: `任务 '${scene.id}' 内嵌对话 '${dlg.id}' 存在缺 id 的节点`,
            suggestion: '对话树的每个 [[dialogues.nodes]] 必须有 id 字段',
          })
          continue
        }
        // 注释：audit-e M5——lines 为字符串时运行期逐字符输出（零报错）；
        // 加载期校验 lines 存在时必须为数组（含 scene+dialogue id 定位）
        if (node.lines !== undefined && !Array.isArray(node.lines)) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error', file: path,
            message: `任务 '${scene.id}' 内嵌对话 '${dlg.id}' 节点 '${node.id}' 的 lines 必须是数组（当前是 ${typeof node.lines}）`,
            suggestion: 'lines 用表数组写法：lines = ["一句台词"]（单字符串会被逐字符输出）',
          })
        }
        nodeIds.add(node.id)
        if (node.id === 'start') hasStart = true
      }
      if (!hasStart) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file: path,
          message: `任务 '${scene.id}' 内嵌对话 '${dlg.id}' 缺少 'start' 节点`,
          suggestion: '对话树必须从 id = "start" 的节点开始渲染',
        })
      }
      for (const node of nodes) {
        for (const choice of node?.choices ?? []) {
          if (!choice?.next || !nodeIds.has(choice.next)) {
            errorReporter.report({
              source: 'mod-loader', severity: 'error', file: path,
              message: `任务 '${scene.id}' 内嵌对话 '${dlg.id}' 的选项 next 指向不存在的节点 '${String(choice?.next)}'`,
              suggestion: 'choices[].next 必须指向本对话树内已定义的节点 id',
            })
          }
        }
      }
      const conv: Conversation = { id: dlg.id, nodes }
      if (!sceneConversations.has(scene.id)) sceneConversations.set(scene.id, new Map())
      const map = sceneConversations.get(scene.id)!
      if (map.has(conv.id)) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file: path,
          message: `任务 '${scene.id}' 内嵌对话 id '${conv.id}' 重复`,
          suggestion: '同任务内嵌对话 id 必须唯一',
        })
        continue
      }
      map.set(conv.id, conv)
    }
    // 注释：custom objective 结构校验（M2 重构：事件名白名单不属 core——
    // h:orgasm/h:end 是 h-core 插件领域事件，core 只做结构校验；
    // 事件名合法性由 quest-system 延迟校验（game:plugins_loaded 挂点，
    // 与条件字段校验同强度）。fail_event ≠ event 属结构问题（同名遮蔽主计数路径）
    for (const step of scene.steps ?? []) {
      const obj = step.objective
      if (step.type === 'objective' && obj?.type === 'custom') {
        if (typeof obj.event !== 'string' || !obj.event) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error', file: path,
            message: `任务 '${scene.id}' 步骤 '${step.id}' 的 custom objective 缺少 event 字段（目标不会推进）`,
            suggestion: 'objective.event 声明监听的事件名（如 "h:orgasm"），由 quest-system 在插件就绪后校验合法性',
          })
        }
        if (obj.fail_event && obj.fail_event === obj.event) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error', file: path,
            message: `任务 '${scene.id}' 步骤 '${step.id}' 的 custom objective 的 fail_event（'${obj.fail_event}'）与 event 相同（主计数路径被失败分支遮蔽）`,
            suggestion: 'fail_event 必须是与 event 不同的事件（如 event = "h:orgasm"、fail_event = "h:end"）',
          })
        }
      }
    }
  }
  // 解析完成后 conversations.scene = sceneConversations
  mod.conversations.scene = sceneConversations
  // 注释：校验 scene 引用（scene_id 必须存在）+ B-I-1：steps.conversation 引用存在性
  //（§37 铁律：加载时 error——原只校验 scene_id；conversation 坏引用只在运行期
  // dialogue-system 报 warning 后任务静默跳步，作者无感知）+ 步骤图拓扑校验（audit-e I3：
  // 步骤引用/必填字段——TOML 路径与 quest-system registerScene 运行时路径共用
  // validateSceneSteps；含 file 定位）
  for (const [id, scene] of mod.quests) {
    const filePath = scenePaths.get(id) ?? ''
    validateSceneSteps(scene, filePath)
    for (const step of scene.steps ?? []) {
      if (step.type === 'scene' && step.scene_id && !mod.quests.has(step.scene_id)) {
        errorReporter.report({
          source: 'mod-loader', severity: 'error', file: filePath, message: `Scene '${id}' 的 step 引用了不存在的 scene_id '${step.scene_id}'`,
          suggestion: `检查 ${scenePrefixes.map(p => p.replace(`/mods/${modName}/`, '')).join(' 或 ')} 下是否有该 id 的文件`,
        })
      }
      if (step.conversation) {
        const ref = parseConversationRef(step.conversation as ConversationRef | string)
        if (!resolveConversation(mod.conversations, ref)) {
          errorReporter.report({
            source: 'mod-loader', severity: 'error', file: filePath,
            message: `任务 '${id}' 步骤 '${step.id}' 的对话引用不存在：${JSON.stringify(ref)}`,
            suggestion: '检查对话引用拼写（scene: 引用需任务内嵌对话已定义；character: 引用需角色对话文件存在）',
          })
        }
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

  // 注释：加载存档迁移 steps（audit-f 修复，2026-08-12）——mods/[mod]/migrations/*.toml
  // 的 [[migrations]] 条目平铺合并（按文件遍历顺序）；读档时 migrateSaveData 执行
  // （此前迁移零生产调用 = 静默从未生效）
  const migrations: MigrationStep[] = []
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(`/mods/${modName}/`)) continue
    if (!path.includes('/migrations/') || !path.endsWith('.toml')) continue
    const data = parseFile(path, raw)
    const steps = (data.migrations as MigrationStep[] | undefined) ?? []
    for (const step of steps) {
      if (step && (step.rename || step.default || step.transform)) {
        migrations.push(step)
      }
    }
  }
  mod.migrations = migrations

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

// 注释：步骤图拓扑校验（audit-e I3/I6，2026-08-15）——步骤引用字段
//（next/on_win/on_lose/else/on_fail/goto.target/objective.on_fail）必须指向本场景内
// 存在的 step id；objective 步骤必须有 objective 字段；combat 步骤必须声明 next 或
// on_win/on_lose 之一（否则胜利后挂起）+ enemies 非空（否则秒胜直通）；goto 步骤
// 必须有 target；step id 不得重复。terminal 步骤（无 next 的 reward/dialogue 等）
// 合法不报。`next`/`on_win`/`on_lose` 空字符串 = 显式结束标记（立即 completeScene），
// 合法不报（2026-08-15：替代旧 `next = "不存在的id"` 哨兵写法——旧哨兵仍可运行但
// 加载期会报未定义引用 error）。TOML 路径（parseModData 解析循环）与 quest-system
// registerScene 运行时路径共用。返回上报的 error 数量（调用方据此决定是否拒绝注册）
function expandCharacterAbilitiesForChar(char: any, abilityDefs: Record<string, AbilityDef>): void {
  if (!char) return
  if (!char.abilities) char.abilities = {}
  const expanded: Record<string, { level: number; xp: number | null }> = {}
  // 注释：只展开角色已有的（roster 简写 → {level, xp}；对象保持；attributes 落位的卡能力保留）
  for (const [abilityId, value] of Object.entries(char.abilities)) {
    if (typeof value === 'number') {
      expanded[abilityId] = { level: value, xp: 0 }
    } else if (typeof value === 'object' && value !== null) {
      expanded[abilityId] = value as { level: number; xp: number | null }
    }
  }
  // 注释：condition 模式能力全量注入（升级遍历入口；缺条目则 checkUpgrade 静默不升）
  for (const [abilityId, def] of Object.entries(abilityDefs)) {
    if (def.mode !== 'condition') continue
    if (expanded[abilityId] === undefined) {
      expanded[abilityId] = { level: 0, xp: 0 }
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
  const hasAngry = (char as any).base?.[ATTR.ANGER] !== undefined
  applyAttributeDefaults(char, mod.attributes)
  expandCharacterAbilitiesForChar(char as any, mod.abilities)
  normalizeMarksToAbilities(char as any, mod)
  normalizeInventoryToArray(char as any)
  normalizeRelations(char as any, mod.relationTypes)
  initializeTalentsForChar(char as any, mod.talentDefs)
  if (!hasAngry) {
    if (!(char as any).base) (char as any).base = {}
    ;(char as any).base[ATTR.ANGER] = 1 + Math.floor(Math.random() * 35)
  }
}

// 注释：reverse 自动推导（关系系统 v2）——未显式声明 reverse 时按"同名换端"：
// "父母子女（为大）" ↔ "父母子女（为小）"；无（为大/为小）后缀 → 无反向
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
// 2026-08-11（按需展开批）：刻印是"角色卡"——attributes.toml 全部 category=mark 属性保证
// abilities 有 0 级条目（h-mark 升级写 .level 需要条目存在，缺失会 TypeError；面板显示全貌）。
// 导出供 save-system restoreFromSave 恢复路径复用（旧存档 marks 值不静默丢失）。
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

