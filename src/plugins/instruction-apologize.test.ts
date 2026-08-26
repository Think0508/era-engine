// 注释：apologize（1023 道歉）复刻测试——B1 剩余
// 覆盖：指令注册/耗时60/前提 TARGET_ANGRY_WITH_PLAYER、成败分支（减怒后≤30 → 成功链含 341 清标记；
//       >30 → 失败链好感下降）、口上查询成败场景、无世界观
// 数值依据：Behavior_Data.csv:26-27（duration=60）+ Behavior_Effect.csv:25-26
//          + handle_instruct.py:958-975（int(10+adjust*10)）

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

function resetChars(talkLv = 0): void {
  resetCharacterEntity(player(), DEFAULT_PLAYER_BASE)
  resetCharacterEntity(npc(), DEFAULT_NPC_BASE)
  player().abilities = { 话术技能: { level: talkLv, xp: 0 } }
  const p = player()
  p.base['体力'] = 200
  p.base['气力'] = 200
  p.base['体力上限'] = 200
  p.base['气力上限'] = 200
  const n = npc()
  n.base['愤怒'] = 0
  n.base['反感'] = 0
  n.base['好意'] = 0
  n.base['好感度'] = 0
  n.sp_flag = {}
}

describe('apologize（1023）复刻', () => {
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

  it('指令已注册：daily / 耗时60 / 前提含 TARGET_ANGRY_WITH_PLAYER', () => {
    const cmd = commandRegistry.getById('apologize')
    expect(cmd).toBeDefined()
    expect(cmd!.category).toBe('daily')
    expect(cmd!.timeCost).toBe(60)
    expect(cmd!.premises).toContain('TARGET_ANGRY_WITH_PLAYER')
  })

  it('成功分支：话术0 → 愤怒 50-20=30 ≤30 → 清标记 + 反感 + 自己HP/MP + 经验 + 口上 apologize', async () => {
    resetChars(0)
    const n = npc()
    n.base['愤怒'] = 50
    n.base['反感'] = 0
    n.sp_flag = { angry_with_player: true }
    const p = player()
    const before = gameContext.getContext().time
    const callSpy = vi.spyOn(apiSystem, 'call')

    await commandExecutor.execute('apologize', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 60)
    expect(n.base['愤怒']).toBe(30)
    expect(n.sp_flag.angry_with_player).toBe(false)
    // 62：反感 +（60+5）=65（话术/反发刻印0 → adjust 1）
    expect(n.base['反感']).toBe(65)
    // CVE_A1：自己对话经验 +1
    expect(p.experience['80']).toBe(1)
    // 1511/1512：体力 -60、气力 -180（degree0）
    expect(p.base['体力']).toBe(140)
    expect(p.base['气力']).toBe(20)
    const queries = callSpy.mock.calls.filter(args => args[0] === 'talk-common' && args[1] === 'getTextEntry' && args[2] === 'apologize')
    expect(queries.length).toBeGreaterThan(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('失败分支：愤怒 100-20=80 >30 → 好感下降 + 好意 + 自己HP/MP + 经验 + 口上 apologize_failed', async () => {
    resetChars(0)
    const n = npc()
    n.base['愤怒'] = 100
    n.base['好感度'] = 100
    n.base['好意'] = 0
    n.sp_flag = { angry_with_player: true }
    const p = player()
    const before = gameContext.getContext().time
    const callSpy = vi.spyOn(apiSystem, 'call')

    await commandExecutor.execute('apologize', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 60)
    expect(n.base['愤怒']).toBe(80)
    expect(n.sp_flag.angry_with_player).toBe(true) // 失败不清标记
    // 23：好感 100 - calcFavorability(60)=60 → 40
    expect(n.base['好感度']).toBe(40)
    // 53：好意 +（60+30）=90
    expect(n.base['好意']).toBe(90)
    expect(p.experience['80']).toBe(1)
    const queries = callSpy.mock.calls.filter(args => args[0] === 'talk-common' && args[1] === 'getTextEntry' && args[2] === 'apologize_failed')
    expect(queries.length).toBeGreaterThan(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('前提门控：目标未被玩家惹火 → 不执行', async () => {
    resetChars(0)
    const n = npc()
    n.base['愤怒'] = 50
    n.sp_flag = {}
    const before = gameContext.getContext().time

    await commandExecutor.execute('apologize', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute)
    expect(n.base['愤怒']).toBe(50)
  })

  it('口上：apologize / apologize_failed 默认兜底存在且不含世界观残留', async () => {
    resetChars(0)
    const success = await apiSystem.call('talk-common', 'getText', 'apologize', 'npc_1', 'player') as string | null
    const failed = await apiSystem.call('talk-common', 'getText', 'apologize_failed', 'npc_1', 'player') as string | null
    expect(success).toBeTruthy()
    expect(failed).toBeTruthy()
    for (const text of [success, failed]) {
      expect(text).not.toContain('博士')
      expect(text).not.toContain('源石')
      expect(text).not.toContain('罗德岛')
    }
  })
})