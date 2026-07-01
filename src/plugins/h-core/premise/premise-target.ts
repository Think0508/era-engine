// 注释：目标前提

import { entitySystem } from '../../../core/entity-system'

export function registerTargetPremises(registry: any): void {
  registry.register('SELECTED_EXISTS', (ctx: any) => {
    return (ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId) != null
  })

  registry.register('SELECTED_NORMAL', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    return !char?.status_effects?.some((s: any) => s.category === 'special')
  })
}
