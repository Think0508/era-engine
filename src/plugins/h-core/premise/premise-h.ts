// 注释：H 状态前提——注册基础 H 状态前提 handler
// 前提列表对齐 erArk：NOT_H, TIRED_LE_84, HP_G_1, SCENE_ONLY_TWO 等

import { gameContext } from '../../../core/game-context'
import { entitySystem } from '../../../core/entity-system'

export function registerHPremises(registry: any): void {
  registry.register('HAVE_TARGET', (ctx: any) => {
    return (ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId) != null
  })

  registry.register('NOT_H', (ctx: any) => {
    if (!ctx.selectedCharacterId && !ctx.uiStore?.selectedCharacterId) return false
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    const char = entitySystem.get('character', charId) as any
    return !char?.h_state?.is_h
  })

  registry.register('T_NORMAL', (_ctx: any) => {
    return true // 注释：简化版——始终正常。TODO: 按 erArk 的 T_NORMAL_56 等判断
  })

  registry.register('TIRED_LE_84', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    const 体力 = char?.base?.体力 ?? 100
    // 注释：84 以下疲劳（体力 > 16 即不疲劳）
    return 体力 > 16
  })

  registry.register('HP_G_1', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    const 体力 = char?.base?.体力 ?? 0
    return 体力 > 1
  })

  registry.register('IS_H', (ctx: any) => {
    if (!ctx.selectedCharacterId && !ctx.uiStore?.selectedCharacterId) return false
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    const char = entitySystem.get('character', charId) as any
    return char?.h_state?.is_h === true
  })

  registry.register('SCENE_ONLY_TWO', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    let count = 0
    for (const char of entitySystem.getAll('character')) {
      if ((char as any).current_location === loc.id) count++
    }
    return count <= 2
  })

  // 注释：技巧≥LV3——用于按摩等需要技巧等级的指令
  registry.register('TECHNIQUE_GE_3', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    // 注释：能力[30] = 技巧
    return (char?.abilities?.[30]?.level ?? 0) >= 3
  })
}
