// 注释：map-system 插件——地图与移动系统
// 职责：注册 move 指令、提供 map API、MapView 渲染（interactive log entry）
// 不参与口上触发——只管移动 + 事件发射
// tags 驱动指令不属于 map-system——消费 tag 的插件自己注册

import type { PluginContext, LocationData, GameContext, Edge, MoveConfig, MapLayout } from '../../core/types'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { narrativeLog } from '../../core/narrative-log'
import { commandRegistry } from '../../core/command-registry'
import type { CommandDef } from '../../core/command-registry'
import { modLoader } from '../../core/mod-loader'
import { evaluateCondition } from '../../core/condition'

interface ReachableLocation {
  target: string
  name: string
  time_cost: number
  via: 'parent' | 'child' | 'graph'
}

function getReachable(
  fromId: string,
  gc: GameContext,
  graph: Edge[],
  cfg: MoveConfig,
): ReachableLocation[] {
  const results: ReachableLocation[] = []
  const seen = new Set<string>()
  const fromLoc = entitySystem.get('location', fromId) as any as LocationData
  if (!fromLoc) return results

  // 1. Parent chain: up to parent
  if (fromLoc.parent) {
    const parent = entitySystem.get('location', fromLoc.parent) as any as LocationData
    if (parent && !seen.has(parent.id)) {
      seen.add(parent.id)
      results.push({ target: parent.id, name: parent.name, time_cost: cfg.parent_time_cost, via: 'parent' })
    }
  }

  // 2. Parent chain: down to direct children
  const allLocations = entitySystem.getAll('location')
  for (const loc of allLocations) {
    const l = loc as any as LocationData
    if (l.parent === fromId && !seen.has(l.id)) {
      seen.add(l.id)
      results.push({ target: l.id, name: l.name, time_cost: cfg.child_time_cost, via: 'child' })
    }
  }

  // 3. Graph edges
  for (const edge of graph) {
    if (edge.from === fromId && !seen.has(edge.to)) {
      if (!edge.condition || evaluateCondition(edge.condition, gc)) {
        const target = entitySystem.get('location', edge.to) as any as LocationData
        if (target) {
          seen.add(edge.to)
          results.push({ target: edge.to, name: target.name, time_cost: edge.time_cost ?? cfg.edge_default_time_cost, via: 'graph' })
        }
      }
    }
  }

  return results
}

// 注释：onLoad——map-system 无需提前声明
export function onLoad(_ctx: PluginContext): void {
}

// 注释：onEnable——注册 map API + move 指令
export function onEnable(ctx: PluginContext): void {
  // 注释：注册 map API
  ctx.api.register('map', {
    // 注释：获取当前地点
    getCurrentLocation: (): LocationData | null => {
      return gameContext.getContext().location
    },
    // 注释：获取某地点的可达地点（parent/children/graph）
    getReachable: (locationId?: string): ReachableLocation[] => {
      const id = locationId ?? gameContext.getContext().location?.id
      if (!id) return []
      const gc = gameContext.getContext()
      const mod = modLoader.getMod()
      const cfg = mod?.moveConfig ?? { parent_time_cost: 10, child_time_cost: 5, edge_default_time_cost: 10 }
      return getReachable(id, gc, mod?.graph ?? [], cfg)
    },
    // 注释：获取子地点（parent === locationId 的地点）
    getChildren: (locationId: string): LocationData[] => {
      const result: LocationData[] = []
      const all = entitySystem.getAll('location')
      for (const loc of all) {
        if ((loc as any).parent === locationId) {
          result.push(loc as any as LocationData)
        }
      }
      return result
    },
    // 注释：获取祖先链（parent 递归向上）
    getAncestors: (locationId: string): LocationData[] => {
      const result: LocationData[] = []
      let current = entitySystem.get('location', locationId) as any as LocationData
      while (current?.parent) {
        const parent = entitySystem.get('location', current.parent) as any as LocationData
        if (!parent) break
        result.push(parent)
        current = parent
      }
      return result
    },
    // 注释：获取地点数据
    getLocation: (locationId: string): LocationData | null => {
      return (entitySystem.get('location', locationId) as any as LocationData) ?? null
    },
    // 注释：检查地点是否有某 tag
    hasTag: (locationId: string, tag: string): boolean => {
      const loc = entitySystem.get('location', locationId) as any as LocationData
      return loc?.tags?.includes(tag) ?? false
    },
    // 注释：获取某地点的视觉地图 layout——沿 parent 链向上查找最近的 layout JSON
    getMapLayout: (locationId?: string): { layout: MapLayout; parentId: string } | null => {
      const mod = modLoader.getMod()
      if (!mod) return null
      const id = locationId ?? gameContext.getContext().location?.id
      if (!id) return null

      // Walk parent chain to find the nearest layout
      const seen = new Set<string>()
      let currentId: string | null = id
      while (currentId && !seen.has(currentId)) {
        seen.add(currentId)
        if (mod.layouts.has(currentId)) {
          const layout = mod.layouts.get(currentId)!
          return { layout, parentId: currentId }
        }
        const loc = mod.locations.get(currentId)
        currentId = loc?.parent ?? null
      }
      return null
    },
    // 注释：移动到目标地点——通过 getReachable 查找 time_cost，无路径则报错
    moveTo: async (targetLocationId: string): Promise<void> => {
      const loc = gameContext.getContext().location
      if (!loc) return

      const gc = gameContext.getContext()
      const mod = modLoader.getMod()
      const cfg = mod?.moveConfig ?? { parent_time_cost: 10, child_time_cost: 5, edge_default_time_cost: 10 }
      const reachable = getReachable(loc.id, gc, mod?.graph ?? [], cfg)
      const r = reachable.find(r => r.target === targetLocationId)
      if (!r) {
        throw new Error(`moveTo 失败：从 '${loc.id}' 无法到达 '${targetLocationId}'`)
      }

      const target = entitySystem.get('location', targetLocationId) as any as LocationData
      const targetName = target?.name ?? targetLocationId
      narrativeLog.write(`你前往${targetName}...`, 'movement', 'map-system')
      await gameContext.moveTo(targetLocationId, r.time_cost)
    },
  })

  // 注释：注册 move 指令（从 native-commands 移除占位）
  commandRegistry.unregister('move')
  const moveCmd: CommandDef = {
    id: 'move',
    label: '移动',
    group: 'location_commands',
    modes: ['exploration'],
    priority: 5,
    source: 'plugin:map-system',
    handler: async () => {
      const loc = gameContext.getContext().location
      if (!loc) return
      // Try to load a visual map layout
      const mod = modLoader.getMod()
      const hasLayout = mod?.layouts.has(loc.id) ?? false
      if (hasLayout) {
        await gameContext.enterMode('map')
      } else {
        // No visual layout — show text map as before
        const gc = gameContext.getContext()
        const cfg = mod?.moveConfig ?? { parent_time_cost: 10, child_time_cost: 5, edge_default_time_cost: 10 }
        const reachable = getReachable(loc.id, gc, mod?.graph ?? [], cfg)
        narrativeLog.write('地图', 'map', 'map-system', true, {
          locationId: loc.id,
          locationName: loc.name,
          locationType: loc.type,
          reachable,
        })
      }
    },
  }
  ctx.commands.register(moveCmd)
}
