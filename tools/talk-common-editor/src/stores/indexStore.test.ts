/**
 * indexStore 筛选集成测试：内存工作区 → 真实 store 链路。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { setFsAdapterForTests, useWorkspaceStore } from './workspaceStore'
import { useIndexStore } from './indexStore'
import { makeWorkspaceFs, ROOT } from '../lib/__tests__/fixtures'

describe('indexStore 筛选（指令来源）', () => {
  beforeEach(() => {
    // Node 测试环境无 localStorage → 垫一个
    ;(globalThis as Record<string, unknown>).localStorage = {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    }
    setActivePinia(createPinia())
    setFsAdapterForTests(makeWorkspaceFs())
  })

  it('默认层模式：source=mod 必须筛空（没有 mod 引入指令被加载）', async () => {
    const ws = useWorkspaceStore()
    await ws.setRoot(ROOT)
    const index = useIndexStore()

    expect(index.items.some((i) => i.instruction?.sourceKind === 'mod')).toBe(false)

    index.source = 'mod'
    expect(index.filtered).toHaveLength(0)

    index.source = 'native'
    const keys = index.filtered.map((i) => i.key)
    expect(keys).toContain('chat')
    expect(keys).toContain('sleep')
  })

  it('mod 模式（选中 example-mod）：source=mod 只含该 mod 引入的指令', async () => {
    const ws = useWorkspaceStore()
    await ws.setRoot(ROOT)
    const index = useIndexStore()

    ws.setMode('mod') // 触发 reload（异步）
    await ws.reload()
    expect(ws.mode).toBe('mod')
    expect(ws.modId).toBe('example-mod') // 无 active_mod 配置 → 取第一个
    expect(index.items.some((i) => i.key === 'demo')).toBe(true)

    index.source = 'mod'
    expect(index.filtered.map((i) => i.key)).toEqual(['demo'])

    index.source = 'native'
    expect(index.filtered.some((i) => i.key === 'chat')).toBe(true)
    expect(index.filtered.some((i) => i.key === 'demo')).toBe(false)

    index.source = 'all'
    expect(index.filtered.some((i) => i.key === 'demo')).toBe(true)
  })

  it('来源筛选可与其他筛选组合（原生 + 未建）', async () => {
    const ws = useWorkspaceStore()
    await ws.setRoot(ROOT)
    const index = useIndexStore()

    index.source = 'native'
    index.status = ['no-talk']
    const keys = index.filtered.map((i) => i.key)
    expect(keys).toContain('sleep')
    expect(keys).not.toContain('chat') // chat 有默认口上
  })

  it('保存后自身前提并入白名单；白名单失败过（空集）则跳过合并保持警告可见', async () => {
    const ws = useWorkspaceStore()
    await ws.setRoot(ROOT)

    expect(ws.knownPremises.has('BRAND_NEW_PREMISE')).toBe(false)
    ws.noteSavedTalk('conditions = "premise(BRAND_NEW_PREMISE)"')
    expect(ws.knownPremises.has('BRAND_NEW_PREMISE')).toBe(true)

    // 模拟白名单刷新失败（空集）→ 不合并，警告保持可见
    ws.knownPremises.clear()
    ws.noteSavedTalk('conditions = "premise(ANOTHER_NEW)"')
    expect(ws.knownPremises.has('ANOTHER_NEW')).toBe(false)
  })
})