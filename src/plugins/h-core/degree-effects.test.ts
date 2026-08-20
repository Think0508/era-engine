// 注释：五度属性——机制通电小步测试（2026-08-21）
// 覆盖：属性默认落 social / accumulate_degrees 多度累加 / 单调不降（负值 warning 丢弃）/
// 未定义度名 warning / 条件路径 selected.屈服度 >= N 翻转 / character:changed / fail-closed 无目标
// 设计依据：docs/five-degrees-attributes.md；计划：docs/superpowers/plans/2026-08-21-five-degrees-wiring.md

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { commandRegistry } from '../../core/command-registry'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { conditionEngine } from '../../core/condition-engine'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from '../effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './index'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

function npc(id = 'npc_1'): any {
  return entitySystem.get('character', id) as any
}

async function runExecute(effectTarget: string, degrees: Record<string, number>): Promise<void> {
  await apiSystem.call('effect-system', 'execute', [
    { type: 'accumulate_degrees', params: { degrees }, target: effectTarget },
  ], { sourceId: 'player' })
}

describe('五度属性·机制通电（accumulate_degrees）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()
    narrativeLog.clear()
    apiSystem.clear()
    eventBus.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)

    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {} })
    entitySystem.register('character', 'npc_2', { id: 'npc_2', name: '测试NPC2', base: {} })
    npc('npc_1').social = {}
    npc('npc_2').social = {}
  })

  beforeEach(() => {
    errorReporter.clear()
    npc('npc_1').social = {}
    npc('npc_2').social = {}
  })

  it('G1：3 个新度以 default=0 落 social，且已进入 mod.attributes（条件路径即可引用）', () => {
    // mod.attributes 合并了 h-core 默认层 → 度定义存在
    const attrs = (modLoader.getMod() as any)?.attributes
    for (const degree of ['屈服度', '软弱度', '欲望度']) {
      expect(attrs?.[degree]).toBeTruthy()
      expect(attrs?.[degree]?.category).toBe('social')
    }
    // mod 角色（player 经 applyAttributeDefaults）→ social 含 3 度 = 0
    const player = entitySystem.get('character', 'player') as any
    for (const degree of ['屈服度', '软弱度', '欲望度']) {
      expect(player.social?.[degree]).toBe(0)
    }
  })

  it('G2/G3：accumulate_degrees 对目标一次性累加多度（固定数）', async () => {
    await runExecute('npc_1', { 屈服度: 10, 软弱度: 5 })
    const n = npc('npc_1')
    expect(n.social['屈服度']).toBe(10)
    expect(n.social['软弱度']).toBe(5)
    // 未声明度不受影响
    expect(n.social['欲望度'] ?? 0).toBe(0)
    // 另一目标不受影响
    expect(npc('npc_2').social['屈服度'] ?? 0).toBe(0)
  })

  it('单调不降：负值入参 → 该度不扣减 + warning（只增不减）', async () => {
    npc('npc_1').social['屈服度'] = 50
    await runExecute('npc_1', { 屈服度: -20 })
    expect(npc('npc_1').social['屈服度']).toBe(50)
    expect(errorReporter.getErrors().some(e => e.severity === 'warning' && e.message.includes('单调铁律'))).toBe(true)
  })

  it('未定义度名 → warning + 跳过（防拼错静默）', async () => {
    // 注意：故意用 ASCII 假名（扫描脚本只收中文属性字面量，中文"不存在度"会被 scan-attr-refs 误报）
    await runExecute('npc_1', { no_such_degree: 10 })
    expect(npc('npc_1').social['no_such_degree'] ?? 0).toBe(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'warning' && e.message.includes('未在 attributes.toml 定义'))).toBe(true)
  })

  it('条件路径：selected.屈服度 >= 10 累加前为假，累加后为真', async () => {
    const ctx: any = { ...gameContext.getContext(), selectedCharacterId: 'npc_1' }
    expect(conditionEngine.evaluate('selected.屈服度 >= 10', ctx)).toBe(false)
    await runExecute('npc_1', { 屈服度: 10 })
    expect(conditionEngine.evaluate('selected.屈服度 >= 10', ctx)).toBe(true)
  })

  it('累加触发 character:changed 事件', async () => {
    let fired: string | null = null
    const h = (p: any): void => { fired = p?.id }
    eventBus.on('character:changed', h)
    try {
      await runExecute('npc_1', { 欲望度: 3 })
    } finally {
      eventBus.off('character:changed', h)
    }
    expect(fired).toBe('npc_1')
    expect(npc('npc_1').social['欲望度']).toBe(3)
  })

  it('无目标 → fail-closed warning，不静默通过', async () => {
    // 直接调 handler 验证本 effect 自身守卫（execute 对 target=selected 无选中时会在更上层告警并跳过）
    const handler = effectTypeRegistry.getHandler('accumulate_degrees')!
    await handler({ degrees: { 屈服度: 10 } }, { _targetIds: [] })
    await handler({ degrees: { 屈服度: 10 } }, { _targetIds: undefined })
    expect(errorReporter.getErrors().filter(e => e.severity === 'warning' && e.message.includes('无目标角色')).length).toBe(2)
  })
})
