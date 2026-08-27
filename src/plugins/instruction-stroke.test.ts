// 注释：stroke（1005 身体接触）复刻测试——B1 第二条
// 覆盖：成功链全 7 效果 ID 数值 / 体力气力中量扣减 + MP 转 HP / T_NORMAL_56_OR_UNCONSCIOUS_FLAG 前提矩阵 / 口上触发不报错
// 数值依据：InstructConfig.csv:1005 + Behavior_Data.csv:103 + Behavior_Effect.csv:103
//   + default.py:125(21) / :241(13) / :259(14) / :165(22) / :3482(54) / :3506(55) / :3578(58) / :3674(62)
// 通用口上：erArk talk/daily/stroke.csv → 待用户确认世界观句后落 talk-common behavior/daily/stroke.toml

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

/** 重置玩家/NPC 数值（与 chat 测试同基座，保证全字段隔离） */
function resetChars(): void {
  const p = player()
  resetCharacterEntity(p, DEFAULT_PLAYER_BASE)
  const n = npc()
  resetCharacterEntity(n, DEFAULT_NPC_BASE)
}

describe('stroke（1005）复刻', () => {
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

  it('成功链：全 7 效果 ID 数值精确（能力0/无状态修正）', async () => {
    resetChars()
    const n = npc()
    n.base['欲情'] = 0
    n.base['快乐'] = 0
    n.base['羞耻'] = 0
    n.base['反感'] = 0
    n.base['信赖度'] = 0
    const before = gameContext.getContext().time

    await commandExecutor.execute('stroke', execCtx())

    const after = gameContext.getContext().time
    // time_cost=10（Behavior_Data.csv:103）
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 10)
    // 21 好感度 + floor(10×1.0)=10（calcFavorability(tc=10)）
    expect(n.base['好感度']).toBe(10)
    // 13/14 双方中量：先 HP -30，再 MP -60；玩家 50/30 → 20/30 → MP 触 0 转 HP → 1/0
    expect(player().base['体力']).toBe(1)
    expect(player().base['气力']).toBe(0)
    expect(n.base['体力']).toBe(1)
    expect(n.base['气力']).toBe(0)
    // erArk 链不含 22 ADD_SMALL_TRUST（复核修正）：不再额外涨信赖
    expect(n.base['信赖度']).toBe(0)
    // 54/55/58 欲情/快乐/羞耻 +（10+30）×1.0 = 40
    expect(n.base['欲情']).toBe(40)
    expect(n.base['快乐']).toBe(40)
    expect(n.base['羞耻']).toBe(40)
    // 62 反感 +（10+5）×1.0 = 15
    expect(n.base['反感']).toBe(15)
  })

  it('口上触发：scene=stroke 有原生默认兜底且不含世界观残留', async () => {
    resetChars()
    narrativeLog.clear()
    // 直接查 talk-common stroke 词条池非空（角色轨兜底可出文本）
    const text = await apiSystem.call('talk-common', 'getText', 'stroke', 'npc_1', 'player') as string | null
    expect(text).toBeTruthy()
    expect(text).not.toContain('博士')
    expect(text).not.toContain('源石')
    // 执行 stroke 后叙事日志出现角色轨默认口上（前缀 测试NPC：）
    await commandExecutor.execute('stroke', execCtx())
    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(logs.some(t => t.startsWith('测试NPC：'))).toBe(true)
    expect(logs.some(t => t.includes('博士') || t.includes('源石'))).toBe(false)
    expect(errorReporter.getErrors().filter(e => e.severity === 'error')).toEqual([])
  })

  it('口上前提语义：可读别名与 erArk 原名等价（NPC 主动/目标玩家/未陷落）', () => {
    const evalPrem = (premises: string[], overrides: any = {}): boolean => conditionEngine.evaluatePremises(premises, { ...gameContext.getContext(), ...overrides })
    const p = player()
    const n = npc()
    // sys_1 / NPC_INITIATED：发起者非玩家
    for (const prem of ['sys_1', 'NPC_INITIATED']) {
      expect(evalPrem([prem], { sourceId: 'npc_1', selectedCharacterId: 'npc_1' })).toBe(true)
      expect(evalPrem([prem], { sourceId: 'player', selectedCharacterId: 'npc_1' })).toBe(false)
      expect(evalPrem([prem], { sourceId: undefined, selectedCharacterId: 'npc_1' })).toBe(false)
    }
    // sys_4 / TARGET_IS_PLAYER：目标是玩家
    for (const prem of ['sys_4', 'TARGET_IS_PLAYER']) {
      expect(evalPrem([prem], { sourceId: 'npc_1', selectedCharacterId: 'player' })).toBe(true)
      expect(evalPrem([prem], { sourceId: 'npc_1', selectedCharacterId: 'npc_1' })).toBe(false)
    }
    // FALL_LEVEL_E_0 / TARGET_NOT_FALLEN：目标无陷落天赋
    n.talents = {}
    expect(evalPrem(['FALL_LEVEL_E_0'], { selectedCharacterId: 'npc_1' })).toBe(true)
    expect(evalPrem(['TARGET_NOT_FALLEN'], { selectedCharacterId: 'npc_1' })).toBe(true)
    n.talents = { 思慕: {} }
    expect(evalPrem(['FALL_LEVEL_E_0'], { selectedCharacterId: 'npc_1' })).toBe(false)
    expect(evalPrem(['TARGET_NOT_FALLEN'], { selectedCharacterId: 'npc_1' })).toBe(false)
    n.talents = {}
    // 玩家侧同理（NPC 主动时目标是玩家）
    p.talents = {}
    expect(evalPrem(['FALL_LEVEL_E_0'], { selectedCharacterId: 'player' })).toBe(true)
    expect(evalPrem(['TARGET_NOT_FALLEN'], { selectedCharacterId: 'player' })).toBe(true)
    p.talents = { 奴隶: {} }
    expect(evalPrem(['FALL_LEVEL_E_0'], { selectedCharacterId: 'player' })).toBe(false)
    expect(evalPrem(['TARGET_NOT_FALLEN'], { selectedCharacterId: 'player' })).toBe(false)
    p.talents = {}
  })

  it('前提 T_NORMAL_56_OR_UNCONSCIOUS_FLAG：正常/无意识通过，纯睡眠（bits5|6）不通过', () => {
    const evalPrem = (overrides: any): boolean => {
      const n = npc()
      // 合并进 sp_flag（保留其他字段）
      n.sp_flag = { ...n.sp_flag, ...overrides }
      return conditionEngine.evaluatePremises(['T_NORMAL_56_OR_UNCONSCIOUS_FLAG'], { ...gameContext.getContext(), selectedCharacterId: 'npc_1' })
    }
    // 正常目标（无 unnormal 位、无 unconscious_h）→ true
    expect(evalPrem({})).toBe(true)
    // 目标带 bit5|6（睡眠，无 unconscious_h）→ false（不是"正常56"）
    expect(evalPrem({ unnormal_flag: 0x30 })).toBe(false)
    // 目标 unconscious_h=1（睡奸）→ true（OR 分支）
    expect(evalPrem({ unnormal_flag: 0x30, unconscious_h: 1 })).toBe(true)
    // 目标 unconscious_h=3（时停）→ true（OR 分支）
    expect(evalPrem({ unnormal_flag: 0x30, unconscious_h: 3 })).toBe(true)
    // 无目标 → false（本指令还有 HAVE_TARGET，目标必选）
    expect(conditionEngine.evaluatePremises(['T_NORMAL_56_OR_UNCONSCIOUS_FLAG'], { ...gameContext.getContext(), selectedCharacterId: undefined })).toBe(false)
  })

  it('前提查"自己"维度：TIRED_LE_74/HP_G_1 看玩家（tired_type=2 注入）', () => {
    const evalPrem = (premises: string[]): boolean => conditionEngine.evaluatePremises(premises, { ...gameContext.getContext(), selectedCharacterId: 'npc_1' })
    const p = player()
    // 玩家疲劳 >118 → TIRED_LE_74 false（即使目标疲劳 0）
    p.base['疲劳度'] = 119
    expect(evalPrem(['TIRED_LE_74'])).toBe(false)
    p.base['疲劳度'] = 118
    expect(evalPrem(['TIRED_LE_74'])).toBe(true)
    // 玩家体力 ≤1 → HP_G_1 false
    p.base['体力'] = 1
    expect(evalPrem(['HP_G_1'])).toBe(false)
    p.base['体力'] = 2
    expect(evalPrem(['HP_G_1'])).toBe(true)
    // 恢复玩家状态
    p.base['疲劳度'] = 0
    p.base['体力'] = 50
  })

  it('整批执行后无 error 级错误', () => {
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.severity === 'error')).toBe(false)
  })
})