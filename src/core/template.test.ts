import { describe, it, expect } from 'vitest'
import { deepMerge, resolveTemplate } from './template'
import type { EntityData } from './types'

describe('deepMerge', () => {
  it('should override primitive values', () => {
    const parent = { hp: 100, name: 'base' }
    const child = { hp: 200 }
    expect(deepMerge(parent, child)).toEqual({ hp: 200, name: 'base' })
  })

  it('should deep merge objects', () => {
    const parent = { base: { hp: 100, mp: 50 } }
    const child = { base: { hp: 200 } }
    expect(deepMerge(parent, child)).toEqual({ base: { hp: 200, mp: 50 } })
  })

  it('should replace arrays (not append)', () => {
    const parent = { tags: ['a', 'b'] }
    const child = { tags: ['c'] }
    expect(deepMerge(parent, child)).toEqual({ tags: ['c'] })
  })

  it('should remove keys set to null', () => {
    const parent = { hp: 100, mp: 50 }
    const child = { hp: null as any }
    expect(deepMerge(parent, child)).toEqual({ mp: 50 })
  })

  it('should handle nested object deep merge across multiple levels', () => {
    const parent = { base: { stats: { hp: 100, mp: 50 }, name: 'p' } }
    const child = { base: { stats: { hp: 200 } } }
    expect(deepMerge(parent, child)).toEqual({
      base: { stats: { hp: 200, mp: 50 }, name: 'p' },
    })
  })

  it('should combine array replacement and null removal in one merge', () => {
    const parent = { tags: ['a', 'b'], hp: 100, mp: 50, name: 'p' }
    const child = { tags: ['c'], hp: null as any }
    expect(deepMerge(parent, child)).toEqual({ tags: ['c'], mp: 50, name: 'p' })
  })

  it('should not mutate inputs', () => {
    const parent = { base: { hp: 100, mp: 50 } }
    const child = { base: { hp: 200 } }
    deepMerge(parent, child)
    expect(parent).toEqual({ base: { hp: 100, mp: 50 } })
    expect(child).toEqual({ base: { hp: 200 } })
  })
})

describe('resolveTemplate', () => {
  it('should resolve single-level template', () => {
    const templates = new Map<string, EntityData>()
    templates.set('base', { id: 'base', base: { hp: 100, mp: 50 } })
    templates.set('hero', { id: 'hero', extends: 'base', base: { hp: 200 } })

    const result = resolveTemplate('hero', templates)
    expect(result.base).toEqual({ hp: 200, mp: 50 })
  })

  it('should resolve multi-level inheritance (A → B → C)', () => {
    const templates = new Map<string, EntityData>()
    templates.set('a', {
      id: 'a',
      base: { hp: 100, mp: 50, attack: 10 },
      tags: ['human'],
    })
    templates.set('b', {
      id: 'b',
      extends: 'a',
      base: { hp: 150, defense: 5 },
      tags: ['warrior'],
    })
    templates.set('c', {
      id: 'c',
      extends: 'b',
      base: { mp: 80 },
      name: 'hero_c',
    })

    const result = resolveTemplate('c', templates)
    expect(result.base).toEqual({
      hp: 150,
      mp: 80,
      attack: 10,
      defense: 5,
    })
    expect(result.tags).toEqual(['warrior'])
    expect(result.name).toBe('hero_c')
  })

  it('should return a copy when template has no extends', () => {
    const templates = new Map<string, EntityData>()
    templates.set('solo', { id: 'solo', base: { hp: 100 }, name: 'solo' })

    const result = resolveTemplate('solo', templates)
    expect(result).toEqual({ id: 'solo', base: { hp: 100 }, name: 'solo' })
    expect(result).not.toBe(templates.get('solo'))
    expect(result.base).not.toBe(templates.get('solo')!.base)
  })

  it('should detect circular inheritance', () => {
    const templates = new Map<string, EntityData>()
    templates.set('a', { id: 'a', extends: 'b' })
    templates.set('b', { id: 'b', extends: 'a' })

    expect(() => resolveTemplate('a', templates)).toThrow('循环继承')
  })

  it('should detect longer circular inheritance chain (A → B → C → A)', () => {
    const templates = new Map<string, EntityData>()
    templates.set('a', { id: 'a', extends: 'b' })
    templates.set('b', { id: 'b', extends: 'c' })
    templates.set('c', { id: 'c', extends: 'a' })

    expect(() => resolveTemplate('a', templates)).toThrow('循环继承')
  })

  it('should throw if parent template not found', () => {
    const templates = new Map<string, EntityData>()
    templates.set('hero', { id: 'hero', extends: 'nonexistent' })

    expect(() => resolveTemplate('hero', templates)).toThrow('父模板')
  })

  it('should throw if template id itself not found', () => {
    const templates = new Map<string, EntityData>()

    expect(() => resolveTemplate('missing', templates)).toThrow('missing')
  })

  it('should allow the same parent to be inherited by siblings (diamond not circular)', () => {
    const templates = new Map<string, EntityData>()
    templates.set('base', { id: 'base', base: { hp: 100 } })
    templates.set('hero1', { id: 'hero1', extends: 'base', base: { mp: 50 } })
    templates.set('hero2', { id: 'hero2', extends: 'base', base: { mp: 80 } })

    expect(resolveTemplate('hero1', templates).base).toEqual({ hp: 100, mp: 50 })
    expect(resolveTemplate('hero2', templates).base).toEqual({ hp: 100, mp: 80 })
  })
})
