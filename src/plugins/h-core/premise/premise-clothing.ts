// 注释：服装前提——查角色 equipment / equipment_off

import { entitySystem } from '../../../core/entity-system'

// 注释：检查某槽位是否为空
function isSlotEmpty(charId: string, slot: string): boolean {
  const char = entitySystem.get('character', charId) as any
  if (!char) return true
  const equip = char.equipment ?? {}
  return !equip[slot]
}

// 注释：检查某槽位是否在 equipment_off 中（H 中已脱下）
function isSlotOff(charId: string, slot: string): boolean {
  const char = entitySystem.get('character', charId) as any
  if (!char) return false
  const off = char.equipment_off ?? {}
  return !!off[slot]
}

export function registerClothingPremises(registry: any): void {
  // 注释：目标完全裸体（所有可脱槽位都空）
  registry.register('CLOTH_OFF', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    if (!char?.equipment) return false
    const removableSlots = ['head', 'upper', 'coat', 'bra', 'lower', 'panties', 'foot']
    return removableSlots.every(s => !char.equipment[s])
  })

  // 注释：目标未穿胸罩
  registry.register('NOT_WEAR_BRA', (ctx: any) => {
    return isSlotEmpty(ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId, 'bra')
  })

  // 注释：目标未穿内裤
  registry.register('NOT_WEAR_PAN', (ctx: any) => {
    return isSlotEmpty(ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId, 'panties')
  })

  // 注释：目标胸罩可见（已脱下或未穿）
  registry.register('BRA_VISIBLE', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    return isSlotEmpty(charId, 'bra') || isSlotOff(charId, 'bra')
  })

  // 注释：目标内裤可见
  registry.register('PANTIES_VISIBLE', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    return isSlotEmpty(charId, 'panties') || isSlotOff(charId, 'panties')
  })

  // 注释：目标穿着某槽位
  registry.register('CLOTH_WEAR', (ctx: any) => {
    const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
    if (!charId) return false
    return !isSlotEmpty(charId, ctx.premiseParam ?? 'upper')
  })
}
