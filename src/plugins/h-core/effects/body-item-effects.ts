// 注释：h-core 效果域模块——身体物品/药物/震动棒效果（E2 拆分，2026-08-15）
// 自 index.ts 原样迁出：apply_lubricant / apply_aphrodisiac / apply_instant_toy /
// body_item_equip / body_item_unequip / body_item_clear_all / vibrator_set / vibrator_up /
// vibrator_down / body_item_tick。纯重构：handler 逻辑零改动，仅注册位置迁移
// （onLoad 中 registerBodyItemEffects() 调用点位于原 apply_lubricant 首次注册处，保持注册顺序不变）。

import { effectTypeRegistry } from '../../../core/effect-type-registry'
import { entitySystem } from '../../../core/entity-system'
import { eventBus } from '../../../core/event-bus'
import { gameContext } from '../../../core/game-context'
import { errorReporter } from '../../../core/error-reporter'
import { modLoader } from '../../../core/mod-loader'
import { apiSystem } from '../../../core/api'
import { ATTR } from '../../../core/entity-utils'
import type { BodyItemSlot } from '../types'

export function registerBodyItemEffects(): void {
  // ═══════════════════════════════════════════════════════════
  // H 药物效果——精准复刻 erArk 公式
  // ═══════════════════════════════════════════════════════════

  // 注释：润滑液——TARGET_ADD_HUGE_LUBRICATION (效果1001)
  // 公式：润滑 += min(99999, 10000 - floor(当前 * 0.1))
  effectTypeRegistry.register('apply_lubricant', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.base) continue
      const cur = ch.base[ATTR.LUBE] ?? 0
      ch.base[ATTR.LUBE] = Math.min(99999, cur + (10000 - Math.floor(cur * 0.1)))
    }
    return true
  })

  // 注释：媚药——TARGET_ADD_HUGE_DESIRE_AND_SUBMIT (效果1002)
  // 公式：欲情 += min(99999, 10000 - floor(当前 * 0.016))
  //       屈服 += min(99999, 10000 - floor(当前 * 0.016))
  //       desire_point = 100（满值）
  effectTypeRegistry.register('apply_aphrodisiac', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.base) continue
      const curD = ch.base[ATTR.AROUSAL] ?? 0
      ch.base[ATTR.AROUSAL] = Math.min(99999, curD + (10000 - Math.floor(curD * 0.016)))
      const curS = ch.base[ATTR.OBEDIENCE] ?? 0
      ch.base[ATTR.OBEDIENCE] = Math.min(99999, curS + (10000 - Math.floor(curS * 0.016)))
      // 注释：desire_point 满值
      if (!ch.desire_point) ch.desire_point = 0
      ch.desire_point = Math.min(100, (ch.desire_point ?? 0) + 100)
    }
    return true
  })

  // 注释：灌肠液——TARGET_ENEMA (效果1003) —— 完整复刻 erArk item_effect.py:1231

  // 注释：一次性玩具（跳蛋/按摩棒）——即时快感
  // params: part (部位), base (基础快感)
  effectTypeRegistry.register('apply_instant_toy', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const part = (_p.part as string) ?? 'clit'
    const base = (_p.base as number) ?? 50
    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.base) continue
      ch.base[part] = (ch.base[part] ?? 0) + base
    }
    return true
  })

  // ═══════════════════════════════════════════════════════════
  // body_item 效果
  // ═══════════════════════════════════════════════════════════

  // 注释：body_item_equip——装备到身体物品槽
  // 从 sourceId 背包扣除，设 target 的 body_items[slot]
  effectTypeRegistry.register('body_item_equip', async (_p: any, execCtx: any) => {
    const slot = (_p.slot as number) ?? -1
    if (slot < 0) return true
    const itemId = execCtx._itemId ?? execCtx.sourceItemId
    // 注释：扣 source 背包
    const srcId = execCtx.sourceId
    if (srcId && itemId) {
      // 注释：消费扣减——removeItem 返回 boolean（从不 throw），失败（背包数量不足/不存在）→ 装备中止
      const removed = await apiSystem.call('inventory', 'removeItem', srcId, itemId, 1) as unknown as boolean
      if (!removed) {
        errorReporter.report({
          source: 'h-core',
          severity: 'warning',
          message: `body_item_equip 从背包移除 '${itemId}' 失败（数量不足或不存在）——装备中止`,
        })
        return true
      }
    }
    // 注释：设 target 的 body_items[slot]
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.body_items) ch.body_items = {}
      const itemDef = (modLoader.getMod()?.items as any)?.[itemId ?? ''] as any
      const slotData: BodyItemSlot = {
        itemId: itemId ?? '',
        active: true,
      }
      if (itemDef?.duration) {
        const ct = gameContext.getContext().time
        // expiry 到期清槽由 onEnable 的 game:hour_changed 监听处理（erArk realtime_settle.py:270-283）
        slotData.expiry = ct.hour * 60 + ct.minute + itemDef.duration
      }
      ch.body_items[String(slot)] = slotData
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 注释：body_item_unequip——卸下身体物品（grill Q4：manual/h_end 卸下归还背包 +1）
  effectTypeRegistry.register('body_item_unequip', async (_p: any, execCtx: any) => {
    const slot = (_p.slot as number) ?? -1
    if (slot < 0) return true
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items) continue
      const slotData = ch.body_items[String(slot)] as BodyItemSlot | undefined
      delete ch.body_items[String(slot)]
      if (slotData?.itemId) {
        await apiSystem.call('inventory', 'addItem', id, slotData.itemId, 1)
      }
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 注释：body_item_clear_all——清除所有 body_item（H 结束用）
  effectTypeRegistry.register('body_item_clear_all', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items) continue
      ch.body_items = {}
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // ═══════════════════════════════════════════════════════════
  // 震动棒系统——档位控制 + 每次行动后 tick
  // ═══════════════════════════════════════════════════════════

  // 注释：vibrator_set——设置震动棒档位 0-3
  effectTypeRegistry.register('vibrator_set', (_p: any, execCtx: any) => {
    const level = (_p.level as number) ?? 0
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state) ch.h_state.sex_toy_level = Math.max(0, Math.min(3, level))
    }
    return true
  })

  effectTypeRegistry.register('vibrator_up', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state && ch.h_state.sex_toy_level < 3) ch.h_state.sex_toy_level++
    }
    return true
  })

  effectTypeRegistry.register('vibrator_down', (_p: any, execCtx: any) => {
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state && ch.h_state.sex_toy_level > 0) ch.h_state.sex_toy_level--
    }
    return true
  })

  // 注释：body_item_tick——每次 H 行动后触发，遍历 active body_item 产生持续快感
  // erArk SecondEffect 公式：
  //   toy_adjust = sex_toy_level × 0.5
  //   adjust = getAbilityAdjust(part_ability_lv)
  //   pleasure = tick_base × adjust × toy_adjust
  effectTypeRegistry.register('body_item_tick', (_p: any, execCtx: any) => {
    const ids = execCtx._targetIds as string[]
    const mod = modLoader.getMod()
    const adjTable = (mod?.hConfig as any)?.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const getAdj = (lv: number) => adjTable[Math.min(Math.max(0, lv), 10)] ?? 4.0

    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items || !ch.h_state) continue
      const toyLevel = ch.h_state.sex_toy_level ?? 0
      if (toyLevel <= 0) continue
      const toyAdj = toyLevel * 0.5

      for (const slotData of Object.values(ch.body_items) as BodyItemSlot[]) {
        if (!slotData.active) continue
        const itemDef = (mod?.items as any)?.[slotData.itemId]
        const tickPart = (itemDef as any)?.tick_part
        if (!tickPart) continue
        const tickBase = (itemDef as any)?.tick_base ?? 20
        const abLv = ch.abilities?.[tickPart.ability]?.level ?? 0
        const abAdj = getAdj(abLv)
        const pleasure = Math.floor(tickBase * abAdj * toyAdj)
        if (pleasure > 0) {
          if (!ch.base) ch.base = {}
          for (const pName of (tickPart.params as string[]) ?? []) {
            ch.base[pName] = Math.min(99999, (ch.base[pName] ?? 0) + pleasure)
          }
        }
      }
    }
    return true
  })
}
