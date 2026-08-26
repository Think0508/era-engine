// 注释：B4-B7 SEX/drug birth_control_pills_before/after（6108/6109）复刻测试
// 覆盖：前置、效果链 21/13/14/(58)/62/948/949/1009/1010、body_item[11]/[12] 状态、口上默认文件

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
import { onLoad as inventoryOnLoad, onEnable as inventoryOnEnable } from './inventory-system/index'
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
import { onLoad as ejaculationOnLoad } from './h-ejaculation/index'
import { onLoad as pregnancyOnLoad } from './h-pregnancy/index'
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
  player().h_state = { is_h: true }
  npc().h_state = { is_h: true }
  player().inventory = []
  npc().inventory = []
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
}

describe('B4-B7 SEX/drug 避孕药（6108/6109）', () => {
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
    inventoryOnLoad(stubCtx)
    await inventoryOnEnable(stubCtx)
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
    await hiddenOnEnable(stubCtx)
    groupSexOnLoad(stubCtx)
    await groupSexOnEnable(stubCtx)
    hNpcAiOnLoad(stubCtx)
    await hNpcAiOnEnable(stubCtx)
    ejaculationOnLoad(stubCtx)
    pregnancyOnLoad(stubCtx)

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

  it('两条避孕药指令已注册', () => {
    expect(commandRegistry.getById('birth_control_pills_before')).toBeDefined()
    expect(commandRegistry.getById('birth_control_pills_after')).toBeDefined()
  })

  it('birth_control_pills_before：消耗事前避孕药 + body_item[11]', async () => {
    resetChars()
    player().inventory = [{ itemId: '事前避孕药', count: 1 }]
    await commandExecutor.execute('birth_control_pills_before', execCtx())

    const p = player()
    const n = npc()

    expect(p.inventory.some((i: any) => i.itemId === '事前避孕药')).toBe(false)
    expect(n.base['好感度']).toBe(10)
    expect(p.base['体力']).toBe(70)
    expect(n.base['体力']).toBe(70)
    expect(p.base['气力']).toBe(240)
    expect(n.base['气力']).toBe(240)
    expect(n.base['反感']).toBe(15)
    expect(n.body_items?.['11']?.active).toBe(true)
    expect(n.body_items?.['11']?.itemId).toBe('事前避孕药')
    expect(typeof n.body_items?.['11']?.expiry).toBe('number')

    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('birth_control_pills_after：消耗事后避孕药 + body_item[12]', async () => {
    resetChars()
    player().inventory = [{ itemId: '事后避孕药', count: 1 }]
    await commandExecutor.execute('birth_control_pills_after', execCtx())

    const p = player()
    const n = npc()

    expect(p.inventory.some((i: any) => i.itemId === '事后避孕药')).toBe(false)
    expect(n.base['好感度']).toBe(10)
    expect(p.base['体力']).toBe(70)
    expect(n.base['体力']).toBe(70)
    expect(p.base['气力']).toBe(240)
    expect(n.base['气力']).toBe(240)
    expect(n.base['羞耻']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.body_items?.['12']?.active).toBe(true)
    expect(n.body_items?.['12']?.itemId).toBe('事后避孕药')

    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('前置矩阵：无对应避孕药时不通过', () => {
    resetChars()
    player().inventory = []
    expect(execCtx().evaluatePremises(['HAVE_TARGET', 'T_NPC_NOT_ACTIVE_H', 'TARGET_IS_H', 'HAVE_BIRTH_CONTROL_PILLS_BEFORE'])).toBe(false)
    expect(execCtx().evaluatePremises(['HAVE_TARGET', 'T_NPC_NOT_ACTIVE_H', 'TARGET_IS_H', 'HAVE_BIRTH_CONTROL_PILLS_AFTER'])).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of ['birth_control_pills_before', 'birth_control_pills_after']) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text, scene).not.toContain('博士')
      expect(text, scene).not.toContain('源石')
    }
  })
})