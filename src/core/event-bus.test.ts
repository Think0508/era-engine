import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventBus } from './event-bus'

describe('event-bus', () => {
  beforeEach(() => { eventBus.clear() })

  it('should emit and receive events', async () => {
    const handler = vi.fn()
    eventBus.on('combat:start', handler)
    await eventBus.emit('combat:start', { participants: ['a', 'b'] })
    expect(handler).toHaveBeenCalledWith({ participants: ['a', 'b'] })
  })

  it('should support off', async () => {
    const handler = vi.fn()
    eventBus.on('test', handler)
    eventBus.off('test', handler)
    await eventBus.emit('test', {})
    expect(handler).not.toHaveBeenCalled()
  })

  it('should support once', async () => {
    const handler = vi.fn()
    eventBus.once('test', handler)
    await eventBus.emit('test', {})
    await eventBus.emit('test', {})
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('should catch handler errors without blocking others', async () => {
    const good = vi.fn()
    eventBus.on('test', () => { throw new Error('bad') })
    eventBus.on('test', good)
    await expect(eventBus.emit('test', {})).resolves.not.toThrow()
    expect(good).toHaveBeenCalled()
  })

  it('handler 抛错 → errorReporter 上报（2026-08-12 全面审计：原 catch{} 静默）', async () => {
    const { errorReporter } = await import('./error-reporter')
    errorReporter.clear()
    eventBus.on('boom:event', () => { throw new Error('handler exploded') })
    await eventBus.emit('boom:event', {})
    const errs = errorReporter.getErrors().filter(e => e.severity === 'error' && e.message.includes('boom:event'))
    expect(errs.length).toBeGreaterThan(0)
    expect(errs[0].message).toContain('handler exploded')
  })

  it('should await async handlers serially', async () => {
    const order: string[] = []
    eventBus.on('test', async () => {
      await new Promise(r => setTimeout(r, 50))
      order.push('first')
    })
    eventBus.on('test', async () => {
      order.push('second')
    })
    await eventBus.emit('test', {})
    expect(order).toEqual(['first', 'second'])
  })

  it('should support priority (lower number = earlier)', async () => {
    const order: string[] = []
    eventBus.on('test', () => { order.push('default') }, 10)
    eventBus.on('test', () => { order.push('first') }, 1)
    eventBus.on('test', () => { order.push('second') }, 5)
    await eventBus.emit('test', {})
    expect(order).toEqual(['first', 'second', 'default'])
  })

  it('should support wildcard combat:*', async () => {
    const handler = vi.fn()
    eventBus.on('combat:*', handler)
    await eventBus.emit('combat:start', {})
    await eventBus.emit('combat:end', {})
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('should detect same-tick cycle and break', async () => {
    let count = 0
    const handler = () => {
      count++
      eventBus.emit('test', {})
    }
    eventBus.on('test', handler)
    await eventBus.emit('test', {})
    expect(count).toBe(1)
  })
})
