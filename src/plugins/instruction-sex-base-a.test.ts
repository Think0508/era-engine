// 注释：B4 SEX/base 第一批（6002/6006/6013/6014）——使用已有效果/API 的 4 条
// 覆盖：指令注册、h_end/hidden_sex_end 结束清理、orgasm_edge 开关、口上默认文件

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
import { onLoad as hNpcAiOnLoad, onEnable as hNpcAiOnEnable } from './h-npc-ai/index'
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
  player().h_state = { is_h: true, orgasm_edge: 0 }
  npc().h_state = { is_h: true, orgasm_edge: 0 }
  npc().sp_flag = {}
}

describe('B4 SEX/base 第一批（6002/6006/6013/6014）', () => {
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

  it('4 条指令已注册', () => {
    for (const id of ['h_end', 'hidden_sex_end', 'orgasm_edge_on', 'orgasm_edge_off']) {
      expect(commandRegistry.getById(id)).toBeDefined()
    }
  })

  it('h_end：结束 H 并清空 h_state', async () => {
    resetChars()
    player().h_state = { is_h: true, orgasm_edge: 0 }
    npc().h_state = { is_h: true, orgasm_edge: 0 }
    await commandExecutor.execute('h_end', execCtx())
    expect(player().h_state).toBeUndefined()
    expect(npc().h_state).toBeUndefined()
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('hidden_sex_end：清除隐奸模式 + 结束 H', async () => {
    resetChars()
    const n = npc()
    n.sp_flag = { hidden_sex_mode: 2 }
    n.h_state = { is_h: true, orgasm_edge: 0 }
    player().h_state = { is_h: true, orgasm_edge: 0 }
    await commandExecutor.execute('hidden_sex_end', execCtx())
    expect(n.sp_flag.hidden_sex_mode).toBe(0)
    expect(player().h_state).toBeUndefined()
    expect(n.h_state).toBeUndefined()
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('orgasm_edge_on：目标寸止状态置 1', async () => {
    resetChars()
    const n = npc()
    n.h_state = { is_h: true, orgasm_edge: 0, orgasm_edge_count: {} }
    await commandExecutor.execute('orgasm_edge_on', execCtx())
    expect(n.h_state.orgasm_edge).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('orgasm_edge_off：目标寸止状态清 0', async () => {
    resetChars()
    const n = npc()
    n.h_state = { is_h: true, orgasm_edge: 1, orgasm_edge_count: { 4: 1 } }
    await commandExecutor.execute('orgasm_edge_off', execCtx())
    expect(n.h_state.orgasm_edge).toBe(0)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of ['h_end', 'hidden_sex_end', 'orgasm_edge_on', 'orgasm_edge_off']) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text).not.toContain('博士')
      expect(text).not.toContain('源石')
    }
  })
})