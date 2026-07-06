import { entitySystem } from '../../core/entity-system'

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
    const newVal = oldVal + delta
    this.writeValue(char, attrName, newVal)

    this.record(charId, attrName, oldVal, newVal)
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

  /** 格式化输出文本——按角色分组，列出所有变化 */
  format(): string {
    const parts: string[] = []
    for (const charId of this.charIds()) {
      const char = entitySystem.get('character', charId) as any
      const name = char?.name ?? charId
      const lines: string[] = []

      for (const [attr, rec] of this.getChanges(charId)) {
        const delta = rec.new - rec.old
        if (delta >= 0) {
          lines.push(`${attr} ${rec.old} + ${delta} = ${rec.new}`)
        } else {
          lines.push(`${attr} ${rec.old} - ${Math.abs(delta)} = ${rec.new}`)
        }
      }

      if (lines.length > 0) {
        parts.push(`\n${name}\n${lines.join('\n')}`)
      }
    }
    return parts.join('\n')
  }

  /** 简单摘要格式（用于简短变化） */
  formatSummary(): string {
    const items: string[] = []
    for (const charId of this.charIds()) {
      const char = entitySystem.get('character', charId) as any
      const name = char?.name ?? charId
      for (const [attr, rec] of this.getChanges(charId)) {
        const delta = rec.new - rec.old
        if (delta >= 0) {
          items.push(`${name}:${attr}+${delta}`)
        } else {
          items.push(`${name}:${attr}${delta}`)
        }
      }
    }
    return items.join(' ')
  }

  // ── private ──

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
    // 按可能的位置查找：base > abilities > 直接字段
    if (char.base && typeof char.base[attr] === 'number') return char.base[attr]
    if (char.abilities && typeof char.abilities[attr]?.level === 'number') return char.abilities[attr].level
    if (typeof char[attr] === 'number') return char[attr]
    return 0
  }

  private writeValue(char: any, attr: string, value: number): void {
    if (char.base && typeof char.base[attr] === 'number') {
      char.base[attr] = value
    } else if (char.abilities && typeof char.abilities[attr]?.level === 'number') {
      char.abilities[attr].level = value
    } else if (typeof char[attr] === 'number') {
      char[attr] = value
    }
  }
}
