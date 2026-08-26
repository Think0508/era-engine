// 注释：listen_complaint（1024 听牢骚）复刻测试——B1 待办
// 覆盖：新前提 TARGET_ABD_OR_ANGRY_MOOD / TARGET_NOT_ANGRY_WITH_PLAYER 是否存在并真语义、
//       耗时45、特殊减怒（话术0 → angry-20）、通用链数值、前提门控、口上无世界观
// 数值依据：Behavior_Data.csv:28（duration=45）+ Behavior_Effect.csv:27（21-1511-1512-53-CVE×2）
//          + handle_instruct.py:977-989（int(10+adjust*10)）+ default.py 对应效果公式

import { conditionEngine } from '../core/condition-engine'
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
  player().abilities = { 话术技能: { level: 0, xp: 0 } }
  const p = player()
  p.base['体力'] = 200
  p.base['气力'] = 200
  p.base['体力上限'] = 200
  p.base['气力上限'] = 200
}

describe('listen_complaint（1024）复刻', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()
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
    hiddenOnEnable(stubCtx)
    groupSexOnLoad(stubCtx)
    await groupSexOnEnable(stubCtx)

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

  it('前提已注册且真语义：目标愤怒>30 且未被玩家惹火才通过', () => {
    const n = npc()
    n.base['愤怒'] = 50
    n.sp_flag = {}
    expect(conditionEngine.evaluatePremises(['TARGET_ABD_OR_ANGRY_MOOD'], execCtx().evalCtx())).toBe(true)
    expect(conditionEngine.evaluatePremises(['TARGET_NOT_ANGRY_WITH_PLAYER'], execCtx().evalCtx())).toBe(true)
    n.base['愤怒'] = 30
    expect(conditionEngine.evaluatePremises(['TARGET_ABD_OR_ANGRY_MOOD'], execCtx().evalCtx())).toBe(false)
    n.base['愤怒'] = 50
    n.sp_flag = { angry_with_player: true }
    expect(conditionEngine.evaluatePremises(['TARGET_NOT_ANGRY_WITH_PLAYER'], execCtx().evalCtx())).toBe(false)
  })

  it('指令已注册：daily / 耗时45 / 前提含两个新前提', () => {
    const cmd = commandRegistry.getById('listen_complaint')
    expect(cmd).toBeDefined()
    expect(cmd!.category).toBe('daily')
    expect(cmd!.timeCost).toBe(45)
    expect(cmd!.premises).toContain('TARGET_ABD_OR_ANGRY_MOOD')
    expect(cmd!.premises).toContain('TARGET_NOT_ANGRY_WITH_PLAYER')
  })

  it('执行成功：话术0 → 减怒20 + 好感/好意/经验/自耗 + 口上查询 talk-common', async () => {
    resetChars()
    const n = npc()
    n.base['愤怒'] = 50
    n.base['好感度'] = 0
    n.base['好意'] = 0
    n.sp_flag = {}
    const p = player()
    const before = gameContext.getContext().time
    const callSpy = vi.spyOn(apiSystem, 'call')

    await commandExecutor.execute('listen_complaint', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 45)
    // handle_instruct.py:987——value = int(10 + adjust*10)，话术0 adjust=1.0 → 20
    expect(n.base['愤怒']).toBe(30)
    // 21：好感 +45（calcFavorability(time)=time）
    expect(n.base['好感度']).toBe(45)
    // 53：好意 +（45+30）=75
    expect(n.base['好意']).toBe(75)
    // CVE_A2/A1：双方对话经验 +1
    expect(n.experience['80']).toBe(1)
    expect(p.experience['80']).toBe(1)
    // 1511/1512：自己体力 -45、气力 -135（degree0：HP1/MP3 每分钟）
    expect(p.base['体力']).toBe(155)
    expect(p.base['气力']).toBe(65)
    const queries = callSpy.mock.calls.filter(args => args[0] === 'talk-common' && args[1] === 'getTextEntry' && args[2] === 'listen_complaint')
    expect(queries.length).toBeGreaterThan(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('前提门控：目标愤怒≤30 → 不执行', async () => {
    resetChars()
    const n = npc()
    n.base['愤怒'] = 30
    n.sp_flag = {}
    const before = gameContext.getContext().time

    await commandExecutor.execute('listen_complaint', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute)
    expect(n.base['愤怒']).toBe(30)
  })

  it('前提门控：目标被玩家惹火 → 不执行', async () => {
    resetChars()
    const n = npc()
    n.base['愤怒'] = 50
    n.sp_flag = { angry_with_player: true }
    const before = gameContext.getContext().time

    await commandExecutor.execute('listen_complaint', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute)
    expect(n.base['愤怒']).toBe(50)
  })

  it('口上：listen_complaint 默认兜底存在且不含世界观残留', async () => {
    resetChars()
    const text = await apiSystem.call('talk-common', 'getText', 'listen_complaint', 'npc_1', 'player') as string | null
    expect(text).toBeTruthy()
    expect(text).not.toContain('博士')
    expect(text).not.toContain('源石')
    expect(text).not.toContain('罗德岛')
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })
})