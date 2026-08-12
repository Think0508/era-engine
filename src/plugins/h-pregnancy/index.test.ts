// 注释：h-pregnancy 避孕药清槽语义测试（2026-08-12 静默错误审计修复）
// erArk pregnancy.py：事后避孕药（槽12）受孕判定时失效、排卵促进药（槽10）判定时消耗
import { describe, it, expect, beforeAll, vi } from 'vitest'
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

  // 注释：排卵日 + 有精液的角色（受孕判定可达）——B8 修复后只取 W(7) 子宫精液
  function makePregChar(id: string, bodyItems: Record<string, any>, extra: Record<string, any> = {}) {
    entitySystem.register('character', id, {
      name: id,
      id,
      base: { '排卵周期': 5 },
      body_semen: { 7: [7, 100, 1] },
      body_items: bodyItems,
      ...extra,
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

  it('B8：仅 V(6) 精液不触发受精（erArk 只取子宫 W(7)，pregnancy.py:45-46）', async () => {
    entitySystem.register('character', 'v_only', {
      name: 'v_only', id: 'v_only',
      base: { '排卵周期': 5 },
      body_semen: { 6: [6, 100, 1] },  // 只有阴道精液
    })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['v_only'] })
    const ch = entitySystem.get('character', 'v_only') as any
    expect(ch.pregnancy).toBeUndefined()
    // 阴道精液不被清（判定未触发）
    expect(ch.body_semen[6][1]).toBe(100)
  })

  it('B8：W(7) 精液触发受精；清槽同时清 [1] 与 [2]（pregnancy.py:102-105）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10)
    // W 精液 300ml 等级 2 → rate = 9 + 10 = 19 > 10 → 受精
    entitySystem.register('character', 'w_preg', {
      name: 'w_preg', id: 'w_preg',
      base: { '排卵周期': 5 },
      body_semen: { 6: [6, 50, 1], 7: [7, 300, 2] },
    })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['w_preg'] })
    const ch = entitySystem.get('character', 'w_preg') as any
    expect(ch.pregnancy).toBeDefined()
    expect(ch.body_semen[7][1]).toBe(0)  // 当前量清空
    expect(ch.body_semen[7][2]).toBe(0)  // 等级清空（B8 修复——原只清 [1]）
    vi.restoreAllMocks()
  })

  it('B8：浓厚精液（射精方 h_state.thick_semen）rate×2（pregnancy.py:81-84）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10)
    // 无浓厚：W 100ml 等级 1 → rate = 1+5 = 6 < 10 → 不怀孕
    entitySystem.register('character', 'thick_ctl', {
      name: 'thick_ctl', id: 'thick_ctl', base: { '排卵周期': 5 },
      body_semen: { 7: [7, 100, 1] },
    })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['thick_ctl'], sourceId: 'thick_shooter' })
    expect((entitySystem.get('character', 'thick_ctl') as any).pregnancy).toBeUndefined()
    // 有浓厚（射精方标记）：rate = 6×2 = 12 > 10 → 怀孕
    entitySystem.register('character', 'thick_tgt', {
      name: 'thick_tgt', id: 'thick_tgt', base: { '排卵周期': 5 },
      body_semen: { 7: [7, 100, 1] },
    })
    entitySystem.register('character', 'thick_shooter', {
      name: 'thick_shooter', id: 'thick_shooter', h_state: { thick_semen: true },
    })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['thick_tgt'], sourceId: 'thick_shooter' })
    expect((entitySystem.get('character', 'thick_tgt') as any).pregnancy).toBeDefined()
    vi.restoreAllMocks()
  })

  it('B8：催眠强制排卵——非排卵日 + force_ovulation → 允许判定且 rate×5（消耗标志）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.10)
    // 非排卵日（周期 3）无 force_ovulation → 不判定
    entitySystem.register('character', 'hyp_ctl', {
      name: 'hyp_ctl', id: 'hyp_ctl', base: { '排卵周期': 3 },
      body_semen: { 7: [7, 100, 1] },
    })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['hyp_ctl'] })
    expect((entitySystem.get('character', 'hyp_ctl') as any).pregnancy).toBeUndefined()
    // 非排卵日 + force_ovulation：rate = 6×5 = 30 > 10 → 怀孕；标志判定后消耗
    entitySystem.register('character', 'hyp_tgt', {
      name: 'hyp_tgt', id: 'hyp_tgt', base: { '排卵周期': 3 },
      body_semen: { 7: [7, 100, 1] },
      hypnosis: { force_ovulation: true },
    })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'pregnancy_check', params: {} },
    ], { _targetIds: ['hyp_tgt'] })
    const ch = entitySystem.get('character', 'hyp_tgt') as any
    expect(ch.pregnancy).toBeDefined()
    expect(ch.hypnosis.force_ovulation).toBe(false)
    vi.restoreAllMocks()
  })
})
