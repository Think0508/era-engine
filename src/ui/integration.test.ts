// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from './stores/game-store'
import { useUIStore } from './stores/ui-store'
import { commandRegistry } from '../core/command-registry'
import { commandExecutor } from '../core/command-executor'
import { narrativeLog } from '../core/narrative-log'
import { registerNativeCommands, unregisterNativeCommands } from './native-commands'
import { mockPlayer, mockTownSquare, mockTime, mockCharactersAtTownSquare, mockCalendar, mockEquipmentSlots } from './stores/mock-data'

// 注释：集成测试——验证 UI 各组件协同工作
// 不测 Vue 渲染（需 browser 环境），只测数据流和状态管理

describe('UI 集成测试', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    commandRegistry.clear()
    narrativeLog.clear()
    registerNativeCommands()
  })

  it('原生指令注册后可查询', () => {
    expect(commandRegistry.getById('open_player_panel')).toBeDefined()
    expect(commandRegistry.getById('rest')).toBeDefined()
    expect(commandRegistry.getById('save')).toBeDefined()
    expect(commandRegistry.getById('load')).toBeDefined()
    // 注释：move/talk 由插件注册，不在 native-commands 中
    expect(commandRegistry.getById('move')).toBeUndefined()
    expect(commandRegistry.getById('talk')).toBeUndefined()
  })

  it('game-store 填充 mock 数据后状态正确', () => {
    const gameStore = useGameStore()
    gameStore.setPlayer(mockPlayer)
    gameStore.setLocation(mockTownSquare)
    gameStore.setTime(mockTime)
    gameStore.setCharactersAtLocation(mockCharactersAtTownSquare)
    gameStore.setCalendar(mockCalendar)
    gameStore.setEquipmentSlots(mockEquipmentSlots)

    expect(gameStore.player?.name).toBe('玩家')
    expect(gameStore.location?.name).toBe('城镇广场')
    expect(gameStore.charactersAtLocation).toHaveLength(1)
    expect(gameStore.calendar?.month_names).toHaveLength(12)
    expect(gameStore.equipmentSlots).toHaveLength(3)
  })

  it('ui-store 选择角色后 hasSelection 为 true', () => {
    const uiStore = useUIStore()
    expect(uiStore.hasSelection).toBe(false)
    uiStore.selectCharacter('guard')
    expect(uiStore.hasSelection).toBe(true)
    uiStore.clearSelection()
    expect(uiStore.hasSelection).toBe(false)
  })

  it('指令执行包裹 EXECUTING 状态', async () => {
    const gameStore = useGameStore()
    const uiStore = useUIStore()
    gameStore.setPlayer(mockPlayer)

    // 注释：执行 rest 指令（handler 写日志）
    await commandExecutor.execute('rest', {
      uiStore,
      gameStore,
      evaluateCondition: () => true,
    })

    // 注释：执行后日志有条目
    expect(gameStore.narrativeLogEntries.length).toBeGreaterThan(0)
    const lastEntry = gameStore.narrativeLogEntries[gameStore.narrativeLogEntries.length - 1]
    expect(lastEntry.type).toBe('system')
  })

  it('模式栈切换——daily_menu 触发', () => {
    const gameStore = useGameStore()
    expect(gameStore.currentMode).toBe('exploration')
    gameStore.pushMode('daily_menu')
    expect(gameStore.currentMode).toBe('daily_menu')
    gameStore.popMode()
    expect(gameStore.currentMode).toBe('exploration')
  })

  it('EXECUTING 状态切换', () => {
    const gameStore = useGameStore()
    expect(gameStore.isIdle).toBe(true)
    gameStore.setExecutionState('EXECUTING')
    expect(gameStore.isExecuting).toBe(true)
    gameStore.setExecutionState('IDLE')
    expect(gameStore.isIdle).toBe(true)
  })

  it('折叠状态管理', () => {
    const uiStore = useUIStore()
    expect(uiStore.isFolded('status')).toBe(false)
    uiStore.toggleFold('status')
    expect(uiStore.isFolded('status')).toBe(true)
  })

  it('指令编号映射——getByMode 返回 Act_COM', () => {
    const gameStore = useGameStore()
    gameStore.pushMode('exploration')
    const locationCmds = commandRegistry.getByMode('exploration', 'location_commands')
    // 注释：move 已移出 native-commands，rest 仍在
    expect(locationCmds.some(c => c.id === 'rest')).toBe(true)
  })

  it('narrativeLog write + addLogEntry 流程', () => {
    const gameStore = useGameStore()
    // 注释：模拟 bridge 监听——手动调 addLogEntry
    const entry = {
      id: 'test-1',
      text: '测试文本',
      type: 'system',
    }
    gameStore.addLogEntry(entry)
    expect(gameStore.narrativeLogEntries).toHaveLength(1)
    expect(gameStore.narrativeLogEntries[0].text).toBe('测试文本')
  })

  it('unregisterNativeCommands 清除所有原生指令', () => {
    unregisterNativeCommands()
    expect(commandRegistry.getById('open_player_panel')).toBeUndefined()
    expect(commandRegistry.getById('move')).toBeUndefined()
  })
})
