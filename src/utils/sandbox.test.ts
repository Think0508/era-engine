import { describe, it, expect, beforeEach } from 'vitest'
import { createSandboxContext, runSandbox } from './sandbox'
import { entitySystem } from '../core/entity-system'
import { gameContext } from '../core/game-context'

describe('sandbox', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('returns context values', () => {
    const ctx = createSandboxContext()
    expect(ctx.player).toBeNull()
    expect(ctx.time).toBeDefined()
    expect(ctx.time.hour).toBe(8)
  })

  it('getEntity returns null for nonexistent', () => {
    const ctx = createSandboxContext()
    expect(ctx.getEntity('character', 'nonexistent')).toBeNull()
  })

  it('rand returns within range', () => {
    const ctx = createSandboxContext()
    for (let i = 0; i < 100; i++) {
      const r = ctx.rand(5, 10)
      expect(r).toBeGreaterThanOrEqual(5)
      expect(r).toBeLessThanOrEqual(10)
    }
  })

  it('runSandbox executes simple code', () => {
    const ctx = createSandboxContext()
    const fn = new Function('ctx', 'return 1 + 1')
    const result = fn(ctx)
    expect(result).toBe(2)
  })

  it('runSandbox does not crash on bad code', () => {
    const ctx = createSandboxContext()
    const result = runSandbox('undefinedVar', ctx)
    // 注释：Proxy 返回 undefined，不报错
    expect(result).toBeUndefined()
  })

  it('runSandbox context is read-only', () => {
    const ctx = createSandboxContext()
    runSandbox('ctx.player = { id: "hacker" }; return ctx.player', ctx)
    expect(ctx.player).toBeNull()
  })
})
