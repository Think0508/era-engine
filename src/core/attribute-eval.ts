// 注释：属性有效值求值（2026-09-22）
// 设计：docs/superpowers/specs/2026-09-22-attribute-effective-value-design.md
//
// 分层：本文件是**叶子模块** —— 不 import 任何 core 模块。
//   原因：mod-loader → mod-parse → entity-utils 已构成链路，本模块要被 entity-utils import，
//   若反向 import entity-utils/mod-loader 即成环。属性定义与脚本解析器由 mod-loader 注入；
//   裸值由 entity-utils 传入；跨属性读取用注入的 rawReader（命名空间查找仍单一来源在 entity-utils）。
//
// 语义（唯一权威定义）：
//   raw = 裸值（entity-utils 的命名空间查找结果）
//   v   = compute ? 脚本(raw, attrs) : raw        ← 先派生
//   v   = (set ?? v + Σflat) × (1 + Σpercent)     ← 后叠修正（复用公式通道代数）
//
// 闸门（零回归保证）：只有【属性定义存在】+【裸值是数字】+【有 compute 或有修正条目】才走管线，
//   其余一律原样返回。因此未接入任何来源时，本管线是恒等变换。

import { errorReporter } from './error-reporter'

export interface AttributeDefLike {
  compute?: string
}

export interface AttributeMod {
  flat?: number
  percent?: number
  set?: number
}

export interface ModifierEntry {
  /** 来源 id：同 (id, attr) 重复注册按覆盖处理（幂等） */
  id: string
  attr: string
  mod: AttributeMod
  source?: string
}

interface EntityState {
  /** 任何裸值写入 / 修正变更 → bump */
  version: number
  cachedAtVersion: number
  cachedAtGlobal: number
  cache: Map<string, { raw: number; v: number }>
  mods: ModifierEntry[]
}

/** 递归深度上限（对齐战斗管线的 64 断链惯例） */
const MAX_DEPTH = 64

let states = new WeakMap<object, EntityState>()
let globalVersion = 1
let definitions: Record<string, AttributeDefLike> = {}
let scriptResolver: ((name: string) => string | undefined) | null = null
// ⚠️ 桩期说明（T1，2026-09-22）：scriptResolver 由 configureAttributeEval 写入，
//    首次读取在 Task 4 的 applyCompute；桩期无读取点，显式引用以满足 tsconfig noUnusedLocals
//    （与 mod-validate.ts 的 `void pairName` 同惯例）。Task 4 实装 applyCompute 后**删除本行**。
void scriptResolver
let rawReader: ((entity: any, name: string) => any) | null = null
let depth = 0

export function configureAttributeEval(cfg: {
  definitions?: Record<string, AttributeDefLike>
  scriptResolver?: (name: string) => string | undefined
  rawReader?: (entity: any, name: string) => any
}): void {
  if (cfg.definitions) definitions = cfg.definitions
  if (cfg.scriptResolver) scriptResolver = cfg.scriptResolver
  if (cfg.rawReader) rawReader = cfg.rawReader
}

/** mod 数据定义变更（热重载/读档重建）→ 所有实体缓存失效 */
export function bumpDataVersion(): void {
  globalVersion++
}

/** 裸值写入后调用：让该实体的缓存失效。未走过管线的实体零成本（无 state 即返回） */
export function notifyAttrWrite(entity: any): void {
  if (entity === null || typeof entity !== 'object') return
  const st = states.get(entity)
  if (st) st.version++
}

export function __resetAttributeEval(): void {
  states = new WeakMap()
  globalVersion++
  definitions = {}
  scriptResolver = null
  // ⚠️ 刻意**不重置** rawReader：它由 entity-utils 在模块加载时注入，属结构性接线而非测试态。
  //    若在此清掉，测试里 reset 之后 compute 的跨属性读取会静默失效（attr.get 恒 0）。
  depth = 0
}

function stateOf(entity: object): EntityState {
  let st = states.get(entity)
  if (!st) {
    st = { version: 1, cachedAtVersion: -1, cachedAtGlobal: -1, cache: new Map(), mods: [] }
    states.set(entity, st)
  }
  return st
}

function hasMods(entity: object, name: string): boolean {
  const st = states.get(entity)
  if (!st) return false
  for (const m of st.mods) {
    if (m.attr === name) return true
  }
  return false
}

