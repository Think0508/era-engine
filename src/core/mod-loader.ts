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
}

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

  return mod
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
