import { entitySystem } from '../../core/entity-system'
import { getEntityAttr, setEntityAttr, getLevel } from '../../core/entity-utils'
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

    const oldVal = this.resolveValue(char, attrName)
    this.writeValue(char, attrName, value)

    this.record(charId, attrName, oldVal, value)
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

  /** 钳制属性值到有效范围（体力不超上限、属性不低于0等） */
  private clampValue(char: any, attr: string, value: number): number {
    // 下限统一为 0（除非没找到该属性）
    let v = Math.max(0, value)

    // 体力 → 不超 体力上限
    if (attr === '体力') {
      const max = this.resolveValue(char, '体力上限')
      if (max > 0) v = Math.min(max, v)
    }
    // 气力 → 不超 气力上限
    else if (attr === '气力') {
      const max = this.resolveValue(char, '气力上限')
      if (max > 0) v = Math.min(max, v)
    }
    // 疲劳度上限 160
    else if (attr === '疲劳度') {
      v = Math.min(160, v)
    }
    // 饥饿值上限 240
    else if (attr === '饥饿值') {
      v = Math.min(240, v)
    }
    // 尿意上限 240
    else if (attr === '尿意') {
      v = Math.min(240, v)
    }
    // 射精欲 → 不超 射精欲上限
    else if (attr === '射精欲') {
      const max = this.resolveValue(char, '射精欲上限')
      if (max > 0) v = Math.min(max, v)
    }
    // 精液量 → 不超 精液量上限
    else if (attr === '精液量') {
      const max = this.resolveValue(char, '精液量上限')
      if (max > 0) v = Math.min(max, v)
    }
    // 欲望值上限 100
    else if (attr === '欲望值') {
      v = Math.min(100, v)
    }

    return v
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
