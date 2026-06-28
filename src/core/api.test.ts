import { describe, it, expect, beforeEach } from 'vitest'
import { apiSystem } from './api'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

describe('api-system', () => {
  beforeEach(() => {
    apiSystem.clear()
    entitySystem.clear()
    bindingResolver.loadBindings({})
  })

  it('should register and call API methods', async () => {
    apiSystem.register('test', {
      greet: async (name: string) => `Hello ${name}`,
    })
    const result = await apiSystem.call('test', 'greet', 'World')
    expect(result).toBe('Hello World')
  })

  it('should throw on duplicate method registration', () => {
    apiSystem.register('test', { greet: async () => {} })
    expect(() => apiSystem.register('test', { greet: async () => {} })).toThrow(
      'duplicate',
    )
  })

  it('should throw on non-existent namespace', async () => {
    await expect(apiSystem.call('nonexistent', 'method')).rejects.toThrow()
  })

  it('should throw on non-existent method', async () => {
    apiSystem.register('test', { greet: async () => {} })
    await expect(apiSystem.call('test', 'nonexistent')).rejects.toThrow()
  })

  it('should have engine core API available', async () => {
    entitySystem.register('character', 'hero', { name: 'Hero' })
    const entity = await apiSystem.call('engine', 'getEntity', 'character', 'hero')
    expect(entity).not.toBeNull()
    expect(entity.name).toBe('Hero')
  })

  it('should support bindings.get via engine API', async () => {
    entitySystem.register('character', 'player', { base: { hp_val: 100 } })
    bindingResolver.loadBindings({ 'combat-base': { hp: 'hp_val' } })
    const hp = await apiSystem.call('engine', 'bindings.get', 'player', 'hp')
    expect(hp).toBe(100)
  })

  it('should support bindings.set via engine API', async () => {
    entitySystem.register('character', 'player', { base: { hp_val: 100 } })
    bindingResolver.loadBindings({ 'combat-base': { hp: 'hp_val' } })
    await apiSystem.call('engine', 'bindings.set', 'player', 'hp', 50)
    expect(await apiSystem.call('engine', 'bindings.get', 'player', 'hp')).toBe(50)
  })

  it('should allow adding methods to existing namespace', () => {
    apiSystem.register('test', { method1: async () => 'a' })
    apiSystem.register('test', { method2: async () => 'b' })
    expect(apiSystem.has('test', 'method1')).toBe(true)
    expect(apiSystem.has('test', 'method2')).toBe(true)
  })
})
