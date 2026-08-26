// 注释：B4-B7 SEX/drug philter（6102）复刻测试
// 覆盖：HAVE_PHILTER 前置（自己背包）、效果链数值（21/13/14/62/942/1002）、口上默认文件
// 注意：13/14 为 medium 双方消耗，测试把双方气力抬到 300 避免 MP=0 转 HP 的连锁分支，
// 以便直接断言 -30/-60 的主数值链。

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
import { onLoad as sleepOnLoad } from './sleep-system/index'
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
  player().inventory = [{ itemId: '媚药', count: 1 }]
  npc().inventory = []
  // 避免 MP=0 转 HP 分支，单独验证 13/14 的 medium 主数值链
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
}

describe('B4-B7 SEX/drug philter（6102）', () => {
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

  it('philter 已注册', () => {
    expect(commandRegistry.getById('philter')).toBeDefined()
  })

  it('philter：消耗媚药并结算完整效果链', async () => {
    resetChars()
    await commandExecutor.execute('philter', execCtx())

    const p = player()
    const n = npc()

    // 942 USE_PHILTER：玩家背包 1 个媚药被消耗
    expect(p.inventory.some((i: any) => i.itemId === '媚药')).toBe(false)

    // 21 ADD_INTERACTION_FAVORABILITY：目标好感 +10（默认无修正时 floor(1×10)）
    expect(n.base['好感度']).toBe(10)

    // 13 DOWN_BOTH_MEDIUM_HIT_POINT：双方体力 -30（medium 3/分 × 10）
    expect(p.base['体力']).toBe(70)
    expect(n.base['体力']).toBe(70)

    // 14 DOWN_BOTH_MEDIUM_MANA_POINT：双方气力 -60（medium 6/分 × 10）
    expect(p.base['气力']).toBe(240)
    expect(n.base['气力']).toBe(240)

    // 62 TARGET_ADD_SMALL_DISGUST：目标反感 +15（(10+5)×1）
    expect(n.base['反感']).toBe(15)

    // 1002 TARGET_ADD_HUGE_DESIRE_AND_SUBMIT：欲情/屈服 +10000，欲望值=100
    expect(n.base['欲情']).toBe(10000)
    expect(n.base['屈服']).toBe(10000)
    expect(n.desire_point).toBe(100)

    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('HAVE_PHILTER 为 false 时前提矩阵不通过（无媚药）', () => {
    resetChars()
    player().inventory = []
    expect(execCtx().evaluatePremises(['HAVE_TARGET', 'T_NPC_NOT_ACTIVE_H', 'TARGET_IS_H', 'HAVE_PHILTER'])).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    const text = await apiSystem.call('talk-common', 'getText', 'philter', 'npc_1', 'player') as string | null
    expect(text).toBeTruthy()
    expect(text).not.toContain('博士')
    expect(text).not.toContain('源石')
  })
})
