// 注释：premise-instruct 前提语义矩阵测试（2026-08-08 审查新增）
// 覆盖：SEX_TOY 档位前提（WEAK==1/MIDDLE==2/STRONG==3，erArk handle_premise_H.py:3206/3229/3241）
// 背景：原实现 WEAK=1-3（假通过）、STRONG>=4（vibrator_set 上限 3 → 恒 false 死键）、MIDDLE 缺失——
// 注册≠语义对（复刻 skill 常见静默错误），用行为矩阵锁定语义

import { conditionEngine } from '../core/condition-engine'
import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
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
    return conditionEngine.evaluatePremises([premise], { ...gameContext.getContext(), selectedCharacterId: 'npc_1' })
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
    expect(conditionEngine.evaluatePremises(['TARGET_NOW_SEX_TOY_WEAK'], { ...gameContext.getContext(), selectedCharacterId: undefined })).toBe(false)
    expect(conditionEngine.evaluatePremises(['TARGET_NOW_SEX_TOY_ON'], { ...gameContext.getContext(), selectedCharacterId: undefined })).toBe(false)
  })

  it('HAVE_PHILTER：查自己背包数组，非目标（erArk HAVE_PHILTER 无 T_ 前缀 = 自己）', () => {
    const p = entitySystem.get('character', 'player') as any
    const n = entitySystem.get('character', 'npc_1') as any
    p.inventory = [{ itemId: '媚药', count: 1 }]
    n.inventory = []
    expect(conditionEngine.evaluatePremises(['HAVE_PHILTER'], { ...gameContext.getContext(), selectedCharacterId: 'npc_1' })).toBe(true)
    // 目标有、自己没有 → false（防止查错对象）
    p.inventory = []
    n.inventory = [{ itemId: '媚药', count: 1 }]
    expect(conditionEngine.evaluatePremises(['HAVE_PHILTER'], { ...gameContext.getContext(), selectedCharacterId: 'npc_1' })).toBe(false)
    // 数量为 0 → false
    p.inventory = [{ itemId: '媚药', count: 0 }]
    expect(conditionEngine.evaluatePremises(['HAVE_PHILTER'], { ...gameContext.getContext(), selectedCharacterId: 'npc_1' })).toBe(false)
    p.inventory = []
    n.inventory = []
  })

  // ═══════════════ insert 批次：体位/插入/扩张/家具前提（2026-08-26）═══════════════
  // 目标：锁定“可读名 + 真语义”矩阵，防止再出现注册≠语义对。
  function evalP(premise: string, overrides: any = {}): boolean {
    return conditionEngine.evaluatePremises([premise], { ...gameContext.getContext(), selectedCharacterId: 'npc_1', ...overrides })
  }

  it('体位前提矩阵：POSITION_* 查自己 current_sex_position（数字 1-12/-1），旧 DR_* 为兼容别名', () => {
    const p = entitySystem.get('character', 'player') as any
    p.h_state = { current_sex_position: -1 }
    expect(evalP('POSITION_NONE')).toBe(true)
    expect(evalP('DR_POSITION_NULL')).toBe(true)
    expect(evalP('POSITION_NORMAL')).toBe(false)
    expect(evalP('HAVE_SEX_POSITION')).toBe(false)
    expect(evalP('DR_HAVE_SEX_POSITION')).toBe(false)

    p.h_state = { current_sex_position: 1 }
    expect(evalP('POSITION_NONE')).toBe(false)
    expect(evalP('POSITION_NORMAL')).toBe(true)
    expect(evalP('DR_POSITION_NORMAL')).toBe(true)
    expect(evalP('POSITION_BACK')).toBe(false)
    expect(evalP('HAVE_SEX_POSITION')).toBe(true)
    expect(evalP('DR_HAVE_SEX_POSITION')).toBe(true)

    p.h_state = { current_sex_position: 12 }
    expect(evalP('POSITION_BACK_LIE')).toBe(true)

    // 目标体位不影响自己体位前提
    const n = entitySystem.get('character', 'npc_1') as any
    n.h_state = { current_sex_position: 1 }
    p.h_state = { current_sex_position: -1 }
    expect(evalP('POSITION_NONE')).toBe(true)
    expect(evalP('POSITION_NORMAL')).toBe(false)
    p.h_state = undefined
    n.h_state = undefined
  })

  it('PENIS_IN_TARGET_* 查目标 insert_position（0=V 1=A 3=W），旧别名等价', () => {
    const n = entitySystem.get('character', 'npc_1') as any
    const p = entitySystem.get('character', 'player') as any
    p.h_state = { insert_position: 1 } // 玩家自己有插入不影响目标判定
    n.h_state = { insert_position: 0 }
    expect(evalP('PENIS_IN_TARGET_VAGINA_OR_WOMB')).toBe(true)
    expect(evalP('PENIS_IN_TARGET_WOMB')).toBe(false)
    expect(evalP('PENIS_IN_TARGET_ANAL')).toBe(false)
    expect(evalP('PENIS_IN_T_VAGINA_OR_WOMB')).toBe(true)

    n.h_state.insert_position = 3
    expect(evalP('PENIS_IN_TARGET_WOMB')).toBe(true)
    expect(evalP('PENIS_IN_TARGET_VAGINA_OR_WOMB')).toBe(true)
    expect(evalP('PENIS_IN_T_WOMB')).toBe(true)

    n.h_state.insert_position = 1
    expect(evalP('PENIS_IN_TARGET_ANAL')).toBe(true)
    expect(evalP('PENIS_IN_TARGET_VAGINA_OR_WOMB')).toBe(false)

    n.h_state = undefined
    expect(evalP('PENIS_IN_TARGET_ANAL')).toBe(false)
    p.h_state = undefined
  })

  it('TARGET_ANUS_EMPTY：后穴无道具/非灌肠（不查 insert_position——换肛交体位需 PENIS_IN_TARGET_ANAL 同时成立）', () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.h_state = { insert_position: 1 }
    n.body_items = {}
    n.dirty = undefined
    expect(evalP('TARGET_ANUS_EMPTY')).toBe(true)
    expect(evalP('TARGET_A_EMPTY')).toBe(true)

    n.h_state.vibrator_insertion_anal = true
    expect(evalP('TARGET_ANUS_EMPTY')).toBe(false)
    n.h_state.vibrator_insertion_anal = false

    n.h_state.anal_beads = true
    expect(evalP('TARGET_ANUS_EMPTY')).toBe(false)
    n.h_state.anal_beads = false

    n.dirty = { a_clean: 1 }
    expect(evalP('TARGET_ANUS_EMPTY')).toBe(false)
    n.dirty.a_clean = 0
    expect(evalP('TARGET_ANUS_EMPTY')).toBe(true)

    n.body_items = { toy: { itemId: '肛珠', active: true } }
    expect(evalP('TARGET_ANUS_EMPTY')).toBe(false)
    n.body_items = {}
    n.dirty = undefined
    n.h_state = undefined
  })

  it('TARGET_WOMB_DILATE_GE_3/5：查目标 abilities.子宫扩张 等级，旧 T_W_DILATE_* 别名等价', () => {
    const n = entitySystem.get('character', 'npc_1') as any
    n.abilities = { '子宫扩张': { level: 2, xp: 0 } }
    expect(evalP('TARGET_WOMB_DILATE_GE_3')).toBe(false)
    expect(evalP('T_W_DILATE_GE_3')).toBe(false)
    n.abilities['子宫扩张'].level = 3
    expect(evalP('TARGET_WOMB_DILATE_GE_3')).toBe(true)
    expect(evalP('TARGET_WOMB_DILATE_GE_5')).toBe(false)
    n.abilities['子宫扩张'].level = 5
    expect(evalP('TARGET_WOMB_DILATE_GE_5')).toBe(true)
    n.abilities = {}
  })

  it('LOCATION_FURNITURE_* / LOCATION_FURNITURE_3：家具等级语义（GE>= / 3==）', () => {
    const loc = gameContext.getContext().location as any
    const original = loc.furniture_count
    loc.furniture_count = 2
    expect(evalP('LOCATION_FURNITURE_GE_1')).toBe(true)
    expect(evalP('LOCATION_FURNITURE_GE_2')).toBe(true)
    expect(evalP('LOCATION_FURNITURE_GE_3')).toBe(false)
    expect(evalP('LOCATION_FURNITURE_3')).toBe(false)
    expect(evalP('PLACE_FURNITURE_GE_1')).toBe(true)

    loc.furniture_count = 3
    expect(evalP('LOCATION_FURNITURE_3')).toBe(true)
    expect(evalP('LOCATION_FURNITURE_GE_3')).toBe(true)

    loc.furniture_count = 0
    expect(evalP('LOCATION_FURNITURE_GE_1')).toBe(false)
    expect(evalP('LOCATION_FURNITURE_3')).toBe(false)
    loc.furniture_count = original
  })

  it('WAIST/FINGER/TECHNIQUE 无前缀查自己（目标等级高不影响）', () => {
    const p = entitySystem.get('character', 'player') as any
    const n = entitySystem.get('character', 'npc_1') as any
    p.abilities = p.abilities ?? {}
    n.abilities = n.abilities ?? {}
    p.abilities['腰技'] = { level: 3, xp: 0 }
    n.abilities['腰技'] = { level: 7, xp: 0 }
    expect(evalP('WAIST_TECHNIQUE_GE_3')).toBe(true)
    expect(evalP('WAIST_TECHNIQUE_GE_5')).toBe(false)
    expect(evalP('WAIST_TECHNIQUE_GE_7')).toBe(false)
    expect(evalP('TARGET_TECHNIQUE_GE_3')).toBe(false) // 目标技巧，非腰技

    p.abilities['腰技'].level = 7
    expect(evalP('WAIST_TECHNIQUE_GE_7')).toBe(true)
    p.abilities['指技'] = { level: 5, xp: 0 }
    expect(evalP('FINGER_TECHNIQUE_GE_5')).toBe(true)
    p.abilities['技巧'] = { level: 3, xp: 0 }
    expect(evalP('TECHNIQUE_GE_3')).toBe(true)
    p.abilities = {}
    n.abilities = {}
  })
})
