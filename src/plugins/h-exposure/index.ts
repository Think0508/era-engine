// 注释：h-exposure 插件——露出系统
// 4 级露出模式/被发现处理

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { narrativeLog } from '../../core/narrative-log'

export function onLoad(_ctx: PluginContext): void {
  // 注释：露出模式切换——改变角色的 exposure_level
  effectTypeRegistry.register('exposure_set_level', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.exposure) char.exposure = { level: 0, mode: 'normal' }
      char.exposure.level = Math.max(0, Math.min(3, params.level ?? 0))
      const modes = ['normal', 'mild', 'moderate', 'heavy']
      char.exposure.mode = modes[char.exposure.level]
    }
    return true
  })

  effectTypeRegistry.register('exposure_discovered', (_params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      narrativeLog.write(`${id} 暴露了！`, 'system', 'h-exposure')
    }
    return true
  })
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  ctx.api.register('h-exposure', {
    getLevel: (charId: string) => {
      const char = entitySystem.get('character', charId) as any
      return char?.exposure?.level ?? 0
    },
    setLevel: (charId: string, level: number) => {
      const char = entitySystem.get('character', charId) as any
      if (!char) return
      if (!char.exposure) char.exposure = { level: 0, mode: 'normal' }
      char.exposure.level = Math.max(0, Math.min(3, level))
    },
  })

  // 注释：通过 h-core API 注册前提 handler
  try {
    await ctx.api.call('h-core', 'registerPremise', 'IS_EXPOSURE_MODE', () => false)
    await ctx.api.call('h-core', 'registerPremise', 'EXPOSURE_LEVEL_GE_1', (ctx2: any) => {
      const charId = ctx2.selectedCharacterId ?? ctx2.uiStore?.selectedCharacterId
      if (!charId) return false
      const char = entitySystem.get('character', charId) as any
      return (char?.exposure?.level ?? 0) >= 1
    })
  } catch {
    // 注释：h-core 未加载时忽略
  }
}
