// 注释：h-time-stop 资源统一测试（Task 2）——TSP 删除、精力化扣费（consume_sanity 通道）、
// 归零自动中断、时长统计、SANITY_POINT_G_0 前提、quiet 叙事、旧 TSP 字段不再消费
// boot 模式参照 chain-flow.test.ts：effectTypeRegistry 重复注册抛错 → onLoad 只能一次 → 全部放 beforeAll

import { conditionEngine } from '../../core/condition-engine'
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { commandRegistry } from '../../core/command-registry'
import { commandExecutor } from '../../core/command-executor'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { onLoad as effectOnLoad, onEnable as effectOnEnable } from '../effect-system/index'
import { onLoad as hCoreOnLoad, onEnable as hCoreOnEnable } from '../h-core/index'
import { onLoad as dialogueOnLoad, onEnable as dialogueOnEnable } from '../dialogue-system/index'
import { onEnable as talkCommonOnEnable } from '../talk-common-system/index'
import { onLoad as sleepOnLoad } from '../sleep-system/index'
import { onLoad as timeStopOnLoad, onEnable as timeStopOnEnable } from './index'
import { onEnable as mapOnEnable } from '../map-system/index'
import { onLoad as npcAiOnLoad, onEnable as npcAiOnEnable } from '../h-npc-ai/index'
import { onLoad as combatBaseOnLoad } from '../combat-base/index'
import { eventBus } from '../../core/event-bus'
import { makeTestExecCtx } from '../../utils/test-helpers'

// 注释：events 用真实 eventBus——h-time-stop 的 execution_end 监听器必须真实注册才能测到
const stubCtx: any = {
  api: apiSystem,
  events: eventBus,
  commands: commandRegistry,
  ui: { registerSlot: () => {} },
}

const execCtx = makeTestExecCtx

function player(): any {
  return entitySystem.get('character', 'player') as any
}

