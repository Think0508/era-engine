import { describe, it, expect, beforeEach } from 'vitest'
import { SlotRegistry } from './slot-registry'
import type { GameContext, UISlotItem } from '../../core/types'

// 注释：mock GameContext 供 condition 求值
const mockCtx: GameContext = {
  player: null,
  location: { id: 'town', name: '城镇', parent: null, type: 'building', tags: ['has_shop'] },
  time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
  getEntity: () => null,
}

// 注释：mock 组件（测试不需要真实 Vue 组件）
const mockComponent = { name: 'MockComponent' } as any

describe('slot-registry', () => {
  let registry: SlotRegistry

  beforeEach(() => {
    registry = new SlotRegistry()
  })

  const makeItem = (overrides: Partial<UISlotItem> = {}): UISlotItem => ({
    id: 'test',
    component: mockComponent,
    priority: 0,
    ...overrides,
  })

  it('register/getItems 基本注册', () => {
    registry.register('character-list', makeItem({ id: 'a', priority: 5 }))
    const items = registry.getItems('character-list', mockCtx)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('a')
  })

  it('getItems 按 priority 升序', () => {
    registry.register('character-list', makeItem({ id: 'c', priority: 10 }))
    registry.register('character-list', makeItem({ id: 'a', priority: 1 }))
    registry.register('character-list', makeItem({ id: 'b', priority: 5 }))
    const items = registry.getItems('character-list', mockCtx)
    expect(items.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('condition 不满足时过滤掉', () => {
    registry.register('character-list', makeItem({ id: 'visible', condition: () => true }))
    registry.register('character-list', makeItem({ id: 'hidden', condition: () => false }))
    const items = registry.getItems('character-list', mockCtx)
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('visible')
  })

  it('无 condition 始终显示', () => {
    registry.register('character-list', makeItem({ id: 'always' }))
    const items = registry.getItems('character-list', mockCtx)
    expect(items).toHaveLength(1)
  })

  it('同名 slot + 同 id 重复注册被拒绝', () => {
    registry.register('character-list', makeItem({ id: 'dup' }))
    expect(() => registry.register('character-list', makeItem({ id: 'dup' }))).toThrow(/重复注册/)
  })

  it('不同 slot 同 id 允许', () => {
    registry.register('character-list', makeItem({ id: 'same' }))
    expect(() => registry.register('location-panel', makeItem({ id: 'same' }))).not.toThrow()
  })

  it('unregister 移除', () => {
    registry.register('character-list', makeItem({ id: 'remove-me' }))
    registry.unregister('character-list', 'remove-me')
    expect(registry.getItems('character-list', mockCtx)).toHaveLength(0)
  })

  it('clear 清空所有', () => {
    registry.register('character-list', makeItem({ id: 'a' }))
    registry.register('location-panel', makeItem({ id: 'b' }))
    registry.clear()
    expect(registry.getSlotNames()).toHaveLength(0)
  })

  it('getSlotNames 返回所有插槽名', () => {
    registry.register('character-list', makeItem())
    registry.register('location-panel', makeItem({ id: 'other' }))
    expect(registry.getSlotNames().sort()).toEqual(['character-list', 'location-panel'])
  })

  it('不存在的插槽返回空数组', () => {
    expect(registry.getItems('nonexistent', mockCtx)).toEqual([])
  })
})
