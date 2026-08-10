import { describe, it, expect, beforeEach, vi } from 'vitest'
import { gameContext } from './game-context'
import { eventBus } from './event-bus'
import { entitySystem } from './entity-system'

describe('game-context', () => {
  beforeEach(() => {
    gameContext.reset()
    eventBus.clear()
  })

  it('should provide context snapshot with initial values', () => {
    const ctx = gameContext.getContext()
    expect(ctx.player).toBeNull()
    expect(ctx.location).toBeNull()
    expect(ctx.time.hour).toBe(8)
    expect(ctx.time.minute).toBe(0)
    expect(ctx.time.day).toBe(1)
  })

  it('should advance time by minutes', () => {
    gameContext.advanceTime(30)
    const ctx = gameContext.getContext()
    expect(ctx.time.minute).toBe(30)
    expect(ctx.time.hour).toBe(8)
  })

  it('should roll over minutes to hours', () => {
    gameContext.advanceTime(60)
    const ctx = gameContext.getContext()
    expect(ctx.time.minute).toBe(0)
    expect(ctx.time.hour).toBe(9)
  })

  it('should emit game:hour_changed when hour changes', async () => {
    const handler = vi.fn()
    eventBus.on('game:hour_changed', handler)
    await gameContext.advanceTime(60)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should emit game:hour_changed for each hour crossed', async () => {
    const handler = vi.fn()
    eventBus.on('game:hour_changed', handler)
    await gameContext.advanceTime(150) // 2 hours 30 min
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('should roll over hours to days and emit game:new_day', async () => {
    const newDayHandler = vi.fn()
    eventBus.on('game:new_day', newDayHandler)
    // Advance from hour 8 to hour 1 next day (17 hours = 1020 min)
    await gameContext.advanceTime(1020)
    const ctx = gameContext.getContext()
    expect(ctx.time.hour).toBe(1)
    expect(ctx.time.day).toBe(2)
    expect(newDayHandler).toHaveBeenCalledTimes(1)
  })

  it('should emit game:night_start at hour 22', async () => {
    const nightHandler = vi.fn()
    eventBus.on('game:night_start', nightHandler)
    // Advance from hour 8 to hour 22 (14 hours = 840 min)
    await gameContext.advanceTime(840)
    expect(nightHandler).toHaveBeenCalledTimes(1)
  })

  it('should return a copy of time (not mutable reference)', () => {
    const ctx1 = gameContext.getContext()
    ctx1.time.hour = 99
    const ctx2 = gameContext.getContext()
    expect(ctx2.time.hour).toBe(8)
  })

  // 注释：以下为 Phase 5 新增方法的测试

  it('setExecutionState/getExecutionState', () => {
    expect(gameContext.getExecutionState()).toBe('IDLE')
    gameContext.setExecutionState('EXECUTING')
    expect(gameContext.getExecutionState()).toBe('EXECUTING')
    gameContext.setExecutionState('IDLE')
    expect(gameContext.getExecutionState()).toBe('IDLE')
  })

  it('enterMode/exitMode 模式栈行为', async () => {
    expect(gameContext.getCurrentMode()).toBe('exploration')
    await gameContext.enterMode('combat')
    expect(gameContext.getCurrentMode()).toBe('combat')
    await gameContext.enterMode('dialogue')
    expect(gameContext.getCurrentMode()).toBe('dialogue')
    const popped = await gameContext.exitMode()
    expect(popped).toBe('dialogue')
    expect(gameContext.getCurrentMode()).toBe('combat')
    await gameContext.exitMode()
    expect(gameContext.getCurrentMode()).toBe('exploration')
  })

  it('enterMode/exitMode emit game:mode_changed', async () => {
    const handler = vi.fn()
    eventBus.on('game:mode_changed', handler)
    await gameContext.enterMode('combat')
    expect(handler).toHaveBeenCalledWith({ mode: 'combat', action: 'enter' })
    await gameContext.exitMode()
    expect(handler).toHaveBeenCalledWith({ mode: 'combat', action: 'exit' })
  })

  it('moveTo emit location:leave 和 location:enter', async () => {
    entitySystem.clear()
    entitySystem.register('location', 'town', {
      id: 'town', name: '城镇', parent: null, type: 'building', tags: [],
    })
    entitySystem.register('location', 'forest', {
      id: 'forest', name: '森林', parent: null, type: 'field', tags: [],
    })
    gameContext.setLocation(entitySystem.get('location', 'town') as any)

    const leaveHandler = vi.fn()
    const enterHandler = vi.fn()
    eventBus.on('location:leave', leaveHandler)
    eventBus.on('location:enter', enterHandler)

    await gameContext.moveTo('forest', 10)

    expect(leaveHandler).toHaveBeenCalledBefore(enterHandler)
    expect(leaveHandler).toHaveBeenCalledWith({ from: 'town' })
    // 注释：2026-08-10 enter payload 增加 from（跟随系统按"同位置"判定的消费方）
    expect(enterHandler).toHaveBeenCalledWith({ to: 'forest', from: 'town' })
    expect(gameContext.getContext().location?.id).toBe('forest')
    expect(gameContext.getContext().time.minute).toBe(10)
  })

  it('moveTo 使用默认 timeCost 5 分钟', async () => {
    entitySystem.clear()
    entitySystem.register('location', 'town', {
      id: 'town', name: '城镇', parent: null, type: 'building', tags: [],
    })
    entitySystem.register('location', 'forest', {
      id: 'forest', name: '森林', parent: null, type: 'field', tags: [],
    })
    gameContext.setLocation(entitySystem.get('location', 'town') as any)

    await gameContext.moveTo('forest')

    expect(gameContext.getContext().time.minute).toBe(5)
  })

  it('game:new_day payload 带 reason 字段', async () => {
    const newDayHandler = vi.fn()
    eventBus.on('game:new_day', newDayHandler)
    // 注释：从 hour 8 推进到第二天（17 hours = 1020 min）
    await gameContext.advanceTime(1020)
    expect(newDayHandler).toHaveBeenCalledTimes(1)
    // 注释：reason 默认 'natural'（自然时间流逝）
    expect(newDayHandler.mock.calls[0][0].reason).toBe('natural')
  })
})
