// 注释：hunger-system 插件——饥饿系统
// 功能：饥饿值自动增长 + 进食效果 + 消化CD + NPC口粮
// 所有数值通过 h-config.toml [hunger] 可 patch/override

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { modLoader } from '../../core/mod-loader'
import { narrativeLog } from '../../core/narrative-log'

const HUNGER_ATTR = '饥饿值'
const DIGESTION_ATTR = '消化剩余'

function getHungerConfig(): any {
  return (modLoader.getMod()?.hConfig as any)?.hunger ?? {}
}

// 注释：获取角色某个物品的数量
function getItemCount(charId: string, itemId: string): number {
  const ch = entitySystem.get('character', charId) as any
  return ch?.inventory?.find((i: any) => i.itemId === itemId)?.count ?? 0
}

// 注释：检查背包是否有可吃的食物
function findFirstFood(charId: string): string | null {
  const ch = entitySystem.get('character', charId) as any
  if (!ch?.inventory) return null
  const mod = modLoader.getMod()
  for (const entry of ch.inventory) {
    const def = (mod?.items as any)?.[entry.itemId]
    if (def?.use === 'food' && (entry.count ?? 0) > 0) return entry.itemId
  }
  return null
}

export function onLoad(_ctx: PluginContext): void {
  // 注释：eat_food——进食效果
  // params: { itemId: string }
  // 需要背包有对应食物，消化剩余为 0
  // 扣除食物 → 减饥饿值 → 设消化CD → 回HP/MP → 耗时
  effectTypeRegistry.register('eat_food', async (params: any, execCtx: any) => {
    const itemId = params.itemId as string
    if (!itemId) return true
    const mod = modLoader.getMod()
    const itemDef = (mod?.items as any)?.[itemId]
    if (itemDef?.use !== 'food') return true

    const timeCost = execCtx._timeCost ?? itemDef.time_cost ?? 30
    const ids = execCtx._targetIds as string[]

    for (const id of ids) {
      const ch = entitySystem.get('character', id) as any
      if (!ch?.base) continue

      // 注释：消化中不能吃
      if ((ch.base[DIGESTION_ATTR] ?? 0) > 0) {
        narrativeLog.write(`${ch.name ?? id} 还在消化中，吃不下`, 'system', 'hunger-system')
        continue
      }

      // 注释：检查背包
      if (getItemCount(id, itemId) <= 0) {
        narrativeLog.write(`${ch.name ?? id} 没有 ${itemDef.name ?? itemId}`, 'system', 'hunger-system')
        continue
      }

      // 注释：扣食物
      try {
        await apiSystem.call('inventory', 'removeItem', id, itemId, 1)
      } catch {
        continue
      }

      // 注释：减饥饿值
      const reduction = itemDef.hunger_reduction ?? 240
      ch.base[HUNGER_ATTR] = Math.max(0, (ch.base[HUNGER_ATTR] ?? 0) - reduction)

      // 注释：设消化CD（受天赋影响）
      const digestTime = itemDef.digestion_time ?? 240
      const talentMod = ch.talents?.['饿得快'] ? 0.5 : 1.0
      ch.base[DIGESTION_ATTR] = Math.floor(digestTime * talentMod)

      // 注释：回HP/MP（erArk default.py:63-120 公式）
      const hpMax = ch.base['体力上限'] ?? 2500
      const mpMax = ch.base['气力上限'] ?? 2000
      const hpRate = itemDef.hp_recovery ?? 1.0
      const mpRate = itemDef.mp_recovery ?? 1.0
      const hpGain = Math.floor(timeCost * (10 + hpMax * 0.005) * hpRate)
      const mpGain = Math.floor(timeCost * (20 + hpMax * 0.01) * mpRate)
      ch.base['体力'] = Math.min(hpMax, (ch.base['体力'] ?? 0) + hpGain)
      ch.base['气力'] = Math.min(mpMax, (ch.base['气力'] ?? 0) + mpGain)

      execCtx.settlement?.applyChange?.(id, HUNGER_ATTR, -reduction)
      narrativeLog.write(`${ch.name ?? id} 吃完了${itemDef.name ?? itemId}，HP+${hpGain} MP+${mpGain}`, 'system', 'hunger-system')
    }
    return true
  })
}

export function onEnable(ctx: PluginContext): void {
  // 注释：消化衰减 + NPC 自动进食（饥饿值增长已收敛到引擎行动级结算——
  // G1 决策 2026-08-09：erArk 只有行动级（realtime_settle 按 true_add_time 结算），
  // 小时级 tick 与行动级重叠 = 双倍增长；增长统一走 core realtimeSettle.settleHunger
  // （含 erArk HP/MP 比例系数），此处只保留不重叠的消化/NPC 进食）
  ctx.events.on('game:hour_changed', async () => {
    const cfg = getHungerConfig()
    const allChars = entitySystem.getAll('character')
    for (const ch of allChars) {
      const c = ch as any
      if (!c?.base) continue

      // 注释：消化递减
      const digestRate = cfg.digestion_per_hour ?? 60
      if ((c.base[DIGESTION_ATTR] ?? 0) > 0) {
        c.base[DIGESTION_ATTR] = Math.max(0, (c.base[DIGESTION_ATTR] ?? 0) - digestRate)
      }

      // 注释：NPC 自动进食
      if (c.id !== 'player' && c.id !== '0') {
        const threshold = cfg.npc_auto_eat_threshold ?? 190
        if ((c.base[HUNGER_ATTR] ?? 0) > threshold && (c.base[DIGESTION_ATTR] ?? 0) <= 0) {
          const foodId = findFirstFood(c.id)
          if (foodId) {
            await apiSystem.call('effect-system', 'execute', [
              { type: 'eat_food', params: { itemId: foodId } }
            ], { sourceId: c.id, _targetIds: [c.id], _timeCost: 30 })
          }
        }
      }
    }
  })

  // 注释：每日口粮（NPC 天没亮时获得，关闭则不发放）
  ctx.events.on('game:new_day', async (_payload: any) => {
    const cfg = getHungerConfig()
    const rationId = cfg.daily_ration_id as string
    const rationCount = (cfg.daily_ration_count as number) ?? 1
    if (!rationId || rationCount <= 0) return
    for (const ch of entitySystem.getAll('character')) {
      const c = ch as any
      if (c.id === 'player' || c.id === '0') continue
      if (!c.base) continue
      try {
        await apiSystem.call('inventory', 'addItem', c.id, rationId, rationCount)
      } catch { /* 忽略无 inventory-system 的情况 */ }
    }
  })

  ctx.api.register('hunger-system', {
    getHunger: (charId: string): number => {
      const ch = entitySystem.get('character', charId) as any
      return ch?.base?.[HUNGER_ATTR] ?? 0
    },
    getDigestion: (charId: string): number => {
      const ch = entitySystem.get('character', charId) as any
      return ch?.base?.[DIGESTION_ATTR] ?? 0
    },
  })
}
