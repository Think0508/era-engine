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
// 修正来源（同一份叠加代数，见 applyMods）：
//   ① 声明式（pull，2026-09-22 计划二）：装备/被动技能/天赋从实体**当前状态**现推导
//      （char.equipment / char.abilities[id].level / char.talents[id]），每次进管线重算 ——
//      不缓存、不需要任何变更通知，故脱下装备/掉级/失去天赋**立即**失效（天然无漂移）。
//   ② 运行时清单（计划三）：实体上的纯数据字段 char.attr_mods（带绝对到期时刻 expiresAt），
//      读时现算 + 剪除过期条目；因为是纯数据字段，它随存档往返（save-system 整对象序列化）。
//   ③ push 栈：registerModifier 登记的临时修正（存模块内 WeakMap，**不随存档**）。

import { errorReporter } from './error-reporter'

export interface AttributeDefLike {
  compute?: string
}

/** 上限规则（形状 = `src/core/entity-utils.ts` 的 `ATTR_CAPS` 条目；**属性名表只此一份**，
 *  由 entity-utils 在模块加载时注入——本模块是叶子模块，不能反向 import）。 */
export interface AttrCapRuleLike {
  /** 固定上限（常量类：疲劳 160 / 信赖 300 / 饥饿 240 / 尿意 300 / 欲望 100 / 默认 99999）
   *  ——读时投影**不**处理它们（写入端只钳这一类） */
  cap?: number
  /** 上限属性名（体力→体力上限、气力→气力上限、射精欲→射精欲上限、精液量→精液量上限） */
  maxAttr?: string
}

export interface AttributeMod {
  flat?: number
  percent?: number
  set?: number
}

/** 「一条修正声明有多强」的**唯一一份**算式（2026-09-22 终审 Fix 4）：`set ?? flat ?? percent ?? fallback`。
 *  消费方：状态属性修正的 D5 强度（status-system，fallback = 1）、战斗 modify_attribute 的登记强度
 *  （combat-base，fallback = 0）。**禁止再各写一份**——本算式此前在两个插件里各写一遍，且默认值已经分叉
 *  （状态侧 `?? 1`、战斗侧无兜底），改单侧就静默分叉。
 *  非有限数（TOML 的 `nan`/`inf` typo，或上游算出的 NaN）→ 一律取 `fallback`：强度是**比较基准**，
 *  把 NaN 传下去会让 `registerRuntimeMod` 的 `strength >= prev` 全假 → 修正静默拒绝（旧战斗侧的形态）。 */
