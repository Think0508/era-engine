// G2 决策测试（2026-08-09）：欲望每日增长——仅 NPC（erArk past_day_settle.py:76 `if character_id:`）
// 修复验证：① 参数 bug（getEntityAttr(char.id) 传字符串 → 静默死代码）② 范围仅 NPC（玩家由
// H/自慰/药物链置 79/0/100，B3 指令化时带）③ 上限 100 ④ 同日只结算一次
import { describe, it, expect, beforeEach } from 'vitest'
import { newDaySettle } from './newday-settle'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'

function setDay(day: number, month = 1): void {
  // 注意：必须用 setTime（内部 state）——getContext() 返回 time 浅拷贝，改它无效
  gameContext.setTime({ minute: 0, hour: 8, day, month, year: 1 })
}

describe('newday-settle（G2：欲望每日增长——仅 NPC）', () => {
  beforeEach(() => {
    entitySystem.clear()
    gameContext.reset()
  })

  it('NPC 欲望按能力等级增长（erArk randint(abl, abl×2)）且上限 100', () => {
    entitySystem.register('character', 'npc_a', {
      id: 'npc_a', base: { 欲望值: 0 }, abilities: { 欲望: { level: 3, xp: 0 } },
    })
    setDay(2)
    newDaySettle()
    const npc = entitySystem.get('character', 'npc_a') as any
    // add ∈ [abl, abl×2] = [3, 6]
    expect(npc.base['欲望值']).toBeGreaterThanOrEqual(3)
    expect(npc.base['欲望值']).toBeLessThanOrEqual(6)
    // 同日再结算 → 跳过（不叠加）
    newDaySettle()
    expect(npc.base['欲望值']).toBeLessThanOrEqual(6)
    // 跨天 → 叠加
    setDay(3)
    newDaySettle()
    expect(npc.base['欲望值']).toBeGreaterThanOrEqual(6)
    expect(npc.base['欲望值']).toBeLessThanOrEqual(12)
  })

  it('欲望能力等级 0 → 不增长（erArk randint(0,0)=0）', () => {
    entitySystem.register('character', 'npc_b', {
      id: 'npc_b', base: { 欲望值: 0 }, abilities: { 欲望: { level: 0, xp: 0 } },
    })
    setDay(5)
    newDaySettle()
    expect((entitySystem.get('character', 'npc_b') as any).base['欲望值']).toBe(0)
  })

  it('玩家（player/0）不增长（G2 决策：erArk 排除玩家）', () => {
    entitySystem.register('character', 'player', {
      id: 'player', base: { 欲望值: 0 }, abilities: { 欲望: { level: 5, xp: 0 } },
    })
    entitySystem.register('character', '0', {
      id: '0', base: { 欲望值: 0 }, abilities: { 欲望: { level: 5, xp: 0 } },
    })
    setDay(6)
    newDaySettle()
    expect((entitySystem.get('character', 'player') as any).base['欲望值']).toBe(0)
    expect((entitySystem.get('character', '0') as any).base['欲望值']).toBe(0)
  })

  it('上限 100 钳制', () => {
    entitySystem.register('character', 'npc_c', {
      id: 'npc_c', base: { 欲望值: 98 }, abilities: { 欲望: { level: 10, xp: 0 } },
    })
    setDay(7)
    newDaySettle()
    expect((entitySystem.get('character', 'npc_c') as any).base['欲望值']).toBeLessThanOrEqual(100)
  })

  it('回拨日期（读档到更早）→ 按 != 语义正常结算（2026-08-09 审查确认：无需 reset）', () => {
    // 审查结论：lastSettledDay 用 != 比较——回拨日期（≠）会结算 ✓；
    // 若引入 reset，读档当天反而重复结算（存档已结算 + 读档首行动再结算）= 引入新 bug
    entitySystem.register('character', 'npc_d', {
      id: 'npc_d', base: { 欲望值: 0 }, abilities: { 欲望: { level: 3, xp: 0 } },
    })
    setDay(10)
    newDaySettle()
    const after = (entitySystem.get('character', 'npc_d') as any).base['欲望值']
    expect(after).toBeGreaterThanOrEqual(3)
    // 读档回拨到更早日期（5 ≠ 10）→ 结算（当天语境重新开始）
    setDay(5)
    newDaySettle()
    expect((entitySystem.get('character', 'npc_d') as any).base['欲望值']).toBeGreaterThan(after)
    // 同日重复调用 → 跳过（幂等）
    const again = (entitySystem.get('character', 'npc_d') as any).base['欲望值']
    newDaySettle()
    expect((entitySystem.get('character', 'npc_d') as any).base['欲望值']).toBe(again)
  })
})
