// 战斗效果条目（契约 v4.0）——"库定义 + 技能引用"的解析层
//
// 一个战斗效果分两半：
//   · 库定义（definitions/battle-effects.toml 的 [effects.XXX]）——落地方式/时机/目标/结算动作/默认数值
//   · 技能引用（abilities[].battle_effects 的 { effect = "XXX", 参数… }）——只覆盖参数白名单
// 本文件把两者解析成一条可直接执行的条目。
//
// 分层：本文件**不认识任何具体动作名、通道名、属性名**——动作/通道的语义由注册它们的一方解释。
//
// 三种相位字段（互斥，不再一词两义）：
//   instant 条目：trigger  = 发生相位（如饮血 attack_end）
//   zone   条目：settle   = 驻留期间的结算相位（如流血 turn_start）；缺省 = 常驻修正（不进相位）
//                apply_at = 何时施加（缺省按 target 推导：enemy→on_hit、self→on_use）
//
// 数值三形态（value）：
//   value = 20                              → { flat: 20 }        固定数
//   value = { percent = 0.05 }              → 比例（基准由动作定义：最大气血/内力/本次伤害/原值）
//   value = { flat = 10, percent = 0.05 }   → 比例 + 固定
//   value = { set = 0 }                     → 覆盖基准（仅通道：防御 set 0 = 无视防御）
// 层数缩放（growth，乘性）：
//   value(层) = 基础值 × (1 + growth × (层数 − 1))
//   破绽  -0.5 × (1+0.5(k−1)) = −50/−75/−100%
//   火毒   0.05 × (1+0.5(k−1)) = 5%/7.5%/10%
//   毒     (1%气血上限+0.1M) × (1+0.25(k−1))

export type EffectDelivery = 'zone' | 'instant'
export type MergeMode = 'refresh' | 'stack' | 'strongest'

/**
 * 实例来源——**战斗状态**（zone 里的东西）是被谁弄出来的：
 *   · skill   ：技能施展时的效果条目（"技能词条"）挂上去的
 *   · passive ：被动技在战斗开始时常驻编译进效果区
 *   · talent  ：战斗天赋同上
 *   · system  ：插件 API / mod 脚本直接挂（mountEffect / mountResolved）
 * UI 用它把"被技能挂的 BUFF/DEBUFF"与"被动/天赋的常驻条目"分开显示（不必解析 id 字符串）。
 */
export type EffectOrigin = 'skill' | 'passive' | 'talent' | 'system'

/** 数值：固定项 + 比例项（+ 仅通道使用的覆盖项） */
export interface EffectValue {
  flat: number
  percent: number
  /** 覆盖基准（仅 modify_channel：防御 set 0 = 无视防御） */
  set?: number
}

/** 库条目（battle-effects.toml 的 [effects.XXX] 原始形态）——类型定义单一来源在 core/mod-types.ts */
export type { BattleEffectDef as EffectDef } from '../../core/mod-types'
import type { BattleEffectDef } from '../../core/mod-types'


/** 实例规格：挂到身上（zone）或就地执行（instant）时这条效果的全部参数 */
export interface EffectInstanceSpec {
  /** 实例触发相位（zone = settle；instant = 发生相位） */
  trigger?: string
  /** 实际执行动作 */
  action: string
  duration: 'battle' | 'permanent' | { turns: number }
  category: 'buff' | 'debuff' | 'neutral'
  merge: MergeMode
  maxStack: number
  stacks: number
  value: EffectValue
  growth: number
  priority: number
  condition?: string
  whenSkill?: string
  minLevel?: number
  stat?: string
  channel?: string
  skill?: string
  levelNames?: string[]
  uses?: number
  /** extra_attack 用：每次行动最大追加次数（缺省 1；0 = 不限） */
  maxPerAction?: number
}

/** 解析结果：技能条目 / 库条目统一形态 */
export interface ResolvedEffect {
  id: string
  name?: string
  description?: string
  delivery: EffectDelivery
  /** 作用对象（zone = 挂给谁；instant = 作用谁） */
  target: 'self' | 'enemy'
  chance: number
  /** 本条条目**自己**发生的相位：zone = 施加相位；instant = 发生相位 */
  at?: string
  /** 本条条目**自己**的动作：zone 恒为 mount_effect；instant = 实际动作 */
  action: string
  /** 库条目的施加器（zone） */
  apply?: string
  applyArgs?: Record<string, any>
  paramLabels?: Record<string, string>
  spec: EffectInstanceSpec
}

