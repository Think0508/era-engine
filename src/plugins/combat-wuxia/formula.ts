// 注释：combat-wuxia 公式层（纯函数 + 中间量通道词表）——2026-09-11 合同 v1.2（毒）
//
// ⚠️ 侧前缀命名铁律（2026-09-11）：技能侧与人物侧存在**同名维度**，一律带侧前缀，杜绝
//    "用人物厚重去改技能厚重"这类串线：
//      技能侧四维：技能轻灵 / 技能厚重 / 技能巧技 / 技能毒性   ← 技能 style 表（可缺省 = 0）
//      人物侧四维：人物轻灵 / 人物厚重 / 人物巧技 / 人物毒功   ← 角色 base 属性（人物毒功=第四维积累值）
//    风格系数只用前三维（技能三维 × 人物三维）；精通系数只吃人物三维；
//    技能毒性 / 人物毒功 走独立毒线（毒功系数、毒功精通系数）——**不进风格系数与精通系数**。
//    除数差异也是绊线：技能侧 /1000、人物侧 /50、毒功精通 /200。
//
// 公式（唯一权威定义；index.ts 的钩子只做取值与接线）：
//   命中：准头 = 轻功系数×2 + 灵敏×1（各自下限 0）
//         比率 r = 准头攻 /(准头攻 + 准头守)（双方全 0 → 0.5）
//         命中率 = 90 + (r − 0.5)×180 + 攻方 hit_bonus − 守方 dodge_bonus
//                  + 通道「命中率」(0 基准) − 通道「闪避率」(0 基准)   ← 不截断
//   伤害（每段一次；标准系/暗毒系）：
//         力道项 = 力道×3（暗毒系：灵敏×3）
//         武功威力 = power × 威力曲线(L) / 段数
//         伤害 = (力道项 + 武功威力 + 武器项) × (1 + 武功系数/1000) × 风格系数 × 精通系数
//                + 当前内力/25 + 其他加成
//   毒（v1.2）：
//         M = 该段武功威力 × (1 + 暗毒系数/1000) × 毒功系数 × 毒功精通系数
//         毒功系数 = (1 + 技能毒性/1000) × (1 + 人物毒功/50)
//         毒功精通系数 = 1 + 人物毒功/200
//         即时：M′ = M 过通道「毒伤害」→ 并入该段基础伤害（同一次判定）
//         持续：每回合开始 (1 + 0.25×(k−1)) × (1%×目标气血上限 + M×0.1) → 过「毒伤害」→ 扣血
//   防御：根骨×0.8 + 定力×0.5（再 ×(1+defense_mult)，最后套通道「防御」）
//
// ⚠️ 本文件不 import combat-base（父插件源文件——引擎在加载时建立链接，不跨插件 import）。
//    通道读取/应用在此按 combat-base/formula-channels.ts 的同一语义本地实现（3 行），
//    语义一致性由 formula-channels.test.ts 的交叉断言守住。

export type ChannelMode = 'flat' | 'percent' | 'set'

export interface ChannelMod { flat: number; percent: number; set?: number }
export type ChannelBag = Record<string, ChannelMod>

/** 通道应用：base' = set ?? base ；value = (base' + flat) × (1 + percent) */
export function applyChannel(base: number, mod: ChannelMod | undefined): number {
  if (!mod) return base
  const b = mod.set !== undefined ? mod.set : base
  return (b + (mod.flat ?? 0)) * (1 + (mod.percent ?? 0))
}

export function channelOf(bag: ChannelBag | undefined, channel: string): ChannelMod | undefined {
  return bag?.[channel]
}

// ── 通道词表（天赋/效果常改、且改属性达不到的介入点）─────────────────────
// 判据：① 天赋常改 ② 改属性达不到 ③ 改完影响本次计算
// 被剪掉的（改属性即可表达、或已有统计键落点）：武器项/武功系数/精通系数/内力项/
//   基础命中率/K/准头比率（属性或常量）、基础伤害/受伤/暴击率/暴击倍率（= damage_out/damage_in/
//   crit_rate/crit_mul 既有统计键）。要加回来 = 注册表加一行 + 公式里读一行。
//   （注：力道项/灵敏项曾在此列，后为「截脉」加回并注册——见下面 CH.STAT_POWER / CH.STAT_AGI）

