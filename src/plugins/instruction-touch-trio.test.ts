// 注释：B3 基础触摸试点——touch_head（5002）/ touch_breast（5003）/ touch_buttocks（5004）
// 覆盖：指令注册/耗时10/前提、基础数值链、口上默认文件、无 error
// 数值依据：Behavior_Data.csv:310-312（duration=10）+ Behavior_Effect.csv 对应链

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
  const p = player()
  p.base['体力'] = 200
  p.base['气力'] = 200
  p.base['体力上限'] = 200
  p.base['气力上限'] = 200
  const n = npc()
  n.base['体力'] = 200
  n.base['气力'] = 200
  n.base['体力上限'] = 200
  n.base['气力上限'] = 200
  n.base['好感度'] = 0
  n.base['恭顺'] = 0
  n.base['好意'] = 0
  n.base['快乐'] = 0
  n.base['羞耻'] = 0
  n.base['反感'] = 0
  n.base['欲情'] = 0
  n.base['屈服'] = 0
  n.base['苦痛'] = 0
  n.base['胸部'] = 0
  n.sp_flag = {}
}

describe('B3 基础触摸试点（5002/5003/5004）', () => {
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

  it('三种指令已注册：daily?→obscenity / 耗时10 / 前提含 T_NORMAL_56_OR_UNCONSCIOUS_FLAG', () => {
    for (const id of ['touch_head', 'touch_breast', 'touch_buttocks']) {
      const cmd = commandRegistry.getById(id)
      expect(cmd).toBeDefined()
      expect(cmd!.category).toBe('obscenity')
      expect(cmd!.timeCost).toBe(10)
      expect(cmd!.premises).toContain('T_NORMAL_56_OR_UNCONSCIOUS_FLAG')
    }
  })

  it('touch_head 执行：时间+10 + 好感/恭顺/好意/快乐/羞耻/反感 + HP/MP 消耗 + 口上', async () => {
    resetChars()
    const n = npc()
    const p = player()
    const before = gameContext.getContext().time
    const callSpy = vi.spyOn(apiSystem, 'call')

    await commandExecutor.execute('touch_head', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 10)
    expect(n.base['好感度']).toBe(10)
    expect(n.base['恭顺']).toBe(40)
    expect(n.base['好意']).toBe(40)
    expect(n.base['快乐']).toBe(40)
    expect(n.base['羞耻']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(p.base['体力']).toBe(190)
    expect(p.base['气力']).toBe(170)
    expect(n.base['体力']).toBe(190)
    expect(n.base['气力']).toBe(170)
    const queries = callSpy.mock.calls.filter(args => args[0] === 'talk-common' && args[1] === 'getTextEntry' && args[2] === 'touch_head')
    expect(queries.length).toBeGreaterThan(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('touch_breast 执行：胸快/欲情/羞耻/反感 + 经验 1/41 + 口上', async () => {
    resetChars()
    const n = npc()
    const p = player()

    await commandExecutor.execute('touch_breast', execCtx())

    expect(n.base['好感度']).toBe(10)
    expect(n.base['羞耻']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.base['胸部']).toBeGreaterThan(0)
    expect(n.base['欲情']).toBeGreaterThan(0)
    expect(n.experience['1']).toBe(1)
    expect(p.experience['41']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('touch_buttocks 执行：欲情/屈服/羞耻/苦痛/反感 + 经验 0 + 口上', async () => {
    resetChars()
    const n = npc()

    await commandExecutor.execute('touch_buttocks', execCtx())

    expect(n.base['好感度']).toBe(10)
    expect(n.base['欲情']).toBe(40)
    expect(n.base['屈服']).toBe(40)
    expect(n.base['羞耻']).toBe(40)
    expect(n.base['苦痛']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.experience['0']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    resetChars()
    for (const scene of ['touch_head', 'touch_breast', 'touch_buttocks']) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text).not.toContain('博士')
      expect(text).not.toContain('源石')
    }
  })
})