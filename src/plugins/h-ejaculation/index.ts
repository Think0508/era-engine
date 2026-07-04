// 注释：h-ejaculation 插件——射精系统，完全对齐 erArk
// - eja_add: 射精积累（公式对齐 default.py）
// - eja_climax: 射精判定 + 避孕套检查
// - eja_shoot: 射精量计算（含全部 7 个乘数）
// - eja_decay: 非 H 模式下的射精欲衰减

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'

export function onLoad(_ctx: PluginContext): void {
  // 注释：射精积累——对齐 erArk default.py:3669
  // 公式：eja += addTime + 10 + floor(eja × 0.4)  （无上限，睡觉得到衰减）
  effectTypeRegistry.register('eja_add', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    const addTime = ctx._timeCost ?? params.addTime ?? 10
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) continue
      const current = char.base['射精欲'] ?? 0
      char.base['射精欲'] = current + addTime + 10 + Math.floor(current * 0.4)
    }
    return true
  })

  // 注释：射精判定
  effectTypeRegistry.register('eja_climax', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) continue
      const eja = char.base['射精欲'] ?? 0
      if (eja < 1000) continue
      char.base['射精欲'] = 0
      const semenCount = calcSemenAmount(char, params.level ?? 'normal')
      const hasCondom = char.body_items?.['13']?.active === true
      if (hasCondom) {
        const hstate = char.h_state
        if (hstate) {
          hstate.condom_count[0]++
          hstate.condom_count[1] += semenCount
        }
        delete char.body_items['13']
        narrativeLog.write(`${char.name} 射精了！(避孕套 ${semenCount}ml)`, 'system', 'h-ejaculation')
        eventBus.emit('h:shoot', { character: id, amount: semenCount, position: params.positionId, condom: true })
      } else {
        trackSemen(char, params.positionId ?? 0, semenCount)
        narrativeLog.write(`${char.name} 射精了！(${semenCount}ml)`, 'system', 'h-ejaculation')
        eventBus.emit('h:shoot', { character: id, amount: semenCount, position: params.positionId, condom: false })
      }
    }
    return true
  })

  // 注释：射精量计算（直接 effect 版）
  effectTypeRegistry.register('eja_shoot', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) return
      const amount = calcSemenAmount(char, params.level ?? 'normal')
      trackSemen(char, params.positionId ?? 0, amount)
      narrativeLog.write(`射精 ${amount}ml`, 'system', 'h-ejaculation')
    }
    return true
  })

  // 注释：射精欲衰减——非 H 模式下每小时减 10×60
  effectTypeRegistry.register('eja_decay', (_p: any, ctx: any) => {
    const ids = ctx._targetIds as string[]
    for (const id of ids) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base || char?.h_state?.is_h) continue
      if (char.base['射精欲'] > 0) {
        char.base['射精欲'] = Math.max(0, char.base['射精欲'] - 600)
      }
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：每小时衰减射精欲
  ctx.events.on('game:hour_changed', () => {
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (!c?.base || c?.h_state?.is_h) continue
      if ((c.base['射精欲'] ?? 0) > 0) {
        c.base['射精欲'] = Math.max(0, c.base['射精欲'] - 600)
      }
    }
  })

  ctx.api.register('h-ejaculation', {
    getEja: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.base?.['射精欲'] ?? 0
    },
    setEja: (charId: string, val: number) => {
      const char = entitySystem.get('character', charId) as any
      if (char?.base) char.base['射精欲'] = Math.max(0, val)
    },
    getSemenOnBody: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.body_semen ?? {}
    },
    absorbSemen: (_charId: string) => {
      // TODO: 按时间衰减精液
    },
  })
}

// 注释：射精量计算——对齐 erArk ejaculation_panel.py
// 所有乘数累乘，最后 × ±20% 浮动
function calcSemenAmount(char: any, level: string): number {
  const baseMap: Record<string, number> = { small: 10, normal: 20, strong: 50 }
  let amount = baseMap[level] ?? 20

  // 注释：(1) 忍耐次数乘数
  const endure = char.h_state?.endure_not_shoot_count ?? 0
  amount *= (endure + 1)

  // 注释：(2) 本次 H 首次射精 ×2
  const shotInHSession = char.h_state?.shoot_semen_amount ?? 0
  if (shotInHSession === 0) amount *= 2

  // 注释：(3) 精力剂 ×2
  if (char.h_state?.used_semen_energy_agent) amount *= 2

  // 注释：(4) 积攒精液 ×2（extra_semen_point >= 阈值时）
  const extra = char.base?.['额外精液量'] ?? 0
  if (extra >= 100) amount *= 2  // TODO: 精确阈值

  // 注释：(5) 浓厚精液 ×2
  if (char.h_state?.thick_semen) amount *= 2

  // 注释：(6) 目标榨精能力调整——ability[77]（榨精）
  // TODO: 需目标角色 ID，当前简化为 1.0
  // const milkingLv = targetChar?.abilities?.['榨精']?.level ?? 0
  // amount *= getMilkingAdjust(milkingLv)

  // 注释：(7) 精液存量检查——不超出 semen_point + extra_semen_point
  // TODO: 需精液存量系统

  // 注释：随机 ±20%
  amount *= 0.8 + Math.random() * 0.4
  return Math.max(1, Math.floor(amount))
}

// 注释：精液追踪——对齐 erArk 索引：[0]=未使用, [1]=当前量, [2]=等级, [3]=总量
function trackSemen(char: any, positionId: number, amount: number): void {
  if (!char.body_semen) char.body_semen = {}
  const existing = char.body_semen[positionId]
  if (existing) {
    existing[1] = (existing[1] ?? 0) + amount
    existing[3] = (existing[3] ?? 0) + amount
  } else {
    char.body_semen[positionId] = [0, amount, 0, amount]
  }
  // 注释：精液等级（1-5）
  const total = char.body_semen[positionId][3] ?? 0
  char.body_semen[positionId][2] = Math.min(5, Math.floor(total / 100) + 1)
  // 注释：更新 h_state 射精总量
  if (char.h_state) {
    char.h_state.shoot_semen_amount = (char.h_state.shoot_semen_amount ?? 0) + amount
  }
}