/** 技能行可覆盖的参数白名单（= 参数词汇表；UI 直接渲染这份表） */
export const PARAM_VOCAB: { key: string; label: string; type: string; desc: string }[] = [
  { key: 'chance', label: '触发几率', type: 'percent', desc: '0–1（UI 显示 0–100%）；缺省 1；多段技按段掷' },
  { key: 'value', label: '数值', type: 'number|{flat,percent}', desc: '固定数 / 比例 / 比例+固定；语义随效果' },
  { key: 'growth', label: '每层增量', type: 'number', desc: '乘性：value × (1+growth×(层数−1))；缺省 0' },
  { key: 'stacks', label: '层数', type: 'int', desc: '施加时的初始层数；缺省 1' },
  { key: 'turns', label: '持续回合', type: 'int', desc: '覆盖库条目 duration' },
  { key: 'merge', label: '叠加方式', type: 'enum', desc: 'refresh（只刷时长）/ stack（累加）/ strongest（取高层数）' },
  { key: 'max_stack', label: '层数上限', type: 'int', desc: 'merge=stack 时的上限' },
  { key: 'uses', label: '次数上限', type: 'int', desc: '触发 N 次后移除（如封穴 1 次）' },
  { key: 'priority', label: '优先级', type: 'int', desc: '同相位内大者先结算' },
  { key: 'condition', label: '触发条件', type: 'enum', desc: 'target_has_debuff/target_has_buff/self_has_debuff/self_has_buff' },
  { key: 'when_skill', label: '限定技能', type: 'string', desc: '只在施展该技能时参与' },
  { key: 'min_level', label: '解锁等级', type: 'int', desc: '技能等级 ≥ N 才参与' },
]

export const PARAM_WHITELIST: Set<string> = new Set(PARAM_VOCAB.map(p => p.key))

/** zone 型引用的统一入口动作名（combat-base 注册；把库条目按 apply 施加器挂到目标身上） */
export const MOUNT_ACTION = 'mount_effect'

/** 缺省生命周期（zone 型条目没写 duration 时） */
export const DEFAULT_ZONE_TURNS = 5

// ── 战斗统计键（modify_stat 的落点；单位分两组，用错不静默换算）──────────

/** 点数组：吃 value.flat（hit_bonus/dodge_bonus/crit_rate） */
export const POINT_STATS = new Set(['hit_bonus', 'dodge_bonus', 'crit_rate'])
/** 倍率组：吃 value.percent（crit_mul/damage_out/damage_in/defense_mult） */
export const RATIO_STATS = new Set(['crit_mul', 'damage_out', 'damage_in', 'defense_mult'])
/** 全部统计键（校验用） */
export const STAT_KEYS: Set<string> = new Set([...POINT_STATS, ...RATIO_STATS])

// ── 数值归一化与求值 ────────────────────────────────────────────────────

export function normalizeValue(raw: any): EffectValue {
  if (typeof raw === 'number' && Number.isFinite(raw)) return { flat: raw, percent: 0 }
  if (raw && typeof raw === 'object') {
    const out: EffectValue = {
      flat: num(raw.flat),
      percent: num(raw.percent),
    }
    if (typeof raw.set === 'number' && Number.isFinite(raw.set)) out.set = raw.set
    return out
  }
  return { flat: 0, percent: 0 }
}

/** 层数缩放：value(层) = 基础值 × (1 + growth×(层−1))；set 不缩放 */
export function scaleValue(v: EffectValue, growth: number, stack: number): EffectValue {
  const m = 1 + (Number.isFinite(growth) ? growth : 0) * Math.max(0, (stack || 1) - 1)
  const out: EffectValue = { flat: v.flat * m, percent: v.percent * m }
  if (v.set !== undefined) out.set = v.set
  return out
}

/** 数值落到具体量：flat + percent × 基准（基准由动作定义） */
export function valueAmount(v: EffectValue, basis: number): number {
  return v.flat + v.percent * basis
}

/** 该数值是否有内容（用于校验"给没给数值"） */
export function isValueEmpty(v: EffectValue): boolean {
  return v.flat === 0 && v.percent === 0 && v.set === undefined
}

export function normalizeDuration(
  raw: any, delivery: EffectDelivery,
): 'battle' | 'permanent' | { turns: number } {
  if (typeof raw === 'number' && Number.isFinite(raw)) return { turns: Math.max(1, Math.round(raw)) }
  if (raw === 'battle' || raw === 'permanent') return raw
  if (raw && typeof raw === 'object' && typeof raw.turns === 'number') {
    return { turns: Math.max(1, Math.round(raw.turns)) }
  }
  return delivery === 'zone' ? { turns: DEFAULT_ZONE_TURNS } : 'battle'
}

/** 层数→显示名（缺省 "名字 x层"，1 层只显名字） */
export function displayNameOf(name: string, levelNames: string[] | undefined, stack: number): string {
  const k = Math.max(1, Math.round(stack || 1))
  const custom = levelNames?.[k - 1]
  if (typeof custom === 'string' && custom.length > 0) return custom
  return k > 1 ? `${name} x${k}` : name
}

// ── 引用解析 ────────────────────────────────────────────────────────────

export type ResolveResult =
  | { ok: true; entry: ResolvedEffect }
  | { ok: false; error: string }

/**
 * 把技能里的一条引用（{ effect = "流血", chance = 0.3 } 或裸字符串 "流血"）与库定义合成一条可执行条目。
 * 只允许覆盖参数白名单；结构字段（action/target/时机/category/stat/channel）一律以库条目为准。
 */
