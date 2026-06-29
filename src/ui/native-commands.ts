// 注释：native-commands 原生指令注册
// 引擎启动时通过 CommandRegistry 注册，source='native'
// mod 可通过 ui-overrides.toml override（TODO: 后续阶段实现解析）
// handler 函数走 NativeCommandContext（不是 PluginContext）
// Phase 5 原生指令全 handler 类（不触发 effect-system）

import { commandRegistry } from '../core/command-registry'
import { useUIStore } from './stores/ui-store'
import { useGameStore } from './stores/game-store'

// 注释：注册原生指令——在引擎初始化后调用
export function registerNativeCommands(): void {
  // 注释：Ex_COM（main_menu）——跨模式稳定
  commandRegistry.register({
    id: 'open_player_panel',
    label: '能力显示(主角)',
    group: 'main_menu',
    modes: ['exploration', 'daily_menu', 'combat'],
    priority: 10,
    source: 'native',
    handler: () => {
      // TODO(task-5.14): CharacterPanel(target='player')
      const uiStore = useUIStore()
      uiStore.setActivePanel('character-player')
    },
  })

  commandRegistry.register({
    id: 'open_selected_panel',
    label: '能力显示',
    group: 'main_menu',
    modes: ['exploration', 'combat'],
    priority: 11,
    condition: 'selected != null',
    source: 'native',
    handler: () => {
      const uiStore = useUIStore()
      if (uiStore.selectedCharacterId) {
        uiStore.setActivePanel('character-npc')
      }
    },
  })

  commandRegistry.register({
    id: 'move',
    label: '移动',
    group: 'location_commands',
    modes: ['exploration'],
    priority: 5,
    source: 'native',
    handler: () => {
      // TODO(task-5.11): MapView 作为 interactive entry 渲染
      const gameStore = useGameStore()
      // 注释：临时——写一条 map 类型的日志条目
      gameStore.addLogEntry({
        id: `map-${Date.now()}`,
        text: '地图',
        type: 'map',
        source: 'native',
        interactive: true,
        payload: { locationId: gameStore.location?.id },
      })
    },
  })

  commandRegistry.register({
    id: 'talk',
    label: '交谈',
    group: 'character_commands',
    modes: ['exploration'],
    priority: 10,
    condition: 'selected != null',
    source: 'native',
    handler: () => {
      // TODO(task-5.15): bridge 接入后触发对话系统
      const gameStore = useGameStore()
      const uiStore = useUIStore()
      if (uiStore.selectedCharacterId) {
        gameStore.addLogEntry({
          id: `talk-${Date.now()}`,
          text: `与 ${uiStore.selectedCharacterId} 交谈...（对话系统 Phase 7 实现）`,
          type: 'dialogue',
          source: 'native',
        })
      }
    },
  })

  commandRegistry.register({
    id: 'rest',
    label: '休息',
    group: 'location_commands',
    modes: ['exploration'],
    priority: 20,
    source: 'native',
    handler: () => {
      const gameStore = useGameStore()
      gameStore.addLogEntry({
        id: `rest-${Date.now()}`,
        text: '你休息了一会儿，恢复了一些体力。（休息系统 Phase 6+ 实现）',
        type: 'system',
        source: 'native',
      })
    },
  })

  // 注释：@测试：跳到明天——供 Phase 5 测试每日菜单触发
  // TODO(phase-11): 作弊面板实现后移除
  commandRegistry.register({
    id: 'cheat_skip_day',
    label: '@测试：跳到明天',
    group: 'main_menu',
    modes: ['exploration'],
    priority: 90,
    source: 'native',
    handler: async () => {
      const gameStore = useGameStore()
      // 注释：推进时间到第二天 8:00（模拟新天）
      gameStore.setTime({ minute: 0, hour: 8, day: gameStore.time.day + 1, month: gameStore.time.month, year: gameStore.time.year })
      gameStore.addLogEntry({
        id: `newday-${Date.now()}`,
        text: '时间跳到第二天...',
        type: 'system',
        source: 'native',
      })
      // 注释：触发每日菜单模式
      // TODO(task-5.15): bridge 接入后通过 core 的 game:new_day 事件触发
      gameStore.pushMode('daily_menu')
    },
  })

  commandRegistry.register({
    id: 'save',
    label: 'SAVE',
    group: 'main_menu',
    modes: ['exploration', 'daily_menu'],
    priority: 50,
    source: 'native',
    handler: () => {
      const gameStore = useGameStore()
      gameStore.addLogEntry({
        id: `save-${Date.now()}`,
        text: '存档功能开发中（Phase 11 实现）',
        type: 'system',
        source: 'native',
      })
    },
  })

  commandRegistry.register({
    id: 'load',
    label: 'LOAD',
    group: 'main_menu',
    modes: ['exploration', 'daily_menu'],
    priority: 51,
    source: 'native',
    handler: () => {
      const gameStore = useGameStore()
      gameStore.addLogEntry({
        id: `load-${Date.now()}`,
        text: '读档功能开发中（Phase 11 实现）',
        type: 'system',
        source: 'native',
      })
    },
  })

  commandRegistry.register({
    id: 'options',
    label: '选项',
    group: 'main_menu',
    modes: ['exploration', 'daily_menu', 'combat'],
    priority: 52,
    source: 'native',
    handler: () => {
      const uiStore = useUIStore()
      uiStore.setActivePanel('options')
    },
  })
}

// 注释：卸载原生指令
export function unregisterNativeCommands(): void {
  const ids = [
    'open_player_panel', 'open_selected_panel', 'move', 'talk', 'rest',
    'cheat_skip_day', 'save', 'load', 'options',
  ]
  for (const id of ids) {
    commandRegistry.unregister(id)
  }
}
