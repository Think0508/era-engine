import { describe, it, expect, beforeEach } from 'vitest'
import { useRegistry } from './use-registry'

describe('useRegistry', () => {
  beforeEach(() => useRegistry.clear())
  it('内置 use 值已注册', () => {
    expect(useRegistry.has('self')).toBe(true)
    expect(useRegistry.has('gift')).toBe(true)
  })
  it('register 后 has 为 true', () => {
    useRegistry.register('learn')
    expect(useRegistry.has('learn')).toBe(true)
  })
})
