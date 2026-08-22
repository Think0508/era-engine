// 注释：body-shape-system 插件——女/男角色身材「cm 数值 ↔ 身材档」双向一致化
// 2026-08 grill 定稿实现：
//   - 数据：mod.bodyShape（body-shape.toml，插件默认层 + mod 定义层字段级合并）
//   - 维度：chest(胸围)/hip(臀围) 写天赋（互斥、数值权威、懒物化）；
//           height(身高) 纯派生标签（数值→档，不写天赋）；
//           penis(阴茎长度) 男用纯派生档——base.阴茎大小(0-3) 降级为【派生镜像】
//           （jj_0~3 前提 / h-core pain-adjust / 属性面板零改动兼容；镜像由本系统保持新鲜）
//   - 档位：天赋层保持 erArk 原版 5 胸/3 臀 不动；身高 3 档 小车/标准/大车（标签）；
//           阴茎 4 档 短小/普通/粗大/巨根（erArk 官方分层，cm 边界 8/12/16 min闭max开）
//   - 性别闸：维度级——胸/臀/身高=女(2)，阴茎=男(1)；维度未写 sex 时用根 sex_to_apply
//   - 懒物化：首次被读/写才落地；阴茎首触无数据 → 按分布 5/55/30/10 掷档再档内均匀取 cm
//     （修复 attributes.toml default=1 预填导致"真实加载全员普通、分布只活单测"的潜伏 BUG）
//   - 存储：char.body_shape = { 胸围, 臀围, 身高, 阴茎长度 }（L3 引擎独占承载）——不放 base，
//     因为 attributes.toml 会对 base 自动落默认值，首读即覆盖手写天赋/掷档结果
//   - 条件接入：代理域 body_shape.*（counter-system 先例）读时先 reconcile（懒物化正确）
// 通信：ctx.api.register('body-shape', ...)；写尺寸发标准字符事件 character:changed

