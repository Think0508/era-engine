// 注释：binding-resolver 跨命名空间读写测试（audit-a I2）
// 背景：get/set 只读 `entity.base`——绑定到 social/combat/economy 类属性读恒 null、
// 写产生 base 副本双真相源。修复后读写走 getEntityAttr/setEntityAttr 跨命名空间，
// 键已存在时写回原命名空间（不产生 base 副本），键不存在时落 base（既有语义保留）。

import { describe, it, expect, beforeEach } from 'vitest'
import { bindingResolver } from './binding-resolver'
import { entitySystem } from './entity-system'

describe('binding-resolver 跨命名空间（audit-a I2）', () => {
  beforeEach(() => {
    entitySystem.clear()
    bindingResolver.loadBindings({ 'test-plugin': { favorability: '好感度', trust: '信赖度' } })
  })

  it('get 读 social 命名空间（不限于 base）：social.好感度=60 → 60', () => {
    entitySystem.register('character', 'char_1', { id: 'char_1', base: {}, social: { 好感度: 60 } })
    expect(bindingResolver.get('char_1', 'favorability')).toBe(60)
  })

  it('set 写入已有键所在命名空间，不产生 base 副本', () => {
    entitySystem.register('character', 'char_2', { id: 'char_2', base: {}, social: { 好感度: 60 } })
    bindingResolver.set('char_2', 'favorability', 80)
    const c = entitySystem.get('character', 'char_2') as any
    expect(c.social['好感度']).toBe(80)
    expect(c.base?.['好感度']).toBeUndefined()
    expect(bindingResolver.get('char_2', 'favorability')).toBe(80)
  })

  it('键不存在于任何命名空间 → 落 base（既有语义保留）', () => {
    entitySystem.register('character', 'char_3', { id: 'char_3', base: {} })
    bindingResolver.set('char_3', 'favorability', 30)
    const c = entitySystem.get('character', 'char_3') as any
    expect(c.base['好感度']).toBe(30)
    expect(bindingResolver.get('char_3', 'favorability')).toBe(30)
  })

  it('getForPlugin/setForPlugin 跨命名空间行为一致', () => {
    entitySystem.register('character', 'char_4', { id: 'char_4', base: {}, social: { 好感度: 10 } })
    expect(bindingResolver.getForPlugin('test-plugin', 'char_4', 'favorability')).toBe(10)
    expect(bindingResolver.setForPlugin('test-plugin', 'char_4', 'favorability', 99)).toBe(true)
    const c = entitySystem.get('character', 'char_4') as any
    expect(c.social['好感度']).toBe(99)
    expect(c.base?.['好感度']).toBeUndefined()
    expect(bindingResolver.getForPlugin('test-plugin', 'char_4', 'favorability')).toBe(99)
  })

  it('属性缺失/未绑定 → null（既有语义保留）', () => {
    entitySystem.register('character', 'char_5', { id: 'char_5', base: {} })
    expect(bindingResolver.get('char_5', 'trust')).toBeNull()
    bindingResolver.loadBindings({})
    expect(bindingResolver.get('char_5', 'favorability')).toBeNull()
    expect(bindingResolver.get('missing_char', 'favorability')).toBeNull()
  })
})
