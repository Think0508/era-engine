// 计数器声明注册（register.ts）——加载校验 / 半成品标记 / 条件字段注册 / 事件绑定编译
// 输入：mod.counterDefs + mod.counterViews（mod-parse 已按 id 合并插件默认层与 mod override）

import { modLoader } from '../../core/mod-loader'
import { conditionRegistry } from '../../core/condition-registry'
import { errorReporter } from '../../core/error-reporter'
import { isPlayerChar } from '../../core/game-context'
import type { CounterDef, CounterViewDef } from '../../core/mod-types'
import type { CompiledBinding, CounterRegistry } from './types'

/** 路径段数模板（* 为固定根）——chars.{charId}.{key} 后 0-4 段动态（维/字段/real 段）。
 * pathMatch 段数须一致，故为每个 key 注册 0-N 段模板。 */
const TEMPLATE_SUFFIXES = [
  '',
  '.{a}',
  '.{a}.{b}',
  '.{a}.{b}.{c}',
  '.{a}.{b}.{c}.{d}',
]

// ============ 定义源 ============
// defs 键 = `${scope}:${id}`（同 id 可分别声明 player/character 两 scope）；
// views 键 = id（视图无方向性，读任意目标实体）

export function getDefs(): Record<string, CounterDef> {
  return modLoader.getMod()?.counterDefs ?? {}
}

export function getViews(): Record<string, CounterViewDef> {
  return modLoader.getMod()?.counterViews ?? {}
}

/** 按目标角色性质解析 scope 版定义：玩家实体 → player scope，其余 → character scope。
 * 键恒为 `${scope}:${id}`（mod-parse 强制默认 character scope）——无裸 id 兜底。 */
export function getDefForChar(charId: string | null | undefined, counterId: string): CounterDef | undefined {
  if (!charId || !counterId) return undefined
  const defs = getDefs()
  const scope = isPlayerChar(charId) ? 'player' : 'character'
  return defs[`${scope}:${counterId}`]
}

// ============ 校验 ============

function fail(message: string): void {
  errorReporter.report({ source: 'counter-system', severity: 'error', message })
}

function warn(message: string): void {
  errorReporter.report({ source: 'counter-system', severity: 'warning', message })
}

/** 校验全部声明；非法声明 error（不注册），pending/未支持 scope warning（注册但跳过条件） */
export function validateDefs(): { errors: boolean } {
  let hasError = false
  const defs = getDefs()
  const views = getViews()

  // 同 id 跨 scope 的 type 一致性（编译绑定按 counterId 聚合、运行时按目标实体选 scope 版
  // 定义——若两版 type 不一致，会按错的类型写入/查询 = 静默错误）
  const typeById = new Map<string, string>()
  for (const def of Object.values(defs)) {
    const prev = typeById.get(def.id)
    if (prev && prev !== def.type) {
      fail(`计数器 '${def.id}': 同 id 多 scope（${def.scope}）type 必须一致（声明 ${def.type}，已有 ${prev}）——编译绑定会误用 scope 版定义`)
      hasError = true
    }
    typeById.set(def.id, def.type)
  }

  for (const def of Object.values(defs)) {
    const { id } = def
    // 1. 类型合法
    if (!['number', 'list', 'group_table'].includes(def.type)) {
      fail(`计数器 '${id}'（${def.scope}）: type 必须是 number/list/group_table，收到 '${def.type}'`)
      hasError = true
      continue
    }
    // 2. scope 合法（global 未实现——存全局表需要 gameStateProviders，本次不做）
    if (!['player', 'character', 'global'].includes(def.scope)) {
      fail(`计数器 '${id}': scope 必须是 player/character/global，收到 '${def.scope}'`)
      hasError = true
      continue
    }
    if (def.scope === 'global') {
      warn(`计数器 '${id}': scope=global 未实现（本次迭代只支持 player/character），条件路径不注册`)
      continue
    }
    // 3. number 不支持 initial_from（快照并入存储会丢失"初始"读数；list/分组表已支持）
    if (def.type === 'number' && def.initial_from) {
      warn(`计数器 '${id}': number 类型不支持 initial_from（初始值请用 list 或分组表表达），字段将被忽略`)
    }
    // 4. 分组表必须有 dims + fields
    if (def.type === 'group_table') {
      if (!def.dims || def.dims.length < 1) {
        fail(`计数器 '${id}': group_table 必须有 dims（维度声明，from 为 payload 字段路径）`)
        hasError = true
      }
      if (!def.fields || def.fields.length < 1) {
        fail(`计数器 '${id}': group_table 必须有 fields（计数字段）`)
        hasError = true
      }
      if (def.event || def.add) {
        warn(`计数器 '${id}': group_table 的事件绑定在 fields[].event 上声明，顶层 event/add 被忽略`)
      }
    } else {
      // number/list 必须有 event + add
      if (!def.event || !def.add) {
        fail(`计数器 '${id}': ${def.type} 类型必须有 event 与 add（驱动事件与增量/名单项）`)
        hasError = true
      }
    }
  }

  for (const [id, view] of Object.entries(views)) {
    const body = [view.source, view.aggregate, view.relation, view.map].filter(Boolean)
    if (body.length !== 1) {
      fail(`视图 '${id}': source/aggregate/relation/map 四选一（收到 ${body.length} 个）`)
      hasError = true
      continue
    }
    if (view.map && (!view.map.path || !view.map.table)) {
      fail(`视图 '${id}': map 必须有 path 与 table（维度值 → 实体字段段）`)
      hasError = true
      continue
    }
    if (view.aggregate) {
      const agg = view.aggregate
      // 视图按展示 id 引用计数器（任意 scope 版本存在即可）
      const all = Object.values(defs)
      const target = all.find(d => displayIdOf(d) === agg.counter)
      if (!target) {
        fail(`视图 '${id}': aggregate 引用的计数器 '${agg.counter}' 不存在`)
        hasError = true
        continue
      }
      if (agg.op === 'sum' && target.type === 'list') {
        // sum 对 list 恒返回 0（list 无字段可求和）——静默失效，加载期直接拦
        fail(`视图 '${id}': aggregate.op=sum 不适用于 list 型计数器 '${agg.counter}'（list 无数值字段；计数请用 op=count）`)
        hasError = true
        continue
      }
      if (agg.op === 'sum' && agg.field && target.type === 'group_table') {
        const f = target.fields?.find(fd => fd.id === agg.field)
        if (!f) {
          fail(`视图 '${id}': aggregate.field '${agg.field}' 不在计数器 '${target.id}' 的 fields 中`)
          hasError = true
        }
      }
    }
  }
  return { errors: hasError }
}

