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
//   v   = ((set ?? v) + Σflat) × (1 + Σpercent)   ← 后叠修正（复用公式通道代数）
//
// 闸门（零回归保证）：只有【属性定义存在】+【裸值是数字】+【有 compute 或有修正条目】才走管线，
//   其余一律原样返回。因此未接入任何来源时，本管线是恒等变换。
//
// 两类修正来源（同一份叠加代数，见 applyMods）：
//   ① 声明式（pull，2026-09-22 计划二）：装备/被动技能/天赋从实体**当前状态**现推导
//      （char.equipment / char.abilities[id].level / char.talents[id]），每次进管线重算 ——
//      不缓存、不需要任何变更通知，故脱下装备/掉级/失去天赋**立即**失效（天然无漂移）。
//   ② 运行时（push）：registerModifier 登记的临时修正（战斗 buff 等）。

import { errorReporter } from './error-reporter'

export interface AttributeDefLike {
  compute?: string
}

export interface AttributeMod {
  flat?: number
  percent?: number
  set?: number
}

/** 声明式来源的单条修正（mod 数据里写的 `attribute_mods = [{ attr, flat?, percent?, set?, per_level? }]`）。
 *  ⚠️ 与 push 栈的 `AttributeMod` 刻意不同：本形状 `attr` 必填、多一个 `per_level`（等级缩放）。 */
export interface AttributeModSource {
  attr: string
  flat?: number
  percent?: number
  set?: number
  per_level?: number
}

/** 声明式来源需要的 mod 定义快照（mod-loader 注入；core 不能 import mod-loader，否则成环） */
export interface DeclarativeDefs {
  items?: Record<string, any>
  abilities?: Record<string, any>
  talentDefs?: Record<string, any>
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
let rawReader: ((entity: any, name: string) => any) | null = null
/** 声明式来源的 mod 定义快照（items / abilities / talentDefs） */
let defs: DeclarativeDefs = {}
/** 插件追加的声明式来源（内置三源之后，按注册顺序） */
const extraSources: ((entity: any, defs: DeclarativeDefs) => AttributeModSource[])[] = []
let depth = 0

export function configureAttributeEval(cfg: {
  definitions?: Record<string, AttributeDefLike>
  scriptResolver?: (name: string) => string | undefined
  rawReader?: (entity: any, name: string) => any
  defs?: DeclarativeDefs
}): void {
  if (cfg.definitions) definitions = cfg.definitions
  if (cfg.scriptResolver) scriptResolver = cfg.scriptResolver
  if (cfg.rawReader) rawReader = cfg.rawReader
  if (cfg.defs) defs = cfg.defs
}

/** 追加声明式来源（内置三源最先，注册的按注册顺序在其后；顺序只影响 set 的「最后一条胜出」） */
export function registerDeclarativeSource(fn: (entity: any, defs: DeclarativeDefs) => AttributeModSource[]): void {
  extraSources.push(fn)
}

/** mod 数据（重新）加载（loadMod：定义/脚本注入本身就是重载点）→ 所有实体缓存失效 */
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
  // 声明式来源的注入态同属测试态（定义快照 + 插件追加来源），必须一并清干净
  defs = {}
  extraSources.length = 0
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
  // 非数字属性（string/boolean/对象型如 abilities 条目）不参与派生与修正；
  // 用 Number.isFinite 而非 typeof：NaN/±Infinity 也不得进入管线（否则会被缓存并污染下游）
  if (!Number.isFinite(raw)) return raw
  const def = definitions[name]
  if (!def) return raw
  const hasCompute = typeof def.compute === 'string' && def.compute.length > 0
  // 深度护栏（本模块**唯一**一份，措辞与 compute 自引用同款）必须**先于聚合**判定，且聚合要在它
  //   自增的这一帧内完成。原因：声明式来源可以读属性（"从角色当前状态派生修正"最自然的写法 ——
  //   装备看 state、被动技能看等级），那会重入本函数；若聚合发生在 depth 自增之前，重入链上
  //   depth 恒等于**进入值**（既不增长也不回退）→ 递归只受栈深限制，最终以 RangeError 被来源
  //   循环的 try/catch 吞成 'attr-decl-source' 上报（有界性的假象，且断链处不可归因）。
  //   放在护栏内之后：重入链每层 +1，到 MAX_DEPTH 由同一份护栏干净断链 + 同一套去重上报。
  if (depth >= MAX_DEPTH) {
    errorReporter.reportDedup(`attr-eval-depth:${name}`, {
      source: 'attribute-eval', severity: 'error',
      message: `属性 '${name}' 求值递归超过深度上限（${MAX_DEPTH}）——已断链并返回裸值`,
      suggestion: `检查属性 '${name}' 的 compute 依赖是否构成循环（如 '${name}' 的派生公式里读取了 '${name}' 自身），或声明式来源是否无条件地重读了 '${name}'`,
    })
    return raw
  }

