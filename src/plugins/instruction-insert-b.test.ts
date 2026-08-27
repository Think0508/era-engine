// 注释：B4-B7 SEX/insert A 链（6345-6360）复刻测试
// 覆盖：16 条指令注册；12 体位数值链（A 插入/后穴/经验）；深部 6359/6360；口上默认文件。

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { commandExecutor } from '../core/command-executor'
import { narrativeLog } from '../core/narrative-log'
import { errorReporter } from '../core/error-reporter'
import { eventBus } from '../core/event-bus'
import { clearBehaviorHistory } from '../core/command-executor'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from './effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from './h-core/index'
import { onLoad as bondageOnLoad, onEnable as bondageOnEnable } from './h-bondage/index'
import { onLoad as sleepOnLoad, onEnable as sleepOnEnable } from './sleep-system/index'
import { onLoad as timeStopOnLoad, onEnable as timeStopOnEnable } from './h-time-stop/index'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from './dialogue-system/index'
import { onEnable as talkCommonOnEnable } from './talk-common-system/index'
import { onEnable as confinementOnEnable } from './confinement-system/index'
import { onLoad as exposureOnLoad, onEnable as exposureOnEnable } from './h-exposure/index'
import { onLoad as followOnLoad, onEnable as followOnEnable } from './follow-system/index'
import { onLoad as hiddenOnLoad, onEnable as hiddenOnEnable } from './h-hidden/index'
import { onLoad as groupSexOnLoad, onEnable as groupSexOnEnable } from './h-group-sex/index'
import { onLoad as hNpcAiOnLoad, onEnable as hNpcAiOnEnable } from './h-npc-ai/index'
import { onLoad as ejaculationOnLoad, onEnable as ejaculationOnEnable } from './h-ejaculation/index'
import { onLoad as firstTimeOnLoad } from './h-first-time/index'

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
  player().first_times = {}
  npc().first_times = { virgin_A: true }   // 跳过 A性交 −350 处女惩罚，聚焦效果链
  player().h_state = { is_h: true, target_character_id: 'npc_1', current_sex_position: -1 }
  npc().h_state = { is_h: true, target_character_id: 'player', insert_position: -1 }
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
}

const A_IDS = [
  'anal_sex', 'change_anal_sex_position',
  'normal_anal_sex', 'back_anal_sex', 'riding_anal_sex', 'back_riding_anal_sex',
  'face_seat_anal_sex', 'back_seat_anal_sex', 'face_stand_anal_sex', 'back_stand_anal_sex',
  'face_hug_anal_sex', 'back_hug_anal_sex', 'face_lay_anal_sex', 'back_lay_anal_sex',
  'stimulate_sigmoid_colon', 'stimulate_vagina',
]

// [id, positionCode, playerHp, playerMp, npcHp, npcMp, state]
const POSITION_CASES: [string, number, number, number, number, number, string][] = [
  ['normal_anal_sex', 1, 50, 200, 50, 200, '好意'],
  ['back_anal_sex', 2, 50, 200, 50, 200, '屈服'],
  ['riding_anal_sex', 3, 50, 200, 50, 200, '先导'],
  ['back_riding_anal_sex', 4, 50, 200, 50, 200, '先导'],
  ['face_seat_anal_sex', 5, 70, 240, 70, 240, '恭顺'],
  ['back_seat_anal_sex', 6, 70, 240, 70, 240, '恭顺'],
  ['face_stand_anal_sex', 7, 40, 140, 40, 140, '羞耻'],
  ['back_stand_anal_sex', 8, 40, 140, 40, 140, '羞耻'],
  ['face_hug_anal_sex', 9, 40, 140, 50, 200, '好意'],
  ['back_hug_anal_sex', 10, 40, 140, 50, 200, '好意'],
  ['face_lay_anal_sex', 11, 70, 240, 70, 240, '好意'],
  ['back_lay_anal_sex', 12, 70, 240, 70, 240, '好意'],
]