/** 从定义对象取展示 id（scope:id 键拆解） */
function displayIdOf(def: CounterDef): string {
  return def.id
}

/** 半成品标记：pending=true 的字段/计数器 → warning（条件不注册，监听跳过） */
export function pendingItems(): Set<string> {
  const result = new Set<string>()
  for (const def of Object.values(getDefs())) {
    const id = displayIdOf(def)
    if (def.type === 'group_table') {
      for (const f of def.fields ?? []) {
        if (f.pending) {
          result.add(`group_field:${id}.${f.id}`)
          warn(`计数器 '${id}' 字段 '${f.id}' 为半成品（pending，依赖事件 '${f.event}' 未实现）——条件路径不注册、监听跳过`)
        }
      }
    }
  }
  return result
}

// ============ 条件字段注册 ============

// 注：不设幂等 guard——conditionRegistry.clear() 由 mod-loader 每次 loadMod 执行（会把本插件
// 之前注册的 fields 一并清空），game:mod_loaded 重建时全量重注册即可（重复注册无害）。
// 曾用 registeredPaths Set 做增量，但热更新后 clear 已发生而 Set 未清 → 路径永不重注册 = 静默失效。

export function registerConditionFields(): void {
  const fields: Record<string, { type: string; description: string }> = {}
  // 按已知 key 注册精确路径模板（key 段不宽泛通配——拼错计数器/视图名在加载期被拦，防静默失效）；
  // 同一 key 注册 0-N 段（维度/字段/real 段）。dims 段本身是运行时数据（部位/角色 id），无法静态枚举。
  const registerKeys = (ids: Iterable<string>, kind: string): void => {
    for (const id of ids) {
      for (const suffix of TEMPLATE_SUFFIXES) {
        fields[`counters.{charId}.${id}${suffix}`] = {
          type: 'number',
          description: `${kind} ${id}（counters 代理域${suffix ? ', 可加 .real 真实值段' : ''}）`,
        }
      }
    }
  }
  const counterIds = new Set<string>()
  for (const def of Object.values(getDefs())) {
    if (def.scope === 'global') continue
    counterIds.add(def.id)
  }
  registerKeys(counterIds, '计数器')
  registerKeys(Object.keys(getViews()), '视图')
  conditionRegistry.registerFromPlugin('counter-system', fields)
}

// ============ 事件绑定编译 ============

/** 编译事件绑定：声明 → 事件名 → 绑定列表。pending 字段跳过；未注册事件（无 emit 者）无法
 * 静态检测，由 pending 显式标记承担（见 ADR-0016）。
 * 同 id 多 scope 只编译一次（store 写入时经 getDefForChar 动态选 scope 版定义——
 * 同 id 双 scope 的 type/fields 结构约定一致（docs/counter-system.md））。 */
export function compileBindings(): Map<string, CompiledBinding[]> {
  const byEvent = new Map<string, CompiledBinding[]>()
  const seen = new Set<string>()

  const push = (evt: string, b: CompiledBinding): void => {
    const list = byEvent.get(evt) ?? []
    list.push(b)
    byEvent.set(evt, list)
  }

  for (const def of Object.values(getDefs())) {
    if (def.scope === 'global') continue
    if (seen.has(def.id)) continue   // 同 id 另一 scope 已编译
    seen.add(def.id)
    if (def.type === 'group_table') {
      for (const f of def.fields ?? []) {
        if (f.pending) continue
        if (!f.event || typeof f.event !== 'string') continue
        push(f.event, { counterId: def.id, kind: 'group_field', field: { id: f.id, add: f.add } })
      }
    } else {
      if (!def.event) continue
      push(def.event, { counterId: def.id, kind: def.type === 'list' ? 'list' : 'number' })
    }
  }
  return byEvent
}

/** 编译注册表（index.onEnable / game:mod_loaded 重建用） */
export function buildRegistry(): CounterRegistry {
  return {
    defs: getDefs(),
    views: getViews(),
    bindingsByEvent: compileBindings(),
  }
}