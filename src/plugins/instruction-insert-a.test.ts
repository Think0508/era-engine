// 注释：B4-B7 SEX/insert V 链（6301-6316）复刻测试
// 覆盖：16 条指令注册；12 体位数值链（体力/气力/状态/经验/插入状态）；深部 6315/6316；口上默认文件。

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
  // first_times 不在 resetCharacterEntity 全字段内（历史残留会跨测试污染破处判定）。
  // 本批测试聚焦效果链数值，先标记已非处女以避免 性交 -250 处女惩罚导致退缩；
  // first_time_check 的破处断言在其它先行批次测试中覆盖。
  player().first_times = {}
  npc().first_times = { virgin_V: true }
  player().h_state = { is_h: true, target_character_id: 'npc_1', current_sex_position: -1 }
  npc().h_state = { is_h: true, target_character_id: 'player', insert_position: -1 }
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
}

const V_IDS = [
  'vaginal_sex', 'change_vaginal_sex_position',
  'normal_sex', 'back_sex', 'riding_sex', 'back_riding_sex',
  'face_seat_sex', 'back_seat_sex', 'face_stand_sex', 'back_stand_sex',
  'face_hug_sex', 'back_hug_sex', 'face_lay_sex', 'back_lay_sex',
  'stimulate_g_point', 'womb_os_caress',
]

// [id, positionCode, playerHp, playerMp, npcHp, npcMp, state]
const POSITION_CASES: [string, number, number, number, number, number, string][] = [
  ['normal_sex', 1, 50, 200, 50, 200, '好意'],
  ['back_sex', 2, 50, 200, 50, 200, '屈服'],
  ['riding_sex', 3, 50, 200, 50, 200, '先导'],
  ['back_riding_sex', 4, 50, 200, 50, 200, '先导'],
  ['face_seat_sex', 5, 70, 240, 70, 240, '恭顺'],
  ['back_seat_sex', 6, 70, 240, 70, 240, '恭顺'],
  ['face_stand_sex', 7, 40, 140, 40, 140, '羞耻'],
  ['back_stand_sex', 8, 40, 140, 40, 140, '羞耻'],
  ['face_hug_sex', 9, 40, 140, 50, 200, '欲情'],
  ['back_hug_sex', 10, 40, 140, 50, 200, '欲情'],
  ['face_lay_sex', 11, 70, 240, 70, 240, '好意'],
  ['back_lay_sex', 12, 70, 240, 70, 240, '好意'],
]

describe('B4-B7 SEX/insert V 链（6301-6316）', () => {
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

  it('V 链 16 条指令已注册', () => {
    for (const id of V_IDS) {
      expect(commandRegistry.getById(id), id).toBeDefined()
    }
  })

  it.each(POSITION_CASES)('%s：12 体位数值链 + 插入状态', async (id, posCode, pHp, pMp, nHp, nMp, state) => {
    resetChars()
    // 12 体位指令为“当前体位快捷动作”：
    // 需要先处于该体位且已插入 V（真实流程由入口面板/上一轮动作建立）
    player().h_state.current_sex_position = posCode
    npc().h_state.insert_position = 0
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
    expect(n.base[state]).toBeGreaterThan(0)   // 欲情等会被 feel_by_sex 二次叠加，因此只断言 >0
    expect(n.base['反感']).toBe(15)
    expect(n.base['阴道']).toBeGreaterThan(0)
    expect(n.experience?.['4']).toBe(1)
    expect(n.experience?.['61']).toBe(1)
    expect(n.experience?.['65']).toBe(1)
    expect(p.experience?.['60']).toBe(1)
    expect(n.h_state.insert_position).toBe(0)
    expect(p.h_state.current_sex_position).toBe(posCode)

    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('stimulate_g_point：深部 V 动作（无体位切换）', async () => {
    resetChars()
    npc().h_state.insert_position = 0
    player().abilities = player().abilities ?? {}
    player().abilities['腰技'] = { level: 3, xp: 0 }
    await commandExecutor.execute('stimulate_g_point', execCtx())

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
    expect(n.base['阴道']).toBeGreaterThan(0)
    expect(n.experience?.['4']).toBe(1)
    expect(n.experience?.['61']).toBe(1)
    expect(n.experience?.['65']).toBe(1)
    expect(p.experience?.['60']).toBe(1)
    // 深部动作不写体位
    expect(n.h_state.insert_position).toBe(0)
    expect(p.h_state.current_sex_position).toBe(-1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('womb_os_caress：子宫口深部（W 快感 + W 苦痛 + V 快感 + 扩张经验）', async () => {
    resetChars()
    npc().h_state.insert_position = 0
    player().abilities = player().abilities ?? {}
    player().abilities['腰技'] = { level: 4, xp: 0 }
    await commandExecutor.execute('womb_os_caress', execCtx())

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
    expect(n.base['子宫']).toBeGreaterThan(0)
    expect(n.base['阴道']).toBeGreaterThan(0)
    expect(n.experience?.['4']).toBe(1)
    expect(n.experience?.['7']).toBe(1)
    expect(n.experience?.['61']).toBe(1)
    expect(n.experience?.['65']).toBe(1)
    expect(n.experience?.['68']).toBe(1)
    expect(p.experience?.['60']).toBe(1)
    // 复核补丁：erArk 145 VAGINA_TECH_ADD_PL_P_ADJUST 不再漏写 → 玩家射精欲上升
    expect(player().base['射精欲']).toBeGreaterThan(0)
    expect(n.h_state.insert_position).toBe(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('入口/换体位指令：open_sex_position_panel 发 UI 事件', async () => {
    const listener = vi.fn()
    eventBus.on('ui:open_sex_position_panel', listener)
    resetChars()
    await commandExecutor.execute('vaginal_sex', execCtx())
    expect(listener).toHaveBeenCalledWith({ sexType: 1, change: false })
    listener.mockClear()
    player().h_state.current_sex_position = 1
    npc().h_state.insert_position = 0
    await commandExecutor.execute('change_vaginal_sex_position', execCtx())
    expect(listener).toHaveBeenCalledWith({ sexType: 1, change: true })
    eventBus.off('ui:open_sex_position_panel', listener)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of V_IDS) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text, scene).not.toContain('博士')
      expect(text, scene).not.toContain('源石')
    }
  })
})