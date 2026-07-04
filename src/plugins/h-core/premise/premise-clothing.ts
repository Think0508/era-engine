// 注释：服装前提——查角色 equipment / equipment_off

import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'

function getClothTag(charId: string, slot: string): number | null {
  const char = entitySystem.get('character', charId) as any
  if (!char?.equipment?.[slot]) return null
  const itemId = char.equipment[slot]
  const mod = modLoader.getMod()
  const itemDef = mod?.items[itemId]
  return (itemDef as any)?.cloth_tag ?? null
}

function isSlotEmpty(charId: string, slot: string): boolean {
  const char = entitySystem.get('character', charId) as any
  if (!char) return true
  const equip = char.equipment ?? {}
  return !equip[slot]
}

function isSlotOff(charId: string, slot: string): boolean {
  const char = entitySystem.get('character', charId) as any
  if (!char) return false
  const off = char.equipment_off ?? {}
  return !!off[slot]
}

// 注释：从 context 取目标角色 ID
function targetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

// 注释：从 context 取自己（玩家）角色 ID
function selfId(ctx: any): string | null {
  return ctx.gameStore?.player?.id ?? ctx.playerId ?? null
}

// 注释：工厂——槽位前提
function slotPremise(slotId: string, getId: (ctx: any) => string | null) {
  return (ctx: any) => {
    const charId = getId(ctx)
    return charId != null && !isSlotEmpty(charId, slotId)
  }
}

// 注释：工厂——槽位前提（或逻辑：任一槽位非空即真）
function anySlotPremise(slotIds: string[], getId: (ctx: any) => string | null) {
  return (ctx: any) => {
    const charId = getId(ctx)
    if (!charId) return false
    return slotIds.some(s => !isSlotEmpty(charId, s))
  }
}

// 注释：工厂——标签前提（任意槽位有匹配 cloth_tag）
function tagPremise(tagId: number, getId: (ctx: any) => string | null) {
  return (ctx: any) => {
    const charId = getId(ctx)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    if (!char?.equipment) return false
    for (const slotId of Object.keys(char.equipment)) {
      const tag = getClothTag(charId, slotId)
      if (tag === tagId) return true
    }
    return false
  }
}

// 注释：工厂——裤子前提（下身非空且不是裙子）
function trouserPremise(getId: (ctx: any) => string | null) {
  return (ctx: any) => {
    const charId = getId(ctx)
    if (!charId) return false
    if (isSlotEmpty(charId, 'lower')) return false
    return getClothTag(charId, 'lower') !== 5
  }
}