export function modStrength(mod: { flat?: number; percent?: number; set?: number } | undefined | null, fallback = 0): number {
  const v = mod?.set ?? mod?.flat ?? mod?.percent
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
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

/** 运行时修正（带到期时刻）——存实体 `char.attr_mods`，随存档往返（纯数据字段） */
export interface RuntimeAttrMod {
  /** 来源标识：状态用 `status:<状态ID>`，战斗用 `combat:<效果实例ID>` */
  id: string
  attr: string
  flat?: number
  percent?: number
  set?: number
  /** 绝对游戏分钟；缺省 = 不自动到期（由来源显式移除） */
  expiresAt?: number
  source?: string
  /** D5 比较用的强度，随条目持久化（存档往返后比较仍成立）。缺省 = -Infinity（老档条目，任何新施加都能覆盖） */
  strength?: number
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
/** 上限规则表（`ATTR_CAPS`，由 entity-utils 注入）：读时封顶投影用（见 applyCapProjection）。
 *  与 rawReader 同属**结构性接线**（不是测试态）——`__resetAttributeEval` 刻意不清它。 */
let capRules: Record<string, AttrCapRuleLike> | null = null
/** 声明式来源的 mod 定义快照（items / abilities / talentDefs） */
let defs: DeclarativeDefs = {}
/** 插件追加的声明式来源（内置三源之后，按注册顺序） */
const extraSources: ((entity: any, defs: DeclarativeDefs) => AttributeModSource[])[] = []
/** 运行时修正清单在实体上的字段名（纯数据字段 → 随存档往返，见 save-system 的整对象序列化） */
const RUNTIME_FIELD = 'attr_mods'
/** 游戏内当前时刻（分钟），由 mod-loader 注入。未注入 = 运行时条目一律视为不过期
 *  （把它们当成"全过期"会静默返回偏小的错值——宁可不失效，也不静默算错） */
let nowMinutes: (() => number) | null = null
let depth = 0

export function configureAttributeEval(cfg: {
  definitions?: Record<string, AttributeDefLike>
  scriptResolver?: (name: string) => string | undefined
  rawReader?: (entity: any, name: string) => any
  defs?: DeclarativeDefs
  nowMinutes?: () => number
  capRules?: Record<string, AttrCapRuleLike>
}): void {
  if (cfg.definitions) definitions = cfg.definitions
  if (cfg.scriptResolver) scriptResolver = cfg.scriptResolver
  if (cfg.rawReader) rawReader = cfg.rawReader
  if (cfg.defs) defs = cfg.defs
  if (cfg.nowMinutes) nowMinutes = cfg.nowMinutes
  if (cfg.capRules) capRules = cfg.capRules
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
  //    上限规则表（capRules）同属结构性接线，同样不清（清了 = 读时封顶在测试里静默失效）。
  // 时钟同属注入态（mod-loader 注入）→ 必须重置，否则上一个用例的时刻会渗进下一个用例。
  nowMinutes = null
  depth = 0
}

/** 读时封顶投影（2026-09-23 末轮用户裁定）：**裸值可以越过上限，读出来的有效值不可以**。
 *
 *  为什么收口在**读**这一侧：写入端按上限钳制会把"临时上限修正"永久刻进裸值 ——
 *  上限**减益**下 `min(有效上限, 裸值+增量)` 把裸值截断（体力 100 + `体力上限−100` → 裸值写成 20，
 *  撤修正仍 20 = 永久 −80）；上限**增益**下又把裸值抬过基础上限且不回落（R1/R2 同一通道）。
 *  改在读侧后三条语义同时成立（裁定原文）：
 *    · 裸值 150 / 基础上限 100 / 上限修正 +100（有效上限 200）→ 读 **150**（上限增益真能屯更多）
 *    · 裸值 150 / 基础上限 100 / 无修正（有效上限 100）        → 读 **100**（不会白拿）
 *    · 裸值 100 / 基础上限 120 / 上限修正 −100（有效上限 20）  → 读 **20**（上限减益立即削当前值）
 *
 *  上限取**有效上限**：裁定给的三条语义全部按"有效上限"定义（裸上限会让第一条失效——修正抬高的上限读不到）。
 *  递归有界，三重保险：① `maxAttr === name` 显式跳过（上限属性不吃自己的规则，防自封顶）；
 *  ② 四个上限属性（体力上限/气力上限/射精欲上限/精液量上限）自己都不带 `maxAttr` 规则 → 递归一层即终止；
 *  ③ 再退一步还有本模块的 MAX_DEPTH 护栏（异形 mod 的 compute 环会有界断链 + 上报）。
 *
 *  生效条件（两条都必须满足）：
 *    · 该属性在 `ATTR_CAPS` 里**带 maxAttr**（常量 `cap` 类不在此步——它们在写入端钳制）；
 *    · 有效上限 **> 0**（≤0 视为"无上限"而不生效，与 `clampAttrValue` 既有约定一致：
 *      否则上限缺失/为 0 的角色会被把值全封成 0）。
 *  边界：属性未在 mod 定义里登记时不投影（沿用本模块"无定义 = 恒等"的闸门；生产侧四个属性都由 mod 定义）。 */
function applyCapProjection(entity: any, name: string, v: number): number {
  const maxAttr = capRules?.[name]?.maxAttr
  if (!maxAttr || maxAttr === name) return v
  if (!rawReader) return v
  const max = readEffective(entity, maxAttr, rawReader(entity, maxAttr))
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return v
  return v > max ? max : v
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
    // 两类清单来源每次进管线**现算一次**，且闸门与叠加共用同一份清单（不在两处各聚合一次）：
    //   ① 声明式（装备/被动技能/天赋/插件追加）—— 从实体当前状态现推导
    //   ② 运行时清单（char.attr_mods）—— 读时现算并剪除过期条目（到点即失效，无需通知）
    // 顺序 = 声明式在前、运行时在后 → 多个 set 取清单顺序最后一条，即**临时修正压过常驻来源**
    //   （与「后写的 set 胜出」既有语义一致：同一属性上运行时修正比装备/被动更"晚"）。
    const decl = collectDeclarativeMods(entity)
    const runtime = readRuntimeMods(entity)
    const all: AttributeModSource[] = [...decl, ...runtime]
    // 名字沿用「声明式」时期：这里判定的是**合并后清单**（声明式 + 运行时），
    // 故单有运行时条目（既无 compute 也无声明式）也能过闸门。
    const hasDecl = all.some(m => m.attr === name)
    // 闸门：无 compute、无修正 → 原样返回（恒等）——但**读时封顶**仍要过（裸值可越顶、读出来不能）
    if (!hasCompute && !hasMods(entity, name) && !hasDecl) return applyCapProjection(entity, name, raw)

    const st = stateOf(entity)
    // 声明式来源**没有任何变更通知**（改 equipment/abilities/talents 不走 registerModifier、
    //   也不保证走 setEntityAttr）→ 它不能进 (raw → v) 缓存：缓存键只比对裸值与版本戳，
    //   同裸值 + 同版本下声明式修正可能已经变了（换装备/升级/掉级/失去天赋），命中的就是陈旧值。
    //   故只要实体带**任何**声明式修正，本次读取既不读缓存也不写缓存（一律现算）。
    //   判据用整份清单而非仅本属性：compute 派生会读别的属性（attrs.get），别的属性上的声明式
    //   变化同样会让本属性的缓存失真，只看本属性会漏掉这条传递路径。
    //   ⚠️ 判据必须用**合并后**的 all（含运行时清单），不能只看 decl：运行时条目"到点即失效"同样
    //   没有任何通知，若只看 decl，则「挂修正期间读一次（被判为可缓存 → 缓存里存的是**含修正**的值）
    //   → 修正到期（版本戳不变、裸值不变）→ 命中该缓存」会一直返回含修正的陈旧值。
    //   用 all 则「有条目 ⇒ 一律现算」，与声明式共用同一条策略，不新增第二套失效机制。
    //   反向仍然安全：缓存条目只在 all 为空时写入，而 all 为空时值与 (裸值, 版本) 一一对应。
    const cacheable = all.length === 0
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
    v = applyMods(entity, name, v, all)
    // 收口：先派生、再叠修正、最后**按有效上限封顶**（缓存里存的就是封顶后的值）
    v = applyCapProjection(entity, name, v)
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
  // ③.5 被装配的能力（2026-09-23 秘籍-内功系统）——声明式来源第四条。
  //   与 ② 的区别：② 是"拥有即生效"（所有被动技能的 attribute_mods）；本条只在**装配期间**生效。
  //   装配状态 = 角色的纯数据字段 `equipped_abilities`（能力 ID 列表，随存档往返）；
  //   加成清单读能力定义的 `equipped_mods`（与 attribute_mods 同形状、同 per_level 缩放规则）。
  //   core 只认"被装配的能力"这个概念，不认识"内功"——名字与准入规则（槽位数）由上层插件决定。
  const equipped = entity.equipped_abilities
  if (Array.isArray(equipped)) {
    for (const id of equipped) {
      if (typeof id !== 'string') continue
      const def = defs.abilities?.[id]
      const list = def?.equipped_mods
      if (!Array.isArray(list) || list.length === 0) continue
      const level = typeof entity.abilities?.[id]?.level === 'number' ? entity.abilities[id].level : 0
      // 未学会（level 0）却挂在装配位上 = 数据畸形：不提供任何加成（与 ② 同判据）
      if (level <= 0) continue
      pushMods(out, list, level)
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

/** 读实体的运行时修正清单：跳过并剪除已过期/畸形的条目。返回的条目保证在当前时刻有效。
 *  每次读取都重算（不缓存）→ 到点立即失效，**不需要任何变更通知**；过期条目就地剪掉，
 *  否则清单会随挂载次数无界增长（且会一并写进存档）。
 *  未注入时钟（nowMinutes === null，如单测直调）时条目一律视为不过期（见 nowMinutes 注释）。
 *  ⚠️ 别名契约（两半要分清，2026-09-22 终审 M-1）：
 *  · **条目**（`RuntimeAttrMod`）就是**实体自己的对象**（不是副本）：就地改 `strength` 会改写后续
 *    D5 顶替判定的比较基准，就地改数值则直接改写生效中的修正，且都绕过 notifyAttrWrite（不失效缓存）；
 *  · **返回的数组**每次调用都是**新数组**，且剪除轮里实体字段会被整个换成它（`entity.attr_mods = live`）
 *    —— 调用方**不得长期持有这个数组引用**：上一轮拿到的那份在下一次剪除后已与实体脱钩，
 *    往里 push 既不会进实体、也不会进存档（每轮都要现调本函数取最新一份）。
 *  要改清单请走 registerRuntimeMod / removeRuntimeMod / removeRuntimeModsByPrefix。 */
export function readRuntimeMods(entity: any): RuntimeAttrMod[] {
  if (!entity || typeof entity !== 'object') return []
  const list = (entity as any)[RUNTIME_FIELD]
  if (!Array.isArray(list) || list.length === 0) return []
  const now = nowMinutes ? nowMinutes() : null
  const live: RuntimeAttrMod[] = []
  let dropped = false
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || typeof raw.attr !== 'string' || raw.attr.length === 0) {
      dropped = true            // 畸形条目一并剪除：否则每次存档都被原样写回，永远留在档里
      continue
    }
    // 有 expiresAt 但非有限数字（字符串/NaN/Infinity typo）→ 视为不自动到期（保持既有行为），但要上报：
    //   静默把一个"该到点的减益"变成永久减益，符号是反的，不能没有诊断。
    if (raw.expiresAt !== undefined && !(typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt))) {
      errorReporter.reportDedup(`attr-mod-expires:${raw.attr}`, {
        source: 'attribute-eval', severity: 'error',
        message: `实体 '${entity.id}' 的运行时修正 '${raw.id}'（属性 '${raw.attr}'）的 expiresAt 不是有限数字（收到 ${typeof raw.expiresAt}）——该条目视为不自动到期`,
        suggestion: 'expiresAt 必须是有限 number（绝对游戏分钟）；写成字符串/NaN 会让减益永不失效',
      })
    }
    if (now !== null && typeof raw.expiresAt === 'number' && now >= raw.expiresAt) { dropped = true; continue }
    live.push(raw as RuntimeAttrMod)
  }
  // 只在本轮真的剪掉了东西时才写回（避免每次读取都产生一次无意义的赋值）
  // 刻意**不** notifyAttrWrite：剪除不改变聚合值（被剪的条目本就不参与），且有条目存在时该实体
  //   的读取本就不走缓存（见 readEffective 的 cacheable）——没有需要失效的缓存。
  if (dropped) (entity as any)[RUNTIME_FIELD] = live
  return live
}

/** 施加/刷新一条运行时修正。
 *  强度（strength）由调用方给出并随条目持久化：`<` 现有 → 不生效（不降级、不刷新时长）；
 *  `>=` 现有 → 顶上并重置为该条自己的 expiresAt（同强度也刷新时长）。返回是否顶上。
 *  ⚠️ strength **写在条目上**（不是 WeakMap）：它必须随存档往返，否则"存了破绽3、读档后又打来
 *  破绽2"会因丢失强度而错误顶替（老档条目无此字段 → 视为 -Infinity，任何新施加都能覆盖）。 */
export function registerRuntimeMod(entity: any, entry: RuntimeAttrMod, strength: number): boolean {
  if (!entity || typeof entity !== 'object') return false
  if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) return false
  if (typeof entry.attr !== 'string' || entry.attr.length === 0) return false
  if (!Number.isFinite(strength)) return false
  // D5 的比较基准必须是**存活**条目：先借 readRuntimeMods 剪除过期/畸形条目（**不另写一份剪除逻辑**），
  //   再从实体重读剪除后的数组——它把剪除结果就地写回了实体字段。
  //   否则"已到点但没人读过该实体"（离屏 NPC，或两次读取之间的任意角色）的过期条目仍会否决
  //   新的较弱施加：静默不生效，连较弱的那条都没有——比"降级"更糟。
  readRuntimeMods(entity)
  if (!Array.isArray((entity as any)[RUNTIME_FIELD])) (entity as any)[RUNTIME_FIELD] = []
  const list = (entity as any)[RUNTIME_FIELD] as RuntimeAttrMod[]
  const next: RuntimeAttrMod = { ...entry, strength }
  const i = list.findIndex(m => m?.id === entry.id && m?.attr === entry.attr)
  if (i >= 0) {
    const prev = typeof list[i].strength === 'number' ? list[i].strength : Number.NEGATIVE_INFINITY
    if (!(strength >= prev)) return false
    list[i] = next
  } else {
    list.push(next)
  }
  notifyAttrWrite(entity)
  return true
}

/** 移除运行时修正：给 attr 则只移除该属性的那条，否则移除该 id 的全部。返回移除条数 */
export function removeRuntimeMod(entity: any, id: string, attr?: string): number {
  if (!entity || typeof entity !== 'object') return 0
  const list = (entity as any)[RUNTIME_FIELD]
  if (!Array.isArray(list)) return 0
  const before = list.length
  ;(entity as any)[RUNTIME_FIELD] = list.filter((m: any) => !(m?.id === id && (attr === undefined || m?.attr === attr)))
  const removed = before - (entity as any)[RUNTIME_FIELD].length
  if (removed > 0) notifyAttrWrite(entity)
  return removed
}

/** 按 id 前缀批量移除（战斗结束清理 `combat:*`、状态移除清理 `status:<id>`）。返回移除条数 */
export function removeRuntimeModsByPrefix(entity: any, prefix: string): number {
  if (!entity || typeof entity !== 'object') return 0
  const list = (entity as any)[RUNTIME_FIELD]
  if (!Array.isArray(list)) return 0
  const before = list.length
  ;(entity as any)[RUNTIME_FIELD] = list.filter((m: any) => !(typeof m?.id === 'string' && m.id.startsWith(prefix)))
  const removed = before - (entity as any)[RUNTIME_FIELD].length
  if (removed > 0) notifyAttrWrite(entity)
  return removed
}

/** 叠加代数：base′ = set ?? v → value = (base′ + Σflat) × (1 + Σpercent)
 *  与 plugins/combat-base/formula-channels.ts 的通道语义一致（percent 相加后只乘一次）。
 *  `mods` 由 readEffective 现算后传入（一次读取只聚合一次，闸门与叠加共用）；多个 set 取清单顺序最后一条。 */
function applyMods(entity: object, name: string, v: number, mods: AttributeModSource[]): number {
  let set: number | undefined
  let flat = 0
  let percent = 0
  let hit = false
  // 叠加累积体（**全场唯一一份**）：声明式 + 运行时清单 + push 栈共用，杜绝"两处各写一遍、改单侧就静默分叉"。
  // 各来源的形状不同（AttributeModSource 带 attr/per_level；运行时条目带 id/expiresAt/strength；
  // push 条目是 ModifierEntry.attr + .mod），故 attr 判定留在各自循环里，只有累积数学进闭包。
  const acc = (m: AttributeMod): void => {
    hit = true
    if (typeof m.set === 'number' && Number.isFinite(m.set)) set = m.set
    if (typeof m.flat === 'number' && Number.isFinite(m.flat)) flat += m.flat
    if (typeof m.percent === 'number' && Number.isFinite(m.percent)) percent += m.percent
  }
  // ① 声明式 + 运行时（顺序：装备→技能→天赋→插件追加→运行时清单；push 栈在其后 —— 后写的 set 胜出）
  for (const m of mods) {
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