  depth++
  try {
    // 声明式来源每次进管线**现算一次**：闸门与叠加共用同一份清单（不在两处各聚合一次）
    const decl = collectDeclarativeMods(entity)
    const hasDecl = decl.some(m => m.attr === name)
    if (!hasCompute && !hasMods(entity, name) && !hasDecl) return raw

    const st = stateOf(entity)
    // 声明式来源**没有任何变更通知**（改 equipment/abilities/talents 不走 registerModifier、
    //   也不保证走 setEntityAttr）→ 它不能进 (raw → v) 缓存：缓存键只比对裸值与版本戳，
    //   同裸值 + 同版本下声明式修正可能已经变了（换装备/升级/掉级/失去天赋），命中的就是陈旧值。
    //   故只要实体带**任何**声明式修正，本次读取既不读缓存也不写缓存（一律现算）。
    //   判据用整份清单而非仅本属性：compute 派生会读别的属性（attrs.get），别的属性上的声明式
    //   变化同样会让本属性的缓存失真，只看本属性会漏掉这条传递路径。
    //   反向仍然安全：缓存条目只在 decl 为空时写入，而 decl 为空时值与 (裸值, 版本) 一一对应。
    const cacheable = decl.length === 0
    if (cacheable) {
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
    }

    let v: number = raw
    v = applyCompute(entity, name, v)
    v = applyMods(entity, name, v, decl)
    if (cacheable) st.cache.set(name, { raw, v })
    return v
  } finally {
    depth--
  }
}

/** 编译缓存：同一段脚本文本只编译一次（mod 热重载换文本即重新编译） */
const compiled = new Map<string, Function>()

function compileScript(code: string): Function {
  let fn = compiled.get(code)
  if (!fn) {
    // 严格模式 + 显式两个入参（不用 with/Proxy：契约比 src/utils/sandbox.ts 更窄）
    fn = new Function('base', 'attrs', `"use strict";\n${code}`)
    compiled.set(code, fn)
  }
  return fn
}

/** 派生：v = 脚本(raw, attrs)。失败姿态一律「回退裸值 + 去重上报」，不阻断调用方。
 *  唯一例外：脚本解析器未注入（注入前的接线缺失 / 单测直接调本模块）时**静默**回退裸值、不上报。
 *  ⚠️ 同步执行、**无超时保护**（同步管线里做不到，见 spec §4.3）——脚本必须纯同步且快速 */
function applyCompute(entity: object, name: string, raw: number): number {
  const def = definitions[name]
  const file = def?.compute
  if (typeof file !== 'string' || file.length === 0) return raw
  if (!scriptResolver) return raw
  const code = scriptResolver(file)
  if (typeof code !== 'string' || code.trim().length === 0) {
    errorReporter.reportDedup(`attr-compute-missing:${file}`, {
      source: 'attribute-eval', severity: 'error',
      message: `属性 '${name}' 的 compute 脚本 '${file}' 不存在或为空——已回退裸值`,
      suggestion: `检查 mods/<mod>/scripts/${file} 是否存在`,
    })
    return raw
  }
  try {
    const out = compileScript(code)(raw, { get: (n: string) => readAttrForCompute(entity, n) })
    if (typeof out !== 'number' || !Number.isFinite(out)) {
      errorReporter.reportDedup(`attr-compute-bad:${name}`, {
        source: 'attribute-eval', severity: 'error',
        message: `属性 '${name}' 的 compute 脚本 '${file}' 返回非有限数字（收到 ${typeof out}）——已回退裸值`,
        suggestion: 'compute 脚本必须 return 一个有限 number，且不得是 async',
      })
      return raw
    }
    return out
  } catch (err) {
    errorReporter.reportDedup(`attr-compute-throw:${name}`, {
      source: 'attribute-eval', severity: 'error',
      message: `属性 '${name}' 的 compute 脚本 '${file}' 执行抛错：${err instanceof Error ? err.message : String(err)}——已回退裸值`,
    })
    return raw
  }
}

/** 等级缩放（**线性追加**，与战斗效果的乘性 growth 刻意不同）：
 *  `flat(级 n) = flat + per_level×(n−1)`（1 级 = flat 本身）；percent 同理；
 *  `set` **不随等级缩放**（它是"覆盖基准"，缩放无意义）。只缩放**显式给过的**字段——
 *  没给 percent 就不要因为 per_level 而凭空产生 percent。 */
function scaleByLevel(m: AttributeModSource, level: number): AttributeModSource {
  const per = m.per_level
  // 非数字/非有限/0 的 per_level 一律当"无缩放"（不产生 NaN —— 静默吞掉数值比报错更难查）
  if (typeof per !== 'number' || !Number.isFinite(per) || per === 0) return m
  const n = Math.max(1, Math.floor(level))
  if (n <= 1) return m
  const step = per * (n - 1)
  const out: AttributeModSource = { attr: m.attr }
  if (typeof m.flat === 'number') out.flat = m.flat + step
  if (typeof m.percent === 'number') out.percent = m.percent + step
  if (typeof m.set === 'number') out.set = m.set
  return out
}

