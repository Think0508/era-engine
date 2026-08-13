// 注释：hunger-system use 数组兼容测试（2026-08-12 静默错误审计修复）——
// use 已数组化（grill Q2 定案），`=== 'food'` 严格比较恒 false → 进食/自动进食静默失效
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

describe('hunger-system use 数组兼容', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
    // 注释：注入测试食物（数组 use + 字符串 use 各一，兼容两代 schema）
    const modItems = (modLoader.getMod()!.items as any)
    modItems['烧饼'] = { id: '烧饼', name: '烧饼', use: ['food'], hunger_reduction: 100, digestion_time: 60 }
    modItems['老式烙饼'] = { id: '老式烙饼', name: '老式烙饼', use: 'food', hunger_reduction: 80, digestion_time: 60 }
  })

  function makeChar(id: string, hunger: number, foodId: string) {
    entitySystem.register('character', id, {
      id, name: id,
      base: { '饥饿值': hunger, '消化剩余': 0 },
      inventory: [{ itemId: foodId, count: 2 }],
    })
  }

  it('eat_food 效果：use=["food"] 数组食物正常进食（扣物/减饥饿）', async () => {
    makeChar('hf1', 300, '烧饼')
    await apiSystem.call('effect-system', 'execute', [
      { type: 'eat_food', params: { itemId: '烧饼' } },
    ], { sourceId: 'hf1', _targetIds: ['hf1'], _timeCost: 30 })
    const ch = entitySystem.get('character', 'hf1') as any
    expect(ch.base['饥饿值']).toBe(200)               // 300 - 100
    expect(ch.inventory.find((i: any) => i.itemId === '烧饼').count).toBe(1)
    expect(ch.base['消化剩余']).toBe(60)              // 消化CD
  })

  it('eat_food 效果：use="food" 字符串（旧 schema）同样兼容', async () => {
    makeChar('hf2', 300, '老式烙饼')
    await apiSystem.call('effect-system', 'execute', [
      { type: 'eat_food', params: { itemId: '老式烙饼' } },
    ], { sourceId: 'hf2', _targetIds: ['hf2'], _timeCost: 30 })
    const ch = entitySystem.get('character', 'hf2') as any
    expect(ch.base['饥饿值']).toBe(220)               // 300 - 80
  })

  it('非食物物品：eat_food 早退（不改任何数值）', async () => {
    makeChar('hf3', 300, '烧饼')
    await apiSystem.call('effect-system', 'execute', [
      { type: 'eat_food', params: { itemId: '回血丹' } },
    ], { sourceId: 'hf3', _targetIds: ['hf3'], _timeCost: 30 })
    const ch = entitySystem.get('character', 'hf3') as any
    expect(ch.base['饥饿值']).toBe(300)
    expect(ch.inventory.find((i: any) => i.itemId === '回血丹')).toBeUndefined() // 没吃没扣
  })

  it('NPC 自动进食：hour_changed 时 findFirstFood 找到数组 use 食物', async () => {
    makeChar('hf4', 200, '烧饼') // 200 > threshold 190
    await eventBus.emit('game:hour_changed', { hour: 1 })
    const ch = entitySystem.get('character', 'hf4') as any
    expect(ch.base['饥饿值']).toBe(100) // 200 - 100（自动吃了一个）
  })
})
