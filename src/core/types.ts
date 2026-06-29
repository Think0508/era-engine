import type { Component } from 'vue'
import type { CommandDef } from './command-registry'

export interface GameTimeData {
  minute: number
  hour: number
  day: number
  month: number
  year: number
}

export interface LocationData {
  id: string
  name: string
  parent: string | null
  type: string
  tags: string[]
  exits: { target: string; name: string; time_cost?: number }[]
}

export type EntityData = Record<string, any>

export interface GameContext {
  player: EntityData | null
  location: LocationData | null
  time: GameTimeData
  getEntity: (type: string, id: string) => EntityData | null
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
