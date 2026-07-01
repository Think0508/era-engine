// 注释：h-pregnancy 插件——妊娠系统
// 受孕判定/7阶段孕期/泌乳
// TODO(phase-11+): 女儿成长完成后作为自订角色入口

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'

export function onLoad(_ctx: PluginContext): void {
  // 注释：受孕判定——精液在体内 + 排卵期 + 未避孕 → 概率
  effectTypeRegistry.register('pregnancy_check', (_params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (isPregnant(char)) continue // 注释：已怀孕跳过
      // 注释：简化判定——精液在V/W部位且量>0 → 随机受孕
      const semenV = char.body_semen?.[4]?.[0] ?? 0
      const semenW = char.body_semen?.[7]?.[0] ?? 0
      if (semenV + semenW > 0 && Math.random() < 0.3) {
        initPregnancy(char)
      }
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  ctx.api.register('h-pregnancy', {
    isPregnant: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return isPregnant(char)
    },
    getStage: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.pregnancy?.stage ?? -1
    },
  })

  // 注释：监听 game:new_day → 推进孕期
  ctx.events.on('game:new_day', () => {
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (!isPregnant(c)) continue
      c.pregnancy.daysPregnant++
      // 注释：每 30 天进入下一阶段（7 阶段，共 210 天）
      c.pregnancy.stage = Math.min(6, Math.floor(c.pregnancy.daysPregnant / 30))
      if (c.pregnancy.stage >= 3 && !c.pregnancy.lactation) {
        c.pregnancy.lactation = true
        // TODO: 泌乳触发——设定奶水积累
      }
    }
  })
}

function isPregnant(char: any): boolean {
  return char?.pregnancy?.stage != null && char.pregnancy.stage >= 0
}

function initPregnancy(char: any): void {
  char.pregnancy = { stage: 0, daysPregnant: 0, lactation: false, hasGivenBirth: false }
}
