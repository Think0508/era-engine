// 注释：h-pregnancy 避孕药清槽语义测试（2026-08-12 静默错误审计修复）
// erArk pregnancy.py：事后避孕药（槽12）受孕判定时失效、排卵促进药（槽10）判定时消耗
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
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const enginePlugins = new Map<string, { toml: string; module?: any }>()
  for (const [path, toml] of Object.entries(pluginTomls)) {
    const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
    if (!dirName) continue
    enginePlugins.set(dirName, { toml, module: pluginModules[`/src/plugins/${dirName}/index.ts`] ?? undefined })
  }
  await pluginManager.loadPlugins(enginePlugins, new Map())
}

describe('h-pregnancy 避孕药清槽语义', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
  })

  // 注释：排卵日 + 有精液的角色（受孕判定可达）
  function makePregChar(id: string, bodyItems: Record<string, any>) {
    entitySystem.register('character', id, {
      name: id,
      id,
      base: { '排卵周期': 5 },
      body_semen: { 6: [6, 100, 1] },
      body_items: bodyItems,
    })
  }

  it('事后避孕药（槽12）：受孕判定后失效清槽（erArk pregnancy.py:57-59）', async () => {
    makePregChar('bc12', { '12': { itemId: '事后避孕药', active: true } })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['bc12'] })
    const ch = entitySystem.get('character', 'bc12') as any
    expect(ch.body_items['12']).toBeUndefined() // 判定后失效
    expect(ch.pregnancy).toBeUndefined()        // 未怀孕
  })

  it('排卵促进药（槽10）：受孕判定时消耗清槽（erArk 03-道具系统.md §2.7）', async () => {
    makePregChar('bc10', { '10': { itemId: '排卵促进药', active: true } })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['bc10'] })
    const ch = entitySystem.get('character', 'bc10') as any
    expect(ch.body_items['10']).toBeUndefined() // 判定时消耗
  })

  it('事前避孕药（槽11）：判定时不消耗（30 天 expiry 属另一机制，TODO）', async () => {
    makePregChar('bc11', { '11': { itemId: '事前避孕药', active: true } })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['bc11'] })
    const ch = entitySystem.get('character', 'bc11') as any
    expect(ch.body_items['11']?.active).toBe(true) // 保留
    expect(ch.pregnancy).toBeUndefined()
  })

  it('h:shoot 路径：事后避孕药同样判定后失效', async () => {
    makePregChar('bc12b', { '12': { itemId: '事后避孕药', active: true } })
    await eventBus.emit('h:shoot', { character: 'someone', target: 'bc12b', position: 0, condom: false })
    const ch = entitySystem.get('character', 'bc12b') as any
    expect(ch.body_items['12']).toBeUndefined()
  })
})
