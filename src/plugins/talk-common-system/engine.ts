import { premiseRegistry } from '../../core/premise-registry'
import { evaluateCondition } from '../../core/condition'
import { gameContext } from '../../core/game-context'
import type { CommonTextIndex, CommonTextEntry } from './types'

export type VariableData = Record<string, {
  parts: string[]
  description: string
  entries: Array<{ context: string; conditions?: string; part?: string }>
}>

export class CommonTextsEngine {
  private index: CommonTextIndex = {}
  private loaded = false

  get isLoaded(): boolean {
    return this.loaded
  }

  get variables(): string[] {
    return Object.keys(this.index)
  }

  loadFromData(defaultData: VariableData, modData: VariableData): void {
    this.index = {}

    const merged = { ...defaultData }
    for (const [key, val] of Object.entries(modData)) {
      merged[key] = val
    }

    for (const [variable, def] of Object.entries(merged)) {
      this.index[variable] = {
        variable,
        description: def.description ?? '',
        parts: def.parts ?? [],
        entries: def.entries.map(e => ({
          context: e.context,
          conditions: e.conditions ? this.parseConditions(e.conditions) : [],
          part: e.part,
        })),
      }
    }

    this.loaded = true
  }

  private parseConditions(raw: string): string[] {
    if (raw.startsWith('premises:')) {
      return raw.slice(9).split('&').filter(Boolean).map(s => {
        const clean = s.startsWith('premises:') ? s.slice(9) : s
        if (clean.includes('==') || clean.includes('>=') || clean.includes('<=') || clean.includes('>') || clean.includes('<')) {
          return clean
        }
        return `premises:${clean}`
      })
    }
    return [raw]
  }

  private pickEntry(entries: CommonTextEntry[], targetId: string | null, actorId?: string): string | null {
    const premiseCtx: Record<string, any> = { selectedCharacterId: targetId, actorId: actorId ?? null }
    const getContext = () => {
      const gc = gameContext.getContext()
      if (targetId) (gc as any).selectedCharacterId = targetId
      return gc
    }
    const matched = entries.filter(e => {
      if (e.conditions.length === 0) return true
      for (const cond of e.conditions) {
        if (cond.startsWith('premises:')) {
          const parts = cond.slice(9).split('&').filter(Boolean)
          for (const part of parts) {
            if (part.includes('==') || part.includes('>=') || part.includes('<=') || part.includes('>') || part.includes('<')) {
              try {
                const gc = getContext()
                if (!evaluateCondition(part, gc)) return false
              } catch { return false }
            } else {
              if (!premiseRegistry.evaluate([part], premiseCtx)) return false
            }
          }
        } else {
          try {
            const gc = getContext()
            if (!evaluateCondition(cond, gc)) return false
          } catch { return false }
        }
      }
      return true
    })
    if (matched.length === 0) return null
    return matched[Math.floor(Math.random() * matched.length)].context
  }

  getText(variable: string, targetId: string | null, actorId?: string): string | null {
    const entry = this.index[variable]
    if (!entry) return null

    if (entry.parts.length > 0) {
      const groups = new Map<string, CommonTextEntry[]>()
      for (const e of entry.entries) {
        const p = e.part ?? ''
        if (!groups.has(p)) groups.set(p, [])
        groups.get(p)!.push(e)
      }

      const parts: string[] = []
      for (const partId of entry.parts) {
        const candidates = groups.get(partId)
        if (!candidates) continue
        const picked = this.pickEntry(candidates, targetId, actorId)
        if (picked) parts.push(picked)
      }
      if (parts.length === 0) return null
      return parts.join('')
    }

    return this.pickEntry(entry.entries, targetId, actorId)
  }

  replaceAll(text: string, targetId: string | null, actorId?: string): string {
    if (!this.loaded) return text

    let result = text
    const varPattern = /\{(\w+)\}/g
    let maxPasses = 10

    while (maxPasses-- > 0) {
      let changed = false
      result = result.replace(varPattern, (_match, varName) => {
        if (!this.index[varName]) return _match
        const replacement = this.getText(varName, targetId, actorId)
        if (replacement === null) return _match
        changed = true
        return replacement
      })
      if (!changed) break
    }

    return result
  }
}

export const commonTextsEngine = new CommonTextsEngine()
