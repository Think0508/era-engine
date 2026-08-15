// 注释：h-core 效果域模块——衣物效果（E2 拆分，2026-08-15）
// 自 index.ts 原样迁出：cloth_remove / cloth_wear / cloth_remove_all / cloth_wear_all /
// cloth_set_visible。纯重构：handler 逻辑零改动，仅注册位置迁移
// （onLoad 中 registerClothEffects() 调用点位于原 cloth_remove 首次注册处，保持注册顺序不变）。

import { effectTypeRegistry } from '../../../core/effect-type-registry'
import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'

export function registerClothEffects(): void {
  // 注释：cloth_remove——H 中脱衣（equipment → equipment_off）
  effectTypeRegistry.register('cloth_remove', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      const slot = _p.slot as string
      if (!ch.equipment?.[slot]) continue
      if (!ch.equipment_off) ch.equipment_off = {}
      ch.equipment_off[slot] = ch.equipment[slot]
      delete ch.equipment[slot]
    }
    return true
  })

  // 注释：cloth_wear——H 中穿衣（equipment_off → equipment）
  effectTypeRegistry.register('cloth_wear', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      const slot = _p.slot as string
      if (!ch.equipment_off?.[slot]) continue
      if (!ch.equipment) ch.equipment = {}
      ch.equipment[slot] = ch.equipment_off[slot]
      delete ch.equipment_off[slot]
    }
    return true
  })

  // 注释：cloth_remove_all——全裸
  effectTypeRegistry.register('cloth_remove_all', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const mod = modLoader.getMod()
    const autoSlots = new Set(mod?.equipmentSlots?.filter(s => s.removable).map(s => s.id) ?? [])
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.equipment) continue
      if (!ch.equipment_off) ch.equipment_off = {}
      for (const [slot, item] of Object.entries(ch.equipment) as [string, any][]) {
        if (autoSlots.has(slot)) {
          ch.equipment_off[slot] = item
          delete ch.equipment[slot]
        }
      }
    }
    return true
  })

  // 注释：cloth_wear_all——全部穿回
  effectTypeRegistry.register('cloth_wear_all', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.equipment_off) continue
      if (!ch.equipment) ch.equipment = {}
      for (const [slot, item] of Object.entries(ch.equipment_off) as [string, any][]) {
        ch.equipment[slot] = item
      }
      ch.equipment_off = {}
    }
    return true
  })

  // 注释：cloth_set_visible——设置某槽位可见性
  effectTypeRegistry.register('cloth_set_visible', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.equipment_visible) ch.equipment_visible = {}
      ch.equipment_visible[_p.slot as string] = _p.visible ?? true
    }
    return true
  })
}
