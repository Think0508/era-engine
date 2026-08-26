// 注释：B3 基础触摸剩余 8 条（5012/5013/5014/5015/5016/5024/5025/5026）复刻测试
// 覆盖：指令注册、基础数值链、口上默认文件、无 error

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
import { onLoad as firstTimeOnLoad, onEnable as firstTimeOnEnable } from './h-first-time/index'
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
  n.base['先导'] = 0
  n.base['屈服'] = 0
  n.base['苦痛'] = 0
  n.base['恐怖'] = 0
  n.base['润滑'] = 0
  n.base['习得'] = 0
  n.base['胸部'] = 0
  n.base['阴蒂'] = 0
  n.base['阴道'] = 0
  n.base['后穴'] = 0
  n.base['口喉'] = 0
  n.sp_flag = {}
  n.equipment = {}
}

describe('B3 基础触摸剩余 8 条（5012/5013/5014/5015/5016/5024/5025/5026）', () => {
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
    firstTimeOnLoad(stubCtx)
    await firstTimeOnEnable(stubCtx)

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

  it('8 条指令已注册且耗时正确', () => {
    const expectTime: Record<string, number> = {
      hand_in_hand: 10, embrace: 3, lap_pillow: 30, kiss: 5,
      raise_skirt: 5, touch_clitoris: 5, touch_vagina: 5, touch_anus: 5,
    }
    for (const [id, time] of Object.entries(expectTime)) {
      const cmd = commandRegistry.getById(id)
      expect(cmd).toBeDefined()
      expect(cmd!.category).toBe('obscenity')
      expect(cmd!.timeCost).toBe(time)
    }
  })

  it('hand_in_hand：时间+10 + 好感/恭顺/快乐/反感', async () => {
    resetChars()
    const n = npc()
    await commandExecutor.execute('hand_in_hand', execCtx())
    expect(n.base['好感度']).toBe(10)
    expect(n.base['恭顺']).toBe(40)
    expect(n.base['快乐']).toBe(40)
    expect(n.base['反感']).toBe(15)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('embrace：时间+3 + 好意/快乐/羞耻/反感', async () => {
    resetChars()
    const n = npc()
    await commandExecutor.execute('embrace', execCtx())
    expect(n.base['好感度']).toBe(3)
    expect(n.base['好意']).toBe(33)
    expect(n.base['快乐']).toBe(33)
    expect(n.base['羞耻']).toBe(33)
    expect(n.base['反感']).toBe(8)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('lap_pillow：时间+30 + 好意/先导/羞耻/反感（需地点有家具）', async () => {
    resetChars()
    const n = npc()
    const loc = gameContext.getContext().location as any
    const oldFurniture = loc.furniture_count
    loc.furniture_count = 1
    try {
      await commandExecutor.execute('lap_pillow', execCtx())
      expect(n.base['好感度']).toBe(30)
      expect(n.base['好意']).toBe(60)
      expect(n.base['先导']).toBe(60)
      expect(n.base['羞耻']).toBe(60)
      expect(n.base['反感']).toBe(35)
    } finally {
      loc.furniture_count = oldFurniture
    }
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('kiss：时间+5 + 初吻/习得/好意/羞耻/反感 + 口喉 + 经验', async () => {
    resetChars()
    const n = npc()
    await commandExecutor.execute('kiss', execCtx())
    expect(n.base['好感度']).toBe(5)
    expect(n.base['习得']).toBe(35)
    expect(n.base['好意']).toBe(35)
    expect(n.base['羞耻']).toBe(35)
    expect(n.base['反感']).toBe(10)
    expect(n.base['口喉']).toBeGreaterThan(0)
    expect(n.experience['40']).toBe(1)
    expect(n.experience['153']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('raise_skirt：时间+5 + 欲情/羞耻/反感 + 内裤可见（需目标穿裙）', async () => {
    resetChars()
    const n = npc()
    n.equipment = { lower: '裙子' }
    await commandExecutor.execute('raise_skirt', execCtx())
    expect(n.base['好感度']).toBe(5)
    expect(n.base['欲情']).toBe(35)
    expect(n.base['羞耻']).toBe(35)
    expect(n.base['反感']).toBe(10)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('touch_clitoris：阴蒂快感 + 润滑/屈服/羞耻/恐怖/反感 + 经验', async () => {
    resetChars()
    const n = npc()
    await commandExecutor.execute('touch_clitoris', execCtx())
    expect(n.base['好感度']).toBe(5)
    expect(n.base['润滑']).toBe(35)
    expect(n.base['屈服']).toBe(35)
    expect(n.base['羞耻']).toBe(35)
    expect(n.base['恐怖']).toBe(15)
    expect(n.base['反感']).toBe(10)
    expect(n.base['阴蒂']).toBeGreaterThan(0)
    expect(n.experience['2']).toBe(1)
    expect(player().experience['41']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('touch_vagina：阴道快感 + 润滑/屈服/羞耻/苦痛/恐怖/反感 + 经验', async () => {
    resetChars()
    const n = npc()
    await commandExecutor.execute('touch_vagina', execCtx())
    expect(n.base['好感度']).toBe(5)
    expect(n.base['润滑']).toBe(35)
    expect(n.base['屈服']).toBe(35)
    expect(n.base['羞耻']).toBe(35)
    expect(n.base['苦痛']).toBe(35)
    expect(n.base['恐怖']).toBe(15)
    expect(n.base['反感']).toBe(10)
    expect(n.base['阴道']).toBeGreaterThan(0)
    expect(n.experience['4']).toBe(1)
    expect(n.experience['65']).toBe(1)
    expect(player().experience['41']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('touch_anus：后穴快感 + 润滑/屈服/羞耻/苦痛/恐怖/反感 + 经验', async () => {
    resetChars()
    const n = npc()
    await commandExecutor.execute('touch_anus', execCtx())
    expect(n.base['好感度']).toBe(5)
    expect(n.base['润滑']).toBe(35)
    expect(n.base['屈服']).toBe(35)
    expect(n.base['羞耻']).toBe(35)
    expect(n.base['苦痛']).toBe(35)
    expect(n.base['恐怖']).toBe(15)
    expect(n.base['反感']).toBe(10)
    expect(n.base['后穴']).toBeGreaterThan(0)
    expect(n.experience['5']).toBe(1)
    expect(n.experience['66']).toBe(1)
    expect(player().experience['41']).toBe(1)
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })

  it('口上默认文件存在且无世界观残留', async () => {
    resetChars()
    for (const scene of ['hand_in_hand', 'embrace', 'lap_pillow', 'kiss', 'raise_skirt', 'touch_clitoris', 'touch_vagina', 'touch_anus']) {
      const text = await apiSystem.call('talk-common', 'getText', scene, 'npc_1', 'player') as string | null
      expect(text, scene).toBeTruthy()
      expect(text).not.toContain('博士')
      expect(text).not.toContain('源石')
    }
  })
})