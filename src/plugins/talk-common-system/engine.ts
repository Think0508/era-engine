import { premiseRegistry } from '../h-core'
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
    const prefix = 'premises:'
    if (raw.startsWith(prefix)) {
      return raw.slice(prefix.length).split('&').filter(Boolean)
    }
    return [raw]
  }

  private pickEntry(entries: CommonTextEntry[], targetId: string | null): string | null {
    const ctx = { selectedCharacterId: targetId }
    const matched = entries.filter(e => {
      if (e.conditions.length === 0) return true
      return premiseRegistry.evaluate(e.conditions, ctx)
    })
    if (matched.length === 0) return null
    return matched[Math.floor(Math.random() * matched.length)].context
  }

  getText(variable: string, targetId: string | null): string | null {
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
        const picked = this.pickEntry(candidates, targetId)
        if (picked) parts.push(picked)
      }
      if (parts.length === 0) return null
      return parts.join('')
    }

    return this.pickEntry(entry.entries, targetId)
  }

  replaceAll(text: string, targetId: string | null): string {
    if (!this.loaded) return text

    let result = text
    const varPattern = /\{(\w+)\}/g
    let maxPasses = 10

    while (maxPasses-- > 0) {
      let changed = false
      result = result.replace(varPattern, (_match, varName) => {
        if (!this.index[varName]) return _match
        const replacement = this.getText(varName, targetId)
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
