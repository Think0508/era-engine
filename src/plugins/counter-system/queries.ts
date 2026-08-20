// 计数器查询（queries.ts）——代理域 resolvePath 入口 + 视图求值 + 聚合
// 读数两个：总数（含初始，默认）/ 真实值（路径加 .real 段，减初始且具名去重）
// count() 聚合直接数分组表 dim1 节点键数（__meta 在根部，不参与）——不含初始；
// 带初始规则的读数一律经视图（声明式，作者显式选择语义）。

import { entitySystem } from '../../core/entity-system'
import type { CounterDef, CounterViewDef } from '../../core/mod-types'
import { getByPath } from './store'
import { getViews, getDefForChar } from './register'
import { META_KEY, REAL_SEG } from './types'

// ============ 代理域入口 ============

/** 条件引擎代理域 'counters' 转发目标：
 * segments = [charId, key, ...rest]；rest 首段可为 REAL_SEG（真实值模式）
 * key 命中视图 → 视图求值；否则按定义类型导航存储。 */
export function resolvePath(segments: string[], _ctx: any): any {
  const charId = segments?.[0]
  const key = segments?.[1]
  if (!charId || !key) return undefined
  const char = entitySystem.get('character', charId) as any
  if (!char) return undefined

  let rest = segments.slice(2)
  let real = false
  if (rest[0] === REAL_SEG) {
    real = true
    rest = rest.slice(1)
  }

  const view = getViews()[key]
  if (view) return evalView(view, char, rest, real)

  const def = getDefForChar(charId, key)
  if (!def) return undefined
  const node = char.counters?.[key]

  if (def.type === 'number') {
    return rest.length > 0 ? undefined : (node ?? 0)
  }
  if (def.type === 'list') {
    // 未建档（从无条目）：回退实时读角色初始字段——初始字段语义恒定（背景设定），无快照
    // 可依时实时读与"快照后"等价，避免"初始凭空消失"（此前 0 起 = B2 静默丢失）
    if (node === undefined) {
      const rawInit = getByPath(char, def.initial_from)
      const rawNamed = getByPath(char, def.initial_named_from)
      const namedList = Array.isArray(rawNamed) ? rawNamed.filter(n => typeof n === 'string') as string[] : []
      const initCount = typeof rawInit === 'number' ? rawInit : 0
      if (rest.length === 0) {
        if (real) return 0                                  // 无任何新增
        return { initial: initCount, named: namedList, list: [] }
      }
      if (rest[0] === 'count') return initCount + namedList.length   // 总数 = 数字初始 + 具名初始
      if (rest[0] === 'list') return []
      if (rest[0] === 'added') return 0
      return undefined
    }
    const namedCount = Array.isArray(node.named) ? node.named.length : 0
    if (rest.length === 0) return real ? node.list.length : node   // real 段 → 真实值（新增名单数）
    if (rest[0] === 'count') return (node.initial ?? 0) + namedCount + node.list.length   // 总数（含初始+具名）
    if (rest[0] === 'list') return node.list
    if (rest[0] === 'added') return node.list.length                          // 真实值（同 real 语义）
    return undefined
  }
  // group_table：导航剩余段（__meta 不暴露为取值路径；未建档直读 = 无数据）
  if (node === undefined) return undefined
  let cur: any = node
  for (const seg of rest) {
    if (cur === null || typeof cur !== 'object') return undefined
    if (seg === META_KEY) return undefined
    cur = cur[seg]
  }
  return cur ?? undefined
}

// ============ 视图求值 ============

function evalView(view: CounterViewDef, char: any, rest: string[], real: boolean): any {
  if (view.relation) return relationCount(char, view.relation.type)
  if (view.map) {
    // 枚举映射：rest[0] 是维度值（如部位 cid）→ table 映射到实体字段段（如 experience.14）
    const key = rest[0]
    if (!key) return 0
    const seg = view.map.table[key]
    if (!seg) return 0
    const v = getByPath(char, `${view.map.path}.${seg}`)
    return typeof v === 'number' ? v : 0
  }
  if (view.source) {
    let v = getByPath(char, view.source.path)
    if (real && view.source.initial_from) {
      const init = getByPath(char, view.source.initial_from)
      if (typeof v === 'number' && typeof init === 'number') return v - init
    }
    return v ?? 0
  }
  if (view.aggregate) return evalAggregate(view.aggregate, char, rest, real)
  return undefined
}

function evalAggregate(
  agg: NonNullable<CounterViewDef['aggregate']>,
  char: any,
  rest: string[],
  real: boolean,
): number {
  const table = char.counters?.[agg.counter]
  const def = getDefForChar(char.id, agg.counter)

  if (def?.type === 'list') {
    if (agg.op !== 'count') return 0
    if (!table) {
      // 未建档回退：实时读角色初始字段（初始字段语义恒定，见 resolvePath list 分支）
      const rawInit = getByPath(char, def.initial_from)
      const rawNamed = getByPath(char, def.initial_named_from)
      const namedList = Array.isArray(rawNamed) ? rawNamed.filter(n => typeof n === 'string') as string[] : []
      return real ? 0 : (typeof rawInit === 'number' ? rawInit : 0) + namedList.length
    }
    const namedCount = Array.isArray(table.named) ? table.named.length : 0
    return real ? table.list.length : (table.initial ?? 0) + namedCount + table.list.length
  }

  if (agg.op === 'count') return countGroupEntries(table ?? {}, rest, real, def, char)
  if (agg.op === 'sum') return sumGroupField(table ?? {}, agg.field ?? '', rest, real, def, char)
  return 0
}

