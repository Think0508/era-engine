// 注释：服装前提——查角色 equipment/equipment_off

import { entitySystem } from '../../../core/entity-system'

export function registerClothingPremises(registry: any): void {
  // 注释：目标全部服装槽为空（裸）
  registry.register('CLOTH_OFF', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    const equip = char?.equipment
    if (!equip) return false
    // 注释：所有槽位都为空
    return Object.values(equip).every(v => v == null || v === '')
  })

  // 注释：目标未穿下身（无内裤/裤子）
  registry.register('NOT_WEAR_PAN', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    const lower = char?.equipment?.lower_body
    return !lower || lower === ''
  })

  // 注释：目标上身可见（H 中已脱下或被掀起）
  registry.register('BRA_VISIBLE', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    const upper = char?.equipment_off?.upper_body || char?.equipment?.upper_body
    return !upper || upper === ''
  })
}
