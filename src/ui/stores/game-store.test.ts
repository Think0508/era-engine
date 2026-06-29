// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from './game-store'

describe('game-store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('pushMode/popMode 栈行为', () => {
    const store = useGameStore()
    expect(store.currentMode).toBe('exploration')
    store.pushMode('combat')
    expect(store.currentMode).toBe('combat')
    store.pushMode('dialogue')
    expect(store.currentMode).toBe('dialogue')
    const popped = store.popMode()
    expect(popped).toBe('dialogue')
    expect(store.currentMode).toBe('combat')
    store.popMode()
    expect(store.currentMode).toBe('exploration')
  })

  it('executionState 切换', () => {
    const store = useGameStore()
    expect(store.isIdle).toBe(true)
    expect(store.isExecuting).toBe(false)
    store.setExecutionState('EXECUTING')
    expect(store.isExecuting).toBe(true)
    expect(store.isIdle).toBe(false)
    store.setExecutionState('IDLE')
    expect(store.isIdle).toBe(true)
  })

  it('addLogEntry 超过 1000 条淘汰最旧', () => {
    const store = useGameStore()
    for (let i = 0; i < 1005; i++) {
      store.addLogEntry({ id: `entry-${i}`, text: `line ${i}`, type: 'system' })
    }
    expect(store.narrativeLogEntries).toHaveLength(1000)
    // 注释：最旧的 5 条被淘汰，保留 entry-5 到 entry-1004
    expect(store.narrativeLogEntries[0].id).toBe('entry-5')
    expect(store.narrativeLogEntries[999].id).toBe('entry-1004')
  })

  it('markLogConsumed', () => {
    const store = useGameStore()
    store.addLogEntry({ id: 'map-1', text: '地图', type: 'map', interactive: true })
    expect(store.narrativeLogEntries[0].consumed).toBeUndefined()
    store.markLogConsumed('map-1')
    expect(store.narrativeLogEntries[0].consumed).toBe(true)
  })

  it('clearLogEntries', () => {
    const store = useGameStore()
    store.addLogEntry({ id: '1', text: 'a', type: 'system' })
    store.addLogEntry({ id: '2', text: 'b', type: 'dialogue' })
    store.clearLogEntries()
    expect(store.narrativeLogEntries).toHaveLength(0)
  })

  it('reset 清空所有状态', () => {
    const store = useGameStore()
    store.setPlayer({ id: 'player', name: '玩家' })
    store.pushMode('combat')
    store.setExecutionState('EXECUTING')
    store.addLogEntry({ id: '1', text: 'a', type: 'system' })
    store.reset()
    expect(store.player).toBeNull()
    expect(store.currentMode).toBe('exploration')
    expect(store.isIdle).toBe(true)
    expect(store.narrativeLogEntries).toHaveLength(0)
  })
})
