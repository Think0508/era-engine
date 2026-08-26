// 注释：B4 SEX/base 剩余 4 条（6001/6009/6019/6020）复刻测试
// 注意：undress 为简化全脱；pull_out_penis/stop_endure 为按 erArk 效果链简化的可用实现

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { commandExecutor } from '../core/command-executor'
import { narrativeLog } from '../core/narrative-log'
import { errorReporter } from '../core/error-reporter'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from './effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './h-core/index'
import { onLoad as sleepOnLoad } from './sleep-system/index'
import { onLoad as timeStopOnLoad, onEnable as timeStopOnEnable } from './h-time-stop/index'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from './dialogue-system/index'
import { onEnable as talkCommonOnEnable } from './talk-common-system/index'
import { onEnable as confinementOnEnable } from './confinement-system/index'
import { onLoad as exposureOnLoad, onEnable as exposureOnEnable } from './h-exposure/index'
import { onLoad as followOnLoad, onEnable as followOnEnable } from './follow-system/index'
import { onLoad as hiddenOnLoad, onEnable as hiddenOnEnable } from './h-hidden/index'
import { onLoad as groupSexOnLoad, onEnable as groupSexOnEnable } from './h-group-sex/index'
import { onLoad as hNpcAiOnLoad, onEnable as hNpcAiOnEnable } from './h-npc-ai/index'
import { onLoad as ejaculationOnLoad } from './h-ejaculation/index'
import { eventBus } from '../core/event-bus'
import { clearBehaviorHistory } from '../core/command-executor'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'

const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

const execCtx = makeTestExecCtx

function npc(): any {
  return entitySystem.get('character', 'npc_1') as any
}

function player(): any {
  return entitySystem.get('character', 'player') as any
}

function resetChars(): void {
  resetCharacterEntity(player(), DEFAULT_PLAYER_BASE)
  resetCharacterEntity(npc(), DEFAULT_NPC_BASE)
  player().h_state = { is_h: true, orgasm_edge: 0, endure_not_shoot_count: 2, insert_position: 0 }
  npc().h_state = { is_h: true, orgasm_edge: 0, endure_not_shoot_count: 0, insert_position: 0 }
  player().base['射精欲'] = 100
  player().base['射精欲上限'] = 100
  npc().equipment = { upper: '布衣', lower: '裙子' }
  npc().equipment_off = {}
}

describe('B4 SEX/base 剩余 4 条（6001/6009/6019/6020）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    gameContext.setLocation(mod.locations.values().next().value as any)

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    sleepOnLoad(stubCtx)
    timeStopOnLoad(stubCtx)
    await timeStopOnEnable(stubCtx)
    dialogueOnLoad(stubCtx)
    dialogueOnEnable(stubCtx)
    await talkCommonOnEnable(stubCtx)
    await confinementOnEnable(stubCtx)
    exposureOnLoad(stubCtx)
    await exposureOnEnable(stubCtx)
    followOnLoad(stubCtx)
    await followOnEnable(stubCtx)
    hiddenOnLoad(stubCtx)
    await hiddenOnEnable(stubCtx)
    groupSexOnLoad(stubCtx)
    await groupSexOnEnable(stubCtx)
    hNpcAiOnLoad(stubCtx)
    await hNpcAiOnEnable(stubCtx)
    ejaculationOnLoad(stubCtx)

    const p = entitySystem.get('character', 'player') as any
    p.current_location = 'town_square'
    entitySystem.register('character', 'npc_1', {
      id: 'npc_1', name: '测试NPC',
      base: {},
      current_location: 'town_square',
    })
    gameContext.setSelectedCharacterId('npc_1')
    resetChars()
  })

  beforeEach(() => {
    clearBehaviorHistory()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('4 条指令已注册', () => {
    for (const id of ['wait_5_min_in_h', 'undress', 'pull_out_penis', 'stop_endure']) {
      expect(commandRegistry.getById(id)).toBeDefined()
    }
  })

  it('wait_5_min_in_h：无其他 H 角色 → 转为结束 H', async () => {
    resetChars()
    // 只保留玩家在 H，目标也设为非 H？但指令需要 IS_H，目标不需要在 H；为触发“无其他 H”将目标 h_state 清掉
    const n = npc()
    n.h_state = undefined
    n.current_location = 'town_square'
    player().h_state = { is_h: true }
    await commandExecutor.execute('wait_5_min_in_h', execCtx())
    expect(player().h_state).toBeUndefined()
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('undress：目标衣物移除到 equipment_off', async () => {
    resetChars()
    const n = npc()
    n.equipment = { upper: '布衣', lower: '裙子' }
    n.equipment_off = {}
    await commandExecutor.execute('undress', execCtx())
    expect(n.equipment_off.upper).toBe('布衣')
    expect(n.equipment_off.lower).toBe('裙子')
    expect(n.equipment.upper).toBeUndefined()
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('pull_out_penis：清除插入部位', async () => {
    resetChars()
    const p = player()
    p.h_state = { is_h: true, insert_position: 0, current_sex_position: 1 }
    await commandExecutor.execute('pull_out_penis', execCtx())
    expect(p.h_state.insert_position).toBe(-1)
    expect(p.h_state.current_sex_position).toBeUndefined()
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('stop_endure：强制射精（射精欲清零 + 无 error）', async () => {
    resetChars()
    const p = player()
    p.base['射精欲'] = 100
    p.base['射精欲上限'] = 100
    p.h_state = { is_h: true, target_character_id: 'npc_1', endure_not_shoot_count: 2, insert_position: 0 }
    await commandExecutor.execute('stop_endure', execCtx())
    expect(p.base['射精欲']).toBe(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of ['wait_5_min_in_h', 'undress', 'pull_out_penis', 'stop_endure']) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text).not.toContain('博士')
      expect(text).not.toContain('源石')
    }
  })
})