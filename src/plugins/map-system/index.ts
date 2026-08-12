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

// 注释：NPC AI 寻路（npc-ai-system 消费）——dijkstra，图 = parent 链 + graph 边
// 返回 { path（含起点不含终点? 含起点到终点）, total_minutes }；不可达 → null
// 与 getReachable 的代价规则一致：parent/child 用 moveConfig 代价，graph 边用 time_cost
function findPath(
  fromId: string,
  toId: string,
  gc: GameContext,
  graph: Edge[],
  cfg: MoveConfig,
): { path: string[]; total_minutes: number } | null {
  if (fromId === toId) return { path: [fromId], total_minutes: 0 }
  const allLocations = entitySystem.getAll('location')
  const locIds = new Set<string>(allLocations.map(l => (l as any).id))
  if (!locIds.has(fromId) || !locIds.has(toId)) return null

  // 注释：邻接表——节点 → [{to, cost}]
  const adj = new Map<string, { to: string; cost: number }[]>()
  const addEdge = (a: string, b: string, cost: number): void => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a)!.push({ to: b, cost })
  }
  // parent/child 链（双向）
  for (const loc of allLocations) {
    const l = loc as any as LocationData
    if (l.parent) {
      addEdge(l.id, l.parent, cfg.parent_time_cost)
      addEdge(l.parent, l.id, cfg.child_time_cost)
    }
  }
  // graph 边（含条件——不满足的边不参与）
  for (const edge of graph) {
    if (!edge.condition || evaluateCondition(edge.condition, gc)) {
      addEdge(edge.from, edge.to, edge.time_cost ?? cfg.edge_default_time_cost)
    }
  }

  // 注释：dijkstra（边权全正）
  const dist = new Map<string, number>([[fromId, 0]])
  const prev = new Map<string, string>()
  const visited = new Set<string>()
  const pq: { id: string; d: number }[] = [{ id: fromId, d: 0 }]
  while (pq.length > 0) {
    pq.sort((a, b) => a.d - b.d)
    const cur = pq.shift()!
    if (visited.has(cur.id)) continue
    visited.add(cur.id)
    if (cur.id === toId) break
    for (const edge of adj.get(cur.id) ?? []) {
      if (visited.has(edge.to)) continue
      const nd = cur.d + edge.cost
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd)
        prev.set(edge.to, cur.id)
        pq.push({ id: edge.to, d: nd })
      }
    }
  }
  if (!dist.has(toId)) return null
  // 注释：回溯路径
  const path: string[] = []
  let cur: string | undefined = toId
  while (cur !== undefined) {
    path.unshift(cur)
    cur = prev.get(cur)
  }
  return { path, total_minutes: dist.get(toId)! }
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
    // 注释：NPC AI 寻路（dijkstra，parent 链 + graph 边）——不可达 → null
    findPath: (fromId: string, toId: string): { path: string[]; total_minutes: number } | null => {
      const gc = gameContext.getContext()
      const mod = modLoader.getMod()
      const cfg = mod?.moveConfig ?? { parent_time_cost: 10, child_time_cost: 5, edge_default_time_cost: 10 }
      return findPath(fromId, toId, gc, mod?.graph ?? [], cfg)
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
      // 注释：第 7 轮链路终审发现——玩家移动后 current_location 必须同步
      // （gameContext.moveTo 只改核心 location；玩家实体字段不更新会导致：
      // ① 存档恢复地点错位（save 恢复读 current_location）② NPC 同地点判定失真
      // ③ follow-system 同位置判定失效——此前玩家移动后 current_location 永远停留在旧地点）
      const playerId = gameContext.getContext().player?.id
      if (playerId) {
        const player = entitySystem.get('character', playerId) as any
        if (player) player.current_location = targetLocationId
      }
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