export const CH = {
  /** 先攻值（initiative） */
  INIT: '先攻',
  /** 最终命中率附加（攻方，0 基准） */
  HIT: '命中率',
  /** 命中率扣减（守方，0 基准） */
  DODGE: '闪避率',
  /** 浮动系数（默认 0.9–1.1 随机） */
  FLOAT: '浮动系数',
  /** 防御值（set 0 = 无视防御） */
  DEFENSE: '防御',
  /** 最终伤害（扣防御**之后**的最后一道修正；攻守双方写入合并后只应用一次。set 0 = 免疫该次伤害） */
  FINAL: '最终伤害',
  /** 该段武功威力 */
  POWER: '武功威力',
  /** 风格系数 */
  STYLE: '风格系数',
  /** 公式末尾平加伤害（只认 flat/set） */
  EXTRA: '其他加成',
  /** 毒伤害减免（v1.2：即时毒伤与持续毒伤共用；set 0 = 免疫毒伤） */
  POISON: '毒伤害',
  /** 准头（攻/守两侧，0 基准之上的比例修正）：失势 = 守方 ×0.5、致盲 = 攻方 ×0.7 */
  AIM: '准头',
  /** 伤害公式的属性分项（力道×3 / 灵敏×3）：截脉 = 力道项 ×0.7 */
  STAT_POWER: '力道项',
  STAT_AGI: '灵敏项',
} as const

export interface WuxiaChannelDef {
  id: string
  label: string
  description: string
}

export const WUXIA_CHANNEL_DEFS: WuxiaChannelDef[] = [
  { id: CH.INIT, label: '先攻', description: '先攻比较值（默认 = 轻功系数）：flat/percent/set' },
  { id: CH.HIT, label: '命中率', description: '最终命中率附加（攻方，0 基准；flat=点数，percent=倍率，set=覆盖贡献，如 set 999 = 必中）' },
  { id: CH.DODGE, label: '闪避率', description: '守方侧命中率扣减（0 基准；与「命中率」相减）' },
  { id: CH.FLOAT, label: '浮动系数', description: '伤害浮动（默认 0.9–1.1；set 1.0 = 稳定输出）' },
  { id: CH.DEFENSE, label: '防御', description: '防御值（根骨×0.8+定力×0.5；flat=平加，percent=倍率，set 0 = 无视防御）' },
  { id: CH.FINAL, label: '最终伤害', description: '扣防御**之后**的最后一道修正（flat=平加，percent=倍率，set 0 = 该次伤害归 0）；攻守双方的修正合并后只应用一次' },
  { id: CH.POWER, label: '武功威力', description: '该段武功威力（power×威力曲线/段数）：flat/percent/set' },
  { id: CH.STYLE, label: '风格系数', description: '风格系数 (轻²+厚²+巧²)/(轻+厚+巧)：flat=平加，percent=×1.1 类加成，set=覆盖' },
  { id: CH.EXTRA, label: '其他加成', description: '公式末尾平加伤害（只认 flat/set；percent 对 0 基准无效）' },
  { id: CH.POISON, label: '毒伤害', description: '毒伤害减免（即时毒伤与持续毒伤共用；flat 平减、percent 百分比、set 0 = 免疫毒伤。只作用于伤害数字，不阻止挂毒）' },
  { id: CH.AIM, label: '准头', description: '准头（轻功系数×2+灵敏）的比例修正：percent -0.5 = 闪避/命中能力减半（失势/致盲用它；「命中率/闪避率」是 0 基准，percent 对它们无效）' },
  { id: CH.STAT_POWER, label: '力道项', description: '伤害公式的力道项（力道×3）的比例修正：percent -0.3 = 力道减三成（截脉用它）' },
  { id: CH.STAT_AGI, label: '灵敏项', description: '暗毒系伤害公式的灵敏项（灵敏×3）的比例修正' },
]

// ── 侧前缀类型（技能侧四维 / 人物侧四维）────────────────────────────────

/** 技能 style 表四维（可缺省；武功无该系风格 = 0） */
export interface SkillStyleValues {
  轻灵?: number
  厚重?: number
  巧技?: number
  毒性?: number
}

/** 人物四维（角色 base 属性；人物毒功 = 与轻灵/厚重/巧技同档的第四维积累值） */
export interface CharStyleValues {
  轻灵?: number
  厚重?: number
  巧技?: number
  毒功?: number
}