/** 闸门 + 管线入口。raw 由 entity-utils 的命名空间查找算出 */
export function readEffective(entity: any, name: string, raw: any): any {
  if (entity === null || entity === undefined || typeof entity !== 'object') return raw
  // 非数字属性（string/boolean/对象型如 abilities 条目）不参与派生与修正
  if (typeof raw !== 'number') return raw
  const def = definitions[name]
  if (!def) return raw
  const hasCompute = typeof def.compute === 'string' && def.compute.length > 0
  if (!hasCompute && !hasMods(entity, name)) return raw
  if (depth >= MAX_DEPTH) {
    errorReporter.reportDedup('attr-eval-depth', {
      source: 'attribute-eval', severity: 'error',
      message: `属性求值递归超过深度上限（${MAX_DEPTH}）——已断链并返回裸值`,
      suggestion: '检查属性之间的 compute 依赖是否构成循环（如 A 派生依赖 A）',
    })
    return raw
  }

  const st = stateOf(entity)
  if (st.cachedAtVersion !== st.version || st.cachedAtGlobal !== globalVersion) {
    st.cache.clear()
    st.cachedAtVersion = st.version
    st.cachedAtGlobal = globalVersion
  }
  // 缓存键必须同时比对 raw：生产写路径大量直接改 entity.base[...]（effect-system、h-group-sex、
  //   h-ejaculation、hunger-system 等），绕过 setEntityAttr 也就绕过了 notifyAttrWrite 的版本号自增，
  //   故版本戳单独不可信 —— 同一 (实体, 属性) 在版本不变的情况下裸值可能已变。
  //   用 Object.is 而非 ===，使缓存里的 NaN 仍能命中（NaN !== NaN 会永远击穿缓存）。
  const hit = st.cache.get(name)
  if (hit && Object.is(hit.raw, raw)) return hit.v

  depth++
  let v: number = raw
  try {
    v = applyCompute(entity, name, v)
    v = applyMods(entity, name, v)
  } finally {
    depth--
  }
  st.cache.set(name, { raw, v })
  return v
}

/** T1 阶段为桩（原样返回）；Task 4 实装 */
function applyCompute(_entity: any, _name: string, raw: number): number {
  return raw
}

/** 叠加代数：base′ = set ?? v → value = (base′ + Σflat) × (1 + Σpercent)
 *  与 plugins/combat-base/formula-channels.ts 的通道语义一致（percent 相加后只乘一次） */
function applyMods(entity: object, name: string, v: number): number {
  const st = states.get(entity)
  if (!st || st.mods.length === 0) return v
  let set: number | undefined
  let flat = 0
  let percent = 0
  let hit = false
  for (const m of st.mods) {
    if (m.attr !== name) continue
    hit = true
    if (typeof m.mod.set === 'number' && Number.isFinite(m.mod.set)) set = m.mod.set
    if (typeof m.mod.flat === 'number' && Number.isFinite(m.mod.flat)) flat += m.mod.flat
    if (typeof m.mod.percent === 'number' && Number.isFinite(m.mod.percent)) percent += m.mod.percent
  }
  if (!hit) return v
  const base = set !== undefined ? set : v
  return (base + flat) * (1 + percent)
}

/** 注册一条属性修正。同 (id, attr) 重复注册 = 覆盖（幂等：热重载/重复挂载安全） */
export function registerModifier(
  entity: any, id: string, attr: string, mod: AttributeMod, opts?: { source?: string },
): void {
  if (entity === null || typeof entity !== 'object') return
  if (typeof id !== 'string' || id.length === 0) return
  if (typeof attr !== 'string' || attr.length === 0) return
  const st = stateOf(entity)
  const entry: ModifierEntry = { id, attr, mod: { ...mod }, source: opts?.source }
  const i = st.mods.findIndex(m => m.id === id && m.attr === attr)
  if (i >= 0) st.mods[i] = entry
  else st.mods.push(entry)
  st.version++
}

/** 移除修正：给 attr 则只移除该属性的那条，否则移除该 id 的全部。返回移除条数 */
export function removeModifier(entity: any, id: string, attr?: string): number {
  if (entity === null || typeof entity !== 'object') return 0
  const st = states.get(entity)
  if (!st) return 0
  const before = st.mods.length
  st.mods = st.mods.filter(m => !(m.id === id && (attr === undefined || m.attr === attr)))
  const removed = before - st.mods.length
  if (removed > 0) st.version++
  return removed
}

export function clearModifiers(entity: any): void {
  if (entity === null || typeof entity !== 'object') return
  const st = states.get(entity)
  if (!st || st.mods.length === 0) return
  st.mods = []
  st.version++
}

/** 调试/测试用：当前挂在该实体上的修正清单（副本） */
export function listModifiers(entity: any): ModifierEntry[] {
  if (entity === null || typeof entity !== 'object') return []
  const st = states.get(entity)
  if (!st) return []
  return st.mods.map(m => ({ ...m, mod: { ...m.mod } }))
}

/** 供 compute 脚本读取其他属性的有效值（递归走同一管线）——Task 4 使用 */
export function readAttrForCompute(entity: any, name: string): any {
  if (!rawReader) return 0
  const raw = rawReader(entity, name)
  return readEffective(entity, name, raw)
}
