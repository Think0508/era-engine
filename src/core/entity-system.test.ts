import { describe, it, expect, beforeEach } from 'vitest'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

describe('entity-system', () => {
  beforeEach(() => {
    entitySystem.clear()
  })

  it('should register and retrieve entities by type and id', () => {
    entitySystem.register('character', 'hero', { name: 'Hero', base: { hp: 100 } })
    const hero = entitySystem.get('character', 'hero')
    expect(hero).not.toBeNull()
    expect(hero!.base.hp).toBe(100)
  })

  it('should throw on duplicate id within same type', () => {
    entitySystem.register('character', 'hero', {})
    expect(() => entitySystem.register('character', 'hero', {})).toThrow(
      'ID重复',
    )
  })

  it('should allow same id across different types', () => {
    entitySystem.register('character', 'hero', {})
    expect(() => entitySystem.register('item', 'hero', {})).not.toThrow()
  })

  it('should return all entities of a type', () => {
    entitySystem.register('character', 'a', {})
    entitySystem.register('character', 'b', {})
    expect(entitySystem.getAll('character').length).toBe(2)
  })

  it('should return null when getting non-existent entity', () => {
    expect(entitySystem.get('character', 'missing')).toBeNull()
  })

  it('should return empty array when getting all of non-existent type', () => {
    expect(entitySystem.getAll('nonexistent_type')).toEqual([])
  })

  it('should clear all entities', () => {
    entitySystem.register('character', 'a', {})
    entitySystem.register('item', 'b', {})
    entitySystem.clear()
    expect(entitySystem.get('character', 'a')).toBeNull()
    expect(entitySystem.get('item', 'b')).toBeNull()
    expect(entitySystem.getAll('character')).toEqual([])
  })
})

describe('binding-resolver', () => {
  beforeEach(() => {
    entitySystem.clear()
    bindingResolver.loadBindings({})
  })

  it('should resolve bound attribute', () => {
    entitySystem.register('character', 'player', {
      base: { hp_val: 100, mp_val: 50 },
    })
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp_val', mp: 'mp_val' },
    })

    expect(bindingResolver.get('player', 'hp')).toBe(100)
    expect(bindingResolver.get('player', 'mp')).toBe(50)
  })

  it('should set bound attribute', () => {
    entitySystem.register('character', 'player', { base: { hp_val: 100 } })
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp_val' },
    })

    bindingResolver.set('player', 'hp', 50)
    expect(bindingResolver.get('player', 'hp')).toBe(50)
  })

  it('should report missing bindings', () => {
    const errors = bindingResolver.validateRequired(
      'combat-base',
      { hp: { type: 'number', description: '血量' } },
      'test-mod',
    )
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('缺少绑定')
  })

  it('should return empty errors when all required bindings are present', () => {
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp_val', mp: 'mp_val' },
    })
    const errors = bindingResolver.validateRequired(
      'combat-base',
      {
        hp: { type: 'number', description: '血量' },
        mp: { type: 'number', description: '内力' },
      },
      'test-mod',
    )
    expect(errors).toEqual([])
  })

  it('should return null when getting non-existent entity', () => {
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp_val' },
    })
    expect(bindingResolver.get('missing_char', 'hp')).toBeNull()
  })

  it('should throw when setting on non-existent entity', () => {
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp_val' },
    })
    expect(() => bindingResolver.set('missing_char', 'hp', 50)).toThrow(
      '不存在',
    )
  })

  it('should return null when getting non-existent pluginKey', () => {
    entitySystem.register('character', 'player', { base: { hp_val: 100 } })
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp_val' },
    })
    expect(bindingResolver.get('player', 'unknown_key')).toBeNull()
  })
})
