// 注释：B4-B7 SEX/foreplay D 组（make_masturebate / make_lick_anal）复刻测试

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
  player().h_state = { is_h: true, target_character_id: 'npc_1' }
  npc().h_state = { is_h: true }
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  player().base['射精欲'] = 0
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
}

const D_IDS = ['make_masturebate', 'make_lick_anal']

describe('B4-B7 SEX/foreplay D 组（6215/6216）', () => {
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
    ejaculationOnEnable(stubCtx)

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

  it('D 组 2 条指令已注册', () => {
    for (const id of D_IDS) {
      expect(commandRegistry.getById(id), id).toBeDefined()
    }
  })

  it('make_masturebate：命令自慰状态链', async () => {
    resetChars()
    await commandExecutor.execute('make_masturebate', execCtx())
    const n = npc()
    expect(n.base['好感度']).toBe(10)
    expect(n.base['皮肤']).toBe(40)
    expect(n.base['润滑']).toBe(40)
    expect(n.base['习得']).toBe(40)
    expect(n.base['欲情']).toBe(40)
    expect(n.base['屈服']).toBe(40)
    expect(n.base['羞耻']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.experience?.['41']).toBe(1)
    expect(n.experience?.['47']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('make_lick_anal：命令舔肛链 + 自己射精欲上升', async () => {
    resetChars()
    await commandExecutor.execute('make_lick_anal', execCtx())
    const n = npc()
    expect(n.base['好感度']).toBe(10)
    expect(n.base['习得']).toBe(40)
    expect(n.base['先导']).toBe(40)
    expect(n.base['屈服']).toBe(40)
    expect(n.base['羞耻']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.base['口喉']).toBeGreaterThan(0)
    expect(n.experience?.['30']).toBe(1)
    expect(n.experience?.['42']).toBe(1)
    expect(player().base['射精欲']).toBeGreaterThan(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of D_IDS) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text, scene).not.toContain('博士')
      expect(text, scene).not.toContain('源石')
    }
  })
})
