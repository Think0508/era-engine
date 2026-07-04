// 注释：h-exposure 插件——露出系统，对齐 erArk
// 5 级露出模式（0=无 1=室内 2=室外 3=人前 4=无意识人前）
// 前提：EXPOSURE_SEX_MODE_0~4 / TARGET_* / SELF_*

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { narrativeLog } from '../../core/narrative-log'

const MODE_NAMES = ['无', '室内露出', '室外露出', '人前露出', '无意识露出']

export function onLoad(_ctx: PluginContext): void {
  effectTypeRegistry.register('exposure_set_level', (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      if (!char) continue
      if (!char.exposure) char.exposure = {}
      char.exposure.level = Math.max(0, Math.min(4, params.level ?? 0))
    }
    return true
  })

  effectTypeRegistry.register('exposure_discovered', (_params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      const char = entitySystem.get('character', id) as any
      narrativeLog.write(`${char?.name ?? id} 暴露了！`, 'system', 'h-exposure')
      // TODO: 触发 NPC 反应/羞耻增长/逃跑等（需 NPC AI 系统）
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
      if (!char.exposure) char.exposure = {}
      char.exposure.level = Math.max(0, Math.min(4, level))
    },
    getModeName: (charId: string): string => {
      const char = entitySystem.get('character', charId) as any
      return MODE_NAMES[char?.exposure?.level ?? 0] ?? '无'
    },
  })

  // 注释：注册所有露出前提——对齐 erArk 9 个
  const reg = (id: string, fn: (c: any) => boolean) => {
    try { ctx.api.call('h-core', 'registerPremise', id, fn) } catch { }
  }

  function getTargetId(ctx2: any): string | null {
    return ctx2.selectedCharacterId ?? ctx2.uiStore?.selectedCharacterId ?? null
  }

  function getSelfId(ctx2: any): string | null {
    return ctx2.gameStore?.player?.id ?? ctx2.sourceId ?? null
  }

  // 注释：目标露出模式检查 0-4
  for (let i = 0; i <= 4; i++) {
    const lvl = i
    reg(`EXPOSURE_SEX_MODE_${lvl}`, (ctx2: any) => {
      const charId = getTargetId(ctx2)
      if (!charId) return false
      const char = entitySystem.get('character', charId) as any
      return (char?.exposure?.level ?? 0) === lvl
    })
  }

  // 注释：自己露出模式 >=1
  reg('SELF_EXPOSURE_MODE_GE_1', (ctx2: any) => {
    const charId = getSelfId(ctx2)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    return (char?.exposure?.level ?? 0) >= 1
  })

  reg('TARGET_EXPOSURE_MODE_GE_1', (ctx2: any) => {
    const charId = getTargetId(ctx2)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    return (char?.exposure?.level ?? 0) >= 1
  })
}