describe('h-time-stop 资源统一（TSP → 精力）', () => {
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

    // 注释：注册效果/指令/前提（每个插件 onLoad/onEnable 一次）
    effectOnLoad(stubCtx)
    effectOnEnable(stubCtx)
    hCoreOnLoad(stubCtx)
    hCoreOnEnable(stubCtx)
    dialogueOnLoad(stubCtx)
    dialogueOnEnable(stubCtx)
    // 注释：talk-common 提供口上插值（trigger_dialogue 依赖，真实 boot 必载）
    await talkCommonOnEnable(stubCtx)
    // 注释：sleep-system 注册 consume_sanity（扣费通道）；h-time-stop 依赖其 effect
    sleepOnLoad(stubCtx)
    // 注释：map-system 先于 h-time-stop onEnable——move 指令门控补丁依赖其已注册
    // （字母序依赖；测试显式保证）
    await mapOnEnable(stubCtx)
    timeStopOnLoad(stubCtx)
    await timeStopOnEnable(stubCtx)
    // 注释：combat-base 注册 start_combat effect（复查 I-1 时停拒战测试用）
    combatBaseOnLoad(stubCtx)
    // 注释：h-npc-ai 注册 recoverFromUnconsciousH API（536 恢复链测试用——
    // time_stop_off 时停中 H 目标醒来判定，mode='time_stop'）
    npcAiOnLoad(stubCtx)
    await npcAiOnEnable(stubCtx)

    // 玩家（test-mod roster 已注册）——NPC 手动注册
    player().current_location = 'town_square'
    entitySystem.register('character', 'npc_1', {
      id: 'npc_1', name: '测试NPC',
      base: {},
      current_location: 'town_square',
    })
    gameContext.setSelectedCharacterId('npc_1')
  })

  beforeEach(async () => {
    // 注释：重置玩家（base-human 模板含 精力 字段）——精力 100/上限 100
    player().base = { 体力: 100, 体力上限: 100, 气力: 100, 气力上限: 100, 精力: 100, 精力上限: 100 }
    // 注释：门槛素质（2026-08-16 grill 定案——PRIMARY=窄域时停 / INTERMEDIATE=广域时停；
    // 测试默认持有两档，指令/自动移动测试才能走通；门槛本身有专门断言）
    player().talents = { '窄域时停': 1, '广域时停': 1 }
    player().experience = {}
    player().action_info = {}
    narrativeLog.clear()
    errorReporter.clear()
    // 注释：时停状态复位（幂等——未激活时直接 return）
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
  })

  it('扣费公式：时停中执行 time_cost=10 行动 → 精力 100→80、today_sanity_point_cost += 20', async () => {
    await apiSystem.call('effect-system', 'execute', [{ type: 'time_stop_on' }], { sourceId: 'player', _targetIds: ['player'] })
    // 注释：brief 许可的 fallback——现成 time_cost=10 指令（test_judge_cmd）依赖 has_bedroom
    // 地点且 trigger_dialogue 场景缺失会告警，直接 emit execution_end 验证新实现直读 payload.timeCost
    await eventBus.emit('game:execution_end', { commandId: 'rest', timeCost: 10 })
    expect(player().base['精力']).toBe(80)
    expect(player().action_info.today_sanity_point_cost).toBe(20)
  })

  it('SANITY_POINT_G_0 前提：精力 50 → truthy；精力 0 → falsy', () => {
    const ctx = () => ({ ...gameContext.getContext(), sourceId: 'player' }) as any
    player().base['精力'] = 50
    expect(conditionEngine.getPremiseValue('SANITY_POINT_G_0', ctx())).toBeTruthy()
    player().base['精力'] = 0
    expect(conditionEngine.getPremiseValue('SANITY_POINT_G_0', ctx())).toBeFalsy()
  })

  it('归零自动中断：精力 5 → 时停中执行行动 → 精力 0 → isActive() === false + 解除叙事', async () => {
    player().base['精力'] = 5
    await apiSystem.call('effect-system', 'execute', [{ type: 'time_stop_on' }], { sourceId: 'player', _targetIds: ['player'] })
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(true)
    await commandExecutor.execute('wait', execCtx())
    expect(player().base['精力']).toBe(0)
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(false)
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('精力值不足'))).toBe(true)
  })

  it('时长统计：时停中执行 time_cost=30 行动 → getDuration() 增加 30', async () => {
    const before = Number(await apiSystem.call('h-time-stop', 'getDuration'))
    await apiSystem.call('effect-system', 'execute', [{ type: 'time_stop_on' }], { sourceId: 'player', _targetIds: ['player'] })
    await commandExecutor.execute('wait', execCtx())
    expect(Number(await apiSystem.call('h-time-stop', 'getDuration'))).toBe(before + 30)
  })

  it('quiet 叙事：time_stop_on/off 带 params.quiet → 无"时间停止了/时间重新流动"；不带 → 有', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('时间停止了'))).toBe(false)
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('时间重新流动'))).toBe(false)

    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on' },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('时间停止了'))).toBe(true)
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off' },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('时间重新流动'))).toBe(true)
  })

  it('旧 TSP 字段不再消费：执行时停行动后 base 无 TSP/tsp_max、experience 无 time_stop_xp', async () => {
    await apiSystem.call('effect-system', 'execute', [{ type: 'time_stop_on' }], { sourceId: 'player', _targetIds: ['player'] })
    await commandExecutor.execute('wait', execCtx())
    expect(player().base['TSP']).toBeUndefined()
    expect(player().base['tsp_max']).toBeUndefined()
    expect(player().experience?.['time_stop_xp']).toBeUndefined()
  })

  // ═══ Task 3：自动时停移动（moveStart + map-system 改道 + 搬运跟随）═══
  it('开关关：未时停移动 → normal', async () => {
    await apiSystem.call('h-time-stop', 'setAutoMove', false)
    const r = await apiSystem.call('h-time-stop', 'moveStart', 10)
    expect(r).toEqual({ mode: 'normal', cost: 0 })
  })

  it('开关开：未时停移动 → 自动 on + 瞬移扣费 + autoOff（完全静默）', async () => {
    await apiSystem.call('h-time-stop', 'setAutoMove', true)
    const before = player().base['精力']
    const logBefore = narrativeLog.getEntries().length
    const r = await apiSystem.call('h-time-stop', 'moveStart', 10)
    expect(r!.mode).toBe('teleport')
    expect(r!.cost).toBe(20)
    expect(player().base['精力']).toBe(before - 20)
    // autoOff 已执行（quiet——无"时间重新流动"叙事）
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(false)
    // 完全静默：无任何含"时间"的叙事（时间停止了！/时间重新流动/赶路叙事均无）
    const newEntries = narrativeLog.getEntries().slice(logBefore)
    expect(newEntries.every((e: any) => !String(e.text).includes('时间'))).toBe(true)
  })

  it('开关开但精力 0：自动 on 前置检查失败 → normal（不进时停）', async () => {
    await apiSystem.call('h-time-stop', 'setAutoMove', true)
    player().base['精力'] = 0
    const r = await apiSystem.call('h-time-stop', 'moveStart', 10)
    expect(r!.mode).toBe('normal')
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(false)
  })

  it('时停激活中移动：teleport 且时间不前进', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(true)
    const before = gameContext.getContext().time
    const beforeStamina = player().base['精力']
    const r = await apiSystem.call('h-time-stop', 'moveStart', 10)
    const after = gameContext.getContext().time
    expect(r!.mode).toBe('teleport')
    expect(r!.cost).toBe(20)
    expect(player().base['精力']).toBe(beforeStamina - 20)
    // 时停大前提：时间完全不动（分钟级）
    expect(after).toEqual(before)
  })

  it('时停中精力归零：移动后自动 off', async () => {
    player().base['精力'] = 5
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    const r = await apiSystem.call('h-time-stop', 'moveStart', 10)
    expect(r!.mode).toBe('teleport')
    expect(r!.cost).toBe(5) // min(max(10×2,1),5)
    expect(player().base['精力']).toBe(0)
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(false)
  })

  it('搬运跟随：时停中玩家 moveTo → 搬运目标 current_location 同步', async () => {
    const carried = entitySystem.get('character', 'npc_1') as any
    player().current_location = 'town_square'
    carried.current_location = 'town_square'
    gameContext.setLocation(entitySystem.get('location', 'town_square') as any)
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_carry' },
    ], { sourceId: 'player', _targetIds: ['npc_1'] })
    // 时停中移动 = 瞬移（map-system moveTo 改道 → teleport 分支）
    await apiSystem.call('map', 'moveTo', 'tavern')
    expect(carried.current_location).toBe('tavern')
  })

  it('自动时停移动完整循环（map-system 集成）：时间不前进 + 扣费 + 静默', async () => {
    await apiSystem.call('h-time-stop', 'setAutoMove', true)
    player().base['精力'] = 100
    player().current_location = 'town_square'
    gameContext.setLocation(entitySystem.get('location', 'town_square') as any)
    const before = gameContext.getContext().time
    narrativeLog.clear()
    await apiSystem.call('map', 'moveTo', 'tavern')
    const after = gameContext.getContext().time
    // 自动瞬移循环：时间不前进
    expect(after).toEqual(before)
    // 精力扣费：edge time_cost=5 → cost = min(max(5×2,1),100) = 10
    expect(player().base['精力']).toBe(90)
    expect(player().action_info.today_sanity_point_cost).toBe(10)
    // 完全静默：无"时间停止了！"叙事
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('时间停止了'))).toBe(false)
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(false)
    // 位置同步（gameContext + 玩家实体）
    expect(gameContext.getContext().location?.id).toBe('tavern')
    expect(player().current_location).toBe('tavern')
  })

  // ═══ Task 4：时停 5 指令数据落地（data/default/instructions）+ 场景口上 ═══
  it('时停指令已加载且前提可用', async () => {
    const cmd = commandRegistry.getById('time_stop_on')
    expect(cmd).toBeDefined()
    expect(cmd!.premises).toContain('TIME_STOP_OFF')
    expect(cmd!.premises).toContain('SANITY_POINT_G_0')
    expect(commandRegistry.getById('time_stop_off')).toBeDefined()
    expect(commandRegistry.getById('time_stop_off_in_h')).toBeDefined()
    expect(commandRegistry.getById('carry_target')).toBeDefined()
    expect(commandRegistry.getById('stop_carry_target')).toBeDefined()
  })

  it('time_stop_on 指令执行：全场冻结', async () => {
    // 玩家精力 100（beforeEach 重置）——所有前提满足（PRIMARY_TIME_STOP/TIME_STOP_OFF/
    // SANITY_POINT_G_0/TIRED_LE_84），指令应完整执行：time_stop_on 效果 + 场景口上
    await commandExecutor.execute('time_stop_on', execCtx())
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(true)
    // 场景口上输出（time_stop_on 场景行存在——scene-dialogue.toml 追加）
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('世界凝固在眼前'))).toBe(true)
    // 完成后清理：执行 time_stop_off effect 恢复（时停状态是模块级，避免污染后续测试）
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(false)
  })

  it('时停中绝顶：settleOrgasm 门控累积、不推 h:orgasm、解除时恰好释放一次（审计 A-I-1 回归）', async () => {
    // 背景：h-time-stop 原 h:orgasm 监听器与 h-core settleOrgasm 的门控累积功能重复——
    // 时停中 spawn 的清醒 NPC（unconscious_h=0）绝顶会实时结算 + 监听器累计 → 解除时双结算。
    // 监听器已删除；本测试钉死正确语义：时停角色绝顶 → 只累积（无数值无事件）→ 释放一次。
    const { settleOrgasm, releaseTimeStopOrgasm } = await import('../h-core/settle/orgasm')
    const ch = entitySystem.get('character', 'npc_1') as any
    ch.sp_flag = { unconscious_h: 3 }
    ch.h_state = { orgasm_level: {}, extra_orgasm_feel: {}, extra_orgasm_count: 0, orgasm_edge_count: {}, time_stop_orgasm_count: {} }
    let orgasmEvents = 0
    const hOrgasmHandler = () => { orgasmEvents++ }
    eventBus.on('h:orgasm', hOrgasmHandler)
    try {
      // 时停中绝顶 1 次 → 门控累积（orgasm.ts:397-400），不结算不推事件
      const r = settleOrgasm('npc_1', { 4: 1 }, {}, {})
      expect(ch.h_state.time_stop_orgasm_count[4]).toBe(1)
      expect(orgasmEvents).toBe(0)
      expect(r.orgasms.length).toBe(0)
      // 解除：先恢复冻结标记（time_stop_off 的快照恢复步骤）→ release 恰好一次结算 + count 清空
      ch.sp_flag.unconscious_h = 0
      const rel = releaseTimeStopOrgasm('npc_1')
      expect(rel.orgasms.length).toBeGreaterThan(0)
      expect(ch.h_state.time_stop_orgasm_count[4]).toBe(0)
      // 二次释放 → 空（无双结算）
      const rel2 = releaseTimeStopOrgasm('npc_1')
      expect(rel2.orgasms.length).toBe(0)
    } finally {
      eventBus.off('h:orgasm', hOrgasmHandler)
      ch.sp_flag = {}
      ch.h_state = undefined
    }
  })

  it('时停中 start_combat 被拒绝（复查 I-1：冻结敌人不可战）', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    const logBefore = narrativeLog.getEntries().length
    await apiSystem.call('effect-system', 'execute', [
      { type: 'start_combat', params: { enemies: ['npc_1'] } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(narrativeLog.getEntries().slice(logBefore).some((e: any) => String(e.text).includes('时停中无法开始战斗'))).toBe(true)
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
  })

  it('时停中身体实时结算冻结（复查轮 3：erArk realtime_settle.py:306 时停中疲劳不结算）', async () => {
    // 玩家带疲劳度——行动推进的时间在 execution_end 回拨，但 realtimeSettle 副作用不回滚
    // （realtimeSettle 在 command-executor 内同步调用，必须走真实指令链测试）
    player().base['疲劳度'] = 50
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    await commandExecutor.execute('wait', execCtx())  // time_cost=30，非 rest/sleep → 疲劳 +5
    expect(player().base['疲劳度']).toBe(50)  // 时停中：疲劳冻结
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    // 非时停对照：同行动疲劳 +5（30 分钟 / 6）
    player().base['疲劳度'] = 50
    await commandExecutor.execute('wait', execCtx())
    expect(player().base['疲劳度']).toBe(55)
  })
})

