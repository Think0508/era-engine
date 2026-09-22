// 注释：binding-resolver 跨命名空间读写测试（audit-a I2）
// 背景：get/set 只读 `entity.base`——绑定到 social/combat/economy 类属性读恒 null、
// 写产生 base 副本双真相源。修复后读写走 getEntityAttr/setEntityAttr 跨命名空间，
// 键已存在时写回原命名空间（不产生 base 副本），键不存在时落 base（既有语义保留）。

import { describe, it, expect, beforeEach } from 'vitest'
import { bindingResolver } from './binding-resolver'
import { entitySystem } from './entity-system'
import { configureAttributeEval, registerRuntimeMod, removeRuntimeMod } from './attribute-eval'

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

  // ── 2026-09-23 末轮 Item 3：getRawForPlugin（5 个生产调用点、此前零测试）──────────────
  // 它存在的理由：多个插件绑**同名通用键**时，getRaw 的跨插件解析会读错属性，
  // 所以「读出来加一点再写回」的插件内读-改-写必须按**自己的映射**取裸值。
  it('getRawForPlugin 按插件自己的映射读裸值（同名键不串域）', () => {
    entitySystem.register('character', 'char_6', { id: 'char_6', base: { 精力: 70, 精神: 20 } })
    configureAttributeEval({ definitions: { 精力: {} } })
    bindingResolver.loadBindings({ 'plug-a': { sanity: '精力' }, 'plug-b': { sanity: '精神' } })
    const c = entitySystem.get('character', 'char_6') as any
    registerRuntimeMod(c, { id: 'test:精力', attr: '精力', flat: 30 }, 30)
    try {
      expect(bindingResolver.getRawForPlugin('plug-a', 'char_6', 'sanity')).toBe(70)   // 裸值
      expect(bindingResolver.getForPlugin('plug-a', 'char_6', 'sanity')).toBe(100)     // 有效值（+30）
      expect(bindingResolver.getRaw('char_6', 'sanity')).toBe(70)                      // 跨插件解析 = 首个含该键的映射
      expect(bindingResolver.getRawForPlugin('plug-b', 'char_6', 'sanity')).toBe(20)   // 按自己的映射（不是 70）
    } finally {
      removeRuntimeMod(c, 'test:精力')
    }
  })

  it('getRawForPlugin 的四条 null 分支（实体/插件/键映射/属性缺失）', () => {
    entitySystem.register('character', 'char_7', { id: 'char_7', base: {} })
    entitySystem.register('character', 'char_8', { id: 'char_8', base: { 精力: 0 } })
    bindingResolver.loadBindings({ 'plug-a': { sanity: '精力' } })
    expect(bindingResolver.getRawForPlugin('plug-a', 'missing_char', 'sanity')).toBeNull()  // 实体不存在
    expect(bindingResolver.getRawForPlugin('plug-x', 'char_7', 'sanity')).toBeNull()        // 插件未绑定
    expect(bindingResolver.getRawForPlugin('plug-a', 'char_7', 'trust')).toBeNull()         // 键无映射
    expect(bindingResolver.getRawForPlugin('plug-a', 'char_7', 'sanity')).toBeNull()        // 属性不存在于任何命名空间
    expect(bindingResolver.getRawForPlugin('plug-a', 'char_8', 'sanity')).toBe(0)           // 存在但为 0 —— 不是 null
  })
})
