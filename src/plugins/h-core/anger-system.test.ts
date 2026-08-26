// 注释：愤怒/心情系统完整生命周期测试（h-core anger-effects + premises）
// 覆盖：MOOD_TO_* 心情档设置、angry_with_player 标记清除、性骚扰/H失败愤怒修正、
//       apology 礼物同时清 anger + angry_with_player、前提真语义

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { bindingResolver } from '../../core/binding-resolver'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { commandRegistry } from '../../core/command-registry'
import { errorReporter } from '../../core/error-reporter'
import { conditionEngine } from '../../core/condition-engine'

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

function char(id: string): any {
  return entitySystem.get('character', id) as any
}

describe('愤怒/心情系统（anger-system）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (!mod) throw new Error('模组加载失败')
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
    gameContext.setPlayer('player')
    // test-mod 已通过 modLoader 注册 player / test_girl，这里只做字段初始化
    const p = char('player')
    const g = char('test_girl')
    if (p) { p.base['愤怒'] = 0; p.base['反感'] = 0; p.base['好感度'] = 0; p.base['信赖度'] = 0; p.base['好意'] = 0; p.abilities = p.abilities ?? {}; p.abilities['反发刻印'] = { level: 0, xp: 0 } }
    if (g) { g.base['愤怒'] = 0; g.base['反感'] = 0; g.base['好感度'] = 0; g.base['信赖度'] = 0; g.base['好意'] = 0; g.abilities = g.abilities ?? {}; g.abilities['反发刻印'] = { level: 0, xp: 0 } }
  })

  beforeEach(() => {
    const g = char('test_girl')
    if (g) {
      g.base['愤怒'] = 0
      g.base['反感'] = 0
      g.base['好感度'] = 0
      g.base['信赖度'] = 0
      g.base['好意'] = 0
      g.sp_flag = {}
      g.abilities['反发刻印'] = { level: 0, xp: 0 }
    }
    const p = char('player')
    if (p) {
      p.base['愤怒'] = 0
      p.base['反感'] = 0
      p.base['好感度'] = 0
      p.base['信赖度'] = 0
      p.base['好意'] = 0
      p.sp_flag = {}
      p.abilities['反发刻印'] = { level: 0, xp: 0 }
    }
  })

  it('心情档效果：target_mood_to_good/normal/bad/angry 设置愤怒 0/20/40/75', async () => {
    const g = char('test_girl')
    for (const [type, value] of [
      ['target_mood_to_good', 0],
      ['target_mood_to_normal', 20],
      ['target_mood_to_bad', 40],
      ['target_mood_to_angry', 75],
    ] as const) {
      await apiSystem.call('effect-system', 'execute', [{ type, params: {} }], {
        sourceId: 'player', _targetIds: ['test_girl'], _timeCost: 10,
      })
      expect(g.base['愤怒']).toBe(value)
    }
  })

  it('心情效果也能作用自己：mood_to_bad → 40', async () => {
    const p = char('player')
    await apiSystem.call('effect-system', 'execute', [{ type: 'mood_to_bad', params: {} }], {
      sourceId: 'player', _targetIds: ['player'], _timeCost: 10,
    })
    expect(p.base['愤怒']).toBe(40)
  })

  it('TARGET_ANGRY_WITH_PLAYER_FLAG_TO_0 清除惹火标记', async () => {
    const g = char('test_girl')
    g.sp_flag = { angry_with_player: true }
    await apiSystem.call('effect-system', 'execute', [{ type: 'target_angry_with_player_flag_to_0', params: {} }], {
      sourceId: 'player', _targetIds: ['test_girl'], _timeCost: 1,
    })
    expect(g.sp_flag.angry_with_player).toBe(false)
  })

  it('LOW_OBSCENITY_FAILED_ADJUST：愤怒+50、惹火标记、好感下降', async () => {
    const g = char('test_girl')
    g.base['好感度'] = 100
    await apiSystem.call('effect-system', 'execute', [{ type: 'low_obscenity_failed_adjust', params: {} }], {
      sourceId: 'player', _targetIds: ['test_girl'], _timeCost: 10,
    })
    expect(g.base['愤怒']).toBe(50)
    expect(g.sp_flag.angry_with_player).toBe(true)
    // 好感 -= calcFavorability(girl,10)，默认 fix=1 → -10
    expect(g.base['好感度']).toBe(90) // 100-10，引擎好感下限0
  })

  it('HIGH_OBSCENITY_FAILED_ADJUST：愤怒+100、好感/信赖下降、反感增加', async () => {
    const g = char('test_girl')
    g.base['反感'] = 0
    g.base['信赖度'] = 50
    g.base['好感度'] = 100
    await apiSystem.call('effect-system', 'execute', [{ type: 'high_obscenity_failed_adjust', params: {} }], {
      sourceId: 'player', _targetIds: ['test_girl'], _timeCost: 10,
    })
    expect(g.base['愤怒']).toBe(100)
    expect(g.sp_flag.angry_with_player).toBe(true)
    expect(g.base['好感度']).toBe(70) // 100-30
    expect(g.base['信赖度']).toBe(38) // 50 - (10+2)
    expect(g.base['反感']).toBeGreaterThan(0)
  })

  it('DO_H_FAILED_ADJUST：愤怒+100、反感增加、好感/信赖下降', async () => {
    const g = char('test_girl')
    g.base['反感'] = 0
    g.base['信赖度'] = 50
    g.base['好感度'] = 100
    await apiSystem.call('effect-system', 'execute', [{ type: 'do_h_failed_adjust', params: {} }], {
      sourceId: 'player', _targetIds: ['test_girl'], _timeCost: 10,
    })
    expect(g.base['愤怒']).toBe(100)
    expect(g.sp_flag.angry_with_player).toBe(true)
    expect(g.base['好感度']).toBe(0) // 100-150 → 下限0
    expect(g.base['信赖度']).toBe(25) // 50 - (50×0.4+5=25)
    expect(g.base['反感']).toBeGreaterThan(0)
  })

  it('apology 礼物：愤怒清零 + 惹火标记清除 + 好感/好意+10', async () => {
    const g = char('test_girl')
    g.base['愤怒'] = 80
    g.sp_flag = { angry_with_player: true }
    await apiSystem.call('effect-system', 'execute', [{ type: 'give_gift', params: { mode: 'apology' } }], {
      sourceId: 'player', _targetIds: ['test_girl'], _timeCost: 10,
    })
    expect(g.base['愤怒']).toBe(0)
    expect(g.sp_flag.angry_with_player).toBe(false)
    expect(g.base['好感度']).toBe(10)
    expect(g.base['好意']).toBe(10)
  })

  it('前提真语义：GOOD/NORMAL/BAD/ANGRY_MOOD 和惹火标记', () => {
    const g = char('test_girl')
    const ctx = { ...gameContext.getContext(), sourceId: 'player', selectedCharacterId: 'test_girl' }
    const evalP = (prem: string) => conditionEngine.evaluatePremises([prem], ctx)
    const p = char('player')
    p.base['愤怒'] = 5
    p.sp_flag = {}
    g.base['愤怒'] = 5
    g.sp_flag = {}
    expect(evalP('GOOD_MOOD')).toBe(true)
    expect(evalP('TARGET_GOOD_MOOD')).toBe(true)
    expect(evalP('ANGRY_MOOD')).toBe(false)
    p.base['愤怒'] = 20
    g.base['愤怒'] = 20
    expect(evalP('NORMAL_MOOD')).toBe(true)
    expect(evalP('TARGET_NORMAL_MOOD')).toBe(true)
    p.base['愤怒'] = 40
    g.base['愤怒'] = 40
    expect(evalP('BAD_MOOD')).toBe(true)
    expect(evalP('TARGET_ABD_OR_ANGRY_MOOD')).toBe(true)
    p.base['愤怒'] = 60
    g.base['愤怒'] = 60
    expect(evalP('ANGRY_MOOD')).toBe(true)
    expect(evalP('TARGET_ANGRY_MOOD')).toBe(true)
    g.sp_flag = { angry_with_player: true }
    expect(evalP('TARGET_ANGRY_WITH_PLAYER')).toBe(true)
    expect(evalP('TARGET_NOT_ANGRY_WITH_PLAYER')).toBe(false)
  })
})