export function resolveEffectRef(raw: any, defs: Record<string, any> | undefined | null): ResolveResult {
  const refId = typeof raw === 'string' ? raw : raw?.effect
  if (typeof refId !== 'string' || refId.length === 0) {
    return { ok: false, error: '缺少 effect 字段（要引用的战斗效果名）' }
  }
  const def = defs?.[refId] as BattleEffectDef | undefined
  if (!def) {
    return {
      ok: false,
      error: `引用了不存在的战斗效果 '${refId}'`,
    }
  }
  const r: Record<string, any> = raw && typeof raw === 'object' ? raw : {}
  for (const key of Object.keys(r)) {
    if (key === 'effect') continue
    if (!PARAM_WHITELIST.has(key)) {
      return {
        ok: false,
        error: `'${refId}' 的参数 '${key}' 不在参数白名单内（结构字段由库条目决定，要定制请单独写一条库条目）`,
      }
    }
  }

  const delivery: EffectDelivery = def.delivery === 'zone' ? 'zone' : 'instant'
  const target: 'self' | 'enemy' = def.target === 'self' ? 'self' : 'enemy'
  const settle = def.settle ?? (delivery === 'zone' ? undefined : def.trigger)
  const at = delivery === 'zone'
    ? (def.apply_at ?? (target === 'self' ? 'on_use' : 'on_hit'))
    : (def.trigger ?? def.settle)
  const duration = normalizeDuration(r.turns !== undefined ? { turns: r.turns } : def.duration, delivery)

  const entry: ResolvedEffect = {
    id: refId,
    name: def.name ?? refId,
    description: def.description,
    delivery,
    target,
    chance: clamp01(pickNum(r.chance, 1)),
    at,
    action: delivery === 'zone' ? MOUNT_ACTION : def.action,
    apply: def.apply,
    applyArgs: def.apply_args,
    paramLabels: def.param_labels,
    spec: {
      trigger: delivery === 'zone' ? settle : def.trigger,
      action: def.action,
      duration,
      category: def.category ?? 'neutral',
      merge: (r.merge ?? def.merge ?? 'refresh') as MergeMode,
      maxStack: Math.max(1, Math.round(pickNum(r.max_stack, def.max_stack ?? 99))),
      stacks: Math.max(1, Math.round(pickNum(r.stacks, 1))),
      value: normalizeValue(r.value !== undefined ? r.value : def.value),
      growth: pickNum(r.growth, def.growth ?? 0),
      priority: Math.round(pickNum(r.priority, def.priority ?? 0)),
      condition: r.condition ?? def.condition,
      whenSkill: r.when_skill ?? def.when_skill,
      minLevel: r.min_level ?? def.min_level,
      stat: def.stat,
      channel: def.channel,
      skill: def.skill,
      levelNames: def.level_names,
      uses: r.uses ?? def.uses,
      maxPerAction: Math.max(0, Math.round(pickNum(def.max_per_action, 1))),
    },
  }
  if (entry.spec.merge !== 'refresh' && entry.spec.merge !== 'stack' && entry.spec.merge !== 'strongest') {
    return { ok: false, error: `'${refId}' 的 merge '${(entry.spec as any).merge}' 非法（refresh/stack/strongest）` }
  }
  return { ok: true, entry }
}

/** 条目分类（推导，不新增作者字段）：用于手册与将来的拖拽 UI 分组 */
export function classifyEffect(entry: { delivery: EffectDelivery; target: 'self' | 'enemy'; at?: string; spec: EffectInstanceSpec }): string {
  const phase = entry.delivery === 'zone' ? (entry.spec.trigger ?? '') : (entry.at ?? '')
  if (entry.delivery === 'zone') {
    return entry.target === 'self' ? '自身状态' : '命中后·挂状态'
  }
  // instant：整招结束后判定 = 攻击后；每段命中链路 = 命中后·即时；其余 = 出手时·即时
  if (phase === 'action_end') return '攻击后'
  if (phase === 'on_hit' || phase === 'attack_end' || phase.startsWith('damage_')) return '命中后·即时'
  return '出手时·即时'
}

/** 该条目实际用到的可覆盖参数（手册/UI 用） */
export function usedParams(entry: ResolvedEffect): string[] {
  const used: string[] = ['chance']
  const v = entry.spec.value
  if (isValueEmpty(v)) used.push('value')
  if (entry.spec.growth) used.push('growth')
  if (entry.spec.stacks !== 1) used.push('stacks')
  if (typeof entry.spec.duration === 'object') used.push('turns')
  if (entry.spec.merge !== 'refresh') used.push('merge')
  if (entry.spec.maxStack !== 99) used.push('max_stack')
  if (entry.spec.uses !== undefined) used.push('uses')
  return used
}

// ── 工具 ────────────────────────────────────────────────────────────────

function num(v: any): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function pickNum(v: any, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
