// 注释：公式中间量通道（formula channels）——combat-base 通用机制层
// 目的：让效果/天赋能"给公式的某一步加值"（如 风格系数×1.1、命中率+10%、无视防御），
//       而不是只能改那 7 个固定统计键。
// 分层：本文件**不认识任何具体通道名**——通道名是不透明字符串，由上层插件（combat-wuxia）
//       或 mod 数据注册与解释。combat-base 只提供：聚合 / 叠加 / 注入 / 明细。
//
// 语义（唯一权威定义）：
//   base' = set ?? base            （set 覆盖基准，多个 set 取最后写入者）
//   value = (base' + flat) × (1 + percent)
//   stack 缩放由调用方负责（与 accumulateStat 一致：value × max(1, stack)）

export type ChannelMode = 'flat' | 'percent' | 'set'

export interface ChannelMod {
  flat: number
  percent: number
  set?: number
}

/** 通道包：通道名 → 修正。战斗本地态，随效果区/相位 overlay 存活 */
export type ChannelBag = Record<string, ChannelMod>

export interface ChannelDef {
  id: string
  label?: string
  description?: string
  /** 注册来源（插件 id），仅用于文档/校验提示 */
  source?: string
}

/** 公式明细记录（调参/UI/校验用；环形缓冲，不入存档） */
export interface FormulaRecord {
  hook: string
  sourceId?: string
  targetId?: string
  skillId?: string | null
  hitIdx?: number
  /** 该次公式的中间量实算值（如 力道项/武功威力/风格系数/命中率…） */
  parts: Record<string, number>
  /** 参与该次公式的通道修正（合并后的最终值） */
  channels: { source: ChannelBag; target: ChannelBag }
  /** 公式输出值（未走后续管线前的原始值） */
  value: number
}

// ── 通道注册表 ───────────────────────────────────────────────────────────

const channelDefs = new Map<string, ChannelDef>()

/** 注册通道定义（幂等覆盖——热重载/重复启用安全） */
export function registerChannel(def: ChannelDef): void {
  if (!def || typeof def.id !== 'string' || def.id.length === 0) return
  channelDefs.set(def.id, { ...def })
}

export function getChannelDefs(): ChannelDef[] {
  return [...channelDefs.values()]
}

export function getChannelIds(): string[] {
  return [...channelDefs.keys()]
}

export function hasChannel(id: string): boolean {
  return channelDefs.has(id)
}

/** 清空注册表（测试模块重置用） */
export function clearChannels(): void {
  channelDefs.clear()
}

// ── 通道包运算 ───────────────────────────────────────────────────────────

export function zeroChannelBag(): ChannelBag {
  return {}
}

/** 累加一条修正。flat/percent 为 0 时跳过（避免空条目污染明细）；set 即使为 0 也记录（防御 set=0 = 无视防御） */
export function accumulateChannel(bag: ChannelBag, channel: string, mode: ChannelMode, value: number): void {
  if (!channel || typeof value !== 'number' || !Number.isFinite(value)) return
  if (mode !== 'set' && value === 0) return
  const mod = bag[channel] ?? (bag[channel] = { flat: 0, percent: 0 })
  if (mode === 'percent') mod.percent += value
  else if (mode === 'set') mod.set = value
  else mod.flat += value
}

/** 合并通道包（flat/percent 相加；set 后者覆盖） */
export function mergeChannelBags(...bags: (ChannelBag | undefined | null)[]): ChannelBag {
  const out: ChannelBag = {}
  for (const bag of bags) {
    if (!bag) continue
    for (const channel of Object.keys(bag)) {
      const m = bag[channel]
      if (!m) continue
      const target = out[channel] ?? (out[channel] = { flat: 0, percent: 0 })
      target.flat += m.flat ?? 0
      target.percent += m.percent ?? 0
      if (m.set !== undefined) target.set = m.set
    }
  }
  return out
}

export function isChannelBagEmpty(bag: ChannelBag | undefined | null): boolean {
  if (!bag) return true
  for (const k of Object.keys(bag)) {
    const m = bag[k]
    if (!m) continue
    if (m.flat !== 0 || m.percent !== 0 || m.set !== undefined) return false
  }
  return true
}

/** 应用一条通道修正：base' = (set ?? base + flat) × (1 + percent) */
export function applyChannel(base: number, mod: ChannelMod | undefined): number {
  if (!mod) return base
  const b = mod.set !== undefined ? mod.set : base
  return (b + (mod.flat ?? 0)) * (1 + (mod.percent ?? 0))
}

export function channelOf(bag: ChannelBag | undefined, channel: string): ChannelMod | undefined {
  return bag?.[channel]
}

// ── 钩子返回值归一化 ─────────────────────────────────────────────────────

/**
 * 覆盖型公式钩子的返回值归一化：
 *   number                              → { value, parts: {} }        （向后兼容）
 *   { damage|value, parts? }            → { value, parts }
 */
export function normalizeFormulaResult(raw: any): { value: number; parts: Record<string, number> } {
  if (typeof raw === 'number') {
    return { value: Number.isFinite(raw) ? raw : 0, parts: {} }
  }
  if (raw && typeof raw === 'object') {
    const v = typeof raw.value === 'number' ? raw.value
      : (typeof raw.damage === 'number' ? raw.damage : 0)
    const parts = raw.parts && typeof raw.parts === 'object' && !Array.isArray(raw.parts)
      ? (raw.parts as Record<string, number>)
      : {}
    return { value: Number.isFinite(v) ? v : 0, parts }
  }
  return { value: 0, parts: {} }
}

// ── 明细格式化（叙事日志/调试指令用） ────────────────────────────────────

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2)
}

/** 通道包 → 文本（如 "风格系数 ×1.10"） */
export function formatChannelBag(bag: ChannelBag | undefined): string {
  if (!bag) return ''
  const parts: string[] = []
  for (const channel of Object.keys(bag)) {
    const m = bag[channel]
    if (!m) continue
    const bits: string[] = []
    if (m.set !== undefined) bits.push(`set ${fmtNum(m.set)}`)
    if (m.flat) bits.push(`+${fmtNum(m.flat)}`)
    if (m.percent) bits.push(`${m.percent > 0 ? '+' : ''}${fmtNum(m.percent * 100)}%`)
    if (bits.length === 0) continue
    parts.push(`${channel} ${bits.join(' ')}`)
  }
  return parts.join('；')
}

/** 中间量明细 → 文本（如 "力道项=300 武功威力=90 …"） */
export function formatParts(parts: Record<string, number> | undefined): string {
  if (!parts) return ''
  return Object.keys(parts)
    .filter(k => typeof parts[k] === 'number')
    .map(k => `${k}=${fmtNum(parts[k])}`)
    .join('  ')
}
