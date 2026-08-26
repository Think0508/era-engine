// 注释：follow（1019 邀请同行）+ end_follow（1020 结束同行）复刻测试——B1 关联对
// 覆盖：指令注册 / 耗时5 / set_follow 数值（is_follow 1/0 + 条件镜像）/ 前提互斥门控 /
//       talk-common 默认口上（follow/end_follow）触发与无世界观残留
// 数值依据：Behavior_Data.csv:24-25（duration=5）+ Behavior_Effect.csv:23-24（363/365 - 9999）
//          + default.py:5025-5086（TARGET_INTELLIGENT_FOLLOW_ON/OFF）

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
}

describe('follow（1019）/ end_follow（1020）复刻', () => {
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

  it('指令已注册且来自 native-instructions（daily/耗时5/前提含目标跟随互斥）', () => {
    const follow = commandRegistry.getById('follow')
    const endFollow = commandRegistry.getById('end_follow')
    expect(follow).toBeDefined()
    expect(follow!.category).toBe('daily')
    expect(follow!.timeCost).toBe(5)
    expect(follow!.premises).toContain('TARGET_NOT_FOLLOW')
    expect(endFollow).toBeDefined()
    expect(endFollow!.category).toBe('daily')
    expect(endFollow!.timeCost).toBe(5)
    expect(endFollow!.premises).toContain('TARGET_IS_FOLLOW')
  })

  it('执行 follow：目标 is_follow=1 + 时间+5 + 口上查询 talk-common follow', async () => {
    resetChars()
    const n = npc()
    const before = gameContext.getContext().time
    const callSpy = vi.spyOn(apiSystem, 'call')

    await commandExecutor.execute('follow', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 5)
    expect(n.sp_flag.is_follow).toBe(1)
    expect(n.following).toBe(true)
    expect(n.follow_mode).toBe(1)
    const followQueries = callSpy.mock.calls.filter(args => args[0] === 'talk-common' && args[1] === 'getTextEntry' && args[2] === 'follow')
    expect(followQueries.length).toBeGreaterThan(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('执行 end_follow：目标 is_follow=0 + 时间+5 + 口上查询 talk-common end_follow', async () => {
    resetChars()
    const n = npc()
    n.sp_flag = { is_follow: 1 }
    n.following = true
    n.follow_mode = 1
    const before = gameContext.getContext().time
    const callSpy = vi.spyOn(apiSystem, 'call')

    await commandExecutor.execute('end_follow', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 5)
    expect(n.sp_flag.is_follow).toBe(0)
    expect(n.following).toBe(false)
    expect(n.follow_mode).toBe(0)
    const endFollowQueries = callSpy.mock.calls.filter(args => args[0] === 'talk-common' && args[1] === 'getTextEntry' && args[2] === 'end_follow')
    expect(endFollowQueries.length).toBeGreaterThan(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('follow 门控：目标已跟随 → 不执行（TARGET_NOT_FOLLOW false）', async () => {
    resetChars()
    const n = npc()
    n.sp_flag = { is_follow: 1 }
    n.following = true
    n.follow_mode = 1
    const before = gameContext.getContext().time

    await commandExecutor.execute('follow', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute)
    expect(n.sp_flag.is_follow).toBe(1)
  })

  it('end_follow 门控：目标未跟随 → 不执行（TARGET_IS_FOLLOW false）', async () => {
    resetChars()
    const n = npc()
    const before = gameContext.getContext().time

    await commandExecutor.execute('end_follow', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute)
    expect(n.sp_flag.is_follow ?? 0).toBe(0)
  })

  it('口上：follow/end_follow 默认兜底存在且不含世界观残留', async () => {
    resetChars()
    const followText = await apiSystem.call('talk-common', 'getText', 'follow', 'npc_1', 'player') as string | null
    const endFollowText = await apiSystem.call('talk-common', 'getText', 'end_follow', 'npc_1', 'player') as string | null
    expect(followText).toBeTruthy()
    expect(endFollowText).toBeTruthy()
    for (const text of [followText, endFollowText]) {
      expect(text).not.toContain('博士')
      expect(text).not.toContain('源石')
      expect(text).not.toContain('罗德岛')
    }

    narrativeLog.clear()
    const n = npc()
    n.sp_flag = { is_follow: 1 }
    n.following = true
    n.follow_mode = 1
    // 只跑 end_follow，避免 follow 后的日志与本用例纠缠；follow 的口上查询已在上方用例覆盖
    await commandExecutor.execute('end_follow', execCtx())
    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(logs.some(t => t.includes('博士') || t.includes('源石') || t.includes('罗德岛'))).toBe(false)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })
})