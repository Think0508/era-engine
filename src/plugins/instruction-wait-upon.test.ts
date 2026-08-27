// 注释：B4-B7 SEX/wait_upon（6601-6614/6616，15 条）复刻测试
// 覆盖：注册、无判定侍奉链数值、有判定口交/SM链数值、阴茎位置写入、口上默认文件。

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

function resetChars(judgePass = false): void {
  resetCharacterEntity(player(), DEFAULT_PLAYER_BASE)
  resetCharacterEntity(npc(), DEFAULT_NPC_BASE)
  player().first_times = {}
  npc().first_times = {}
  player().abilities = player().abilities ?? {}
  npc().abilities = npc().abilities ?? {}
  // 深喉等需要目标技巧≥5 / 六九需要自己技巧≥3；默认给足，方便同一矩阵跑通
  player().abilities['技巧'] = { level: 3, xp: 0 }
  npc().abilities['技巧'] = { level: 5, xp: 0 }
  player().h_state = { is_h: true, target_character_id: 'npc_1', current_sex_position: -1 }
  // wait_upon 多数在口/手等侍奉位进行；默认从口交位开始（各指令执行后会写入自身部位）
  npc().h_state = { is_h: true, target_character_id: 'player', insert_position: 4 }
  // 清洁口交前置：玩家阴茎有精液污浊
  player().dirty = { penis_dirty_dict: { semen: true } }
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
  npc().base['射精欲'] = 0
  player().base['射精欲'] = 0
  if (judgePass) {
    // 口交 450 / SM 700：给足好感/信赖/刻印修正
    npc().base['好感度'] = 10000
    npc().base['信赖度'] = 300
    npc().abilities['快乐刻印'] = { level: 5, xp: 0 }
    npc().abilities['屈服刻印'] = { level: 5, xp: 0 }
  }
}

const WAIT_IDS = [
  'handjob', 'blowjob', 'paizuri', 'footjob', 'hairjob', 'axillajob', 'rub_buttock',
  'hand_blowjob', 'tits_blowjob', 'focus_blowjob', 'deep_throat', 'clean_blowjob',
  'sixty_nine', 'legjob', 'face_rub',
]

// [id, insertCode, judged]
const INSERT_CODE: Record<string, number> = {
  handjob: 9, blowjob: 4, paizuri: 7, footjob: 11, hairjob: 5, axillajob: 8,
  rub_buttock: 10, hand_blowjob: 4, tits_blowjob: 4, focus_blowjob: 4,
  deep_throat: 12, clean_blowjob: 4, sixty_nine: 4, legjob: 10, face_rub: 6,
}

const JUDGED = new Set(['blowjob', 'hand_blowjob', 'tits_blowjob', 'focus_blowjob', 'deep_throat', 'clean_blowjob', 'sixty_nine'])

describe('B4-B7 SEX/wait_upon（6601-6614/6616）', () => {
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

  it('wait_upon 15 条指令已注册', () => {
    for (const id of WAIT_IDS) {
      expect(commandRegistry.getById(id), id).toBeDefined()
    }
  })

  it.each(WAIT_IDS)('%s：数值链 + 阴茎位置 + 侍奉经验', async (id) => {
    const judged = JUDGED.has(id)
    resetChars(judged)
    await commandExecutor.execute(id, execCtx())

    const p = player()
    const n = npc()

    expect(p.base['体力']).toBe(70)
    expect(n.base['体力']).toBe(70)
    expect(p.base['气力']).toBe(240)
    expect(n.base['气力']).toBe(240)
    if (judged) {
      expect(n.base['好感度']).toBeGreaterThan(10000)
    } else {
      expect(n.base['好感度']).toBe(10)
    }
    expect(n.base['信赖度']).toBeGreaterThan(0)
    // 习得受目标技巧等级加成（本矩阵预设技巧=5），因此只断言 >0
    expect(n.base['习得']).toBeGreaterThan(0)
    expect(n.base['羞耻']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.experience?.['30']).toBe(1)
    expect(p.base['射精欲']).toBeGreaterThan(0) // eja_add 70
    expect(n.h_state.insert_position).toBe(INSERT_CODE[id])
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('deep_throat：SM 判定 + 苦痛/恐怖/深喉位置', async () => {
    resetChars(true)
    await commandExecutor.execute('deep_throat', execCtx())
    const n = npc()
    expect(n.base['苦痛']).toBe(40)
    expect(n.base['恐怖']).toBe(40)
    expect(n.base['口喉']).toBeGreaterThan(0)
    expect(n.experience?.['32']).toBe(1)
    expect(n.h_state.insert_position).toBe(12)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('clean_blowjob：just_shoot_off 清标记', async () => {
    resetChars(true)
    player().h_state.just_shoot = 2
    await commandExecutor.execute('clean_blowjob', execCtx())
    expect(player().h_state.just_shoot).toBe(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of WAIT_IDS) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text, scene).not.toContain('博士')
      expect(text, scene).not.toContain('源石')
    }
  })
})