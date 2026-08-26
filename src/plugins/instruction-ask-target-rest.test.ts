// 注释：ask_target_rest（1021 让对方休息）复刻测试——B1 最后一条
// 覆盖：指令注册/耗时1/前提 TARGET_HP_OR_MP_LOW、执行后目标进入 rest 行为块、HP 不低则门控、
//       erArk 无口上 CSV → 不编造、无 error
// 数值依据：InstructConfig.csv:44 + handle_instruct.py:939-946（WAIT duration=1）

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
import { onLoad as sleepOnLoad, onEnable as sleepOnEnable } from './sleep-system/index'
import { onLoad as timeStopOnLoad, onEnable as timeStopOnEnable } from './h-time-stop/index'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from './dialogue-system/index'
import { onEnable as talkCommonOnEnable } from './talk-common-system/index'
import { onEnable as confinementOnEnable } from './confinement-system/index'
import { onLoad as exposureOnLoad, onEnable as exposureOnEnable } from './h-exposure/index'
import { onLoad as followOnLoad, onEnable as followOnEnable } from './follow-system/index'
import { onLoad as hiddenOnLoad, onEnable as hiddenOnEnable } from './h-hidden/index'
import { onLoad as groupSexOnLoad, onEnable as groupSexOnEnable } from './h-group-sex/index'
import { onLoad as npcAiOnLoad, onEnable as npcAiOnEnable } from './npc-ai-system/index'
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
  const n = npc()
  n.base['体力'] = 100
  n.base['体力上限'] = 100
  n.base['气力'] = 100
  n.base['气力上限'] = 100
  n.sp_flag = {}
  n.ai_behavior = undefined
}

// 目标体力/气力低于 30%
function makeTargetLow(): void {
  const n = npc()
  n.base['体力'] = 20
  n.base['体力上限'] = 100
  n.base['气力'] = 50
  n.base['气力上限'] = 100
}

describe('ask_target_rest（1021）复刻', () => {
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
    hiddenOnEnable(stubCtx)
    groupSexOnLoad(stubCtx)
    await groupSexOnEnable(stubCtx)
    npcAiOnLoad(stubCtx)
    npcAiOnEnable(stubCtx)

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

  it('指令已注册：daily / 耗时1 / 前提含 TARGET_HP_OR_MP_LOW', () => {
    const cmd = commandRegistry.getById('ask_target_rest')
    expect(cmd).toBeDefined()
    expect(cmd!.category).toBe('daily')
    expect(cmd!.timeCost).toBe(1)
    expect(cmd!.premises).toContain('TARGET_HP_OR_MP_LOW')
  })

  it('执行成功：目标体力低于30% → 进入 rest 行为块 + 时间+1 + 无 error', async () => {
    resetChars()
    makeTargetLow()
    const n = npc()
    const before = gameContext.getContext().time
    const callSpy = vi.spyOn(apiSystem, 'call')

    await commandExecutor.execute('ask_target_rest', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 1)
    expect(n.ai_behavior?.type).toBe('rest')
    const restCalls = callSpy.mock.calls.filter(args => args[0] === 'npc-ai' && args[1] === 'setBehavior' && args[2] === 'npc_1' && args[3] === 'rest')
    expect(restCalls.length).toBeGreaterThan(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('前提门控：目标体力/气力均不低于30% → 不执行', async () => {
    resetChars()
    const n = npc()
    const before = gameContext.getContext().time

    await commandExecutor.execute('ask_target_rest', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute)
    expect(n.ai_behavior?.type ?? null).toBeNull()
  })

  it('erArk 无口上 CSV → 不编造 ask_target_rest 口上文件，执行无 error', async () => {
    resetChars()
    makeTargetLow()
    const text = await apiSystem.call('talk-common', 'getText', 'ask_target_rest', 'npc_1', 'player') as string | null
    expect(text).toBeNull()
    await commandExecutor.execute('ask_target_rest', execCtx())
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })
})