/** 通道 v1.1 向后兼容别名（技能侧） */
export type StyleValues = SkillStyleValues | undefined

// ── 公式常量（常量即不注册通道；要变成可被天赋改，注册通道再读即可）────────

export const BASE_HIT_RATE = 90      // 基础命中率（%）
export const HIT_K = 180             // 准头比率修正幅度（%）
export const AIM_W_QINGGONG = 2      // 准头 = 轻功系数×2 + 灵敏×1
export const AIM_W_AGI = 1
export const COEFF_DIVISOR = 1000    // 武功系数 → 1 + 系数/1000
export const SKILL_STYLE_DIVISOR = 1000   // 技能风格/技能毒性除数
export const CHAR_STYLE_DIVISOR = 50      // 人物风格/人物毒功除数
export const MASTERY_DIVISOR = 250        // 精通系数 = 1 + 人物三值和/250
export const POISON_MASTERY_DIVISOR = 200 // 毒功精通系数 = 1 + 人物毒功/200
export const POISON_HP_RATE = 0.01        // 持续毒伤：1% × 目标气血上限
export const POISON_M_RATE = 0.1          // 持续毒伤：M × 0.1
export const POISON_K_STEP = 0.25         // 持续毒伤：k 每级 +25%
export const DEF_CON = 0.8
export const DEF_WILL = 0.5
export const MP_DIVISOR = 25

/** 人物风格三维（风格系数/精通系数的输入维度——毒功不在此列） */
export const STYLE_KEYS = ['轻灵', '厚重', '巧技'] as const
/** 技能风格四维（技能 style 表允许的键；毒性走独立毒线，不进风格/精通系数） */
export const SKILL_STYLE_KEYS = ['轻灵', '厚重', '巧技', '毒性'] as const

/** 准头 = 轻功系数×2 + 灵敏×1（各项下限 0——负值属性不应反向加权） */
export function aimValue(qinggong: number, agi: number): number {
  return Math.max(0, qinggong) * AIM_W_QINGGONG + Math.max(0, agi) * AIM_W_AGI
}

// ── 命中公式 ─────────────────────────────────────────────────────────────

export interface HitRateInput {
  attacker: { qinggong: number; agi: number; hitBonus: number }
  defender: { qinggong: number; agi: number; dodgeBonus: number }
  channels: { source: ChannelBag; target: ChannelBag }
}

export function computeHitRate(input: HitRateInput): { value: number; parts: Record<string, number> } {
  const atkAimBase = aimValue(input.attacker.qinggong, input.attacker.agi)
  const defAimBase = aimValue(input.defender.qinggong, input.defender.agi)
  // 通道「准头」：对现算准头做比例修正（percent -0.5 = 准头减半 → 失势/致盲的落点）
  const atkAim = Math.max(0, applyChannel(atkAimBase, channelOf(input.channels.source, CH.AIM)))
  const defAim = Math.max(0, applyChannel(defAimBase, channelOf(input.channels.target, CH.AIM)))
  const total = atkAim + defAim
  const ratio = total > 0 ? atkAim / total : 0.5
  const base = BASE_HIT_RATE + (ratio - 0.5) * HIT_K
  // 命中率/闪避率通道以 0 为基准（纯加值/覆盖），不覆盖整条公式
  const hitChannel = applyChannel(0, channelOf(input.channels.source, CH.HIT))
  const dodgeChannel = applyChannel(0, channelOf(input.channels.target, CH.DODGE))
  const value = base + input.attacker.hitBonus - input.defender.dodgeBonus + hitChannel - dodgeChannel
  return {
    value,
    parts: {
      准头攻基准: atkAimBase,
      准头攻: atkAim,
      准头守基准: defAimBase,
      准头守: defAim,
      准头比率: ratio,
      基础命中: base,
      攻方命中加成: input.attacker.hitBonus,
      守方闪避加成: input.defender.dodgeBonus,
      命中率通道: hitChannel,
      闪避率通道: dodgeChannel,
      命中率: value,
    },
  }
}

// ── 风格 / 精通 / 威力曲线 ───────────────────────────────────────────────

