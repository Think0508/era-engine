// 注释：H 状态前提——PremiseRegistry 注册基础 H 状态前提 handler

import { gameContext } from '../../../core/game-context'
import { entitySystem } from '../../../core/entity-system'

export function registerHPremises(registry: any): void {
  // 注释：有选中的交互目标
  registry.register('HAVE_TARGET', (ctx: any) => {
    const selectedId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    return selectedId != null
  })

  // 注释：目标不在 H 中
  registry.register('NOT_H', (ctx: any) => {
    if (!ctx.selectedCharacterId && !ctx.uiStore?.selectedCharacterId) return false
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    const char = entitySystem.get('character', charId) as any
    return !char?.h_state?.is_h
  })

  // 注释：目标在 H 中
  registry.register('IS_H', (ctx: any) => {
    if (!ctx.selectedCharacterId && !ctx.uiStore?.selectedCharacterId) return false
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    const char = entitySystem.get('character', charId) as any
    return char?.h_state?.is_h === true
  })

  // 注释：目标状态正常（未异常）
  registry.register('T_NORMAL', (ctx: any) => {
    if (!ctx.selectedCharacterId && !ctx.uiStore?.selectedCharacterId) return false
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    const char = entitySystem.get('character', charId) as any
    // 注释：无 special 异常标记即视为正常
    return !char?.status_effects?.some((s: any) => s.category === 'special')
  })

  // 注释：疲劳 ≤ 74（体力≥26%）
  registry.register('TIRED_LE_74', (ctx: any) => {
    if (!ctx.selectedCharacterId && !ctx.uiStore?.selectedCharacterId) return false
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    const char = entitySystem.get('character', charId) as any
    const hp = char?.base?.hp ?? 100
    return hp >= 26
  })

  // 注释：场景仅两人（玩家+目标）
  registry.register('SCENE_ONLY_TWO', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    // 注释：遍历所有角色看当前地点人数
    const charsHere: string[] = []
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (c.current_location === loc.id) charsHere.push(c.id)
    }
    return charsHere.length <= 2
  })
}
