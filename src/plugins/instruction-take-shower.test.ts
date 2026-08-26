// 注释：take_shower（1015 淋浴）复刻测试——B1 第四条
// 覆盖：效果链 12-304-525-702（1751 设施损坏不搬）数值 / 无目标自洗 / 位置 condition + 自动注入前提门控 / 口上触发
// 数值依据：InstructConfig.csv:38 + Behavior_Data.csv:21 + Behavior_Effect.csv:20
//   + handle_instruct.py:837-840 + default.py:223(12) / :4618(304) / :6685(525) / :9594(702)
// 通用口上：erArk data/talk/daily/take_shower.csv（全部 high_1 AI 长文本）→ 骨架化 talk-common behavior/daily/take_shower.toml

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
import { onLoad as ejaculationOnLoad, onEnable as ejaculationOnEnable } from './h-ejaculation/index'
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

function bathroomLocation(): any {
  return {
    id: 'bathroom',
    name: '浴室',
    type: 'room',
    parent: 'town_square',
    tags: ['has_bathroom'],
    exits: [],
  }
}

/** 重置玩家/NPC 数值（含 dirty/body_semen，防跨用例污染） */
function resetChars(): void {
  const p = player()
  resetCharacterEntity(p, DEFAULT_PLAYER_BASE)
  delete (p as any).dirty
  delete (p as any).body_semen
  const n = npc()
  resetCharacterEntity(n, DEFAULT_NPC_BASE)
  delete (n as any).dirty
  delete (n as any).body_semen
}