/** 风格三项得分：(1 + 技能值/1000) × (1 + 人物值/50)；武功无该系风格 → 技能值 0 */
export function styleScores(技能风格: SkillStyleValues | undefined, 人物风格: CharStyleValues | undefined): number[] {
  return STYLE_KEYS.map(k => {
    const 技能值 = typeof 技能风格?.[k] === 'number' ? 技能风格[k]! : 0
    const 人物值 = typeof 人物风格?.[k] === 'number' ? 人物风格[k]! : 0
    return (1 + 技能值 / SKILL_STYLE_DIVISOR) * (1 + 人物值 / CHAR_STYLE_DIVISOR)
  })
}

/** 风格系数 = (轻²+厚²+巧²)/(轻+厚+巧)（全 0 → 1.0）；只用前三维，毒不参与 */
export function styleCoefficient(技能风格: SkillStyleValues | undefined, 人物风格: CharStyleValues | undefined): number {
  const [a, b, c] = styleScores(技能风格, 人物风格)
  const sumSq = a * a + b * b + c * c
  const sum = a + b + c
  return sum > 0 ? sumSq / sum : 1
}

/** 精通系数 = 1 + (人物轻灵 + 人物厚重 + 人物巧技) / 250（单次乘法；只吃人物三维，毒功不参与） */
export function masteryCoefficient(人物风格: CharStyleValues | undefined): number {
  let sum = 0
  for (const k of STYLE_KEYS) sum += typeof 人物风格?.[k] === 'number' ? 人物风格[k]! : 0
  return 1 + sum / MASTERY_DIVISOR
}

/** 威力曲线：默认 0.7+0.05×(L−1)；power_curve 表（[[L, 系数],...]）取 ≤L 的最大档，超出取末档 */
export function powerCurve(def: any, level: number): number {
  const curve = def?.power_curve as [number, number][] | undefined
  if (Array.isArray(curve) && curve.length > 0) {
    let best = curve[0][1]
    for (const [lv, coef] of curve) {
      if (lv <= level) best = coef
      else break
    }
    return best
  }
  return 0.7 + 0.05 * (Math.max(1, level) - 1)
}

/** 防御基准值 = 根骨×0.8 + 定力×0.5 */
export function defenseBase(con: number, will: number): number {
  return con * DEF_CON + will * DEF_WILL
}

// ── 伤害公式 ─────────────────────────────────────────────────────────────

export interface DamageInput {
  /** 标准系 = 力道；暗毒系 = 灵敏 */
  stat: number
  /** true = 暗毒系（属性项名用「灵敏项」，且 stat 传灵敏） */
  dark: boolean
  /** 该段武功威力 = power × 威力曲线(L) / 段数 */
  power: number
  weaponBase: number
  /** 系别系数原值（公式内 /1000） */
  categoryCoeff: number
  /** 技能风格四维（缺省 = 武功无该系风格 → 0） */
  skillStyle?: SkillStyleValues
  /** 人物风格四维（轻/厚/巧；毒功不参与本式） */
  charStyle: CharStyleValues | undefined
  /** 战斗内实时内力（已扣技能消耗） */
  mp: number
  /** 攻击方通道包 */
  channels: ChannelBag | undefined
}

export interface DamageResult {
  value: number
  parts: Record<string, number>
}

export function computeStandardDamage(input: DamageInput): DamageResult {
  const statChannelName = input.dark ? CH.STAT_AGI : CH.STAT_POWER
  // 通道「力道项/灵敏项」：对属性分项做比例修正（percent -0.3 = 力道减三成 → 截脉的落点）
  const statTermBase = input.stat * 3
  const statTerm = Math.max(0, applyChannel(statTermBase, channelOf(input.channels, statChannelName)))
  const styleBase = styleCoefficient(input.skillStyle, input.charStyle)
  const mastery = masteryCoefficient(input.charStyle)

  // 通道：威力 / 风格系数 / 其他加成（其余分项不注册通道 → 原值）
  const power = applyChannel(input.power, channelOf(input.channels, CH.POWER))
  const style = applyChannel(styleBase, channelOf(input.channels, CH.STYLE))
  const extra = applyChannel(0, channelOf(input.channels, CH.EXTRA))
  const mpTerm = input.mp / MP_DIVISOR
  const coeffFactor = 1 + input.categoryCoeff / COEFF_DIVISOR

  const subtotal = statTerm + power + input.weaponBase
  const value = subtotal * coeffFactor * style * mastery + mpTerm + extra

  return {
    value,
    parts: {
      [statChannelName]: statTerm,
      武功威力: power,
      武器项: input.weaponBase,
      三项小计: subtotal,
      武功系数倍率: coeffFactor,
      风格系数: style,
      精通系数: mastery,
      内力项: mpTerm,
      其他加成: extra,
      基础伤害: value,
    },
  }
}

