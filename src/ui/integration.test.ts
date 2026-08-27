// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from './stores/game-store'
import { useUIStore } from './stores/ui-store'
import { commandRegistry } from '../core/command-registry'
import { commandExecutor } from '../core/command-executor'
import { gameContext } from '../core/game-context'
import { eventBus } from '../core/event-bus'
import { apiSystem } from '../core/api'
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
    expect(commandRegistry.getById('log_history')).toBeDefined()
    expect(commandRegistry.getById('save')).toBeDefined()
    expect(commandRegistry.getById('load')).toBeDefined()
    expect(commandRegistry.getById('item')).toBeDefined()
    // 注释：move/talk 由插件注册，不在 native-commands 中
    expect(commandRegistry.getById('move')).toBeUndefined()
    expect(commandRegistry.getById('talk')).toBeUndefined()
    // 注释：rest 已从 native-commands 移除（067a068f）
    expect(commandRegistry.getById('rest')).toBeUndefined()
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

  it('指令执行包裹 EXECUTING 状态（audit-d I-4 修复：原假绿——ctx 无 engine 不查状态）', async () => {
    const gameStore = useGameStore()
    const uiStore = useUIStore()
    gameStore.setPlayer(mockPlayer)
    gameContext.setExecutionState('IDLE')

    // 注释：真实事件断言——execution_start/end 必须达事件总线（audit-d C-1：假桩会断链）
    const events: string[] = []
    const h1 = () => { events.push('start') }
    const h2 = () => { events.push('end') }
    eventBus.on('game:execution_start', h1)
    eventBus.on('game:execution_end', h2)

    await commandExecutor.execute('cheat_skip_day', {
      uiStore,
      gameStore,
      api: apiSystem,
      engine: gameContext,
      evaluateCondition: () => true,
      sourceId: mockPlayer.id,
    })

    eventBus.off('game:execution_start', h1)
    eventBus.off('game:execution_end', h2)

    expect(events).toEqual(['start', 'end'])
    expect(gameContext.getExecutionState()).toBe('IDLE')
    // 注释：执行后日志有条目
    expect(gameStore.narrativeLogEntries.length).toBeGreaterThan(0)
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
    const mainMenuCmds = commandRegistry.getByMode('exploration', 'main_menu')
    // 注释：move/rest 已移出 native-commands，main_menu 组仍有原生指令
    expect(mainMenuCmds.some(c => c.id === 'log_history')).toBe(true)
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

  it('bridge 叙事链：narrativeLog.write → eventBus → bridge → gameStore.addLogEntry', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const gameStore = useGameStore()
    const { EngineUIBridge } = await import('./engine-ui-bridge')
    const { narrativeLog } = await import('../core/narrative-log')
    const { eventBus } = await import('../core/event-bus')
    const { gameContext } = await import('../core/game-context')

    const bridge = new EngineUIBridge(pinia)
    narrativeLog.setEventBus(eventBus)
    narrativeLog.clear()
    bridge.start()
    // 注释：bridge.start() 会同步选中角色到核心
    gameContext.setSelectedCharacterId('guard')
    expect(gameContext.getContext().selectedCharacterId).toBe('guard')

    narrativeLog.write('bridge 叙事测试', 'dialogue', 'test')
    // 注释：narrative:written 是异步 fire-and-forget——等一个宏任务
    await new Promise(r => setTimeout(r, 0))
    expect(gameStore.narrativeLogEntries.some(e => e.text === 'bridge 叙事测试')).toBe(true)

    bridge.stop()
  })

  it('unregisterNativeCommands 清除所有原生指令', () => {
    unregisterNativeCommands()
    expect(commandRegistry.getById('open_player_panel')).toBeUndefined()
    expect(commandRegistry.getById('move')).toBeUndefined()
  })
})