export function registerClothingPremises(registry: any): void {
  // ════════════════════════════════════════════════
  // 自己版（Self）——检查玩家自己的服装
  // ════════════════════════════════════════════════
  registry.register('WEAR_HAT', slotPremise('head', selfId))
  registry.register('WEAR_IN_EAR', slotPremise('accessory', selfId))
  registry.register('WEAR_IN_NECK', slotPremise('accessory', selfId))
  registry.register('WEAR_IN_UP', anySlotPremise(['upper', 'coat'], selfId))
  registry.register('WEAR_BRA', slotPremise('bra', selfId))
  registry.register('WEAR_GLOVES', slotPremise('hand', selfId))
  registry.register('WEAR_IN_DOWN', slotPremise('lower', selfId))
  registry.register('WEAR_TROUSERS', trouserPremise(selfId))
  registry.register('WEAR_PAN', slotPremise('panties', selfId))
  registry.register('WEAR_SOCKS', slotPremise('foot', selfId))
  registry.register('WEAR_SHOES', slotPremise('foot', selfId))
  registry.register('WEAR_SKIRT', tagPremise(5, selfId))

  // 自己否定版
  registry.register('NOT_WEAR_HAT', (ctx: any) => !slotPremise('head', selfId)(ctx))
  registry.register('NOT_WEAR_IN_EAR', (ctx: any) => !slotPremise('accessory', selfId)(ctx))
  registry.register('NOT_WEAR_IN_NECK', (ctx: any) => !slotPremise('accessory', selfId)(ctx))
  registry.register('NOT_WEAR_IN_UP', (ctx: any) => !anySlotPremise(['upper', 'coat'], selfId)(ctx))
  registry.register('NOT_WEAR_BRA', (ctx: any) => !slotPremise('bra', selfId)(ctx))
  registry.register('NOT_WEAR_GLOVES', (ctx: any) => !slotPremise('hand', selfId)(ctx))
  registry.register('NOT_WEAR_IN_DOWN', (ctx: any) => !slotPremise('lower', selfId)(ctx))
  registry.register('NOT_WEAR_TROUSERS', (ctx: any) => !trouserPremise(selfId)(ctx))
  registry.register('NOT_WEAR_PAN', (ctx: any) => !slotPremise('panties', selfId)(ctx))
  registry.register('NOT_WEAR_SOCKS', (ctx: any) => !slotPremise('foot', selfId)(ctx))
  registry.register('NOT_WEAR_SHOES', (ctx: any) => !slotPremise('foot', selfId)(ctx))
  registry.register('NOT_WEAR_SKIRT', (ctx: any) => !tagPremise(5, selfId)(ctx))

  // ════════════════════════════════════════════════
  // 目标版（TARGET）——检查目标角色的服装
  // ════════════════════════════════════════════════
  registry.register('TARGET_WEAR_HAT', slotPremise('head', targetId))
  registry.register('TARGET_WEAR_IN_EAR', slotPremise('accessory', targetId))
  registry.register('TARGET_WEAR_IN_NECK', slotPremise('accessory', targetId))
  registry.register('TARGET_WEAR_IN_UP', anySlotPremise(['upper', 'coat'], targetId))
  registry.register('TARGET_WEAR_BRA', slotPremise('bra', targetId))
  registry.register('TARGET_WEAR_GLOVES', slotPremise('hand', targetId))
  registry.register('TARGET_WEAR_IN_DOWN', slotPremise('lower', targetId))
  registry.register('TARGET_WEAR_TROUSERS', trouserPremise(targetId))
  registry.register('TARGET_WEAR_PAN', slotPremise('panties', targetId))
  registry.register('TARGET_WEAR_SOCKS', slotPremise('foot', targetId))
  registry.register('TARGET_WEAR_SHOES', slotPremise('foot', targetId))
  registry.register('TARGET_WEAR_GLASS', (_ctx: any) => false)  // 无对应槽位
  registry.register('TARGET_WEAR_IN_MOUSE', (_ctx: any) => false)  // 无对应槽位

  // 目标否定版
  registry.register('TARGET_NOT_WEAR_HAT', (ctx: any) => !slotPremise('head', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_IN_EAR', (ctx: any) => !slotPremise('accessory', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_IN_NECK', (ctx: any) => !slotPremise('accessory', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_IN_UP', (ctx: any) => !anySlotPremise(['upper', 'coat'], targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_BRA', (ctx: any) => !slotPremise('bra', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_GLOVES', (ctx: any) => !slotPremise('hand', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_IN_DOWN', (ctx: any) => !slotPremise('lower', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_TROUSERS', (ctx: any) => !trouserPremise(targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_PAN', (ctx: any) => !slotPremise('panties', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_SOCKS', (ctx: any) => !slotPremise('foot', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_SHOES', (ctx: any) => !slotPremise('foot', targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_GLASS', (_ctx: any) => true)  // 没玻璃槽位=没戴
  registry.register('TARGET_NOT_WEAR_IN_MOUSE', (_ctx: any) => true)

  // ════════════════════════════════════════════════
  // 标签版（Tag）——按 cloth_tag 检查
  // ════════════════════════════════════════════════
  // 注释：cloth_tag: 0普通 1童装 2情趣 3泳装 4和服 5裙子 6饰品

  // 目标版
  registry.register('TARGET_WEAR_SWIM', tagPremise(3, targetId))
  registry.register('TARGET_WEAR_SKIRT', tagPremise(5, targetId))
  registry.register('TARGET_WEAR_SEXY', tagPremise(2, targetId))
  registry.register('TARGET_WEAR_KIMONO', tagPremise(4, targetId))
  registry.register('TARGET_WEAR_CHILDISH', tagPremise(1, targetId))

  // 目标否定版
  registry.register('TARGET_NOT_WEAR_SWIM', (ctx: any) => !tagPremise(3, targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_SKIRT', (ctx: any) => !tagPremise(5, targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_SEXY', (ctx: any) => !tagPremise(2, targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_KIMONO', (ctx: any) => !tagPremise(4, targetId)(ctx))
  registry.register('TARGET_NOT_WEAR_CHILDISH', (ctx: any) => !tagPremise(1, targetId)(ctx))

  // ════════════════════════════════════════════════
  // 复合状态
  // ════════════════════════════════════════════════
  const clothOffHandler = (ctx: any) => {
    const charId = targetId(ctx)
    if (!charId) return false
    const char = entitySystem.get('character', charId) as any
    if (!char?.equipment) return false
    const removableSlots = ['head', 'upper', 'coat', 'bra', 'lower', 'panties', 'foot']
    return removableSlots.every(s => !char.equipment[s])
  }

  registry.register('CLOTH_OFF', clothOffHandler)
  registry.register('NOT_CLOTH_OFF', (ctx: any) => !clothOffHandler(ctx))

  // 注释：大部分裸——上身/胸罩/下身/内裤都空
  const clothMostOffHandler = (ctx: any) => {
    const charId = targetId(ctx)
    if (!charId) return false
    return ['upper', 'bra', 'lower', 'panties'].every(s => isSlotEmpty(charId, s))
  }

  registry.register('CLOTH_MOST_OFF', clothMostOffHandler)
  registry.register('NOT_CLOTH_MOST_OFF', (ctx: any) => !clothMostOffHandler(ctx))

  // 注释：缺少胸罩或内裤（自己）
  registry.register('NOW_WEAR_BRA_OR_PAN', (ctx: any) => {
    const charId = selfId(ctx)
    if (!charId) return false
    return isSlotEmpty(charId, 'bra') || isSlotEmpty(charId, 'panties')
  })

  // ════════════════════════════════════════════════
  // 旧版兼容（保持对外接口）
  // ════════════════════════════════════════════════
  registry.register('CLOTH_WEAR', (ctx: any) => {
    const charId = targetId(ctx)
    if (!charId) return false
    return !isSlotEmpty(charId, ctx.premiseParam ?? 'upper')
  })

  registry.register('BRA_VISIBLE', (ctx: any) => {
    const charId = targetId(ctx)
    if (!charId) return false
    return isSlotEmpty(charId, 'bra') || isSlotOff(charId, 'bra')
  })

  registry.register('PANTIES_VISIBLE', (ctx: any) => {
    const charId = targetId(ctx)
    if (!charId) return false
    return isSlotEmpty(charId, 'panties') || isSlotOff(charId, 'panties')
  })
}
