// 注释：B4-B7 SEX/insert 宫颈链（6318-6330）与子宫链（6332-6344）复刻测试
// 覆盖：26 条指令注册；12 宫颈/12 子宫体位数值链（W 插入、子宫口/子宫姦模式、经验）；入口/换体位面板事件。

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

function resetChars(wombDilate = 5): void {
  resetCharacterEntity(player(), DEFAULT_PLAYER_BASE)
  resetCharacterEntity(npc(), DEFAULT_NPC_BASE)
  player().first_times = {}
  // 跳过性交/W性交处女惩罚，聚焦效果链
  npc().first_times = { virgin_V: true, virgin_W: true }
  player().h_state = { is_h: true, target_character_id: 'npc_1', current_sex_position: -1, current_womb_sex_position: 0 }
  npc().h_state = { is_h: true, target_character_id: 'player', insert_position: -1 }
  player().abilities = player().abilities ?? {}
  npc().abilities = npc().abilities ?? {}
  player().abilities['腰技'] = { level: 7, xp: 0 }
  npc().abilities['子宫扩张'] = { level: wombDilate, xp: 0 }
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
}

const CERVIX_IDS = [
  'change_cervix_sex_position',
  'normal_cervix_sex', 'back_cervix_sex', 'riding_cervix_sex', 'back_riding_cervix_sex',
  'face_seat_cervix_sex', 'back_seat_cervix_sex', 'face_stand_cervix_sex', 'back_stand_cervix_sex',
  'face_hug_cervix_sex', 'back_hug_cervix_sex', 'face_lay_cervix_sex', 'back_lay_cervix_sex',
]

const WOMB_IDS = [
  'change_womb_sex_position',
  'normal_womb_sex', 'back_womb_sex', 'riding_womb_sex', 'back_riding_womb_sex',
  'face_seat_womb_sex', 'back_seat_womb_sex', 'face_stand_womb_sex', 'back_stand_womb_sex',
  'face_hug_womb_sex', 'back_hug_womb_sex', 'face_lay_womb_sex', 'back_lay_womb_sex',
]

const POSITION_CASES: [string, number, number, number, number, number, string][] = [
  ['normal', 1, 50, 200, 50, 200, '好意'],
  ['back', 2, 50, 200, 50, 200, '屈服'],
  ['riding', 3, 50, 200, 50, 200, '先导'],
  ['back_riding', 4, 50, 200, 50, 200, '先导'],
  ['face_seat', 5, 70, 240, 70, 240, '恭顺'],
  ['back_seat', 6, 70, 240, 70, 240, '恭顺'],
  ['face_stand', 7, 40, 140, 40, 140, '羞耻'],
  ['back_stand', 8, 40, 140, 40, 140, '羞耻'],
  ['face_hug', 9, 40, 140, 50, 200, '欲情'],
  ['back_hug', 10, 40, 140, 50, 200, '欲情'],
  ['face_lay', 11, 70, 240, 70, 240, '好意'],
  ['back_lay', 12, 70, 240, 70, 240, '好意'],
]

describe('B4-B7 SEX/insert 宫颈链 + 子宫链（6318-6344）', () => {
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

  it('宫颈/子宫 26 条指令已注册', () => {
    for (const id of [...CERVIX_IDS, ...WOMB_IDS]) {
      expect(commandRegistry.getById(id), id).toBeDefined()
    }
  })

  it.each(POSITION_CASES)('宫颈 %s（6319+）：W 插入 + 子宫口模式 + 经验', async (base, posCode, pHp, pMp, nHp, nMp, state) => {
    resetChars(3)
    player().h_state.current_sex_position = posCode
    npc().h_state.insert_position = 0
    await commandExecutor.execute(`${base}_cervix_sex`, execCtx())

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
    expect(n.base['子宫']).toBeGreaterThan(0)
    expect(n.base['阴道']).toBeGreaterThan(0)
    expect(n.experience?.['4']).toBe(1)
    expect(n.experience?.['7']).toBe(1)
    expect(n.experience?.['61']).toBe(1)
    expect(n.experience?.['64']).toBe(1)
    expect(n.experience?.['65']).toBe(1)
    expect(n.experience?.['68']).toBe(1)
    expect(p.experience?.['60']).toBe(1)
    expect(n.h_state.insert_position).toBe(3)
    expect(p.h_state.current_sex_position).toBe(posCode)
    expect(p.h_state.current_womb_sex_position).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it.each(POSITION_CASES)('子宫 %s（6333+）：W 插入 + 子宫姦模式 + 经验', async (base, posCode, pHp, pMp, nHp, nMp, state) => {
    resetChars(5)
    player().h_state.current_sex_position = posCode
    npc().h_state.insert_position = 3
    await commandExecutor.execute(`${base}_womb_sex`, execCtx())

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
    expect(n.base['子宫']).toBeGreaterThan(0)
    expect(n.experience?.['4']).toBe(1)
    expect(n.experience?.['7']).toBe(1)
    expect(n.experience?.['61']).toBe(1)
    expect(n.experience?.['64']).toBe(1)
    expect(n.experience?.['65']).toBe(1)
    expect(n.experience?.['68']).toBe(1)
    expect(p.experience?.['60']).toBe(1)
    expect(n.h_state.insert_position).toBe(3)
    expect(p.h_state.current_sex_position).toBe(posCode)
    expect(p.h_state.current_womb_sex_position).toBe(2)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('宫颈/子宫换体位指令：open_sex_position_panel 发 sexType=2/3 UI 事件', async () => {
    const listener = vi.fn()
    eventBus.on('ui:open_sex_position_panel', listener)
    resetChars(3)
    player().h_state.current_sex_position = 1
    npc().h_state.insert_position = 3
    await commandExecutor.execute('change_cervix_sex_position', execCtx())
    expect(listener).toHaveBeenCalledWith({ sexType: 2, change: true })
    listener.mockClear()
    await commandExecutor.execute('change_womb_sex_position', execCtx())
    expect(listener).toHaveBeenCalledWith({ sexType: 3, change: true })
    eventBus.off('ui:open_sex_position_panel', listener)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of [...CERVIX_IDS, ...WOMB_IDS]) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text, scene).not.toContain('博士')
      expect(text, scene).not.toContain('源石')
    }
  })
})