// ============ 分组表聚合 ============
// rest 定位（如 ['6'] → dim1=6）；不给定位 = 全部 dim1 累加（未建档部位初始回退计入）。
// 跨 dim1 累加不去重（同一角色多部位计数重复计，文档注明；需全局去重另建视图/API）。

/** 条目计数：dim1 节点条目数（dim2 键），应用 __meta 初始规则：
 * 总数 = 初始（count+named） + |实际条目 ∖ named|；真实值 = |实际条目 ∖ named|。
 * 部位未建档（从无条目、meta 未快照）→ 回退实时读 def 初始字段（防"初始凭空消失"）。 */
function countGroupEntries(
  table: any,
  rest: string[],
  real: boolean,
  def?: CounterDef,
  char?: any,
): number {
  const metaRoot = table[META_KEY] ?? {}
  const dim1Keys = rest.length > 0 ? [String(rest[0])] : Object.keys(table).filter(k => k !== META_KEY)
  // 查询部位未建过任何条目（table 无该 dim1 键）→ 仍只算初始（如 male_count.8 从未被射）
  if (dim1Keys.length === 0 && rest.length > 0 && def && char) {
    const rawInit = getByPath(char, def.initial_from)
    const rawNamed = getByPath(char, def.initial_named_from)
    const namedList = Array.isArray(rawNamed) ? rawNamed.filter(n => typeof n === 'string') as string[] : []
    return real ? 0 : (typeof rawInit === 'number' ? rawInit : 0) + namedList.length
  }

  let total = 0
  let realTotal = 0
  for (const d1 of dim1Keys) {
    // 初始部分：meta 已快照用快照；未快照（从无条目）回退实时读角色字段
    const meta = metaRoot[d1]
    const initCount = meta && typeof meta.count === 'number'
      ? meta.count
      : (def && char ? (typeof getByPath(char, def.initial_from) === 'number' ? (getByPath(char, def.initial_from) as number) : 0) : 0)
    const namedArr = meta && Array.isArray(meta.named)
      ? meta.named as string[]
      : (def && char ? (Array.isArray(getByPath(char, def.initial_named_from))
          ? (getByPath(char, def.initial_named_from) as unknown[]).filter(n => typeof n === 'string') as string[]
          : []) : [])
    const named = new Set<string>(namedArr)

    const entries = table[d1]
    let extraCount = 0
    if (entries && typeof entries === 'object') {
      for (const key of Object.keys(entries)) {
        if (!named.has(key)) extraCount++
      }
    }
    total += initCount + namedArr.length + extraCount
    realTotal += extraCount
  }
  return real ? realTotal : total
}

/** 字段求和：定位后遍历所有叶子条目求 field；总数 = 字段求和 + 初始；真实 = 字段求和。
 * 部位未建档 → 回退读 def.initial_fields[field]（若无该字段初始则 0）。 */
function sumGroupField(
  table: any,
  field: string,
  rest: string[],
  real: boolean,
  def?: CounterDef,
  char?: any,
): number {
  const metaRoot = table[META_KEY] ?? {}
  const dim1Keys = rest.length > 0 ? [String(rest[0])] : Object.keys(table).filter(k => k !== META_KEY)
  // 查询部位未建条目 → 仅初始 field_init（如 semen_total.8 从未被射）
  if (dim1Keys.length === 0 && rest.length > 0 && def && char) {
    const p = def.initial_fields?.[field]
    const v = p ? getByPath(char, p) : undefined
    return real ? 0 : (typeof v === 'number' ? v : 0)
  }

  let sum = 0
  let initTotal = 0
  for (const d1 of dim1Keys) {
    const meta = metaRoot[d1]
    const fi = meta?.field_init?.[field]
    const init = typeof fi === 'number'
      ? fi
      : (def && char && def.initial_fields?.[field]
          ? (typeof getByPath(char, def.initial_fields[field]) === 'number'
              ? (getByPath(char, def.initial_fields[field]) as number) : 0)
          : 0)
    initTotal += init

    const entries = table[d1]
    if (entries && typeof entries === 'object') {
      for (const key of Object.keys(entries)) {
        const node = entries[key]
        if (node && typeof node === 'object') {
          const v = node[field]
          if (typeof v === 'number') sum += v
        }
      }
    }
  }
  return real ? sum : sum + initTotal
}

// ============ 关系查询视图 ============

/** 关系数量：读角色关系系统，统计 type 匹配且正向（值 > 0，三档正面=1）的对象数 */
function relationCount(char: any, type: string): number {
  const relations = char.relations
  if (!relations || typeof relations !== 'object') return 0
  let count = 0
  for (const value of Object.values(relations)) {
    if (!value || typeof value !== 'object') continue
    const v = (value as Record<string, unknown>)[type]
    if (typeof v === 'number' && v > 0) count++
    else if (typeof v === 'string' && v !== '中立' && v !== '负面') count++
  }
  return count
}

/** 关系名单（API/UI 用）：type 匹配且正向的对象 id 列表 */
export function relationList(charId: string, type: string): string[] {
  const char = entitySystem.get('character', charId) as any
  if (!char?.relations || typeof char.relations !== 'object') return []
  const result: string[] = []
  for (const [other, value] of Object.entries(char.relations)) {
    if (!value || typeof value !== 'object') continue
    const v = (value as Record<string, unknown>)[type]
    const positive = typeof v === 'number' ? v > 0 : (typeof v === 'string' && v !== '中立' && v !== '负面')
    if (positive) result.push(other)
  }
  return result
}