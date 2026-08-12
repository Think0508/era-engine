// 注释：h-mark 刻印存储一致性测试（2026-08-08 审查新增）
// 背景：刻印能力曾双轨分裂——h-mark 写 `mark_{id}` 数字键，settle_state/calcJudge/
// h-bondage/h-hypnosis 读按名键（'快乐刻印' 等）→ 刻印升级对判定修正/状态系数静默失效。
// 已统一为按名键单一存储，本测试锁定：h-mark 写入按名键 + 好感/信赖修正真实生效。

import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { errorReporter } from '../core/error-reporter'
import { onLoad as markOnLoad, onEnable as markOnEnable } from './h-mark/index'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from './effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './h-core/index'
import { eventBus } from '../core/event-bus'
import { commandRegistry } from '../core/command-registry'
import { clearBehaviorHistory } from '../core/command-executor'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

describe('h-mark 刻印存储（按名键统一）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)
    markOnLoad(stubCtx)
    markOnEnable(stubCtx)
    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    const p = entitySystem.get('character', 'player') as any
    resetCharacterEntity(p, DEFAULT_PLAYER_BASE)
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', { id: 'npc_1', name: '测试NPC', base: {}, current_location: 'town_square' })
    const n = entitySystem.get('character', 'npc_1') as any
    resetCharacterEntity(n, DEFAULT_NPC_BASE)
  })

  it('checkOne 升级写入按名键（快乐刻印），不再写 mark_13', async () => {
    const n = entitySystem.get('character', 'npc_1') as any
    // 快乐刻印 LV1 条件：本次 H 绝顶 ≥2 或 累计 ≥5
    n.h_state = { is_h: true, orgasm_count: { '1': [2, 0] } }
    await apiSystem.call('h-mark', 'checkOne', 'npc_1', 13)
    expect(n.abilities?.['快乐刻印']?.level).toBe(1)
    expect(n.abilities?.['mark_13']).toBeUndefined()
    n.h_state = undefined
  })

  it('快乐刻印 LV2 → settle_favorability 修正 +0.4/级（calcFavorability 按名读）', async () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.base['好感度'] = 0
    n.abilities = { 快乐刻印: { level: 2, xp: 0 } }
    clearBehaviorHistory()
    await apiSystem.call('effect-system', 'execute', [
      { type: 'settle_favorability', target: 'selected' },
    ], makeTestExecCtx({ _timeCost: 5 }))
    // fix = 1.0 + 0.2×2 = 1.4 → floor(5×1.4) = 7（死键时为 5）
    expect(n.base['好感度']).toBe(7)
  })

  it('快乐刻印 LV2 → settle_trust 修正（calcTrust 按名读）：60 分 → 1.0 + 0.4 = 1.4', async () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.base['信赖度'] = 0
    n.abilities = { 快乐刻印: { level: 2, xp: 0 } }
    clearBehaviorHistory()
    await apiSystem.call('effect-system', 'execute', [
      { type: 'settle_trust', target: 'selected' },
    ], makeTestExecCtx({ _timeCost: 60 }))
    expect(n.base['信赖度']).toBeCloseTo(1.4)
  })

  it('settle_state 快乐刻印系数（MARK_DEBUFF_STATES 按名读）：快乐刻印 LV2 → 35×3=105', async () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.base['快乐'] = 0
    n.abilities = { 快乐刻印: { level: 2, xp: 0 } }
    clearBehaviorHistory()
    await apiSystem.call('effect-system', 'execute', [
      { type: 'settle_state', params: { state: '快乐', baseValue: 30 }, target: 'selected' },
    ], makeTestExecCtx({ _timeCost: 5 }))
    expect(n.base['快乐']).toBe(105)
  })

  it('快乐刻印累计分支：orgasm_count[state][1] 合计 ≥5 → LV1（单次 <2 也升级）', async () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.h_state = { is_h: true, orgasm_count: { 4: [1, 5] } } // 单次 1 < 2，累计 5 ≥ 5
    n.abilities = {}
    await apiSystem.call('h-mark', 'checkOne', 'npc_1', 13)
    expect(n.abilities?.['快乐刻印']?.level).toBe(1)
    n.h_state = undefined
  })

  it('无觉刻印：experience[78] ≥5 且无意识 → LV1；无意识门（清醒时不升级）', async () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.sp_flag = { unconscious_h: 3 } // 无意识（时停）
    n.experience = { '78': 5 }
    n.abilities = {}
    await apiSystem.call('h-mark', 'checkOne', 'npc_1', 19)
    expect(n.abilities?.['无觉刻印']?.level).toBe(1)
    // 清醒 → 不升级
    n.sp_flag = {}
    n.abilities = {}
    n.experience = { '78': 100 }
    await apiSystem.call('h-mark', 'checkOne', 'npc_1', 19)
    expect(n.abilities?.['无觉刻印']).toBeUndefined()
    n.sp_flag = {}
  })

  it('无觉刻印单次分支：orgasm_count[0] 合计 ≥2 且无意识 → LV1', async () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.sp_flag = { unconscious_h: 3 }
    n.h_state = { is_h: true, orgasm_count: { 4: [2, 0] } }
    n.abilities = {}
    n.experience = {} // 隔离前测试残留的 exp78
    await apiSystem.call('h-mark', 'checkOne', 'npc_1', 19)
    expect(n.abilities?.['无觉刻印']?.level).toBe(1)
    n.sp_flag = {}
    n.h_state = undefined
  })

  it('苦痛刻印读 params 命名空间（audit-b C1）：params.苦痛=50000 → LV3 + judge 修正生效', async () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.abilities = {}
    delete n.base['苦痛']
    n.params = { 苦痛: 50000 }  // category=parameter → canonical 在 params
    await apiSystem.call('h-mark', 'checkOne', 'npc_1', 15)
    // 50000×5 = 250000 ≥ 20000/40000/80000 → 一路升到 LV3（此前读 base 恒 0 → 永不升级）
    expect(n.abilities?.['苦痛刻印']?.level).toBe(3)
    // judge 刻印修正读升级后的等级（LV3 → +30）
    expect(await apiSystem.call('h-mark', 'getMarkAdjust', 'npc_1', 15)).toBe(30)
    n.params = undefined
  })
})
