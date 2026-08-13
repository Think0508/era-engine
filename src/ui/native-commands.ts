// 注释：native-commands 原生指令注册
// 引擎启动时通过 CommandRegistry 注册，source='native'
// 被插件覆盖的指令（move/talk/save/load）不在 native-commands 注册，由插件接管

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
    category: 'system',
    priority: 10,
    source: 'native',
    handler: () => {
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

  // 注释：move 由 map-system 插件注册；talk 由 dialogue-system 插件注册

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
      // 注释：打开存档面板（读写合一，对齐 erArk 神经连接柜——空槽直接存/已存在槽操作菜单）
      const uiStore = useUIStore()
      uiStore.setActivePanel('save')
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
      // 注释：与 SAVE 同一面板（erArk 读写一个面板）
      const uiStore = useUIStore()
      uiStore.setActivePanel('save')
    },
  })

  // 注释：退出到标题——autoSave（对齐 erArk 退出自动存）+ 清空会话状态回标题
  commandRegistry.register({
    id: 'exit_to_title',
    label: '退出到标题',
    group: 'main_menu',
    modes: ['exploration', 'daily_menu'],
    priority: 54,
    source: 'native',
    handler: async () => {
      try {
        const { autoSave } = await import('../core/save-system')
        const uiStore = useUIStore()
        await autoSave(uiStore.toSaveData(), '退出自动存档')
      } catch {
        // 注释：自动存失败不阻断退出（尽力而为）
      }
      const uiStore = useUIStore()
      const gameStore = useGameStore()
      uiStore.setActivePanel(null)
      uiStore.clearSelection()
      uiStore.setEventOptions(null)
      gameStore.reset()
      // 注释：⚠️ 2026-08-14 审查修复——此前只清 Pinia，core gameContext 残留旧会话
      // （player/location/time/modeStack）——回标题后若直接新游戏，core 与 UI 状态脱节
      const { gameContext } = await import('../core/game-context')
      gameContext.reset()
      // 注释：⚠️ 2026-08-14 第四轮审查——世界卸载：清空实体池（否则"退出到标题→新游戏"
      // 时实体残留旧会话运行时数据——移动/物品/状态污染新游戏；mod 静态数据因
      // 深拷贝注册保持纯净，resetWorld 可从初始数据重建）
      const { modLoader } = await import('../core/mod-loader')
      modLoader.resetWorld()
      uiStore.setGameScreen('title')
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

  commandRegistry.register({
    id: 'log_history',
    label: '日志',
    group: 'main_menu',
    modes: ['exploration'],
    priority: 53,
    source: 'native',
    handler: () => {
      const gameStore = useGameStore()
      gameStore.pushMode('log')
    },
  })

  // 注释：@命令调试——默认隐藏，在选项作弊面板开启
  const AT_CMDS = [
    { id: '@attrs', label: '@查看属性', handler: () => {
      const gs = useGameStore()
      gs.addLogEntry({ id: `@attrs-${Date.now()}`, text: `属性查看功能开发中`, type: 'system', source: 'native' })
    }},
    { id: '@setattr', label: '@设置属性', handler: () => {
      useGameStore().addLogEntry({ id: `@set-${Date.now()}`, text: `@setattr 属性名 值`, type: 'system', source: 'native' })
    }},
    { id: '@teleport', label: '@传送', handler: () => {
      useGameStore().addLogEntry({ id: `@tel-${Date.now()}`, text: `@teleport 地点ID`, type: 'system', source: 'native' })
    }},
    { id: '@spawn', label: '@生成角色', handler: () => {
      useGameStore().addLogEntry({ id: `@sp-${Date.now()}`, text: `@spawn 模板ID 地点ID`, type: 'system', source: 'native' })
    }},
    { id: '@additem', label: '@添加物品', handler: () => {
      useGameStore().addLogEntry({ id: `@ai-${Date.now()}`, text: `@additem 物品ID 数量`, type: 'system', source: 'native' })
    }},
    { id: '@startquest', label: '@开始任务', handler: () => {
      useGameStore().addLogEntry({ id: `@sq-${Date.now()}`, text: `@startquest 任务ID`, type: 'system', source: 'native' })
    }},
    { id: '@errors', label: '@查看错误', handler: () => {
      useGameStore().addLogEntry({ id: `@err-${Date.now()}`, text: `查看控制台错误`, type: 'system', source: 'native' })
    }},
    { id: '@premises', label: '@前提列表', handler: async () => {
      const { conditionEngine } = await import('../core/condition-engine')
      const ids = conditionEngine.getRegisteredPremiseIds()
      useGameStore().addLogEntry({ id: `@pre-${Date.now()}`, text: `已注册前提(${ids.length}): ${ids.join(', ')}`, type: 'system', source: 'native' })
    }},
    { id: '@help', label: '@帮助', handler: () => {
      useGameStore().addLogEntry({ id: `@hlp-${Date.now()}`, text: `@命令列表: @attrs/@setattr/@teleport/@spawn/@additem/@startquest/@premises/@errors/@help/@testcombat`, type: 'system', source: 'native' })
    }},
    { id: '@testcombat', label: '@测试战斗', handler: async () => {
      const uiStore = useUIStore()
      if (!uiStore.selectedCharacterId) {
        useGameStore().addLogEntry({ id: `@tc-${Date.now()}`, text: `请先选中一个角色`, type: 'system', source: 'native' })
        return
      }
      const { eventBus } = await import('../core/event-bus')
      const gs = useGameStore()
      gs.addLogEntry({ id: `@tc-${Date.now()}`, text: `与 ${uiStore.selectedCharacterId} 战斗！`, type: 'system', source: 'native' })
      await eventBus.emit('combat:request', { enemies: [uiStore.selectedCharacterId] })
    }},
  ]
  for (const c of AT_CMDS) {
    commandRegistry.register({
      id: c.id, label: c.label, group: 'main_menu',
      modes: ['exploration', 'daily_menu', 'combat'], priority: 99,
      source: 'native', handler: c.handler,
    })
  }
}

// 注释：卸载原生指令
export function unregisterNativeCommands(): void {
  const ids = [
    'open_player_panel', 'open_selected_panel',
    'cheat_skip_day', 'save', 'load', 'options', 'log_history', 'exit_to_title',
    '@attrs', '@setattr', '@teleport', '@spawn', '@additem', '@startquest', '@premises', '@errors', '@help', '@testcombat',
  ]
  for (const id of ids) {
    commandRegistry.unregister(id)
  }
}