/** 把一条定义的 attribute_mods 按等级缩放后追加进清单（形状不对的条目静默跳过） */
function pushMods(out: AttributeModSource[], list: any, level: number): void {
  if (!Array.isArray(list)) return
  for (const raw of list) {
    if (!raw || typeof raw.attr !== 'string' || raw.attr.length === 0) continue
    out.push(scaleByLevel(raw as AttributeModSource, level))
  }
}

/** 从实体**当前状态**现算声明式修正（每次调用都重算：不缓存 → 脱下/升级/失去天赋立即生效，无需通知） */
export function collectDeclarativeMods(entity: any): AttributeModSource[] {
  const out: AttributeModSource[] = []
  if (!entity || typeof entity !== 'object') return out
  // ① 装备（equipment_off 里的不算穿着——H 中自动脱下的部位不提供修正）
  const worn = entity.equipment
  if (worn && typeof worn === 'object') {
    for (const itemId of Object.values(worn)) {
      const def = typeof itemId === 'string' ? defs.items?.[itemId] : undefined
      pushMods(out, def?.attribute_mods, 1)
    }
  }
  // ② 被动技能（等级 = abilities[id].level；{level, xp} 契约）
  const abil = entity.abilities
  if (abil && typeof abil === 'object') {
    for (const [id, entry] of Object.entries(abil)) {
      const def = defs.abilities?.[id]
      const level = typeof (entry as any)?.level === 'number' ? (entry as any).level : 0
      if (level <= 0) continue
      pushMods(out, def?.attribute_mods, level)
    }
  }
  // ③ 天赋（等级 = talents[id] 数字）
  const tal = entity.talents
  if (tal && typeof tal === 'object') {
    for (const [id, lv] of Object.entries(tal)) {
      const def = defs.talentDefs?.[id]
      const level = typeof lv === 'number' ? lv : 0
      if (level <= 0) continue
      pushMods(out, def?.attribute_mods, level)
    }
  }
  // ④ 插件追加来源
  for (const fn of extraSources) {
    try {
      const list = fn(entity, defs)
      if (Array.isArray(list)) for (const m of list) if (m && typeof m.attr === 'string') out.push(m)
    } catch (err) {
      errorReporter.reportDedup('attr-decl-source', {
        source: 'attribute-eval', severity: 'error',
        message: `声明式来源函数抛错：${err instanceof Error ? err.message : String(err)}——已跳过该来源`,
      })
    }
  }
  return out
}

/** 叠加代数：base′ = set ?? v → value = (base′ + Σflat) × (1 + Σpercent)
 *  与 plugins/combat-base/formula-channels.ts 的通道语义一致（percent 相加后只乘一次）。
 *  `decl` 由 readEffective 现算后传入（一次读取只聚合一次，闸门与叠加共用）；多个 set 取清单顺序最后一条。 */
function applyMods(entity: object, name: string, v: number, decl: AttributeModSource[]): number {
  let set: number | undefined
  let flat = 0
  let percent = 0
  let hit = false
  // 叠加累积体（**全场唯一一份**）：声明式与 push 栈共用，杜绝"两处各写一遍、改单侧就静默分叉"。
  // 两条来源的形状不同（AttributeModSource 带 attr/per_level；push 条目是 ModifierEntry.attr + .mod），
  // 故 attr 判定留在各自循环里，只有累积数学进闭包。
  const acc = (m: AttributeMod): void => {
    hit = true
    if (typeof m.set === 'number' && Number.isFinite(m.set)) set = m.set
    if (typeof m.flat === 'number' && Number.isFinite(m.flat)) flat += m.flat
    if (typeof m.percent === 'number' && Number.isFinite(m.percent)) percent += m.percent
  }
  // ① 声明式来源（顺序：装备→技能→天赋→插件追加；push 栈在其后 —— 后写的 set 胜出）
  for (const m of decl) {
    if (m.attr === name) acc(m)
  }
  // ② push 栈（既有逻辑，原样保留）
  const st = states.get(entity)
  if (st) {
    for (const e of st.mods) {
      if (e.attr === name) acc(e.mod)
    }
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

/** 供 compute 脚本读取其他属性的有效值（递归走同一管线） */
export function readAttrForCompute(entity: any, name: string): any {
  if (!rawReader) {
    // 结构性接线缺失（entity-utils 模块加载时注入）——静默返回 0 会让派生值无声地错，
    // 故必须上报：调用方拿到 0 是回退姿态，但错误必须有信号。
    // 去重键带属性名：否则进程内只有第一个被读的属性会被点名（与深度护栏同款归因处理）
    errorReporter.reportDedup(`attr-eval-no-raw-reader:${name}`, {
      source: 'attribute-eval', severity: 'error',
      message: `读取属性 '${name}' 的有效值时 rawReader 未注入——已返回 0（compute 结果不可信）`,
      suggestion: 'entity-utils 在模块加载时注入 rawReader；单独使用本模块（如单元测试）须自行 configureAttributeEval({ rawReader })',
    })
    return 0
  }
  const raw = rawReader(entity, name)
  return readEffective(entity, name, raw)
}