import type { PluginContext, GameContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'
import { errorReporter } from '../../core/error-reporter'
import { conditionEngine, registerProxyDomain } from '../../core/condition-engine'
import type { BodyShapeDef, BodyShapeDimDef, BodyShapeTierDef } from '../../core/mod-types'

const BUST = '胸围'
const HIP = '臀围'
const HEIGHT = '身高'
const PENIS = '阴茎长度'
const PENIS_RANK = '阴茎大小'     // 派生镜像（0-3）：jj_0~3 前提 / pain-adjust 读取，本系统保持新鲜
const SEX_ATTR = '性别'
const FEMALE = 2
const MALE = 1
// 注释：L3 引擎独占承载（与 pregnancy/dirty/h_state 同策略）——随存档序列化，非属性名
const PAYLOAD = 'body_shape'

interface DimRuntime {
  key: string                    // body_shape 数值字段名：胸围/臀围/身高/阴茎长度
  names: string[]                // 档名（胸/臀 = 天赋名；身高/阴茎 = 派生标签名），按 min 升序
  tierBy: Map<string, { min: number; max: number }>
  defaultTier: string            // 无数值无天赋时使用的默认档（阴茎走掷档，此值仅兜底）
  writesTalent: boolean          // 胸/臀 true（互斥写天赋）；身高/阴茎 false（纯派生标签）
  rolling: boolean               // 阴茎 true：首触无数据按分布掷档（修复潜伏 BUG）
  syncsMirror: boolean           // 阴茎 true：把档位 rank 同步到 base.阴茎大小（派生镜像）
  sexValue: number | null        // 维度级性别闸（null = 用根 sex_to_apply）
  enabled: boolean
}

let dims: Record<'chest' | 'hip' | 'height' | 'penis', DimRuntime> | null = null
let rootSexValue: number = FEMALE   // body_shape.sex_to_apply → 性别值（female=2 male=1）

function buildDims(): void {
  const def: BodyShapeDef | undefined = modLoader.getMod()?.bodyShape
  if (def?.sex_to_apply === 'male') rootSexValue = MALE
  else rootSexValue = FEMALE

  const mk = (raw: BodyShapeDimDef | undefined, opts: {
    writesTalent: boolean
    rolling?: boolean
    syncsMirror?: boolean
  }): DimRuntime => {
    const sexValue: number | null = raw?.sex === 'male' ? MALE : raw?.sex === 'female' ? FEMALE : null
    if (!raw || !raw.tiers) {
      return { key: '', names: [], tierBy: new Map(), defaultTier: '', writesTalent: opts.writesTalent, rolling: !!opts.rolling, syncsMirror: !!opts.syncsMirror, sexValue, enabled: false }
    }
    const tierEntries = Object.entries(raw.tiers) as [string, BodyShapeTierDef][]
    const entries = tierEntries
      .filter(([, t]) => !!t && typeof t.min === 'number' && typeof t.max === 'number')
      .sort((a, b) => a[1].min - b[1].min)
    const tierBy = new Map<string, { min: number; max: number }>()
    for (const [name, t] of entries) tierBy.set(name, t)
    const names = entries.map(([name]) => name)
    const defaultTier = raw.default && raw.tiers[raw.default] ? raw.default : (names[0] ?? '')
    return { key: '', names, tierBy, defaultTier, writesTalent: opts.writesTalent, rolling: !!opts.rolling, syncsMirror: !!opts.syncsMirror, sexValue, enabled: names.length > 0 }
  }

  dims = {
    chest: mk(def?.chest, { writesTalent: true }),
    hip: mk(def?.hip, { writesTalent: true }),
    height: mk(def?.height, { writesTalent: false }),        // 身高：数值 → 档（派生标签），不写天赋
    penis: mk(def?.penis, { writesTalent: false, rolling: true, syncsMirror: true }),  // 男用 + 镜像
  }
  dims.chest.key = BUST
  dims.hip.key = HIP
  dims.height.key = HEIGHT
  dims.penis.key = PENIS
}

function dim(d: 'chest' | 'hip' | 'height' | 'penis'): DimRuntime {
  if (!dims) buildDims()
  return dims![d]
}

function isApplicable(char: any, r: DimRuntime): boolean {
  const want = r.sexValue ?? rootSexValue
  return !!char?.base && char.base[SEX_ATTR] === want
}

// 档位查值：min 闭 max 开；低于首档/高于末档收边
function tierOf(r: DimRuntime, value: number): string | null {
  if (!r.enabled || typeof value !== 'number') return null
  if (value < r.tierBy.get(r.names[0])!.min) return r.names[0]
  for (const name of r.names) {
    const t = r.tierBy.get(name)!
    if (value >= t.min && value < t.max) return name
  }
  return r.names[r.names.length - 1]
}

function tierRank(r: DimRuntime, valueOrName: number | string): number {
  const name = typeof valueOrName === 'string' ? valueOrName : tierOf(r, valueOrName)
  return name ? r.names.indexOf(name) : -1
}

// 档位落地：写天赋（胸/臀）+ 同步镜像（阴茎 base.阴茎大小=rank）
function applyTier(char: any, r: DimRuntime, tierName: string): void {
  if (r.writesTalent) {
    if (!char.talents) char.talents = {}
    for (const name of r.names) {
      if (name === tierName) char.talents[name] = 1
      else delete char.talents[name]
    }
  }
  if (r.syncsMirror) {
    if (!char.base) char.base = {}
    char.base[PENIS_RANK] = tierRank(r, tierName)
  }
}

// 阴茎首触掷档：显式写了 阴茎大小=0/2/3（非默认值）→ 按该档内均匀取 cm（尊重作者意图）；
// 无值或=1（与 attributes 自动默认值不可区分）→ 按 5%/55%/30%/10% 掷档（h-ejaculation 原分布，
// 掷档语义随 body-shape-system 落地；h-ejaculation 的注册时回退已于 2026-08 架构复盘删除）
function rolledPenis(r: DimRuntime, char: any): string {
  const authored = char.base?.[PENIS_RANK]
  let rank = -1
  if (typeof authored === 'number' && authored !== 1 && Number.isInteger(authored) && r.names[authored]) {
    rank = authored
  } else {
    const roll = Math.random()
    rank = roll < 0.05 ? 0 : roll < 0.6 ? 1 : roll < 0.9 ? 2 : 3
  }
  return r.names[rank] ?? r.defaultTier
}

const warned = new Set<string>()
function warnOnce(char: any, r: DimRuntime, msg: string): void {
  const key = `${char?.id}:${r.key}:${msg}`
  if (warned.has(key)) return
  warned.add(key)
  errorReporter.report({
    source: 'body-shape-system',
    severity: 'warning',
    message: `角色 '${char?.id}' 身材数据不自治：${msg}`,
  })
}

// 一致化 + 懒物化（返回是否发生了写入）
function reconcile(char: any, r: DimRuntime): boolean {
  if (!char[PAYLOAD] || typeof char[PAYLOAD] !== 'object') char[PAYLOAD] = {}
  if (!char.talents) char.talents = {}
  if (!r.enabled) return false

  const present = r.writesTalent ? r.names.filter(n => char.talents[n]) : []
  const stored = char[PAYLOAD][r.key]

  // ① 有数值 → 数值权威：重算档（胸/臀写天赋；身高/阴茎确认档名 + 同步镜像）
  if (typeof stored === 'number') {
    const derived = tierOf(r, stored)
    if (!derived) return false
    if (r.writesTalent) {
      const autoRepaired = present.length !== 1 || present[0] !== derived
      if (autoRepaired && present.length && !present.includes(derived)) {
        warnOnce(char, r, `数值权威覆盖天赋：${present.join('、')} → ${derived}`)
      }
      applyTier(char, r, derived)
      return autoRepaired
    }
    if (r.syncsMirror && char.base?.[PENIS_RANK] !== tierRank(r, derived)) {
      applyTier(char, r, derived)
      return true
    }
    return false
  }

  // ② 无数值只有单一档（仅胸/臀）→ 落该档最小值
  if (present.length === 1) {
    const t = r.tierBy.get(present[0])!
    char[PAYLOAD][r.key] = t.min
    applyTier(char, r, present[0])
    return true
  }

  // ③ 无数值但多档冲突（仅胸/臀）→ 保留最小档 + warning
  if (present.length > 1) {
    const keep = [...present].sort((a, b) => (r.tierBy.get(a)!.min) - (r.tierBy.get(b)!.min))[0]
    warnOnce(char, r, `多档冲突修复：保留 ${keep}，清除 ${present.filter(p => p !== keep).join('、')}`)
    applyTier(char, r, keep)
    char[PAYLOAD][r.key] = r.tierBy.get(keep)!.min
    return true
  }

  // ④ 无数值无天赋 → 默认档懒物化（阴茎走掷档）
  if (r.rolling) {
    const tierName = rolledPenis(r, char)
    const t = r.tierBy.get(tierName)!
    char[PAYLOAD][r.key] = t.min + Math.random() * (t.max - t.min)
    applyTier(char, r, tierName)
    return true
  }
  const t = r.tierBy.get(r.defaultTier)
  if (t) char[PAYLOAD][r.key] = t.min
  applyTier(char, r, r.defaultTier)
  return true
}

function getValue(charId: string, r: DimRuntime): number | null {
  const char = entitySystem.get('character', charId) as any
  if (!char || !r.enabled) return null
  if (!isApplicable(char, r)) return null
  reconcile(char, r)
  return typeof char[PAYLOAD]?.[r.key] === 'number' ? char[PAYLOAD][r.key] : null
}

function setValue(charId: string, r: DimRuntime, value: number): number | null {
  const char = entitySystem.get('character', charId) as any
  if (!char || !r.enabled) return null
  if (!isApplicable(char, r)) return null
  if (!char[PAYLOAD] || typeof char[PAYLOAD] !== 'object') char[PAYLOAD] = {}
  char[PAYLOAD][r.key] = value
  const derived = tierOf(r, value)
  if (derived) applyTier(char, r, derived)
  eventBus.emit('character:changed', { id: charId })
  return char[PAYLOAD][r.key]
}

// 当前档名（胸/臀 = 写回的天赋；身高/阴茎 = 派生标签）。内部先 reconcile。
function getTierLabel(charId: string, r: DimRuntime): string | null {
  const char = entitySystem.get('character', charId) as any
  if (!char || !r.enabled) return null
  if (!isApplicable(char, r)) return null
  reconcile(char, r)
  if (r.writesTalent) return r.names.find(n => char.talents?.[n]) ?? null
  const stored = char[PAYLOAD]?.[r.key]
  return typeof stored === 'number' ? tierOf(r, stored) : null
}

// ============ 长大/缩小原语（adjust）============
// 唯一的"增量写"通道——未来一切驱动器（吸收精液量→胸围、男角色类似等）只调这里，
// 不允许直接改 body_shape 负载（裸写虽然会被下次 reconcile 自愈，但会绕过事件/钳制）。
// - dim: 'bust' | 'hip' | 'height' | 'penis'（文档化 ASCII 键）
// - delta: 正=长大 负=缩小；结果钳制 ≥ 0（硬下限，2026 grill 拍板）
// - 流程：懒物化 → 钳制 → setValue（重算档/同步阴茎镜像/发 character:changed）→
//         发 body-shape:adjusted 专用事件（旧值/新值/实际增量/新档）
function dimByKey(dimKey: string): DimRuntime | null {
  if (dimKey === 'bust') return dim('chest')
  if (dimKey === 'hip') return dim('hip')
  if (dimKey === 'height') return dim('height')
  if (dimKey === 'penis') return dim('penis')
  return null
}

function adjustValue(charId: string, dimKey: string, delta: number): number | null {
  const r = dimByKey(dimKey)
  if (!r || !r.enabled) return null
  const old = getValue(charId, r)
  if (old === null) return null
  const next = Math.max(0, old + delta)
  if (next === old) return old
  const value = setValue(charId, r, next)   // setValue 已按 next 落档（互斥天赋/镜像）
  eventBus.emit('body-shape:adjusted', {
    id: charId,
    dim: dimKey,
    delta: next - old,       // 实际生效增量（钳制后）
    old,
    value,
    tier: tierOf(r, next),   // 与 setValue 落档同一语义，避免再次 reconcile
  })
  return value
}

// ============ 条件引擎代理域（counter-system 先例）============
// 条件写法：body_shape.selected.胸围 / body_shape.{charId}.臀围 / body_shape.{charId}.身高 /
//           body_shape.{charId}.阴茎长度
// 读时先 reconcile（懒物化正确——未消费的 [巨乳] 女孩也能 query 到 90）
export function resolvePath(segments: string[], ctx: any): any {
  const charKey = segments?.[0]
  const dimKey = segments?.[1]
  if (!charKey || !dimKey) return undefined

  let r: DimRuntime | null = null
  if (dimKey === BUST) r = dim('chest')
  else if (dimKey === HIP) r = dim('hip')
  else if (dimKey === HEIGHT) r = dim('height')
  else if (dimKey === PENIS) r = dim('penis')
  if (!r || !r.enabled) return undefined

  const charId = charKey === 'selected' ? (ctx?.selectedCharacterId ?? null) : charKey
  if (!charId) return undefined
  const v = getValue(charId, r)
  return typeof v === 'number' ? v : undefined
}

export function onLoad(_ctx: PluginContext): void {
  // 无效果/指令注册；逻辑全在 onEnable 的 API 中
}

export function onEnable(ctx: PluginContext): void {
  buildDims()
  // 注释：mod 切换/热更新后重建档位表（对齐 gain-rule-system 重载惯例）
  ctx.events.on('game:mod_loaded', () => {
    dims = null
    buildDims()
  })
  // 注释：重载时清 warning 去重缓存（引擎进程内全局内存，防跨 mod 误合并）
  ctx.events.on('game:mod_loaded', () => warned.clear())

  // 注释：条件代理域 body_shape.* —— 与 counter-system 同型（root 段转发）
  registerProxyDomain('body_shape', 'body-shape', 'resolvePath')

  // 注释：身高档前提 hgt_0..N-1（复刻 jj_0~3 的形态）——查 actor（sourceId）的身高档 rank。
  // 阴茎档的 jj_0~3 前提**不在这里**：它们由 h-ejaculation 注册、读 base.阴茎大小 派生镜像，
  // 本系统保证镜像新鲜（reconcile/set 时同步）→ talk-common/h-core 零改动兼容。
  {
    const heightDim = dim('height')
    const count = Math.max(1, heightDim.names.length)
    for (let i = 0; i < count; i++) {
      const idx = i
      conditionEngine.registerPremise(`hgt_${idx}`, (pctx: GameContext) => {
        const actorId = pctx.sourceId ?? pctx.player?.id ?? null
        const actor = actorId ? entitySystem.get('character', actorId) as any : null
        if (!actor) return false
        const r = dim('height')
        if (!isApplicable(actor, r)) return false
        reconcile(actor, r)
        const stored = actor[PAYLOAD]?.[r.key]
        if (typeof stored !== 'number') return false
        return tierRank(r, stored) === idx
      })
    }
  }

  ctx.api.register('body-shape', {
    // 尺寸(cm)——懒物化后返回；性别不符/未配置返回 null
    getBust: (charId: string): number | null => getValue(charId, dim('chest')),
    getHip: (charId: string): number | null => getValue(charId, dim('hip')),
    getHeight: (charId: string): number | null => getValue(charId, dim('height')),
    getPenisLength: (charId: string): number | null => getValue(charId, dim('penis')),
    // 写尺寸——更新数值 + 重算对应档（胸/臀互斥写天赋；阴茎同步镜像）+ 发 character:changed
    setBust: (charId: string, cm: number): number | null => setValue(charId, dim('chest'), cm),
    setHip: (charId: string, cm: number): number | null => setValue(charId, dim('hip'), cm),
    setHeight: (charId: string, cm: number): number | null => setValue(charId, dim('height'), cm),
    setPenisLength: (charId: string, cm: number): number | null => setValue(charId, dim('penis'), cm),
    // 当前档名（胸/臀 = 天赋名如 巨乳；身高/阴茎 = 派生标签）；内部先 reconcile
    getChestTalent: (charId: string): string | null => getTierLabel(charId, dim('chest')),
    getHipTalent: (charId: string): string | null => getTierLabel(charId, dim('hip')),
    getHeightTier: (charId: string): string | null => getTierLabel(charId, dim('height')),
    getPenisTier: (charId: string): string | null => getTierLabel(charId, dim('penis')),
    // 长大/缩小原语：adjust(charId, 'bust'|'hip'|'height'|'penis', delta)
    // 正=长大 负=缩小；结果钳制 ≥0；发 character:changed + body-shape:adjusted
    adjust: (charId: string, dimKey: string, delta: number): number | null => adjustValue(charId, dimKey, delta),
    // 条件代理域转发目标（registerProxyDomain('body_shape', 'body-shape', this)）
    resolvePath,
  })
}