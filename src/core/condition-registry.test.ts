import { describe, it, expect, beforeEach } from 'vitest'
import { conditionRegistry } from './condition-registry'

describe('condition-registry', () => {
  beforeEach(() => { conditionRegistry.clear() })

  it('should have builtin fields', () => {
    const fields = conditionRegistry.getAllFields()
    expect(fields.some(f => f.path === 'location.id')).toBe(true)
    expect(fields.some(f => f.path === 'game.time.hour')).toBe(true)
    expect(fields.some(f => f.path === 'location.tags')).toBe(true)
  })

  it('should register fields from attributes', () => {
    conditionRegistry.registerFromAttributes({
      hp: { type: 'number', default: 100, category: 'base' },
      name: { type: 'string', default: '', category: 'base' }
    })
    const fields = conditionRegistry.getAllFields()
    expect(fields.some(f => f.path === 'player.hp')).toBe(true)
    expect(fields.some(f => f.path === 'character.{id}.hp')).toBe(true)
    expect(fields.some(f => f.path === 'player.name')).toBe(true)
  })

  it('should register fields from plugins', () => {
    conditionRegistry.registerFromPlugin('combat-base', {
      'combat.in_progress': { type: 'boolean', description: 'Is combat in progress' }
    })
    const fields = conditionRegistry.getAllFields()
    expect(fields.some(f => f.path === 'combat.in_progress')).toBe(true)
  })

  it('should register fields from bindings', () => {
    conditionRegistry.registerFromBindings({
      'combat-base': { hp: 'hp', mp: 'mp' }
    })
    const fields = conditionRegistry.getAllFields()
    expect(fields.some(f => f.path === 'player.hp' && f.source === 'bindings:combat-base')).toBe(true)
  })

  it('should validate exact field paths', () => {
    expect(conditionRegistry.validateField('location.id')).toBe(true)
    expect(conditionRegistry.validateField('game.time.hour')).toBe(true)
    expect(conditionRegistry.validateField('nonexistent.field')).toBe(false)
  })

  it('should validate pattern field paths (character.{id}.hp)', () => {
    conditionRegistry.registerFromAttributes({
      hp: { type: 'number', default: 100 }
    })
    expect(conditionRegistry.validateField('character.npc1.hp')).toBe(true)
    expect(conditionRegistry.validateField('character.npc1.nonexistent')).toBe(false)
  })

  it('should generate manual in markdown format', () => {
    conditionRegistry.registerFromAttributes({
      hp: { type: 'number', default: 100 }
    })
    const manual = conditionRegistry.generateManual()
    expect(manual).toContain('可用条件属性手册')
    expect(manual).toContain('location.id')
    expect(manual).toContain('player.hp')
    expect(manual).toContain('|')
  })
})
