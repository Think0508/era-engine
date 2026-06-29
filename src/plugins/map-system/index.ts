// 注释：map-system 插件——地图与移动系统
// 职责：注册 move 指令、提供 map API、MapView 渲染（interactive log entry）
// 不参与口上触发——只管移动 + 事件发射
// tags 驱动指令不属于 map-system——消费 tag 的插件自己注册

import type { PluginContext } from '../../core/types'
import type { LocationData } from '../../core/types'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { narrativeLog } from '../../core/narrative-log'
import { commandRegistry } from '../../core/command-registry'
import type { CommandDef } from '../../core/command-registry'

// 注释：onLoad——map-system 无需提前声明
export function onLoad(_ctx: PluginContext): void {
  // 注释：move 指令在 onEnable 中动态注册（不用 plugin.toml [ui]，因为 handler 是真实函数）
}

// 注释：onEnable——注册 map API + move 指令
export function onEnable(ctx: PluginContext): void {
  // 注释：注册 map API
  ctx.api.register('map', {
    // 注释：获取当前地点
    getCurrentLocation: (): LocationData | null => {
      return gameContext.getContext().location
    },
    // 注释：获取某地点的 exits（不传则用当前地点）
    getExits: (locationId?: string): any[] => {
      const id = locationId ?? gameContext.getContext().location?.id
      if (!id) return []
      const loc = entitySystem.get('location', id) as any as LocationData
      return loc?.exits ?? []
    },
    // 注释：获取子地点（parent === locationId 的地点）
    getChildren: (locationId: string): LocationData[] => {
      const result: LocationData[] = []
      // 注释：遍历所有 location 实体
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
    // 注释：移动到目标地点——封装 gameContext.moveTo + 日志输出
    moveTo: async (targetLocationId: string): Promise<void> => {
      const target = entitySystem.get('location', targetLocationId) as any as LocationData
      const targetName = target?.name ?? targetLocationId
      // 注释：输出移动日志
      narrativeLog.write(`你前往${targetName}...`, 'movement', 'map-system')
      await gameContext.moveTo(targetLocationId)
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
    handler: () => {
      // 注释：把 MapView 作为 interactive log entry 写入叙事日志
      const loc = gameContext.getContext().location
      if (!loc) return
      narrativeLog.write('地图', 'map', 'map-system', true, {
        locationId: loc.id,
        exits: loc.exits,
      })
    },
  }
  ctx.commands.register(moveCmd)
}
