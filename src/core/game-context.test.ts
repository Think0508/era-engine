import { describe, it, expect, beforeEach, vi } from 'vitest'
import { gameContext } from './game-context'
import { eventBus } from './event-bus'

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
})
