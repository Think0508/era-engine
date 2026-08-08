// 注释：premise-instruct 前提语义矩阵测试（2026-08-08 审查新增）
// 覆盖：SEX_TOY 档位前提（WEAK==1/MIDDLE==2/STRONG==3，erArk handle_premise_H.py:3206/3229/3241）
// 背景：原实现 WEAK=1-3（假通过）、STRONG>=4（vibrator_set 上限 3 → 恒 false 死键）、MIDDLE 缺失——
// 注册≠语义对（复刻 skill 常见静默错误），用行为矩阵锁定语义

import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { premiseRegistry } from '../core/premise-registry'
import { errorReporter } from '../core/error-reporter'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './h-core/index'
import { eventBus } from '../core/event-bus'
import { commandRegistry } from '../core/command-registry'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

describe('premise-instruct 前提语义矩阵', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    const p = entitySystem.get('character', 'player') as any
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {}, current_location: 'town_square' })
  })

  function evalPrem(premise: string, level: number | undefined): boolean {
    const n = entitySystem.get('character', 'npc_1') as any
    if (level === undefined) n.h_state = undefined
    else {
      if (!n.h_state) n.h_state = {}
      n.h_state.sex_toy_level = level
    }
    return premiseRegistry.evaluate([premise], { selectedCharacterId: 'npc_1' })
  }

  it('SEX_TOY 档位矩阵：OFF=0 / WEAK=1 / MIDDLE=2 / STRONG=3（erArk 精确语义）', () => {
    expect(evalPrem('TARGET_NOW_SEX_TOY_OFF', undefined)).toBe(true)
    expect(evalPrem('TARGET_NOW_SEX_TOY_OFF', 0)).toBe(true)
    expect(evalPrem('TARGET_NOW_SEX_TOY_OFF', 1)).toBe(false)
    // ON = >0
    expect(evalPrem('TARGET_NOW_SEX_TOY_ON', 0)).toBe(false)
    expect(evalPrem('TARGET_NOW_SEX_TOY_ON', 1)).toBe(true)
    expect(evalPrem('TARGET_NOW_SEX_TOY_ON', 3)).toBe(true)
    // WEAK = ==1（1-3 时不得假通过）
    expect(evalPrem('TARGET_NOW_SEX_TOY_WEAK', 1)).toBe(true)
    expect(evalPrem('TARGET_NOW_SEX_TOY_WEAK', 2)).toBe(false)
    expect(evalPrem('TARGET_NOW_SEX_TOY_WEAK', 3)).toBe(false)
    // MIDDLE = ==2
    expect(evalPrem('TARGET_NOW_SEX_TOY_MIDDLE', 1)).toBe(false)
    expect(evalPrem('TARGET_NOW_SEX_TOY_MIDDLE', 2)).toBe(true)
    expect(evalPrem('TARGET_NOW_SEX_TOY_MIDDLE', 3)).toBe(false)
    // STRONG = ==3（>=4 恒 false——vibrator_set 上限 3）
    expect(evalPrem('TARGET_NOW_SEX_TOY_STRONG', 1)).toBe(false)
    expect(evalPrem('TARGET_NOW_SEX_TOY_STRONG', 2)).toBe(false)
    expect(evalPrem('TARGET_NOW_SEX_TOY_STRONG', 3)).toBe(true)
    expect(evalPrem('TARGET_NOW_SEX_TOY_STRONG', 4)).toBe(false)
  })

  it('无目标 → 全部 false（getTarget 语义）', () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.h_state = { sex_toy_level: 1 }
    expect(premiseRegistry.evaluate(['TARGET_NOW_SEX_TOY_WEAK'], { selectedCharacterId: null })).toBe(false)
    expect(premiseRegistry.evaluate(['TARGET_NOW_SEX_TOY_ON'], { selectedCharacterId: null })).toBe(false)
  })
})