describe('take_shower（1015）复刻', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()
    narrativeLog.clear()
    await modLoader.loadMod('test-mod')
    gameContext.setPlayer('player')
    gameContext.setLocation(bathroomLocation())

    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    ejaculationOnLoad(stubCtx)
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
    hCoreOnEnable(stubCtx)
    await ejaculationOnEnable(stubCtx)

    const p = entitySystem.get('character', 'player') as any
    p.current_location = 'bathroom'
    entitySystem.register('character', 'npc_1', {
      id: 'npc_1', name: '测试NPC',
      base: {},
      current_location: 'bathroom',
    })
    gameContext.setSelectedCharacterId('npc_1')
    resetChars()
  })

  beforeEach(() => {
    clearBehaviorHistory()
    gameContext.setLocation(bathroomLocation())
  })

  it('成功链：全 5 可执行 ID 数值精确（time=30, 无目标只扣自己）', async () => {
    resetChars()
    const p = player()
    p.body_semen = {
      6: [0, 60, 1, 100], // 阴道：保留 60×0.2=12
      7: [0, 100, 1, 200], // 子宫：保留 100×0.7=70
      8: [0, 20, 1, 50],   // 后穴：保留 20×0.3=6
      15: [0, 50, 1, 80],  // 胃：保留 50×1=50
      0: [0, 30, 1, 40],   // 头发：归零
    }
    p.dirty = {
      penis_dirty_dict: { semen: true, blood: true },
      a_clean: 5,
      enema_capacity: 3,
      cloth_semen: { 0: [0, 20, 1, 20] },
    }
    const before = gameContext.getContext().time

    await commandExecutor.execute('take_shower', execCtx())

    const after = gameContext.getContext().time
    // time_cost=30（Behavior_Data.csv:21）
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 30)
    // 12 DOWN_BOTH_SMALL_MANA_POINT：玩家 MP -3/分×30 → -90（MP 触 0 转 HP，下限 1）
    expect(p.base['气力']).toBe(0)
    expect(p.base['体力']).toBe(1)
    // erArk target_flag=True 会连带当前选中目标；有选中 NPC 时同样 MP -90 → HP 1（无 HAVE_TARGET 但保留选中目标）
    expect(npc().base['气力']).toBe(0)
    expect(npc().base['体力']).toBe(1)
    // 304 SHOWER_FLAG_TO_3
    expect(p.sp_flag.shower_state).toBe(3)
    // 525 DIRTY_RESET_IN_SHOWER 保留比例与归零
    expect(p.body_semen[6][1]).toBe(12)
    expect(p.body_semen[6][2]).toBe(3)   // 12/100=12% → L3
    expect(p.body_semen[7][1]).toBe(70)
    expect(p.body_semen[7][2]).toBe(7)   // 70/100=70% → L7
    expect(p.body_semen[8][1]).toBe(6)
    expect(p.body_semen[8][2]).toBe(1)   // 6/200=3% → L1
    expect(p.body_semen[15][1]).toBe(50)
    expect(p.body_semen[15][2]).toBe(3)  // 50/500=10% → L3
    expect(p.body_semen[0][1]).toBe(0)
    expect(p.body_semen[0][2]).toBe(0)
    expect(p.dirty.penis_dirty_dict).toEqual({ semen: false, blood: false })
    expect(p.dirty.a_clean).toBe(0)
    expect(p.dirty.enema_capacity).toBe(0)
    expect(p.dirty.cloth_semen[0][1]).toBe(0)
    expect(p.dirty.cloth_semen[0][2]).toBe(0)
    // 702 RECORD_SHOWER_TIME
    expect(p.action_info.last_shower_time).toBeTruthy()
    expect(p.action_info.last_shower_time.day).toBe(after.day)
    expect(p.action_info.last_shower_time.hour).toBe(after.hour)
    expect(p.action_info.last_shower_time.minute).toBe(after.minute)
  })

  it('无目标也可执行：清除选中角色后只结算玩家', async () => {
    resetChars()
    const p = player()
    p.base['气力'] = 50
    p.base['体力'] = 80
    const before = gameContext.getContext().time

    await commandExecutor.execute('take_shower', execCtx({ uiStore: { selectedCharacterId: undefined } }))

    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute + 30)
    expect(p.base['气力']).toBe(0)
    expect(p.base['体力']).toBe(1)
    expect(npc().base['气力']).toBe(50)
    expect(npc().base['体力']).toBe(80)
  })

  it('门控：位置非浴室 / 疲劳超限 / 体力≤1 时不执行', async () => {
    resetChars()
    const p = player()
    // 非浴室
    gameContext.setLocation({ id: 'town_square', name: '城镇广场', type: 'town', tags: ['public'], exits: [] } as any)
    const beforeNonBath = gameContext.getContext().time
    await commandExecutor.execute('take_shower', execCtx())
    expect(gameContext.getContext().time.hour * 60 + gameContext.getContext().time.minute).toBe(beforeNonBath.hour * 60 + beforeNonBath.minute)
    expect(p.base['气力']).toBe(30)

    // 浴室 + 疲劳>134 → TIRED_LE_84 false
    gameContext.setLocation(bathroomLocation())
    p.base['疲劳度'] = 135
    const beforeTired = gameContext.getContext().time
    await commandExecutor.execute('take_shower', execCtx())
    expect(gameContext.getContext().time.hour * 60 + gameContext.getContext().time.minute).toBe(beforeTired.hour * 60 + beforeTired.minute)
    expect(p.base['气力']).toBe(30)
    p.base['疲劳度'] = 0

    // 浴室 + 体力≤1 → HP_G_1 false
    p.base['体力'] = 1
    const beforeHp = gameContext.getContext().time
    await commandExecutor.execute('take_shower', execCtx())
    expect(gameContext.getContext().time.hour * 60 + gameContext.getContext().time.minute).toBe(beforeHp.hour * 60 + beforeHp.minute)
    expect(p.base['气力']).toBe(30)
  })

  it('口上触发：talk-common 默认池存在且无世界观残留', async () => {
    resetChars()
    narrativeLog.clear()
    const text = await apiSystem.call('talk-common', 'getText', 'take_shower', 'player', 'player') as string | null
    expect(text).toBeTruthy()
    expect(text).not.toContain('博士')
    expect(text).not.toContain('源石')

    await commandExecutor.execute('take_shower', execCtx())
    const logs = narrativeLog.getEntries().map((e: any) => String(e.text))
    expect(logs.some(t => t.includes('淋浴') || t.includes('打开淋浴头'))).toBe(true)
    expect(logs.some(t => t.includes('博士') || t.includes('源石'))).toBe(false)
    expect(errorReporter.getErrors().filter(e => e.severity === 'error')).toEqual([])
  })

  it('整批执行后无 error 级错误', () => {
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.severity === 'error')).toBe(false)
  })
})