import TOML from '@iarna/toml'
import type { PluginContext } from './types'
import type { ApiSystem } from './api'
import type { EventBus } from './event-bus'
import { conditionRegistry } from './condition-registry'
import type { SlotRegistry } from '../ui/slots/slot-registry'
import type { CommandRegistry, CommandDef } from './command-registry'
import { resolveDataDependencies, type DataDependencyInfo } from './data-dependencies'

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
  // 注释：data_dependencies——provides 和 depends_on
  dataDependencies: { provides: string[]; dependsOn: string[] }
  source: 'engine' | 'mod'
}

class PluginManager {
  private apiSystem: ApiSystem
  private eventBus: EventBus
  private slotRegistry: SlotRegistry | null
  private commandRegistry: CommandRegistry | null
  private plugins = new Map<string, PluginDef>()
  private activeParentApis = new Map<string, Record<string, any>>()
  private disabledPlugins = new Set<string>()

  constructor(
    apiSystem: ApiSystem,
    eventBus: EventBus,
    slotRegistry: SlotRegistry | null = null,
    commandRegistry: CommandRegistry | null = null,
  ) {
    this.apiSystem = apiSystem
    this.eventBus = eventBus
    this.slotRegistry = slotRegistry
    this.commandRegistry = commandRegistry
  }

  parsePluginToml(pluginId: string, rawToml: string): PluginDef {
    const data = TOML.parse(rawToml) as any
    if (!data.meta?.id || !data.meta?.name || !data.meta?.version) {
      throw new Error(
        `Plugin '${pluginId}': plugin.toml missing meta.id / meta.name / meta.version`,
      )
    }

    // 注释：data_dependencies 解析
    const dd = data.data_dependencies || {}
    return {
      meta: data.meta,
      dependencies: data.dependencies || data.meta?.dependencies || [],
      requiredAttributes: data.required_attributes || {},
      conditionFields: data.condition_fields || {},
      events: data.events || { listen: [] },
      ui: data.ui || {},
      commands: data.commands || [],
      dataDependencies: {
        provides: dd.provides || [],
        dependsOn: dd.depends_on || [],
      },
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

    // 注释：data_dependencies topo-sort——重新按数据依赖排序 onEnable 顺序
    // 被依赖的插件（如 character-system）排在依赖者（如 map-system）之前
    const enabledDefs = sorted.filter(d => !this.disabledPlugins.has(d.meta.id))
    const ddInfos: DataDependencyInfo[] = enabledDefs.map(d => ({
      pluginId: d.meta.id,
      provides: d.dataDependencies.provides,
      dependsOn: d.dataDependencies.dependsOn,
    }))
    const ddOrder = resolveDataDependencies(ddInfos)
    // 注释：按 data_dependencies 顺序重排（extends 顺序作为同依赖级的 fallback）
    const ddSorted: PluginDef[] = []
    for (const id of ddOrder) {
      const def = allDefs.get(id)
      if (def && !this.disabledPlugins.has(id)) {
        ddSorted.push(def)
      }
    }
    // 注释：补上 ddOrder 遗漏的（无 data_dependencies 的且 extends 排序过的）
    for (const def of sorted) {
      if (!ddSorted.includes(def) && !this.disabledPlugins.has(def.meta.id)) {
        ddSorted.push(def)
      }
    }
    sorted = ddSorted

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

        // 注释：将 plugin.toml [ui] 段的指令注册到 CommandRegistry
        // handler 类指令（JS 脚本路径）Phase 6-7 跳过 + warning（需沙箱 Phase 11）
        this.registerPluginUICommands(def)
      } catch (e) {
        console.warn(`Plugin '${def.meta.id}' onEnable failed: ${(e as Error).message}`)
        this.disabledPlugins.add(def.meta.id)
      }
    }
  }

  // 注释：将 plugin.toml [ui] 段的 location_commands/character_commands/main_menu 注册到 CommandRegistry
  private registerPluginUICommands(def: PluginDef): void {
    if (!this.commandRegistry) return
    const groups: { tomlKey: string; group: 'location_commands' | 'character_commands' | 'main_menu' }[] = [
      { tomlKey: 'location_commands', group: 'location_commands' },
      { tomlKey: 'character_commands', group: 'character_commands' },
      { tomlKey: 'main_menu', group: 'main_menu' },
    ]
    for (const { tomlKey, group } of groups) {
      const cmds = def.ui[tomlKey] as any[]
      if (!Array.isArray(cmds)) continue
      for (const cmd of cmds) {
        // 注释：handler 类指令（JS 脚本路径）Phase 6-7 跳过
        if (cmd.handler && !cmd.effects) {
          console.warn(
            `Plugin '${def.meta.id}': 指令 '${cmd.id}' 是 handler 类（JS 脚本），Phase 6-7 暂不支持（需沙箱 Phase 11）`,
          )
          continue
        }
        try {
          this.commandRegistry!.register({
            id: cmd.id,
            label: cmd.label,
            group,
            modes: cmd.modes || [],
            condition: cmd.condition,
            priority: cmd.priority ?? 0,
            effects: cmd.effects,
            source: `plugin:${def.meta.id}`,
          })
        } catch (e) {
          console.warn(
            `Plugin '${def.meta.id}': 注册指令 '${cmd.id}' 失败: ${(e as Error).message}`,
          )
        }
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
      // 注释：commands——插件动态注册指令，写入 CommandRegistry
      commands: {
        register: (cmd: CommandDef) => {
          if (this.commandRegistry) {
            this.commandRegistry.register(cmd)
          }
        },
        unregister: (id: string) => {
          if (this.commandRegistry) {
            this.commandRegistry.unregister(id)
          }
        },
      },
      ui: {
        // 注释：registerSlot——真正注册到 SlotRegistry（当前空实现→真实注入）
        registerSlot: (slotName: string, item: any) => {
          if (this.slotRegistry) {
            this.slotRegistry.register(slotName, item)
          }
        },
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
