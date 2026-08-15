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
    timeStopOnLoad(stubCtx)
    await timeStopOnEnable(stubCtx)

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
})
