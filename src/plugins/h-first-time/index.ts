// 注释：h-first-time 插件——第一次系统
// 6 种处女类型/实行惩罚/首次剧痛/初吻标记

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'

const VIRGIN_KEYS = ['virgin_V', 'virgin_A', 'virgin_U', 'virgin_W', 'virgin_M', 'virgin_OTHER']

export function onLoad(_ctx: PluginContext): void {
  // 注释：第一次检查——如果目标无该位置 first_time 标记，触发惩罚
  effectTypeRegistry.register('first_time_check', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.first_times) char.first_times = {}
      const key = params.key ?? 'virgin_V'
      if (!char.first_times[key]) {
        char.first_times[key] = true
        // 注释：首次剧痛——苦痛大幅增加
        if (!char.base) char.base = {}
        if (params.painValue) {
          const current = char.base['苦痛'] ?? 0
          char.base['苦痛'] = current + (params.painValue as number)
        }
      }
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  ctx.api.register('h-first-time', {
    isVirgin: (charId: string, key?: string) => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.first_times) return true
      if (key) return !char.first_times[key]
      return VIRGIN_KEYS.some(k => !char.first_times[k]) // 注释：任一未破即算处女
    },
    getFirstTimeFlag: (charId: string, key: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.first_times?.[key] === true
    },
    setFirstTime: (charId: string, key: string) => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      if (!char.first_times) char.first_times = {}
      char.first_times[key] = true
    },
  })
}
