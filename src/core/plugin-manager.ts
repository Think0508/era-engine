import TOML from '@iarna/toml'
import type { PluginContext } from './types'
import type { ApiSystem } from './api'
import type { EventBus } from './event-bus'
import { conditionRegistry } from './condition-registry'

interface PluginMeta {
  id: string
  name: string
  version: string
  extends?: string
  description?: string
}

interface PluginDef {
  meta: PluginMeta
  dependencies: { plugin: string; version: string }[]
  requiredAttributes: Record<string, { type: string; description: string }>
  conditionFields: Record<string, { type: string; description: string }>
  events: { listen: { name: string; description: string }[] }
  ui: Record<string, any>
  commands: { name: string; description: string; handler: string }[]
  source: 'engine' | 'mod'
}

class PluginManager {
  private apiSystem: ApiSystem
  private eventBus: EventBus
  private plugins = new Map<string, PluginDef>()
  private activeParentApis = new Map<string, Record<string, any>>()
  private disabledPlugins = new Set<string>()

  constructor(apiSystem: ApiSystem, eventBus: EventBus) {
    this.apiSystem = apiSystem
    this.eventBus = eventBus
  }

  parsePluginToml(pluginId: string, rawToml: string): PluginDef {
    const data = TOML.parse(rawToml) as any
    if (!data.meta?.id || !data.meta?.name || !data.meta?.version) {
      throw new Error(
        `Plugin '${pluginId}': plugin.toml missing meta.id / meta.name / meta.version`,
      )
    }

    return {
      meta: data.meta,
      dependencies: data.dependencies || data.meta?.dependencies || [],
      requiredAttributes: data.required_attributes || {},
      conditionFields: data.condition_fields || {},
      events: data.events || { listen: [] },
      ui: data.ui || {},
      commands: data.commands || [],
      source: 'engine',
    }
  }

  sortByExtends(defs: Map<string, PluginDef>): PluginDef[] {
    const sorted: PluginDef[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (id: string) => {
      if (visited.has(id)) return
      if (visiting.has(id)) {
        const chain = [...visiting, id].join(' -> ')
        throw new Error(`Circular plugin inheritance detected: ${chain}`)
      }
      visiting.add(id)
      const def = defs.get(id)
      if (!def) throw new Error(`Plugin '${id}' definition not found`)
      if (def.meta.extends) {
        visit(def.meta.extends)
      }
      visiting.delete(id)
      visited.add(id)
      sorted.push(def)
    }

    for (const id of defs.keys()) {
      visit(id)
    }
    return sorted
  }

  async loadPlugins(
    enginePlugins: Map<string, { toml: string; module?: any }>,
    modPlugins: Map<string, { toml: string; module?: any }>,
  ): Promise<void> {
    this.plugins.clear()
    this.disabledPlugins.clear()
    this.activeParentApis.clear()

    const allDefs = new Map<string, PluginDef>()
    for (const [id, data] of enginePlugins) {
      try {
        allDefs.set(id, this.parsePluginToml(id, data.toml))
      } catch (e) {
        console.warn(`Failed to parse plugin '${id}': ${(e as Error).message}`)
        this.disabledPlugins.add(id)
      }
    }
    for (const [id, data] of modPlugins) {
      try {
        const def = this.parsePluginToml(id, data.toml)
        def.source = 'mod'
        allDefs.set(id, def)
      } catch (e) {
        console.warn(`Failed to parse mod plugin '${id}': ${(e as Error).message}`)
        this.disabledPlugins.add(id)
      }
    }

    let sorted: PluginDef[] = []
    try {
      sorted = this.sortByExtends(allDefs)
    } catch (e) {
      console.warn(`Plugin extends sorting failed: ${(e as Error).message}`)
      sorted = [...allDefs.values()]
    }

    for (const def of sorted) {
      if (this.disabledPlugins.has(def.meta.id)) continue
      if (def.meta.extends && this.disabledPlugins.has(def.meta.extends)) {
        this.disabledPlugins.add(def.meta.id)
        continue
      }
      try {
        const ctx = this.createContext(def)
        const data = enginePlugins.get(def.meta.id) || modPlugins.get(def.meta.id)
        if (data?.module?.onLoad) {
          await data.module.onLoad(ctx)
        }
      } catch (e) {
        console.warn(`Plugin '${def.meta.id}' onLoad failed: ${(e as Error).message}`)
        this.disabledPlugins.add(def.meta.id)
      }
    }

    for (const def of sorted) {
      if (this.disabledPlugins.has(def.meta.id)) continue
      if (def.meta.extends && this.disabledPlugins.has(def.meta.extends)) {
        this.disabledPlugins.add(def.meta.id)
        continue
      }
      try {
        const ctx = this.createContext(def)
        const data = enginePlugins.get(def.meta.id) || modPlugins.get(def.meta.id)
        if (data?.module?.onEnable) {
          await data.module.onEnable(ctx)
        }
        this.plugins.set(def.meta.id, def)

        if (Object.keys(def.conditionFields).length > 0) {
          conditionRegistry.registerFromPlugin(def.meta.id, def.conditionFields)
        }
      } catch (e) {
        console.warn(`Plugin '${def.meta.id}' onEnable failed: ${(e as Error).message}`)
        this.disabledPlugins.add(def.meta.id)
      }
    }
  }

  private createContext(def: PluginDef): PluginContext {
    let parentApi: Record<string, any> | null = null
    if (def.meta.extends) {
      parentApi = this.activeParentApis.get(def.meta.extends) || null
    }

    return {
      api: {
        register: (ns: string, methods: Record<string, Function>) => {
          this.apiSystem.register(ns, methods as any)
          this.activeParentApis.set(def.meta.id, methods)
        },
        call: (ns: string, method: string, ...args: any[]) =>
          this.apiSystem.call(ns, method, ...args),
      },
      ui: {
        registerSlot: (_slotName: string, _item: any) => {},
      },
      parent: parentApi ? { api: parentApi } : null,
      events: {
        on: (event: string, handler: Function) =>
          this.eventBus.on(event, handler as any),
        off: (event: string, handler: Function) =>
          this.eventBus.off(event, handler as any),
        emit: (event: string, payload: any) =>
          this.eventBus.emit(event, payload),
      },
      gameState: {
        currentLocation: null,
        player: null,
        time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      },
    }
  }

  getPluginDef(id: string): PluginDef | undefined {
    return this.plugins.get(id)
  }

  getDisabledPlugins(): string[] {
    return [...this.disabledPlugins]
  }
}

export { PluginManager }
