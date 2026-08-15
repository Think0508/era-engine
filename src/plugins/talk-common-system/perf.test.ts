// 性能基准测试（合成数据，不加载 73MB 真实数据）——优化前后对比 + CI 回归防线
// 数据剖面模拟真实 talk-common 分布：5 行为变量 × 6500 条 = 单次 getBehaviorText 约 3.2 万条目
// 条件形态：路径在前/前提失败（40%）、前提在前（30%）、纯前提（20%）、路径+过前提（10%）

import { describe, it, expect, beforeEach } from 'vitest'
import { conditionEngine } from '../../core/condition-engine'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { CommonTextsEngine, type VariableData } from './engine'

function registerPremises(): void {
  conditionEngine.registerPremise('dr_position_normal', () => false)
  conditionEngine.registerPremise('high_1', () => true)
  conditionEngine.registerPremise('high_3', () => true)
  for (let i = 0; i < 12; i++) conditionEngine.registerPremise(`flag_${i}`, () => i % 2 === 0)
  for (let i = 0; i < 10; i++) conditionEngine.registerPremise(`pos_${i}`, () => false)
}

function makeData(): VariableData {
  const TALENTS = ['幼女', '婀娜', '丰腴', '纤细', '成熟', '娇小', '修长', '妩媚', '清纯', '冷艳']
  const STATUS = ['醉意', '发情', '快感', '羞耻', '敏感', '兴奋']
  const entries: Array<{ context: string; conditions: string }> = []
  for (let i = 0; i < 6500; i++) {
    const shape = i % 10
    const t = TALENTS[Math.floor(i / 10) % TALENTS.length]
    let conditions: string
    if (shape < 4) {
      // 路径在前、前提失败——A2 重排的收益区
      conditions = i % 2 === 0
        ? `selected.talents.${t} == 1 && premise(pos_${i % 10})`
        : `selected.status.${STATUS[i % STATUS.length]} == true && premise(pos_${i % 10})`
    } else if (shape < 7) {
      conditions = `premise(dr_position_normal) && selected.talents.${t} == 1`
    } else if (shape < 9) {
      conditions = `premise(high_1) && premise(flag_${i % 12})`
    } else {
      conditions = `selected.talents.${t} == 1 && premise(high_1)`
    }
    entries.push({ context: `口上文本${i}号位……`, conditions })
  }
  const out: VariableData = {}
  for (const variable of [
    'action_A_penis_in_anal',
    'action_B1_penis_in_anal',
    'action_B2_penis_in_anal',
    'action_C1_penis_in_anal',
    'action_C2_penis_in_anal',
  ]) {
    out[variable] = { parts: [], description: '', entries: entries.map(e => ({ ...e })) }
  }
  return out
}

describe('talk-common 性能基准（合成数据）', () => {
  beforeEach(() => {
    conditionEngine.clear()
    entitySystem.clear()
    gameContext.reset()
    registerPremises()
    entitySystem.register('character', 'actor', { id: 'actor', sp_flag: {}, talents: {} })
    entitySystem.register('character', 'target1', {
      id: 'target1',
      sp_flag: {},
      talents: { 幼女: 1, 婀娜: 1 },
      status_effects: [{ id: '醉意', remaining_duration: 60, stack: 1 }],
    })
    gameContext.setPlayer('actor')
  })

  it('getBehaviorText 冷/热调用耗时（宽松阈值守回归，防 CI 波动）', () => {
    const engine = new CommonTextsEngine()
    engine.loadFromData(makeData(), {})

    // 注释：先跑一次让 JIT/热路径就绪（结果丢弃），随后清空 AST 缓存测"冷"（重解析），
    // 再测"热"（AST 缓存命中）——合成数据去重条件少，冷/热差异即表达式解析成本
    engine.getBehaviorText('penis_in_anal', 'target1', 'actor')
    conditionEngine.clear()
    registerPremises()
    const t0 = performance.now()
    const coldResult = engine.getBehaviorText('penis_in_anal', 'target1', 'actor')
    const cold = performance.now() - t0

    const t1 = performance.now()
    const warmResult = engine.getBehaviorText('penis_in_anal', 'target1', 'actor')
    const warm = performance.now() - t1

    console.log(`[perf-synthetic] cold=${cold.toFixed(0)}ms warm=${warm.toFixed(0)}ms`)
    expect(coldResult).toBeTruthy()
    expect(warmResult).toBeTruthy()
    // 注释：回归防线（防"每条目重复正则/重复分配"类回归回潮——实测 6-18ms，
    // 500ms 阈值留 ~30x 余量；CI 波动安全，仍能捕获毫秒级劣化退化为秒级）
    expect(warm).toBeLessThan(500)
  })
})