// 注释：2026-08-16 grill 复刻增量测试——等级门槛 / 536 恢复链 / 时停奸 / 移动门控 / 精液口上
// ⚠️ 本 describe 无独立 beforeAll——依赖上方 describe 的 beforeAll 副作用（插件 onLoad/onEnable
// 只能执行一次：effectTypeRegistry 重复注册抛错）。全量运行正常；`vitest -t` 单独过滤本组
// 测试时 beforeAll 不会执行（实体未注册 → 报 null），属测试结构已知限制
describe('h-time-stop 门槛与恢复链（2026-08-16）', () => {
  // 注释：门槛前提默认持有两档素质（beforeEach 设置）；本组测试显式移除/设置验证门槛语义
  it('门槛前提：PRIMARY=窄域 / INTERMEDIATE+移动判定=广域 / ADVANCED 恒 false', () => {
    const ctx = () => ({ ...gameContext.getContext(), sourceId: 'player' }) as any
    // 无素质 → 全部 false
    player().talents = {}
    expect(conditionEngine.getPremiseValue('PRIMARY_TIME_STOP', ctx())).toBe(false)
    expect(conditionEngine.getPremiseValue('INTERMEDIATE_TIME_STOP', ctx())).toBe(false)
    expect(conditionEngine.getPremiseValue('ADVANCED_TIME_STOP', ctx())).toBe(false)
    // 未时停 → 移动判定恒 true（时停外移动不受限）
    expect(conditionEngine.getPremiseValue('TIME_STOP_JUDGE_FOR_MOVE', ctx())).toBe(true)
    // 仅窄域 → PRIMARY true / INTERMEDIATE false；时停中移动判定 false
    player().talents = { '窄域时停': 1 }
    expect(conditionEngine.getPremiseValue('PRIMARY_TIME_STOP', ctx())).toBe(true)
    expect(conditionEngine.getPremiseValue('INTERMEDIATE_TIME_STOP', ctx())).toBe(false)
    expect(conditionEngine.getPremiseValue('TIME_STOP_JUDGE_FOR_MOVE', ctx())).toBe(true)  // 未时停
    // 广域 → INTERMEDIATE true
    player().talents = { '窄域时停': 1, '广域时停': 1 }
    expect(conditionEngine.getPremiseValue('INTERMEDIATE_TIME_STOP', ctx())).toBe(true)
  })

  it('门槛：无窄域时停 → time_stop_on 指令不可执行（前提不满足）', async () => {
    player().talents = {}
    await commandExecutor.execute('time_stop_on', execCtx())
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(false)
    // 有窄域 → 指令可执行
    player().talents = { '窄域时停': 1 }
    await commandExecutor.execute('time_stop_on', execCtx())
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(true)
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
  })

  it('移动门控补丁：move 指令带 TIME_STOP_JUDGE_FOR_MOVE 前提；窄域时停中点击被拒', async () => {
    const moveCmd = commandRegistry.getById('move')
    expect(moveCmd).toBeDefined()
    expect(moveCmd!.premises).toContain('TIME_STOP_JUDGE_FOR_MOVE')
    // 窄域（无广域）时停中 → 移动判定 false（command-executor 前提拦截 → 时间不推进/不瞬移）
    player().talents = { '窄域时停': 1 }
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    const before = gameContext.getContext().time
    await commandExecutor.execute('move', {
      ...execCtx(),
      evaluatePremises: (premises: string[]) => conditionEngine.evaluatePremises(premises, { ...gameContext.getContext(), sourceId: 'player' }),
    })
    const after = gameContext.getContext().time
    expect(after.hour * 60 + after.minute).toBe(before.hour * 60 + before.minute)  // 时间未推进
    expect(await apiSystem.call('h-time-stop', 'isActive')).toBe(true)  // 时停未被破坏
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
  })

  it('536 恢复链：时停中 H 目标在 time_stop_off 时醒来（判定通过+陷落≥3 → 清醒配合继续 H）', async () => {
    // 构造：玩家 H 中 + 目标时停冻结；目标高好感/信赖度 + 恋人（严重骚扰判定 750≥600 通过，
    // 陷落=恋人 → 3 ≥ 3 → 继续 → 清醒配合 H 不装睡）
    const girl = entitySystem.get('character', 'npc_1') as any
    girl.base['好感度'] = 10000
    girl.base['信赖度'] = 300
    girl.base['愤怒'] = 0
    girl.base['体力'] = 100  // 防 per-tick 疲劳/体力退出（checkNpcFatigueExit：体力>1 才不退出）
    girl.talents = girl.talents ?? {}
    girl.talents['恋人'] = 1
    player().h_state = { is_h: true, target_character_id: 'npc_1' }
    girl.h_state = { is_h: true, target_character_id: 'player' }
    girl.sp_flag = { unconscious_h: 3 }
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    // 关闭时停 → 536 恢复：目标醒来（unconscious_h 清 0）+ 继续 H（is_h=true，不装睡）
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(girl.sp_flag.unconscious_h).toBe(0)
    expect(girl.h_state?.is_h).toBe(true)
    expect(girl.h_state?.pretend_sleep ?? false).toBe(false)  // 时停模式不装睡
    // 清理 H
    player().h_state = undefined
    girl.h_state = undefined
    girl.sp_flag = {}
  })

  it('536 恢复链：判定不通过（低好感/无陷落）→ 醒来后 H 结束', async () => {
    const girl = entitySystem.get('character', 'npc_1') as any
    girl.base['好感度'] = 0
    girl.base['信赖度'] = 0
    girl.base['愤怒'] = 88
    girl.talents = {}
    player().h_state = { is_h: true, target_character_id: 'npc_1' }
    girl.h_state = { is_h: true, target_character_id: 'player' }
    girl.sp_flag = { unconscious_h: 3 }
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    // 醒来 → 严重骚扰判定失败（DO_H_FAIL 语义）→ endHScene → 双方 H 清空
    expect(girl.sp_flag.unconscious_h).toBe(0)
    expect(girl.h_state?.is_h ?? false).toBe(false)
    expect(player().h_state?.is_h ?? false).toBe(false)
    player().h_state = undefined
    girl.h_state = undefined
    girl.sp_flag = {}
  })

  it('门槛解锁：时姦经验 124 达标 → checkTalentGain 自动获得窄域/广域时停（gain.needs 端到端）', async () => {
    // 背景（2026-08-16 审查补测）：门槛前提读 talent，但"经验 → talent 自动获得"的
    // gain.needs 链路（command-executor finally 调 checkTalentGain gainType=0）此前无测试——
    // 若 h-core 默认层 talentDefs 未并入 modLoader，解锁将静默失效
    const { checkTalentGain } = await import('../../core/talent-utils')
    player().talents = {}
    player().experience = { '124': 50 }
    checkTalentGain('player')
    expect(player().talents['窄域时停']).toBe(1)  // 124≥50 → 窄域
    expect(player().talents['广域时停'] ?? 0).toBe(0)  // 124<200 → 广域未解锁
    player().experience['124'] = 200
    checkTalentGain('player')
    expect(player().talents['广域时停']).toBe(1)  // 124≥200 → 广域
  })

  it('时停奸指令：time_stop_h 对时停目标发起 H（叙事与睡奸区分）', async () => {
    const girl = entitySystem.get('character', 'npc_1') as any
    girl.sp_flag = { unconscious_h: 3 }
    girl.h_state = undefined
    player().h_state = undefined
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    await commandExecutor.execute('time_stop_h', execCtx())
    expect(girl.h_state?.is_h).toBe(true)
    expect(player().h_state?.is_h).toBe(true)
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    player().h_state = undefined
    girl.h_state = undefined
    girl.sp_flag = {}
  })

  it('精液记录：eja_climax 对无意识目标射精 → body_semen_in_unconscious 记录 + 醒来触发口上', async () => {
    const { onLoad: ejaOnLoad } = await import('../h-ejaculation/index')
    ejaOnLoad(stubCtx)
    const girl = entitySystem.get('character', 'npc_1') as any
    girl.base['好感度'] = 0
    girl.base['信赖度'] = 0
    girl.base['愤怒'] = 88
    girl.talents = {}
    girl.sp_flag = { unconscious_h: 3 }
    player().base['精液量'] = 80
    player().base['精液量上限'] = 100
    player().h_state = { is_h: true, target_character_id: 'npc_1' }
    girl.h_state = { is_h: true, target_character_id: 'player' }
    // 射精（eja_shoot——直接射精，无 eja_climax 的忍耐判定；eja_climax 在耐力 0 时
    // 100% 忍住是既有公式语义，本测试只验证无意识记录链路）
    await apiSystem.call('effect-system', 'execute', [
      { type: 'eja_shoot', params: { positionId: 6 } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    expect(girl.dirty?.body_semen_in_unconscious ?? []).toContain(6)
    // 关闭时停 → 536 醒来 → settle_unconscious_semen_and_cloth 触发口上（talk-common 数据）
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    // 列表清空 + 醒来口上输出（in_unconscious_cum_on_body_6 = 阴道，talk-common 默认层）
    expect(girl.dirty?.body_semen_in_unconscious ?? []).toEqual([])
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('感到下体'))).toBe(true)
    player().h_state = undefined
    girl.h_state = undefined
    girl.sp_flag = {}
    girl.dirty = {}
  })

  it('精液口上档位：精液量分级条件正确选文（100ml → 阴道 50-100/100-200 档，非最小档）', async () => {
    // 背景（2026-08-16 审查补测）：口上条件用 selected.body_semen.{部位}.1（数组索引路径），
    // 原测试只覆盖 <10 最小档；本测试钉死中高档位选文（避免"条件引擎不支持数组索引 →
    // 恒命中最小档"的静默退化）
    const girl = entitySystem.get('character', 'npc_1') as any
    girl.base['好感度'] = 0
    girl.base['信赖度'] = 0
    girl.base['愤怒'] = 88
    girl.talents = {}
    girl.sp_flag = { unconscious_h: 3 }
    girl.dirty = { body_semen_in_unconscious: [6] }
    girl.body_semen = { 6: [0, 100, 0, 100] }
    girl.body_semen['阴道'] = girl.body_semen[6]  // 模拟 trackSemen 的中文别名注册（条件表达式用别名路径）
    player().h_state = { is_h: true, target_character_id: 'npc_1' }
    girl.h_state = { is_h: true, target_character_id: 'player' }
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_on', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'time_stop_off', params: { quiet: true } },
    ], { sourceId: 'player', _targetIds: ['player'] })
    // 100ml 命中 "GE_100 & L_200" 档（"失控的消防栓"级文本），而非 <10 最小档
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('消防栓'))).toBe(true)
    expect(narrativeLog.getEntries().some((e: any) => String(e.text).includes('感到下体有一丝微妙的湿润'))).toBe(false)
    player().h_state = undefined
    girl.h_state = undefined
    girl.sp_flag = {}
    girl.dirty = {}
    girl.body_semen = {}
  })
})
