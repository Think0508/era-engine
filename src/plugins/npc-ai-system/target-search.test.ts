// 注释：target-search 单元测试——前提权重 / 分层 / 缓存 / 延后语义（erArk search_target）
// 纯函数级测试：直接注册前提 handler + 构造目标表，不加载插件

import { conditionEngine } from '../../core/condition-engine'
import { describe, it, expect, beforeEach } from 'vitest'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { errorReporter } from '../../core/error-reporter'
import { conditionRegistry } from '../../core/condition-registry'
import { searchTarget, resetSearchReports } from './target-search'
import type { AITargetDef } from '../../core/mod-loader'

function makeTarget(partial: Partial<AITargetDef> & { id: string }): AITargetDef {
  return {
    layer: 100,
    behavior: { type: 'wait' },
    ...partial,
  }
}

describe('npc-ai target-search（erArk search_target 语义）', () => {
  beforeEach(() => {
    conditionEngine.clear()
    entitySystem.clear()
    gameContext.reset()
    resetSearchReports()
    errorReporter.clear()
  })

  it('前提权重求和——动态前提权重随状态变化（疲惫越重越想休息）', () => {
    conditionEngine.registerPremise('AI_TIRED_LEVEL_2', (ctx: any) => {
      const tired = entitySystem.get('character', ctx.sourceId) as any
      const level = (tired?.base?.['疲劳度'] ?? 0) >= 136 ? 3 : (tired?.base?.['疲劳度'] ?? 0) >= 120 ? 2 : 0
      return level >= 2 ? level : 0
    })
    entitySystem.register('character', 'npc_1', { id: 'npc_1', base: { '疲劳度': 150 } })

    const restTarget = makeTarget({ id: 'rest', layer: 40, premises: ['AI_TIRED_LEVEL_2'], behavior: { type: 'rest' } })
    const wanderTarget = makeTarget({ id: 'wander', layer: 100, behavior: { type: 'wander' } })

    // 疲劳 150 → rest 候选（权重 3），wander 兜底——layer 40 有候选 → rest
    let picked = searchTarget('npc_1', [restTarget, wanderTarget])
    expect(picked?.id).toBe('rest')

    // 疲劳 100（<120）→ rest 前提不通过 → wander
    ;(entitySystem.get('character', 'npc_1') as any).base['疲劳度'] = 100
    picked = searchTarget('npc_1', [restTarget, wanderTarget])
    expect(picked?.id).toBe('wander')
  })

  it('层序——首个有候选的层胜出（高优先级层空 → 下一层）', () => {
    conditionEngine.registerPremise('ALWAYS_FALSE', () => 0)
    const targets: AITargetDef[] = [
      makeTarget({ id: 'layer5_a', layer: 5, premises: ['ALWAYS_FALSE'], behavior: { type: 'wait' } }),
      makeTarget({ id: 'layer5_b', layer: 5, premises: ['ALWAYS_FALSE'], behavior: { type: 'wait' } }),
      makeTarget({ id: 'layer40', layer: 40, behavior: { type: 'rest' } }),
      makeTarget({ id: 'layer100', layer: 100, behavior: { type: 'wander' } }),
    ]
    entitySystem.register('character', 'npc_1', { id: 'npc_1' })
    const picked = searchTarget('npc_1', targets)
    expect(picked?.id).toBe('layer40')
  })

  it('get_first_only 层——取第一个通过（不加权随机）', () => {
    conditionEngine.registerPremise('AI_HALF', () => (Math.random() < 1 ? 1 : 0)) // 恒通过
    const targets: AITargetDef[] = [
      makeTarget({ id: 'first', layer: 10, get_first_only: true, behavior: { type: 'wait' } }),
      makeTarget({ id: 'second', layer: 10, get_first_only: true, behavior: { type: 'wait' } }),
    ]
    entitySystem.register('character', 'npc_1', { id: 'npc_1' })
    // get_first_only：总是第一个（定义顺序）
    for (let i = 0; i < 20; i++) {
      expect(searchTarget('npc_1', targets)?.id).toBe('first')
    }
  })

  it('condition 布尔门——不参与权重，不满足淘汰', () => {
    const targets: AITargetDef[] = [
      makeTarget({ id: 'night_only', layer: 40, condition: 'game.time.hour >= 22', behavior: { type: 'sleep' } }),
      makeTarget({ id: 'wander', layer: 100, behavior: { type: 'wander' } }),
    ]
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    entitySystem.register('character', 'npc_1', { id: 'npc_1' })
    expect(searchTarget('npc_1', targets)?.id).toBe('wander')

    gameContext.setTime({ minute: 0, hour: 23, day: 1, month: 1, year: 1 })
    expect(searchTarget('npc_1', targets)?.id).toBe('night_only')
  })

  it('condition 的 selected.* = 被决策 NPC 自身（self 引用语义，2026-08-10 修复）', () => {
    const targets: AITargetDef[] = [
      makeTarget({ id: 'at_tavern', layer: 40, condition: "selected.current_location == 'tavern'", behavior: { type: 'stay' } }),
      makeTarget({ id: 'wander', layer: 100, behavior: { type: 'wander' } }),
    ]
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    entitySystem.register('character', 'npc_1', { id: 'npc_1', current_location: 'tavern' })
    // 该 NPC 在 tavern → 命中 at_tavern（此前会因 selected 解析到 undefined 而静默淘汰）
    expect(searchTarget('npc_1', targets)?.id).toBe('at_tavern')

    ;(entitySystem.get('character', 'npc_1') as any).current_location = 'town_square'
    expect(searchTarget('npc_1', targets)?.id).toBe('wander')
  })

  it('加权随机——权重高的目标被选中的概率更高（统计验证）', () => {
    conditionEngine.registerPremise('AI_W1', () => 1)
    conditionEngine.registerPremise('AI_W9', () => 9)
    const targets: AITargetDef[] = [
      makeTarget({ id: 'light', layer: 40, premises: ['AI_W1'], behavior: { type: 'wait' } }),
      makeTarget({ id: 'heavy', layer: 40, premises: ['AI_W9'], behavior: { type: 'wait' } }),
    ]
    entitySystem.register('character', 'npc_1', { id: 'npc_1' })
    let heavy = 0
    const N = 500
    for (let i = 0; i < N; i++) {
      if (searchTarget('npc_1', targets)?.id === 'heavy') heavy++
    }
    // 9:1 权重 → heavy 期望 90% ± 容差
    expect(heavy / N).toBeGreaterThan(0.8)
    expect(heavy / N).toBeLessThan(0.97)
  })

  it('全层无候选 → null（调用方延后重试）', () => {
    conditionEngine.registerPremise('ALWAYS_FALSE', () => 0)
    const targets: AITargetDef[] = [
      makeTarget({ id: 'a', layer: 5, premises: ['ALWAYS_FALSE'], behavior: { type: 'wait' } }),
      makeTarget({ id: 'b', layer: 40, premises: ['ALWAYS_FALSE'], behavior: { type: 'wait' } }),
    ]
    entitySystem.register('character', 'npc_1', { id: 'npc_1' })
    expect(searchTarget('npc_1', targets)).toBeNull()
  })

  it('前提结果轮内缓存——同一前提只求值一次（erArk premise_data 共享）', () => {
    let evalCount = 0
    conditionEngine.registerPremise('AI_COUNTED', () => {
      evalCount++
      return 1
    })
    const targets: AITargetDef[] = [
      makeTarget({ id: 'a', layer: 40, premises: ['AI_COUNTED'], behavior: { type: 'wait' } }),
      makeTarget({ id: 'b', layer: 40, premises: ['AI_COUNTED'], behavior: { type: 'wait' } }),
    ]
    entitySystem.register('character', 'npc_1', { id: 'npc_1' })
    searchTarget('npc_1', targets)
    // 两个目标共享同一前提 → 只求值一次（缓存命中）
    expect(evalCount).toBe(1)
  })

  it('未知前提 strict 淘汰（数据错误显式暴露，不静默放行）', () => {
    const targets: AITargetDef[] = [
      makeTarget({ id: 'bad_premise', layer: 40, premises: ['NO_SUCH_PREMISE_XYZ'], behavior: { type: 'wait' } }),
      makeTarget({ id: 'ok', layer: 100, behavior: { type: 'wander' } }),
    ]
    entitySystem.register('character', 'npc_1', { id: 'npc_1' })
    expect(searchTarget('npc_1', targets)?.id).toBe('ok')
  })

  it('未知前提 → 去重上报（拼错前提 ID 不再静默——2026-08-10 补缺）', () => {

    errorReporter.clear()
    const targets: AITargetDef[] = [
      makeTarget({ id: 'typo_target', layer: 40, premises: ['AI_NIGHT_TYPO'], behavior: { type: 'sleep' } }),
      makeTarget({ id: 'ok', layer: 100, behavior: { type: 'wander' } }),
    ]
    entitySystem.register('character', 'npc_1', { id: 'npc_1' })
    expect(searchTarget('npc_1', targets)?.id).toBe('ok')
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('未注册的前提') && e.message.includes('AI_NIGHT_TYPO'))).toBe(true)
    // 去重：再搜一次不重复上报
    const count = errors.filter(e => e.message.includes('AI_NIGHT_TYPO')).length
    searchTarget('npc_1', targets)
    expect(errorReporter.getErrors().filter(e => e.message.includes('AI_NIGHT_TYPO')).length).toBe(count)
  })

  it('条件拼错字段路径 → 去重上报（不再静默永远不触发）', () => {

    errorReporter.clear()
    const targets: AITargetDef[] = [
      makeTarget({ id: 'typo_cond', layer: 40, condition: "selected.current_locaiton == 'tavern'", behavior: { type: 'stay' } }),
      makeTarget({ id: 'ok', layer: 100, behavior: { type: 'wander' } }),
    ]
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    entitySystem.register('character', 'npc_1', { id: 'npc_1', current_location: 'tavern' })
    // 拼错字段 → 条件默认值 false → 目标淘汰 → 但必须上报
    expect(searchTarget('npc_1', targets)?.id).toBe('ok')
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('未注册字段') && e.message.includes('current_locaiton'))).toBe(true)
  })

  it('条件合法字段（selected.current_location）→ 不误报（2026-08-10 补缺）', () => {
    // 模拟 npc-ai 插件 plugin.toml 的 condition_fields 注册（单元测试不加载插件）
    conditionRegistry.registerFromPlugin('npc-ai-system', {
      'character.{id}.current_location': { type: 'string', description: 'NPC 当前位置' },
    })
    errorReporter.clear()
    const targets: AITargetDef[] = [
      makeTarget({ id: 'at_tavern', layer: 40, condition: "selected.current_location == 'tavern'", behavior: { type: 'stay' } }),
      makeTarget({ id: 'wander', layer: 100, behavior: { type: 'wander' } }),
    ]
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    entitySystem.register('character', 'npc_1', { id: 'npc_1', current_location: 'tavern' })
    expect(searchTarget('npc_1', targets)?.id).toBe('at_tavern')
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('未注册字段'))).toBe(false)
  })
})
