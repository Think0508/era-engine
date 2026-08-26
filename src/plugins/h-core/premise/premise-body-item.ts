// 注释：body-item 前提——查角色 body_items

import { entitySystem } from '../../../core/entity-system'

function targetId(ctx: any): string | null {
  return ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId ?? null
}

function selfId(ctx: any): string | null {
  return ctx.gameStore?.player?.id ?? ctx.playerId ?? null
}

export function registerBodyItemPremises(registry: any): void {
  // 注释：通用——目标某槽有 active body_item
  function hasBodyItemSlot(slot: number, getId: (ctx: any) => string | null) {
    return (ctx: any) => {
      const charId = getId(ctx)
      if (!charId) return false
      const ch = entitySystem.get('character', charId) as any
      if (!ch?.body_items) return false
      const slotData = ch.body_items[String(slot)]
      return slotData?.active === true
    }
  }

  // 注释：目标版
  registry.registerPremise('TARGET_HAS_BODY_ITEM', (ctx: any) => {
    const slot = parseInt(ctx.premiseParam ?? '0', 10)
    return hasBodyItemSlot(slot, targetId)(ctx)
  })

  registry.registerPremise('TARGET_NOT_BODY_ITEM', (ctx: any) => {
    const slot = parseInt(ctx.premiseParam ?? '0', 10)
    return !hasBodyItemSlot(slot, targetId)(ctx)
  })

  // 注释：自己版
  registry.registerPremise('HAS_BODY_ITEM', (ctx: any) => {
    const slot = parseInt(ctx.premiseParam ?? '0', 10)
    return hasBodyItemSlot(slot, selfId)(ctx)
  })

  registry.registerPremise('NOT_BODY_ITEM', (ctx: any) => {
    const slot = parseInt(ctx.premiseParam ?? '0', 10)
    return !hasBodyItemSlot(slot, selfId)(ctx)
  })

  // 注释：快捷前提——特定槽位是否有物品
  registry.registerPremise('TARGET_HAS_VIBRATOR', hasBodyItemSlot(2, targetId))
  registry.registerPremise('TARGET_HAS_ANAL_BEADS', hasBodyItemSlot(7, targetId))
  registry.registerPremise('TARGET_HAS_CONDOM', hasBodyItemSlot(13, targetId))
  registry.registerPremise('TARGET_HAS_GAG', hasBodyItemSlot(14, targetId))
  registry.registerPremise('TARGET_NOT_GAG', (ctx: any) => !hasBodyItemSlot(14, targetId)(ctx))
  registry.registerPremise('TARGET_HAS_NIPPLE_CLAMP', hasBodyItemSlot(0, targetId))
  registry.registerPremise('TARGET_HAS_MILKER', hasBodyItemSlot(4, targetId))
  registry.registerPremise('TARGET_HAS_BLINDFOLD', hasBodyItemSlot(6, targetId))
  registry.registerPremise('TARGET_HAS_SLEEPING_PILL', hasBodyItemSlot(9, targetId))
  registry.registerPremise('TARGET_HAS_CONTRACEPTIVE', (ctx: any) => {
    const charId = targetId(ctx)
    if (!charId) return false
    const ch = entitySystem.get('character', charId) as any
    if (!ch?.body_items) return false
    return [11, 12].some(s => ch.body_items[String(s)]?.active === true)
  })

  // 注释：震动棒档位前提
  function toyLevelGe(minLevel: number, getId: (ctx: any) => string | null) {
    return (ctx: any) => {
      const charId = getId(ctx)
      if (!charId) return false
      const ch = entitySystem.get('character', charId) as any
      return (ch?.h_state?.sex_toy_level ?? 0) >= minLevel
    }
  }

  registry.registerPremise('VIBRATOR_LEVEL_GE_1', toyLevelGe(1, targetId))
  registry.registerPremise('VIBRATOR_LEVEL_GE_2', toyLevelGe(2, targetId))
  registry.registerPremise('VIBRATOR_LEVEL_GE_3', toyLevelGe(3, targetId))
  registry.registerPremise('VIBRATOR_LEVEL_0', (ctx: any) => !toyLevelGe(1, targetId)(ctx))
  registry.registerPremise('SELF_VIBRATOR_LEVEL_GE_1', toyLevelGe(1, selfId))
}
