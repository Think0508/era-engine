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

// 注释：判定退缩门控（复核补丁）——与 settle_* 一致，退缩时 item/玩具效果整链跳过
function canApply(ctx: any): boolean {
  return !ctx?._judgeResult?.retreated
}

export function registerBodyItemEffects(): void {
  // ═══════════════════════════════════════════════════════════
  // H 药物效果——精准复刻 erArk 公式
  // ═══════════════════════════════════════════════════════════

  // 注释：润滑液——TARGET_ADD_HUGE_LUBRICATION (效果1001)
  // 公式：润滑 += min(99999, 10000 - floor(当前 * 0.1))
  effectTypeRegistry.register('apply_lubricant', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
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
    if (!canApply(execCtx)) return true
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
    if (!canApply(execCtx)) return true
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
    if (!canApply(execCtx)) return true
    const slot = (_p.slot as number) ?? -1
    if (slot < 0) return true
    const itemId = _p.itemId ?? execCtx._itemId ?? execCtx.sourceItemId
    // 注释：扣 source 背包——只扣 consume=true 的物品；装备类玩具（erArk H_Machine/SM）不消耗，
    // 物品保留在背包，body_item 只记穿戴状态（2026-08-26 修正：原先一律扣，导致“取下需备件”的假象）
    const srcId = execCtx.sourceId
    const itemDef = itemId ? (modLoader.getMod()?.items as any)?.[itemId] as any : null
    const shouldConsume = itemDef?.consume !== false
    // useItem 已按 consume 预扣，进入效果时不再扣/校验背包，避免双重扣减
    if (!execCtx._fromUseItem && srcId && itemId) {
      if (shouldConsume) {
        // 消费型物品：扣 1，数量不足则中止
        const removed = await apiSystem.call('inventory', 'removeItem', srcId, itemId, 1) as unknown as boolean
        if (!removed) {
          errorReporter.report({
            source: 'h-core',
            severity: 'warning',
            message: `body_item_equip 从背包移除 '${itemId}' 失败（数量不足或不存在）——装备中止`,
          })
          return true
        }
      } else {
        // 装备类玩具不消耗，但必须确实拥有该物品
        const src = entitySystem.get('character', srcId) as any
        const has = (src?.inventory ?? []).some((i: any) => i.itemId === itemId && (i.count ?? 0) > 0)
        if (!has) {
          errorReporter.report({
            source: 'h-core',
            severity: 'warning',
            message: `body_item_equip 背包没有 '${itemId}'——装备中止（装备类不消耗）`,
          })
          return true
        }
      }
    }
    // 注释：设 target 的 body_items[slot]
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.body_items) ch.body_items = {}
      const slotDef = (modLoader.getMod()?.items as any)?.[itemId ?? ''] as any
      const slotData: BodyItemSlot = {
        itemId: itemId ?? '',
        active: true,
      }
      if (slotDef?.duration) {
        const ct = gameContext.getContext().time
        // expiry 到期清槽由 onEnable 的 game:hour_changed 监听处理（erArk realtime_settle.py:270-283）
        slotData.expiry = ct.hour * 60 + ct.minute + slotDef.duration
      }
      ch.body_items[String(slot)] = slotData
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 注释：body_item_unequip——卸下身体物品（装备类不消耗，物品本就在背包；消耗类已消耗，均不归还）
  effectTypeRegistry.register('body_item_unequip', async (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const slot = (_p.slot as number) ?? -1
    if (slot < 0) return true
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items) continue
      delete ch.body_items[String(slot)]
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 注释：body_item_clear_all——清除所有 body_item（H 结束用）
  effectTypeRegistry.register('body_item_clear_all', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
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
    if (!canApply(execCtx)) return true
    const level = (_p.level as number) ?? 0
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state) ch.h_state.sex_toy_level = Math.max(0, Math.min(3, level))
    }
    return true
  })

  effectTypeRegistry.register('vibrator_up', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state && ch.h_state.sex_toy_level < 3) ch.h_state.sex_toy_level++
    }
    return true
  })

  effectTypeRegistry.register('vibrator_down', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (ch?.h_state && ch.h_state.sex_toy_level > 0) ch.h_state.sex_toy_level--
    }
    return true
  })

  // ═══════════════════════════════════════════════════════════
  // item 批：玩具装卸 + 避孕套（2026-08-26）
  // ═══════════════════════════════════════════════════════════

  // toy_equip：从发起者背包扣 itemId（仅 consume=true），装到目标 body_items[slot]，并置 h_state flag（可带档位）
  effectTypeRegistry.register('toy_equip', async (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const slot = (_p.slot as number) ?? -1
    const itemId = (_p.itemId as string) ?? ''
    const flag = (_p.flag as string) ?? ''
    if (slot < 0 || !itemId) return true
    const srcId = execCtx.sourceId
    const itemDef = (modLoader.getMod()?.items as any)?.[itemId] as any
    const shouldConsume = itemDef?.consume !== false
    if (srcId) {
      if (shouldConsume) {
        const removed = await apiSystem.call('inventory', 'removeItem', srcId, itemId, 1) as unknown as boolean
        if (!removed) {
          errorReporter.report({
            source: 'h-core',
            severity: 'warning',
            message: `toy_equip 从背包移除 '${itemId}' 失败（数量不足或不存在）——装备中止`,
          })
          return true
        }
      } else {
        const src = entitySystem.get('character', srcId) as any
        const has = (src?.inventory ?? []).some((i: any) => i.itemId === itemId && (i.count ?? 0) > 0)
        if (!has) {
          errorReporter.report({
            source: 'h-core',
            severity: 'warning',
            message: `toy_equip 背包没有 '${itemId}'——装备中止（装备类不消耗）`,
          })
          return true
        }
      }
    }
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch) continue
      if (!ch.body_items) ch.body_items = {}
      ch.body_items[String(slot)] = { itemId, active: true }
      if (flag && ch.h_state) ch.h_state[flag] = true
      if (typeof _p.level === 'number' && ch.h_state) ch.h_state.sex_toy_level = Math.max(0, Math.min(3, _p.level))
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // toy_unequip：从目标卸下 body_items[slot]，清 h_state flag（装备不消耗，无需归还）
  effectTypeRegistry.register('toy_unequip', async (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const slot = (_p.slot as number) ?? -1
    const flag = (_p.flag as string) ?? ''
    if (slot < 0) return true
    for (const id of execCtx._targetIds as string[]) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.body_items) continue
      delete ch.body_items[String(slot)]
      if (flag && ch.h_state) ch.h_state[flag] = false
      // 拔出震动棒/跳蛋时档位清零
      if (ch.h_state && (flag === 'vibrator_insertion' || flag === 'vibrator_insertion_anal')) {
        ch.h_state.sex_toy_level = 0
      }
      eventBus.emit('character:changed', { id })
    }
    return true
  })

  // 1011 WEAR_CONDOM / 1012 TAKE_CONDOM_OFF：统一 body_items[13] 表示（erArk body_item[13][1]；
  // h-ejaculation 射精判定用 body_items['13']，h_state.condom 仅作兼容镜像）
  effectTypeRegistry.register('wear_condom', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const self = execCtx.sourceId ? entitySystem.get('character', execCtx.sourceId) as any : null
    if (self?.h_state) self.h_state.condom = true
    if (self) {
      if (!self.body_items) self.body_items = {}
      self.body_items['13'] = { itemId: '避孕套', active: true }
    }
    return true
  })
  effectTypeRegistry.register('take_condom_off', (_p: any, execCtx: any) => {
    if (!canApply(execCtx)) return true
    const self = execCtx.sourceId ? entitySystem.get('character', execCtx.sourceId) as any : null
    if (self?.h_state) self.h_state.condom = false
    if (self?.body_items) delete self.body_items['13']
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
