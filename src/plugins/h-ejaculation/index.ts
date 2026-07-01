// 注释：h-ejaculation 插件——射精系统
// 射精积累/忍耐/射精量/精液追踪

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { narrativeLog } from '../../core/narrative-log'

export function onLoad(_ctx: PluginContext): void {
  // 注释：射精积累——P 部位行为时触发
  effectTypeRegistry.register('eja_add', (_params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) continue
      const current = char.base['射精欲'] ?? 0
      // 注释：eja += 100 + int(eja × 0.4)
      char.base['射精欲'] = Math.min(1000, current + 100 + Math.floor(current * 0.4))
    }
    return true
  })

  // 注释：射精判定——绝顶时检查 P 部位
  effectTypeRegistry.register('eja_climax', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) continue
      const eja = char.base['射精欲'] ?? 0
      if (eja < 1000) continue // 注释：未满射精阈值
      // 注释：触发射精
      char.base['射精欲'] = 0
      const semenCount = calcSemenAmount(char, params.level ?? 'normal')
      trackSemen(char, params.positionId ?? 0, semenCount)
      narrativeLog.write(`${char.name} 射精了！(${semenCount}ml)`, 'system', 'h-ejaculation')
      eventBus.emit('h:shoot', { character: id, amount: semenCount, position: params.positionId })
    }
    return true
  })

  // 注释：射精量计算（公式#10）
  effectTypeRegistry.register('eja_shoot', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char?.base) return
      const level = params.level ?? 'normal'
      const amount = calcSemenAmount(char, level)
      trackSemen(char, params.positionId ?? 0, amount)
      narrativeLog.write(`射精 ${amount}ml`, 'system', 'h-ejaculation')
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  ctx.api.register('h-ejaculation', {
    getEja: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.base?.['射精欲'] ?? 0
    },
    setEja: (charId: string, val: number) => {
      const char = entitySystem.get('character', charId) as any
      if (char?.base) char.base['射精欲'] = Math.max(0, Math.min(1000, val))
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

// 注释：射精量计算
function calcSemenAmount(_char: any, level: string): number {
  const baseMap: Record<string, number> = { small: 10, normal: 20, strong: 50 }
  let amount = baseMap[level] ?? 20
  amount *= 0.8 + Math.random() * 0.4 // 浮动 ±20%
  // TODO: 叠加倍率（第一发×2/精力剂/积攒精液/浓厚精液等）
  return Math.floor(amount)
}

// 注释：精液追踪——存到角色 body_semen / cloth_semen
function trackSemen(char: any, positionId: number, amount: number): void {
  if (!char.body_semen) char.body_semen = {}
  const existing = char.body_semen[positionId]
  if (existing) {
    existing[0] += amount
    existing[2] += amount
  } else {
    char.body_semen[positionId] = [amount, 0, amount]
  }
  // 注释：精液等级 = 精液量分级（1-5）
  const total = char.body_semen[positionId][2]
  char.body_semen[positionId][1] = Math.min(5, Math.floor(total / 100) + 1)
}