/** 空手平A：同一标准公式，武功威力 = 0、武功系数 = 0（暗毒不适用——平A按力道轴） */
export function computeDefaultAttack(input: Omit<DamageInput, 'power' | 'dark'>): DamageResult {
  return computeStandardDamage({ ...input, power: 0, dark: false })
}

// ── 毒伤害公式（v1.2；毒线：技能毒性 × 人物毒功） ────────────────────────

export interface PoisonBaseInput {
  /** 该段武功威力 = power × 威力曲线(L) / 段数 */
  技能威力: number
  /** 人物暗毒系数（毒固定吃暗毒系数，与技能自身系别无关） */
  人物暗毒系数: number
  /** 技能毒性（技能 style.毒性；缺省 0） */
  技能毒性: number
  /** 人物毒功（人物第四维积累值；缺省 0） */
  人物毒功: number
  /** 攻击方通道包（通道「毒伤害」减免） */
  channels?: ChannelBag
}

export interface PoisonBaseResult {
  /** M：基础毒伤害**原值**——写进毒 DEBUFF（持续毒伤每回合各自再减免一次） */
  M: number
  /** M′：过通道「毒伤害」后的值——并入本次命中的基础伤害 */
  M应用: number
  parts: Record<string, number>
}

export function computePoisonBase(input: PoisonBaseInput): PoisonBaseResult {
  const 暗毒倍率 = 1 + input.人物暗毒系数 / COEFF_DIVISOR
  const 毒功系数 = (1 + input.技能毒性 / SKILL_STYLE_DIVISOR) * (1 + input.人物毒功 / CHAR_STYLE_DIVISOR)
  const 毒功精通系数 = 1 + input.人物毒功 / POISON_MASTERY_DIVISOR
  const M = input.技能威力 * 暗毒倍率 * 毒功系数 * 毒功精通系数
  const M应用 = Math.max(0, applyChannel(M, channelOf(input.channels, CH.POISON)))
  return {
    M,
    M应用,
    parts: {
      技能威力: input.技能威力,
      暗毒倍率: 暗毒倍率,
      毒功系数: 毒功系数,
      毒功精通系数: 毒功精通系数,
      基础毒伤害: M,
      毒伤害减免后: M应用,
    },
  }
}

export interface PoisonDotInput {
  /** 毒等级 k（1=毒 / 2=猛毒 / 3=剧毒） */
  k: number
  /** 施加时快照的基础毒伤害原值 */
  M: number
  /** 目标气血上限 */
  maxHp: number
  /** 目标通道包（通道「毒伤害」减免） */
  channels?: ChannelBag
}

/** 毒伤原值 → 过通道「毒伤害」→ 取整（即时毒伤与持续毒伤共用同一减免落点） */
export function applyPoisonMitigation(raw: number, channels?: ChannelBag): number {
  return Math.max(0, Math.round(applyChannel(raw, channelOf(channels, CH.POISON))))
}

/** 单层持续毒伤基准 = 1%×气血上限 + M×0.1（层数倍率由实例的 growth 负责） */
export function poisonDotBase(maxHp: number, M: number): number {
  return maxHp * POISON_HP_RATE + M * POISON_M_RATE
}

/** 持续毒伤 = (1 + 0.25×(k−1)) × (1%×气血上限 + M×0.1) → 过通道「毒伤害」→ 取整 */
export function computePoisonDot(input: PoisonDotInput): DamageResult {
  const 等级倍率 = 1 + POISON_K_STEP * (input.k - 1)
  const 上限项 = input.maxHp * POISON_HP_RATE
  const M项 = input.M * POISON_M_RATE
  const raw = 等级倍率 * (上限项 + M项)
  const value = applyPoisonMitigation(raw, input.channels)
  return {
    value,
    parts: {
      毒等级: input.k,
      等级倍率: 等级倍率,
      上限项: 上限项,
      M项: M项,
      毒伤害原值: raw,
      毒伤害减免后: value,
      M快照: input.M,
    },
  }
}
