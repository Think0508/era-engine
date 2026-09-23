// 注释：manual-system 内功装配（2026-09-23）——"可装配能力"的装卸
//
// 语义：
//  · **可装配** = 能力定义里写了 `equipped_mods`（不加独立 boolean，少一个字段少一个矛盾）；
//  · 装配状态 = 角色字段 `char.equipped_abilities`（能力 ID 数组，随存档）；
//  · 装配期间的加成由属性有效值层第 4 个声明式来源负责（core/attribute-eval）——
//    装上即生效、卸下即回落，**没有任何"恢复"代码**；
//  · 槽位上限 = `manual-config.slot_attr`（默认「内功位」）的**有效值**，`-1` = 无限；
//  · 不搞互斥规则：只受数量限制（要互斥就用条件/事件，别在结构里长出来）。

import { eventBus } from '../../core/event-bus'
import { entitySystem } from '../../core/entity-system'
import { getEntityAttr } from '../../core/entity-utils'
import { abilityDef, config } from './context'

export interface EquipResult {
  ok: boolean
  reason?: string
}

export interface SlotState {
  used: number
  /** -1 = 无限 */
  total: number
  unlimited: boolean
}

function charOf(charId: string): any {
  return entitySystem.get('character', charId)
}

/** 槽位状态（总数为 -1 → unlimited） */
export function slots(charId: string): SlotState {
  const char = charOf(charId)
  const used = Array.isArray(char?.equipped_abilities) ? char.equipped_abilities.length : 0
  if (!char) return { used, total: 0, unlimited: false }
  const raw = getEntityAttr(char, config().slot_attr)
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 1
  if (n < 0) return { used, total: -1, unlimited: true }
  return { used, total: Math.max(0, n), unlimited: false }
}

/** 已装配的能力 ID（过滤掉数据里已消失/已不可装配的条目？不过滤——装配状态是玩家状态，
 *  卸下由玩家决定；只是属性层对"无 equipped_mods/未学会"的条目自然不产生加成） */
export function listEquipped(charId: string): string[] {
  const char = charOf(charId)
  return Array.isArray(char?.equipped_abilities) ? [...char.equipped_abilities] : []
}

export function equip(charId: string, abilityId: string): EquipResult {
  const char = charOf(charId)
  if (!char) return { ok: false, reason: `角色 '${charId}' 不存在` }
  const def = abilityDef(abilityId)
  if (!def) return { ok: false, reason: `能力 '${abilityId}' 不存在` }
  if (!Array.isArray(def.equipped_mods) || def.equipped_mods.length === 0) {
    return { ok: false, reason: `'${abilityId}' 不可装配（未声明 equipped_mods）` }
  }
  const entry = char.abilities?.[abilityId]
  const level = typeof entry?.level === 'number' ? entry.level : 0
  if (level <= 0) return { ok: false, reason: `尚未学会 '${abilityId}'` }
  if (!Array.isArray(char.equipped_abilities)) char.equipped_abilities = []
  if (char.equipped_abilities.includes(abilityId)) return { ok: false, reason: `'${abilityId}' 已经装配` }
  const st = slots(charId)
  if (!st.unlimited && st.used >= st.total) {
    return { ok: false, reason: `${config().slot_attr}已满（${st.used}/${st.total}）` }
  }
  char.equipped_abilities.push(abilityId)
  eventBus.emit('internal:equipped', { character: charId, ability: abilityId })
  return { ok: true }
}

export function unequip(charId: string, abilityId: string): EquipResult {
  const char = charOf(charId)
  if (!char) return { ok: false, reason: `角色 '${charId}' 不存在` }
  if (!Array.isArray(char.equipped_abilities) || !char.equipped_abilities.includes(abilityId)) {
    return { ok: false, reason: `'${abilityId}' 当前未装配` }
  }
  char.equipped_abilities = char.equipped_abilities.filter((id: string) => id !== abilityId)
  eventBus.emit('internal:unequipped', { character: charId, ability: abilityId })
  return { ok: true }
}
