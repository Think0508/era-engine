// 注释：rest（1012 休息）复刻测试——B1 第三条
// 覆盖：指令存在 / 时间+60 / recover_permil 数值恢复（玩家+目标）/ 前提全量迁移门控 / 口上兜底无世界观
// 数值依据：Behavior_Data.csv:110（duration=60）+ 用户确认保留的有意区别（recover_permil 100/200，不搬 21/325/1751）

import { conditionEngine } from '../core/condition-engine'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
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

describe('rest（1012）复刻', () => {
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
  })

  it('指令已注册且来自 native-instructions（test-mod 移除覆盖后仍存在）', () => {
    const cmd = commandRegistry.getById('rest')
    expect(cmd).toBeDefined()
    expect(cmd!.id.startsWith('h_')).toBe(false)
    expect(cmd!.category).toBe('daily')
    expect(cmd!.timeCost).toBe(60)
  })

  it('执行 rest：时间+60 + recover_permil 数值恢复（玩家/目标）', async () => {
    resetChars()
    const before = gameContext.getContext().time
    const p = player()
    const n = npc()
    p.base['体力'] = 50
    p.base['气力'] = 30
    n.base['体力'] = 80
    n.base['气力'] = 50

    await commandExecutor.execute('rest', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 60)
    // rate 100 = 体力上限 10%（100×10% = +10）；rate 200 = 气力上限 20%（100×20% = +20）
    expect(p.base['体力']).toBe(60)
    expect(p.base['气力']).toBe(50)
    expect(n.base['体力']).toBe(90)
    expect(n.base['气力']).toBe(70)
  })
it('无目标休息：仅玩家自己恢复，不产生 selected 缺失 warning', async () => {
    resetChars()
    errorReporter.clear()
    const p = player()
    p.base['体力'] = 50
    p.base['气力'] = 30
    const soloCtx = makeTestExecCtx({
      uiStore: { selectedCharacterId: undefined, selectCharacter: () => {}, setActivePanel: () => {}, clearSelection: () => {} },
    })
    const before = gameContext.getContext().time

    await commandExecutor.execute('rest', soloCtx)

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 60)
    expect(p.base['体力']).toBe(60)
    expect(p.base['气力']).toBe(50)
    const warnings = errorReporter.getErrors().filter(e => e.severity === 'warning' && e.message.includes("target='selected' 但无选中角色"))
    expect(warnings).toEqual([])
  })
it('无目标且 mod 无场景口上时：场景级默认口上兜底输出（一个人休息了一会儿……）', async () => {
    resetChars()
    const mod = modLoader.getMod() as any
    const origSceneDialogue = mod.sceneDialogue
    // 临时移除 mod 的 scene=rest 场景口上，验证 talk-common 默认兜底路径
    mod.sceneDialogue = origSceneDialogue.filter((l: any) => l.scene !== 'rest')
    narrativeLog.clear()
    const soloCtx = makeTestExecCtx({
      uiStore: { selectedCharacterId: undefined, selectCharacter: () => {}, setActivePanel: () => {}, clearSelection: () => {} },
    })

    try {
      await commandExecutor.execute('rest', soloCtx)
    } finally {
      mod.sceneDialogue = origSceneDialogue
    }

    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(logs.some(t => t.includes('休息'))).toBe(true)
    expect(logs.some(t => t.includes('博士') || t.includes('源石'))).toBe(false)
  })

  it('前提全量迁移：玩家疲劳 >134 → 不执行（TIRED_LE_84 门控）', async () => {
    resetChars()
    const p = player()
    p.base['疲劳度'] = 135
    const before = gameContext.getContext().time

    await commandExecutor.execute('rest', execCtx())

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute)
    expect(p.base['体力']).toBe(DEFAULT_PLAYER_BASE['体力'])
    p.base['疲劳度'] = 0
  })

  it('口上：rest 默认兜底存在且不含世界观残留', async () => {
    resetChars()
    narrativeLog.clear()
    const text = await apiSystem.call('talk-common', 'getText', 'rest', 'npc_1', 'player') as string | null
    expect(text).toBeTruthy()
    expect(text).not.toContain('博士')
    expect(text).not.toContain('源石')

    await commandExecutor.execute('rest', execCtx())
    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(logs.some(t => t.includes('博士') || t.includes('源石'))).toBe(false)
    expect(errorReporter.getErrors().filter(e => e.severity === 'error')).toEqual([])
  })

  it('整批执行后无 error 级错误', () => {
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(false)
  })
})