// 计数器存储（store.ts）——唯一写实体 .counters 的模块
// 惰性创建：角色首次被计数时才建 counters 字段；分组表条目首次命中才建。
// 初始值快照：首次创建条目时从角色可选字段（initial_from / initial_named_from /
// initial_fields）快照进 __meta——之后与角色字段脱钩（防其它系统误改导致统计漂移）。

import { entitySystem } from '../../core/entity-system'
import type { CounterDef } from '../../core/mod-types'
import { META_KEY } from './types'

/** 实体字段路径导航（'base.初始H过男人数' / 'dirty.body_semen'）；缺失 → undefined */
export function getByPath(obj: any, path?: string): any {
  if (!path) return undefined
  let cur = obj
  for (const seg of path.split('.')) {
    if (cur === null || cur === undefined) return undefined
    if (typeof cur !== 'object') return undefined
    cur = cur[seg]
  }
  return cur
}

/** 角色实体按 id 获取（过期/缺失 → null；计数器键为 id 字符串，永不引用角色数据本身） */
function getChar(charId: string | null | undefined): any {
  if (!charId) return null
  return entitySystem.get('character', charId) as any ?? null
}

/** 数值计数器：+delta。number 不支持 initial_from（validate 已 warning）——恒 0 起，
 * 与声明一致（否则"生效但无法减初始"的静态错）。_def 参数保留签名一致（接 def 但不用）。 */
export function addNumber(charId: string, counterId: string, _def: CounterDef, delta: number): void {
  const char = getChar(charId)
  if (!char || typeof delta !== 'number') return
  if (!char.counters) char.counters = {}
  if (typeof char.counters[counterId] !== 'number') {
    char.counters[counterId] = 0
  }
  char.counters[counterId] = Math.max(0, char.counters[counterId] + delta)
}

/** 名单计数器：加入 itemId。存储 { initial, named[], list[] }——
 * initial = 数字初始快照；named = 具名初始（初始就"算"的人，游戏内再出现不重复进新增名单）；
 * list = 游戏内新增（去重，且排除 named）。 */
export function addToList(charId: string, counterId: string, def: CounterDef, itemId: string): void {
  const char = getChar(charId)
  if (!char || typeof itemId !== 'string' || !itemId) return
  if (!char.counters) char.counters = {}
  const entry = char.counters[counterId]
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.list)) {
    const init = getByPath(char, def.initial_from)
    const namedRaw = getByPath(char, def.initial_named_from)
    char.counters[counterId] = {
      initial: typeof init === 'number' ? init : 0,
      named: Array.isArray(namedRaw) ? namedRaw.filter((n: unknown) => typeof n === 'string') as string[] : [],
      list: [],
    }
  }
  const cur = char.counters[counterId]
  if (!Array.isArray(cur.named)) cur.named = []
  if (!cur.named.includes(itemId) && !cur.list.includes(itemId)) cur.list.push(itemId)
}

/** 分组表：按维度路径累加字段值。dimValues = [dim1, dim2, ...]（事件 payload 映射值） */
export function addGroupField(
  charId: string,
  counterId: string,
  def: CounterDef,
  dimValues: (string | number)[],
  field: string,
  delta: number,
): void {
  const char = getChar(charId)
  if (!char || typeof delta !== 'number') return
  if (!def.dims || dimValues.length < 1 || dimValues.some(v => v === undefined || v === null || v === '')) return
  if (!char.counters) char.counters = {}
  const table = char.counters[counterId]
  if (!table || typeof table !== 'object') char.counters[counterId] = {}
  const t = char.counters[counterId]

  const dim1 = String(dimValues[0])
  // 初始值快照（该 dim1 维度首次创建条目时）
  if (!t[META_KEY]) t[META_KEY] = {}
  if (!t[META_KEY][dim1]) {
    const meta: any = {}
    const initCount = getByPath(char, def.initial_from)
    if (typeof initCount === 'number') meta.count = initCount
    const initNamed = getByPath(char, def.initial_named_from)
    if (Array.isArray(initNamed)) meta.named = initNamed.filter((n: unknown) => typeof n === 'string') as string[]
    if (def.initial_fields) {
      const fieldInit: Record<string, number> = {}
      for (const [f, path] of Object.entries(def.initial_fields)) {
        const v = getByPath(char, path)
        if (typeof v === 'number') fieldInit[f] = v
      }
      if (Object.keys(fieldInit).length > 0) meta.field_init = fieldInit
    }
    t[META_KEY][dim1] = meta
  }

  if (!t[dim1] || typeof t[dim1] !== 'object') t[dim1] = {}
  // 导航剩余维度（dim2 起）——惰性建路径
  let node = t[dim1]
  for (let i = 1; i < dimValues.length; i++) {
    const key = String(dimValues[i])
    if (!node[key] || typeof node[key] !== 'object') node[key] = {}
    node = node[key]
  }
  const old = typeof node[field] === 'number' ? node[field] : 0
  node[field] = Math.max(0, old + delta)
}