describe('B4-B7 SEX/insert A 链（6345-6360）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    gameContext.setPlayer('player')
    const firstLoc = mod.locations.values().next().value as any
    firstLoc.furniture_count = 3
    gameContext.setLocation(firstLoc)

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    bondageOnLoad(stubCtx)
    await bondageOnEnable(stubCtx)
    sleepOnLoad(stubCtx)
    await sleepOnEnable(stubCtx)
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
    await ejaculationOnEnable(stubCtx)
    firstTimeOnLoad(stubCtx)

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

  it('A 链 16 条指令已注册', () => {
    for (const id of A_IDS) {
      expect(commandRegistry.getById(id), id).toBeDefined()
    }
  })

  it.each(POSITION_CASES)('%s：12 体位数值链 + A 插入状态', async (id, posCode, pHp, pMp, nHp, nMp, state) => {
    resetChars()
    player().h_state.current_sex_position = posCode
    npc().h_state.insert_position = 1
    await commandExecutor.execute(id, execCtx())

    const p = player()
    const n = npc()

    expect(n.base['好感度']).toBe(10)
    expect(p.base['体力']).toBe(pHp)
    expect(n.base['体力']).toBe(nHp)
    expect(p.base['气力']).toBe(pMp)
    expect(n.base['气力']).toBe(nMp)
    expect(n.base['信赖度']).toBeGreaterThan(0)
    expect(n.base['润滑']).toBe(40)
    expect(n.base['习得']).toBe(40)
    expect(n.base[state]).toBeGreaterThan(0)
    expect(n.base['反感']).toBe(15)
    expect(n.base['后穴']).toBeGreaterThan(0)
    expect(n.experience?.['5']).toBe(1)
    expect(n.experience?.['62']).toBe(1)
    expect(n.experience?.['66']).toBe(1)
    expect(p.experience?.['60']).toBe(1)
    expect(n.h_state.insert_position).toBe(1)
    expect(p.h_state.current_sex_position).toBe(posCode)

    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('stimulate_sigmoid_colon：A 深部（无体位切换）', async () => {
    resetChars()
    player().abilities = player().abilities ?? {}
    player().abilities['技巧'] = { level: 3, xp: 0 }
    npc().h_state.insert_position = 1
    await commandExecutor.execute('stimulate_sigmoid_colon', execCtx())

    const p = player()
    const n = npc()
    expect(n.base['好感度']).toBe(10)
    expect(p.base['体力']).toBe(50)
    expect(n.base['体力']).toBe(50)
    expect(p.base['气力']).toBe(200)
    expect(n.base['气力']).toBe(200)
    expect(n.base['润滑']).toBe(40)
    expect(n.base['习得']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.base['后穴']).toBeGreaterThan(0)
    expect(n.experience?.['5']).toBe(1)
    expect(n.experience?.['62']).toBe(1)
    expect(n.experience?.['66']).toBe(1)
    expect(p.experience?.['60']).toBe(1)
    expect(n.h_state.insert_position).toBe(1)
    expect(p.h_state.current_sex_position).toBe(-1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('stimulate_vagina：A 深部 + 额外 V 快感', async () => {
    resetChars()
    player().abilities = player().abilities ?? {}
    player().abilities['技巧'] = { level: 3, xp: 0 }
    npc().h_state.insert_position = 1
    await commandExecutor.execute('stimulate_vagina', execCtx())

    const p = player()
    const n = npc()
    expect(n.base['好感度']).toBe(10)
    expect(p.base['体力']).toBe(50)
    expect(n.base['体力']).toBe(50)
    expect(p.base['气力']).toBe(200)
    expect(n.base['气力']).toBe(200)
    expect(n.base['润滑']).toBe(40)
    expect(n.base['习得']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.base['后穴']).toBeGreaterThan(0)
    expect(n.base['阴道']).toBeGreaterThan(0)   // 131 额外 V 快感
    expect(n.experience?.['5']).toBe(1)
    expect(n.experience?.['62']).toBe(1)
    expect(n.experience?.['66']).toBe(1)
    expect(p.experience?.['60']).toBe(1)
    expect(n.h_state.insert_position).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('入口/换体位指令：open_sex_position_panel 发 sexType=4 UI 事件', async () => {
    const listener = vi.fn()
    eventBus.on('ui:open_sex_position_panel', listener)
    resetChars()
    await commandExecutor.execute('anal_sex', execCtx())
    expect(listener).toHaveBeenCalledWith({ sexType: 4, change: false })
    listener.mockClear()
    player().h_state.current_sex_position = 1
    npc().h_state.insert_position = 1
    await commandExecutor.execute('change_anal_sex_position', execCtx())
    expect(listener).toHaveBeenCalledWith({ sexType: 4, change: true })
    eventBus.off('ui:open_sex_position_panel', listener)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of A_IDS) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text, scene).not.toContain('博士')
      expect(text, scene).not.toContain('源石')
    }
  })
})