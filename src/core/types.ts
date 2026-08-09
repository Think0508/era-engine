import type { Component } from 'vue'
import type { CommandDef } from './command-registry'

export interface GameTimeData {
  minute: number
  hour: number
  day: number
  month: number
  year: number
}

export interface Edge {
  from: string
  to: string
  time_cost: number
  condition?: string
}

export interface MapLayoutClickZone {
  x: number
  y: number
  w: number
  h: number
}

export interface MapLayoutNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  clickZones: MapLayoutClickZone[]
  zoom: [number, number]
}

export interface MapLayoutEdge {
  from: string
  to: string
  path: { x: number; y: number }[]
  zoom: [number, number]
}

export interface MapLayout {
  version: number
  background?: string
  nodes: MapLayoutNode[]
  edges: MapLayoutEdge[]
  subMaps: Record<string, string>
  zoomLevels: number
}

export interface MoveConfig {
  parent_time_cost: number
  child_time_cost: number
  edge_default_time_cost: number
}

export interface LocationData {
  id: string
  name: string
  parent: string | null
  type: string
  tags: string[]
}

export type EntityData = Record<string, any>

export interface GameContext {
  player: EntityData | null
  location: LocationData | null
  time: GameTimeData
  getEntity: (type: string, id: string) => EntityData | null
  selectedCharacterId?: string
  // 注释：实体字段别名（插件注册，如 status → status_effects）——core 不认知具体别名
  fieldAliases?: Record<string, string>
  // 注释：关系组（关系系统 v2）——组名 → 展开后的类型名列表（mod 加载后注入）
  relationGroups?: Record<string, string[]>
}

export interface UISlotItem {
  id: string
  component: Component
  priority: number
  condition?: (ctx: GameContext) => boolean
}

export interface PluginContext {
  api: {
    register: (namespace: string, methods: Record<string, Function>) => void
    call: (namespace: string, method: string, ...args: any[]) => Promise<any>
  }
  // 注释：指令注册——插件通过此方法动态注册指令（不通过 plugin.toml）
  commands: {
    register: (cmd: CommandDef) => void
    unregister: (id: string) => void
  }
  ui: {
    registerSlot: (slotName: string, item: UISlotItem) => void
  }
  parent: {
    api: Record<string, any>
  } | null
  events: {
    on: (event: string, handler: Function, priority?: number) => void
    off: (event: string, handler: Function) => void
    emit: (event: string, payload: any) => Promise<void>
  }
  gameState: {
    currentLocation: LocationData | null
    player: EntityData | null
    time: GameTimeData
  }
}
