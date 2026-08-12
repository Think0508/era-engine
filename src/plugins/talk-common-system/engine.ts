import { premiseRegistry } from '../../core/premise-registry'
import { conditionEngine } from '../../core/condition-engine'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { weightedRandom } from '../../utils/weighted-random'
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

  private pickEntry(entries: CommonTextEntry[], targetId: string | null, actorId?: string, unconsciousPass = false): string | null {
    const candidates = this.weightedCandidates(entries, targetId, actorId, unconsciousPass)
    if (candidates.length === 0) return null
    return weightedRandom(candidates.map(c => ({ item: c.text, weight: c.weight })))
  }

  // 注释：候选加权（T7 审查修复——erArk get_weight_from_premise_dict 权重语义）
  // 地文条目的 high_N 前提贡献权重，其余满足前提 +1；原实现均匀随机（权重被忽略）
  private weightedCandidates(entries: CommonTextEntry[], targetId: string | null, actorId?: string, unconsciousPass = false): { text: string; weight: number }[] {
    const premiseCtx: Record<string, any> = { selectedCharacterId: targetId, actorId: actorId ?? null }
    const out: { text: string; weight: number }[] = []
    for (const e of this.filterEntries(entries, targetId, actorId, { unconsciousPass })) {
      let weight = 1
      const premiseList: string[] = []
      for (const cond of e.conditions) {
        if (cond.startsWith('premises:')) {
          premiseList.push(...cond.slice(9).split('&').filter(Boolean))
        }
      }
      if (premiseList.length > 0) {
        const w = premiseRegistry.getWeight(premiseList, premiseCtx)
        if (w <= 0) continue
        weight = w
      }
      out.push({ text: e.context, weight })
    }
    return out
  }

  /** 列出通过条件筛选的全部候选（行为地文组合用——B/C 组合并池后统一随机） */
  private filterEntries(entries: CommonTextEntry[], targetId: string | null, actorId?: string, opts?: { unconsciousPass?: boolean }): CommonTextEntry[] {
    const premiseCtx: Record<string, any> = { selectedCharacterId: targetId, actorId: actorId ?? null }
    const getContext = () => {
      const gc = gameContext.getContext()
      if (targetId) (gc as any).selectedCharacterId = targetId
      return gc
    }
    // 注释：T8 审查补漏——无意识过滤（erArk talk_common_judge :683-687 + get_weight_from_premise_dict :224-237）
    // 动作类（unconsciousPass=false）：目标无意识（unconscious_h>=1）且本条条件无 unconscious 前提 → 跳过；
    // 部位类（unconsciousPass=true）：跳过无意识检查（部位描述在无意识时仍可用）
    const target = targetId ? entitySystem.get('character', targetId) as any : null
    const unconscious = (target?.sp_flag?.unconscious_h ?? 0) >= 1
    return entries.filter(e => {
      if (unconscious && !opts?.unconsciousPass) {
        const hasUnconsciousPremise = e.conditions.some(c => /unconscious/i.test(c))
        if (!hasUnconsciousPremise) return false
      }
      if (e.conditions.length === 0) return true
      for (const cond of e.conditions) {
        if (cond.startsWith('premises:')) {
          const parts = cond.slice(9).split('&').filter(Boolean)
          for (const part of parts) {
            if (part.includes('==') || part.includes('>=') || part.includes('<=') || part.includes('>') || part.includes('<')) {
              // round 14 修复：`FOO==N` 是**前提权重值比较**（erArk get_weight_from_premise_dict
              // :224-237 语义），不是条件路径——原走 evaluateCondition 把 FOO 解析为 0
              // （N!=0 时恒 false 静默淘汰行；==0 恒 true 静默放行）。用前提权重值比较
              const m = part.match(/^([A-Za-z_][\w]*)\s*(==|>=|<=|>|<)\s*(-?\d+)$/)
              if (!m) return false // 无法解析的比较形式 → 淘汰（不静默错误结果）
              const weight = premiseRegistry.getWeight([m[1]], premiseCtx)
              const n = Number(m[3])
              const ok = m[2] === '==' ? weight === n
                : m[2] === '>=' ? weight >= n
                  : m[2] === '<=' ? weight <= n
                    : m[2] === '>' ? weight > n
                      : weight < n
              if (!ok) return false
            } else {
              if (!premiseRegistry.evaluate([part], premiseCtx)) return false
            }
          }
        } else {
          try {
            const gc = getContext()
            if (!conditionEngine.evaluate(cond, gc)) return false
          } catch { return false }
        }
      }
      return true
    })
  }

  // 注释：行为地文组合（T3，erArk talk_common_judge 语义）
  // behaviorKey = 行为部位名（如 penis_in_vagina）——组合 action_A/B1/B2/C1/C2 分段：
  //   A 组：action_A_xxx（随机一条）
  //   B 组：action_B1_xxx ∪ action_B2_xxx 合并池（随机一条，erArk part_id 同为 "B"）
  //   C 组：action_C1_xxx ∪ action_C2_xxx 合并池（随机一条）
  // 动作段间换行（erArk 'action' in type_id → + '\n'）
  getBehaviorText(behaviorKey: string, targetId: string | null, actorId?: string): string | null {
    const segmentGroups = [
      [`action_A_${behaviorKey}`],
      [`action_B1_${behaviorKey}`, `action_B2_${behaviorKey}`],
      [`action_C1_${behaviorKey}`, `action_C2_${behaviorKey}`],
    ]
    let out = ''
    for (const group of segmentGroups) {
      const candidates: { text: string; weight: number }[] = []
      for (const variable of group) {
        const entry = this.index[variable]
        if (!entry) continue
        candidates.push(...this.weightedCandidates(entry.entries, targetId, actorId))
      }
      if (candidates.length === 0) continue
      out += weightedRandom(candidates.map(c => ({ item: c.text, weight: c.weight }))) + '\n'
    }
    if (out.length === 0) return null
    return out.trim()
  }

  getText(variable: string, targetId: string | null, actorId?: string): string | null {
    const entry = this.index[variable]
    if (!entry) return null
    // 注释：动作类 vs 部位类——无意识过滤语义（erArk body_part_flag）
    const isAction = variable.startsWith('action_')
    const unconsciousPass = !isAction

    if (entry.parts.length > 0) {
      const groups = new Map<string, CommonTextEntry[]>()
      for (const e of entry.entries) {
        const p = e.part ?? ''
        if (!groups.has(p)) groups.set(p, [])
        groups.get(p)!.push(e)
      }
      // 注释：T8 审查补漏——短词池合并（erArk talk.py:662-665）：
      // _s 短词且非 penis/hair → A 段并入 common_s 的 A 段候选（合并后统一权重随机）
      if (entry.variable.includes('_s') && !entry.variable.includes('penis') && !entry.variable.includes('hair')) {
        const commonA = this.index['common_s']
        if (commonA) {
          const a = groups.get('A') ?? []
          for (const e of commonA.entries) {
            if ((e.part ?? '') === 'A') a.push(e)
          }
          groups.set('A', a)
        }
      }

      const parts: string[] = []
      for (const partId of entry.parts) {
        const candidates = groups.get(partId)
        if (!candidates) continue
        const picked = this.pickEntry(candidates, targetId, actorId, unconsciousPass)
        if (picked) parts.push(picked)
      }
      if (parts.length === 0) return null
      return parts.join('')
    }

    return this.pickEntry(entry.entries, targetId, actorId, unconsciousPass)
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
