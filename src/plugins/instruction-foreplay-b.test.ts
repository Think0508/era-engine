// 注释：B4-B7 SEX/foreplay B 组（clit_caress / open_labia / cunnilingus / finger_insertion / external_womb_massage）复刻测试

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
import { onLoad as hNpcAiOnLoad, onEnable as hNpcAiOnEnable } from './h-npc-ai/index'
import { onLoad as ejaculationOnLoad } from './h-ejaculation/index'
import { eventBus } from '../core/event-bus'
import { clearBehaviorHistory } from '../core/command-executor'
import { makeTestExecCtx, resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'
import { getEntityAttr } from '../core/entity-utils'

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
  player().base['体力'] = 100
  player().base['气力'] = 300
  player().base['气力上限'] = 300
  npc().base['体力'] = 100
  npc().base['气力'] = 300
  npc().base['气力上限'] = 300
}

const B_IDS = ['clit_caress', 'open_labia', 'cunnilingus', 'finger_insertion', 'external_womb_massage']

describe('B4-B7 SEX/foreplay B 组（6206/6207/6209/6211/6213）', () => {
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

  it('B 组 5 条指令已注册', () => {
    for (const id of B_IDS) {
      expect(commandRegistry.getById(id), id).toBeDefined()
    }
  })

  it('clit_caress / open_labia：阴蒂爱抚链', async () => {
    for (const id of ['clit_caress', 'open_labia']) {
      resetChars()
      await commandExecutor.execute(id, execCtx())
      const n = npc()
      expect(n.base['好感度']).toBe(10)
      expect(n.base['润滑']).toBe(40)
      expect(n.base['阴蒂']).toBeGreaterThan(0)
      expect(n.experience?.['2']).toBe(1)
      expect(player().experience?.['41']).toBe(1)
      expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
    }
  })

  it('cunnilingus：阴蒂+阴道双重部位快感，口经验 42 按源码重复为 2', async () => {
    resetChars()
    await commandExecutor.execute('cunnilingus', execCtx())
    const n = npc()
    expect(n.base['好感度']).toBe(10)
    expect(n.base['润滑']).toBe(40)
    expect(n.base['阴蒂']).toBeGreaterThan(0)
    expect(n.base['阴道']).toBeGreaterThan(0)
    expect(n.experience?.['4']).toBe(1)
    expect(player().experience?.['42']).toBe(2)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('finger_insertion：V 插入链（快乐/羞耻/反感/阴道）', async () => {
    resetChars()
    await commandExecutor.execute('finger_insertion', execCtx())
    const n = npc()
    expect(n.base['好感度']).toBe(10)
    expect(n.base['润滑']).toBe(40)
    expect(n.base['快乐']).toBe(40)
    expect(n.base['羞耻']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(n.base['阴道']).toBeGreaterThan(0)
    expect(n.experience?.['4']).toBe(1)
    expect(n.experience?.['65']).toBe(1)
    expect(player().experience?.['41']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('external_womb_massage：duration=5 → 体力-15/气力-30，子宫快感 + 习得', async () => {
    resetChars()
    await commandExecutor.execute('external_womb_massage', execCtx())
    const p = player()
    const n = npc()
    expect(n.base['好感度']).toBe(5)
    expect(p.base['体力']).toBe(85)
    expect(n.base['体力']).toBe(85)
    expect(p.base['气力']).toBe(270)
    expect(n.base['气力']).toBe(270)
    expect(n.base['润滑']).toBe(35)
    expect(n.base['反感']).toBe(10)
    expect(getEntityAttr(p, '习得')).toBe(35)
    expect(getEntityAttr(n, '习得')).toBe(0)
    expect(n.base['子宫']).toBeGreaterThan(0)
    expect(n.experience?.['7']).toBe(1)
    expect(player().experience?.['41']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    for (const scene of B_IDS) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text, scene).not.toContain('博士')
      expect(text, scene).not.toContain('源石')
    }
  })
})