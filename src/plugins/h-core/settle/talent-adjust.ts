// 注释：天赋修正索引——settle 结算读天赋定义表动态应用（数据化：加天赋 = 改 talents.toml，零 TS 改动）
// 来源：erArk chara_base_state_adjust（common_default.py:358-422）+ calculation_favorability（:675-750）
// 数据结构（talents.toml 天赋定义内可选字段）：
//   state_adjusts = [{ states = ["好意", "快乐"], value = 0.3 }]   # states=["*"] = 全部状态；多个条目可同时生效
//   favorability_adjusts = [{ group = "love1", value = 0.25 }]     # 同 group 取最大值（二选一/阶段性天赋），无 group 直接累加

export interface TalentStateAdj {
  states: string[]
  value: number
}

export interface TalentFavAdj {
  group?: string
  value: number
}

interface StateEntry {
  talent: string
  value: number
}

interface FavEntry {
  talent: string
  group?: string
  value: number
}

// 注释：索引缓存（mod 数据生命周期内不变；mod 切换时由 h-core 重建）
let stateIndex: Map<string, StateEntry[]> | null = null
let stateWildcard: StateEntry[] | null = null
let favList: FavEntry[] | null = null

export function clearTalentAdjustIndex(): void {
  stateIndex = null
  stateWildcard = null
  favList = null
}

function ensureIndex(mod: any): void {
  if (stateIndex && favList) return
  stateIndex = new Map()
  stateWildcard = []
  favList = []
  // 注释：talents.toml 解析为 mod.talentDefs（mod.talents 是初始化后的角色默认值表，无定义字段）
  const talents = mod?.talentDefs ?? {}
  for (const [name, def] of Object.entries(talents) as [string, any][]) {
    const stateAdjusts = def?.state_adjusts as TalentStateAdj[] | undefined
    if (Array.isArray(stateAdjusts)) {
      for (const adj of stateAdjusts) {
        const states = adj.states ?? []
        for (const s of states) {
          if (s === '*') {
            stateWildcard.push({ talent: name, value: adj.value })
          } else {
            if (!stateIndex.has(s)) stateIndex.set(s, [])
            stateIndex.get(s)!.push({ talent: name, value: adj.value })
          }
        }
      }
    }
    const favAdjusts = def?.favorability_adjusts as TalentFavAdj[] | undefined
    if (Array.isArray(favAdjusts)) {
      for (const adj of favAdjusts) {
        favList.push({ talent: name, group: adj.group, value: adj.value })
      }
    }
  }
}

/** 状态天赋修正（加法，erArk final_adjust += 素质修正；含 states=["*"] 通配） */
export function getTalentStateAdjust(mod: any, char: any, state: string): number {
  ensureIndex(mod)
  if (!char?.talents) return 0
  let sum = 0
  for (const entry of stateIndex?.get(state) ?? []) {
    if (char.talents[entry.talent]) sum += entry.value
  }
  for (const entry of stateWildcard ?? []) {
    if (char.talents[entry.talent]) sum += entry.value
  }
  return sum
}

/** 好感/信赖天赋修正（同组取最大 + 无组累加） */
export function getFavorabilityTalentAdjust(mod: any, char: any): number {
  ensureIndex(mod)
  if (!char?.talents) return 0
  let total = 0
  const groupMax = new Map<string, number>()
  for (const adj of favList ?? []) {
    if (!char.talents[adj.talent]) continue
    if (adj.group) {
      groupMax.set(adj.group, Math.max(groupMax.get(adj.group) ?? 0, adj.value))
    } else {
      total += adj.value
    }
  }
  for (const v of groupMax.values()) total += v
  return total
}
