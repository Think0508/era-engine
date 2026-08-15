import TOML from '@iarna/toml'
import type { PluginContext } from './types'
import type { ApiSystem } from './api'
import type { EventBus } from './event-bus'
import { conditionRegistry } from './condition-registry'
import type { CommandRegistry, CommandDef } from './command-registry'
import type { UISlotItem } from './types'

// 注释：SlotRegistry 最小结构接口——core 不依赖 ui 层实现，只声明所需方法
// 真实 SlotRegistry 类（src/ui/slots/slot-registry.ts）结构兼容此接口
export interface SlotRegistryLike {
  register(slotName: string, item: UISlotItem): void
  unregister(slotName: string, id: string): void
}
import { resolveDataDependencies, type DataDependencyInfo } from './data-dependencies'
import { errorReporter } from './error-reporter'

// 注释：孤儿插件检测（2026-08-12 第二轮审计——hunger-system 曾只有 index.ts 缺 plugin.toml，
// plugin-manager 扫描不到 → 整个插件静默未加载（effect/监听器全部失效）且无任何警告）
// 生产路径 main.ts 与 boot 冒烟测试在构建 enginePlugins 前调用；发现孤儿 → warning 上报
export function warnMissingPluginTomls(): void {
  const indexModules = import.meta.glob('/src/plugins/*/index.ts')
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml')
  const withToml = new Set(
    Object.keys(pluginTomls)
      .map(p => p.match(/\/src\/plugins\/([^/]+)\//)?.[1])
      .filter((d): d is string => !!d),
  )
  const orphans: string[] = []
  for (const p of Object.keys(indexModules)) {
    const dir = p.match(/\/src\/plugins\/([^/]+)\//)?.[1]
    if (dir && !withToml.has(dir)) orphans.push(dir)
  }
  // 注释：模组专属插件目录同样检测（mods/[mod]/plugins/）
  const modIndexModules = import.meta.glob('/mods/*/plugins/*/index.ts')
  const modPluginTomls = import.meta.glob('/mods/*/plugins/*/plugin.toml')
  const modWithToml = new Set(
    Object.keys(modPluginTomls)
      .map(p => p.match(/\/mods\/[^/]+\/plugins\/([^/]+)\//)?.[1])
      .filter((d): d is string => !!d),
  )
  for (const p of Object.keys(modIndexModules)) {
    const dir = p.match(/\/mods\/[^/]+\/plugins\/([^/]+)\//)?.[1]
    if (dir && !modWithToml.has(dir)) orphans.push(`${dir}（mod 插件）`)
  }
  if (orphans.length > 0) {
    errorReporter.report({
      source: 'plugin-manager',
      severity: 'warning',
      message: `发现孤儿插件目录（有 index.ts 无 plugin.toml，永远不会被加载）：${orphans.join(', ')}`,
      suggestion: '为这些目录补 plugin.toml（[meta] id/name/version 必填），或删除目录',
    })
  }
}

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
  private slotRegistry: SlotRegistryLike | null
  private commandRegistry: CommandRegistry | null
  private plugins = new Map<string, PluginDef>()
  private activeParentApis = new Map<string, Record<string, any>>()
  private disabledPlugins = new Set<string>()

  constructor(
    apiSystem: ApiSystem,
    eventBus: EventBus,
    slotRegistry: SlotRegistryLike | null = null,
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
        errorReporter.report({ source: 'plugin-manager', severity: 'warning', message: `插件 '${id}' 解析失败：${(e as Error).message}`, suggestion: '检查 plugin.toml 语法与 [meta] 必填字段' })
        this.disabledPlugins.add(id)
      }
    }
    for (const [id, data] of modPlugins) {
      try {
        const def = this.parsePluginToml(id, data.toml)
        def.source = 'mod'
        allDefs.set(id, def)
      } catch (e) {
        errorReporter.report({ source: 'plugin-manager', severity: 'warning', message: `模组插件 '${id}' 解析失败：${(e as Error).message}` })
        this.disabledPlugins.add(id)
      }
    }

    let sorted: PluginDef[] = []
    try {
      sorted = this.sortByExtends(allDefs)
    } catch (e) {
      errorReporter.report({ source: 'plugin-manager', severity: 'warning', message: `插件 extends 排序失败：${(e as Error).message}` })
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
        errorReporter.report({ source: 'plugin-manager', severity: 'warning', message: `插件 '${def.meta.id}' onLoad 失败：${(e as Error).message}`, suggestion: '插件已禁用（错误隔离），检查其 onLoad 实现' })
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
        errorReporter.report({ source: 'plugin-manager', severity: 'warning', message: `插件 '${def.meta.id}' onEnable 失败：${(e as Error).message}`, suggestion: '插件已禁用（错误隔离），检查其 onEnable 实现' })
        this.disabledPlugins.add(def.meta.id)
      }
    }

    // 注释：全部插件启用完毕 → 生命周期事件（此时 condition_fields/premises 已全部注册，
    // 依赖它们的延迟校验（如指令 condition/premises）监听此事件）
    await this.eventBus.emit('game:plugins_loaded', {})
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
          errorReporter.report({
            source: 'plugin-manager',
            severity: 'warning',
            message: `插件 '${def.meta.id}': 指令 '${cmd.id}' 是 handler 类（JS 脚本），Phase 6-7 暂不支持（需沙箱 Phase 11）`,
          })
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
          errorReporter.report({
            source: 'plugin-manager',
            severity: 'warning',
            message: `插件 '${def.meta.id}': 注册指令 '${cmd.id}' 失败: ${(e as Error).message}`,
          })
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
        // 注释：priority 第三参转发（types.ts 已声明；此前丢失——follow-system 等
        // 需要"先于默认 0 优先级的监听器"（如先瞬移跟随者再触发对话 greet））
        on: (event: string, handler: Function, priority?: number) =>
          this.eventBus.on(event, handler as any, priority),
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
