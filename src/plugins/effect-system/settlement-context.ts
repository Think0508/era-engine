import { entitySystem } from '../../core/entity-system'
import { getEntityAttr, setEntityAttr, getLevel, clampAttrValue } from '../../core/entity-utils'
import { modLoader } from '../../core/mod-loader'

interface ChangeRecord {
  old: number
  new: number
}

/**
 * SettlementContext — 行动结算增量记录器
 * 每次 executeEffects 时 new 一个实例，记录所有属性变化
 * 最后通过 format() 输出到 narrativeLog
 *
 * 用法:
 *   ctx.settlement.applyChange(charId, '恭顺', 389)
 *   ctx.settlement.applyChange(charId, '气力', -20)
 */
export class SettlementContext {
  // charId → attrName → {old, new}
  private changes = new Map<string, Map<string, ChangeRecord>>()
  /** 本次行动耗时（分钟），用于时间输出 */
  timeCost = 0

  /**
   * 修改属性并记录变化
   * @param charId 角色 ID
   * @param attrName 属性名（如 '恭顺', '体力'）
   * @param delta 变化量（正=增加，负=减少）
   */
  applyChange(charId: string, attrName: string, delta: number): void {
    const char = entitySystem.get('character', charId) as any
    if (!char) return

    // ability 类属性（attributes.toml category=ability）：操作 abilities[name].level，
    // 保持 {level, xp} 结构——2026-08-09 第5轮修复：原走 writeValue→setEntityAttr 整键替换，
    // abilities[name] 被替换成数字 → calcJudge/settle_state 等直接读 .level 的读取方恒 0（静默失效）
    if (this.isAbilityAttr(attrName)) {
      if (!char.abilities) char.abilities = {}
      const entry = char.abilities[attrName] ?? { level: 0, xp: 0 }
      const oldVal = entry.level ?? 0
      const newVal = Math.max(0, oldVal + delta)
      entry.level = newVal
      char.abilities[attrName] = entry
      this.record(charId, attrName, oldVal, newVal)
      return
    }

    const oldVal = this.resolveValue(char, attrName)
    const clamped = this.clampValue(char, attrName, oldVal + delta)
    this.writeValue(char, attrName, clamped)

    this.record(charId, attrName, oldVal, clamped)
  }

  /**
   * 直接设值并记录变化（不常用，用于升级/刻印等）
   */
  setValue(charId: string, attrName: string, value: number): void {
    const char = entitySystem.get('character', charId) as any
    if (!char) return

    // ability 类属性：设 abilities[name].level（保持 {level, xp} 结构，见 applyChange 注释）
    if (this.isAbilityAttr(attrName)) {
      if (!char.abilities) char.abilities = {}
      const entry = char.abilities[attrName] ?? { level: 0, xp: 0 }
      const oldVal = entry.level ?? 0
      entry.level = Math.max(0, value)
      char.abilities[attrName] = entry
      this.record(charId, attrName, oldVal, Math.max(0, value))
      return
    }

    const oldVal = this.resolveValue(char, attrName)
    this.writeValue(char, attrName, value)

    this.record(charId, attrName, oldVal, value)
  }

  /** attributes.toml category=ability 的属性 → canonical 存储是 abilities 命名空间 */
  private isAbilityAttr(attrName: string): boolean {
    const mod = modLoader.getMod()
    return mod?.attributes?.[attrName]?.category === 'ability'
  }

  /** 是否没有任何变化 */
  get isEmpty(): boolean {
    for (const _ of this.charIds()) return false
    return true
  }

  /** 获取所有受影响的角色 ID */
  charIds(): IterableIterator<string> {
    return this.changes.keys()
  }

  /** 获取某角色的所有变化 */
  getChanges(charId: string): Map<string, ChangeRecord> {
    return this.changes.get(charId) ?? new Map()
  }

  /** 格式化输出文本——erark 风格，含等级变化提示 */
  format(): string {
    const mod = modLoader.getMod()
    const parts: string[] = []
    for (const charId of this.charIds()) {
      const char = entitySystem.get('character', charId) as any
      const name = char?.name ?? charId
      const lines: string[] = []

      for (const [attr, rec] of this.getChanges(charId)) {
        const delta = rec.new - rec.old
        if (delta === 0) continue
        const sign = delta >= 0 ? '+' : ''
        let line = `  ${sign}${delta} ${attr}`

        // 注释：等级变化检测
        const def = mod?.attributes?.[attr]
        if (def?.level_thresholds) {
          const oldLv = getLevel(rec.old, def.level_thresholds)
          const newLv = getLevel(rec.new, def.level_thresholds)
          if (newLv !== oldLv) {
            line += ` (lv${oldLv}->lv${newLv})`
          }
        }

        lines.push(line)
      }

      if (lines.length > 0) {
        parts.push(`\n${name}:\n${lines.join('\n')}`)
      }
    }
    // 注释：erark 风格时间输出
    if (this.timeCost > 0) {
      parts.push(`\n${this.timeCost}分钟过去了`)
    }
    return parts.join('\n')
  }

  /** 简单摘要格式（单行，用于小改动） */
  formatSummary(): string {
    const items: string[] = []
    for (const charId of this.charIds()) {
      const char = entitySystem.get('character', charId) as any
      const name = char?.name ?? charId
      for (const [attr, rec] of this.getChanges(charId)) {
        const delta = rec.new - rec.old
        if (delta === 0) continue
        const sign = delta >= 0 ? '+' : ''
        items.push(`${name}:${attr}${sign}${delta}`)
      }
    }
    return items.join(' ')
  }

  // ── private ──

  /** 钳制属性值到有效范围（下限 0；上限查 core ATTR_CAPS——C6 合并 effect-system 与
   * realtime-settle 的双份 cap 表为单一来源） */
  private clampValue(char: any, attr: string, value: number): number {
    return clampAttrValue(char, attr, value)
  }

  private record(charId: string, attr: string, oldVal: number, newVal: number): void {
    if (!this.changes.has(charId)) {
      this.changes.set(charId, new Map())
    }
    const map = this.changes.get(charId)!
    // 多次改同一属性 → 取最早值做 old
    if (!map.has(attr)) {
      map.set(attr, { old: oldVal, new: newVal })
    } else {
      map.get(attr)!.new = newVal
    }
  }

  private resolveValue(char: any, attr: string): number {
    const val = getEntityAttr(char, attr)
    return typeof val === 'number' ? val : 0
  }

  private writeValue(char: any, attr: string, value: number): void {
    if (!setEntityAttr(char, attr, value)) {
      // 找不到已有命名空间 → 设为直接属性
      char[attr] = value
    }
  }
}
