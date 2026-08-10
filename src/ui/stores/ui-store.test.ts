// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUIStore } from './ui-store'

describe('ui-store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('selectCharacter/clearSelection', () => {
    const store = useUIStore()
    expect(store.hasSelection).toBe(false)
    store.selectCharacter('innkeeper')
    expect(store.selectedCharacterId).toBe('innkeeper')
    expect(store.hasSelection).toBe(true)
    store.clearSelection()
    expect(store.hasSelection).toBe(false)
  })

  it('toggleFold', () => {
    const store = useUIStore()
    expect(store.isFolded('status')).toBe(false)
    store.toggleFold('status')
    expect(store.isFolded('status')).toBe(true)
    store.toggleFold('status')
    expect(store.isFolded('status')).toBe(false)
  })

  it('favorites add/remove', () => {
    const store = useUIStore()
    store.addFavorite('talk')
    store.addFavorite('move')
    expect(store.favorites).toEqual(['talk', 'move'])
    // 注释：重复添加不生效
    store.addFavorite('talk')
    expect(store.favorites).toEqual(['talk', 'move'])
    store.removeFavorite('talk')
    expect(store.favorites).toEqual(['move'])
  })

  it('saveToLocalStorage/loadFromLocalStorage', () => {
    const store = useUIStore()
    store.setTheme('modern')
    store.setColorScheme('dark')
    store.setDisplayMode('clear')
    store.addFavorite('talk')
    store.saveToLocalStorage()

    // 注释：新 store 实例加载偏好
    setActivePinia(createPinia())
    const store2 = useUIStore()
    expect(store2.theme).toBe('era')
    store2.loadFromLocalStorage()
    expect(store2.theme).toBe('modern')
    expect(store2.colorScheme).toBe('dark')
    expect(store2.displayMode).toBe('clear')
    expect(store2.favorites).toEqual(['talk'])
  })

  it('localStorage 不可用时静默跳过', () => {
    const store = useUIStore()
    // 注释：mock localStorage 抛错
    const original = globalThis.localStorage
    // @ts-expect-error 强制设为 undefined 模拟不可用
    delete globalThis.localStorage
    expect(() => store.saveToLocalStorage()).not.toThrow()
    expect(() => store.loadFromLocalStorage()).not.toThrow()
    globalThis.localStorage = original
  })

  it('toSaveData/fromSaveData (foldStates)', () => {
    const store = useUIStore()
    store.toggleFold('status')
    store.toggleFold('look')
    const data = store.toSaveData()
    expect(data.foldStates.status).toBe(true)
    expect(data.foldStates.look).toBe(true)

    // 注释：新 store 恢复
    setActivePinia(createPinia())
    const store2 = useUIStore()
    store2.fromSaveData(data)
    expect(store2.isFolded('status')).toBe(true)
    expect(store2.isFolded('look')).toBe(true)
  })

  it('setActivePanel', () => {
    const store = useUIStore()
    expect(store.activePanel).toBe(null)
    store.setActivePanel('character-player')
    expect(store.activePanel).toBe('character-player')
    store.setActivePanel(null)
    expect(store.activePanel).toBe(null)
  })

  it('toggleSidebarMode', () => {
    const store = useUIStore()
    expect(store.sidebarMode).toBe('overlay')
    store.toggleSidebarMode()
    expect(store.sidebarMode).toBe('sideBySide')
    store.toggleSidebarMode()
    expect(store.sidebarMode).toBe('overlay')
  })

  it('eventOptions set/clear', () => {
    const store = useUIStore()
    expect(store.eventOptions).toBeNull()
    store.setEventOptions([{ id: 'e1', text: '进去看看' }, { id: 'e2', text: '转身离开' }])
    expect(store.eventOptions).toHaveLength(2)
    expect(store.eventOptions![0].text).toBe('进去看看')
    store.setEventOptions(null)
    expect(store.eventOptions).toBeNull()
  })
})
