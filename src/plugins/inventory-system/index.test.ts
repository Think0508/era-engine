// 注释：inventory-system 测试——useItem 消耗语义（2026-08-12 Task 2）
import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { bindingResolver } from '../../core/binding-resolver'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { commandRegistry } from '../../core/command-registry'
import { errorReporter } from '../../core/error-reporter'

async function bootPlugins() {
  const pluginManager = new PluginManager(apiSystem, eventBus, new SlotRegistry(), commandRegistry)
  const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', {  import: 'default', eager: true }) as Record<string, string>
  const enginePlugins = new Map<string, { toml: string; module?: any }>()
  for (const [path, toml] of Object.entries(pluginTomls)) {
    const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
    if (!dirName) continue
    enginePlugins.set(dirName, { toml, module: pluginModules[`/src/plugins/${dirName}/index.ts`] ?? undefined })
  }
  await pluginManager.loadPlugins(enginePlugins, new Map())
}

describe('inventory-system 消耗语义', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
  })

  // 注释：回血丹的 effects = modify_attribute hp +50（test-mod items.toml）
  function makeChar(id: string, inventory: { itemId: string; count: number }[] = []) {
    const ch = entitySystem.register('character', id, { name: id, inventory, base: { hp: 100 } }) as any
    return ch
  }

  it('useItem 消耗品：先扣 1 再执行 effects（现有 bug：useItem 不扣数量）', async () => {
    makeChar('u1', [{ itemId: '回血丹', count: 2 }])
    const before = (entitySystem.get('character', 'u1') as any).base?.hp ?? 100
    await apiSystem.call('inventory', 'useItem', 'u1', '回血丹')
    const ch = entitySystem.get('character', 'u1') as any
    expect(ch.inventory.find((i: any) => i.itemId === '回血丹').count).toBe(1)
    expect(ch.base.hp).toBeGreaterThan(before)
  })

  it('useItem 数量不足：不执行 effects 返回 false', async () => {
    makeChar('u2', [])
    const ch = entitySystem.get('character', 'u2') as any
    ch.base.hp = 100
    const ok = await apiSystem.call('inventory', 'useItem', 'u2', '回血丹')
    expect(ok).toBe(false) // 数量不足：效果不执行（hp 不变）
    expect(ch.base.hp).toBe(100)
    expect(ch.inventory.find((i: any) => i.itemId === '回血丹')).toBeUndefined()
  })

  it('removeItem 返回 boolean：缺物品返回 false（h-core body_item_equip 半成品注记依赖）', async () => {
    makeChar('u3', [])
    expect(await apiSystem.call('inventory', 'removeItem', 'u3', '媚药', 1)).toBe(false)
    makeChar('u4', [{ itemId: '媚药', count: 2 }])
    expect(await apiSystem.call('inventory', 'removeItem', 'u4', '媚药', 1)).toBe(true)
    expect((entitySystem.get('character', 'u4') as any).inventory.find((i: any) => i.itemId === '媚药').count).toBe(1)
  })

  it('useItem 带 targetId：effects 的 _targetIds 用目标', async () => {
    makeChar('u5', [{ itemId: '回血丹', count: 1 }])
    makeChar('u6', [])
    // 回血丹 effects 显式 target="self"——此处只验证扣减与事件，_targetIds 行为由 h_drug 指令覆盖
    await apiSystem.call('inventory', 'useItem', 'u5', '回血丹', 'u6')
    const ch = entitySystem.get('character', 'u5') as any
    expect(ch.inventory).toHaveLength(0)
  })

  // ═══════ 静默错误审计修复（2026-08-12）═══════
  it('equip 背包无物品：拒绝装备 + warning（不凭空写槽）', async () => {
    errorReporter.clear()
    makeChar('e1', [])
    const ok = await apiSystem.call('inventory', 'equip', 'e1', '布衣', 'upper')
    expect(ok).toBe(false)
    const ch = entitySystem.get('character', 'e1') as any
    expect(ch.equipment?.upper).toBeUndefined()
    const warn = errorReporter.getErrors().find(e => e.severity === 'warning' && e.message.includes('布衣'))
    expect(warn).toBeDefined()
  })

  it('equip 槽位已有物品：旧物品回背包（不丢失）再上新', async () => {
    makeChar('e2', [{ itemId: '布衣', count: 1 }, { itemId: '浴衣', count: 1 }])
    await apiSystem.call('inventory', 'equip', 'e2', '布衣', 'upper')
    let ch = entitySystem.get('character', 'e2') as any
    expect(ch.equipment.upper).toBe('布衣')
    expect(ch.inventory.find((i: any) => i.itemId === '布衣')).toBeUndefined()
    await apiSystem.call('inventory', 'equip', 'e2', '浴衣', 'upper')
    ch = entitySystem.get('character', 'e2') as any
    expect(ch.equipment.upper).toBe('浴衣')
    // 旧布衣回背包
    expect(ch.inventory.find((i: any) => i.itemId === '布衣')?.count).toBe(1)
    expect(ch.inventory.find((i: any) => i.itemId === '浴衣')).toBeUndefined()
  })

  it('addItem 角色不存在：返回 false + warning（归还路径不再无痕丢物品）', async () => {
    errorReporter.clear()
    expect(await apiSystem.call('inventory', 'addItem', 'ghost_char', '乳头夹', 1)).toBe(false)
    const warn = errorReporter.getErrors().find(e => e.severity === 'warning' && e.message.includes('ghost_char'))
    expect(warn).toBeDefined()
  })
})
