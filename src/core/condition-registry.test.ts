import { describe, it, expect, beforeEach } from 'vitest'
import { conditionRegistry } from './condition-registry'
import { conditionEngine } from './condition-engine'

describe('condition-registry', () => {
  beforeEach(() => { conditionRegistry.clear() })

  it('validateExpression——premise(X) 命名引用参数校验（未注册 → unknown）', () => {
    conditionEngine.clear()
    conditionEngine.registerPremise('NOT_H', () => true)
    expect(conditionRegistry.validateExpression('premise(NOT_H) && location.id == "tavern"').ok).toBe(true)
    const r = conditionRegistry.validateExpression('premise(UNKNOWN_PREM) == true')
    expect(r.ok).toBe(false)
    expect(r.unknown).toContain('premise:UNKNOWN_PREM')
    const r2 = conditionRegistry.validateExpression('premise(not_h) == true')
    expect(r2.ok).toBe(true)
    conditionEngine.clear()
  })

  it('validatePremise——单前提校验（大小写不敏感）', () => {
    conditionEngine.clear()
    conditionEngine.registerPremise('HAVE_TARGET', () => true)
    expect(conditionRegistry.validatePremise('HAVE_TARGET')).toBe(true)
    expect(conditionRegistry.validatePremise('have_target')).toBe(true)
    expect(conditionRegistry.validatePremise('NOPE')).toBe(false)
    conditionEngine.clear()
  })

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

  it('validateExpression——结构路径（location.tags.{tag}/talents/first_times/relations）', () => {
    conditionRegistry.registerFromAttributes({
      气血: { type: 'number', default: 100 }
    })
    expect(conditionRegistry.validateExpression('location.tags.has_bedroom == true').ok).toBe(true)
    expect(conditionRegistry.validateExpression('location.tags.has_bedroom == true && player.气血 < 30').ok).toBe(true)
    // selected/target 归一化为 character.{id}.
    expect(conditionRegistry.validateExpression('selected.talents.巨乳 == 1').ok).toBe(true)
    expect(conditionRegistry.validateExpression('target.first_times.virgin_V != true && target.talents.性无知 != 1').ok).toBe(true)
    expect(conditionRegistry.validateExpression('character.令狐冲.relations.岳灵珊.好感度 > 60').ok).toBe(true)
    expect(conditionRegistry.validateExpression('character.令狐冲.status.醉意 == true').ok).toBe(true)
    expect(conditionRegistry.validateExpression('inventory.回血丹.count >= 3').ok).toBe(true)
    // abilities 对象形式（level/xp）
    expect(conditionRegistry.validateExpression('selected.abilities.舌技.level >= 3').ok).toBe(true)
    expect(conditionRegistry.validateExpression('character.令狐冲.abilities.华山剑法.level >= 3').ok).toBe(true)
    // 引号内字符串不参与校验
    expect(conditionRegistry.validateExpression('quest.find_master.status == "active"').ok).toBe(true)
  })

  it('validateExpression——未知字段返回列表', () => {
    conditionRegistry.registerFromAttributes({
      气血: { type: 'number', default: 100 }
    })
    const r = conditionRegistry.validateExpression('player.气血 < 30 && player.不存在的属性 > 10 && location.ghost == 1')
    expect(r.ok).toBe(false)
    expect(r.unknown).toContain('player.不存在的属性')
    expect(r.unknown).toContain('location.ghost')
    expect(r.unknown).not.toContain('player.气血')
  })

  it('validateExpression——插件自定义根字段直接精确校验（无根白名单）', () => {
    conditionRegistry.registerFromAttributes({
      气血: { type: 'number', default: 100 },
      内力: { type: 'number', default: 50 },
    })
    conditionRegistry.registerFromPlugin('combat-base', {
      'combat.in_progress': { type: 'boolean', description: 'Is combat in progress' }
    })
    expect(conditionRegistry.validateExpression('combat.in_progress == true').ok).toBe(true)
    // 未注册的自定义根 → 未知
    const r = conditionRegistry.validateExpression('combat.not_a_field == true')
    expect(r.ok).toBe(false)
    expect(r.unknown).toContain('combat.not_a_field')
    // 数字/负数字面量不误判为字段
    expect(conditionRegistry.validateExpression('player.气血 == 0.5 && player.内力 != -5').ok).toBe(true)
  })

  it('validateExpression——! 否定与比较符边界', () => {
    conditionRegistry.registerFromAttributes({
      气血: { type: 'number', default: 100 }
    })
    expect(conditionRegistry.validateExpression('!player.气血').ok).toBe(true)
    expect(conditionRegistry.validateExpression('player.气血 >= 30 && player.气血 <= 100').ok).toBe(true)
    expect(conditionRegistry.validateExpression('location.tags.has_bedroom != true').ok).toBe(true)
  })
})
