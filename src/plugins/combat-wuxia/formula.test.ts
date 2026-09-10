// 注释：combat-wuxia/formula.ts 纯函数测试——命中公式（准头比率式）/风格系数/精通系数/
// 威力曲线/防御基准/伤害公式（力道×3、暗毒灵敏×3、系数 /1000、多段、平A）与通道应用
import { describe, it, expect } from 'vitest'
import {
  BASE_HIT_RATE, HIT_K, aimValue, computeDefaultAttack, computeHitRate, computePoisonBase,
  computePoisonDot, computeStandardDamage, defenseBase, masteryCoefficient, powerCurve,
  styleCoefficient, styleScores, SKILL_STYLE_KEYS,
} from './formula'

// 面板（与 combat-wuxia.test.ts 同源）
const CHAR_STYLE = { 轻灵: 40, 厚重: 40, 巧技: 30 }
const PLAYER = { qinggong: 50, agi: 80 }
const ENEMY = { qinggong: 30, agi: 60 }
const noChannels = { source: {}, target: {} }

// ⚠️ 中间量名属"结构数据"，不是 attributes.toml 属性——中文 key 必须经变量/helper 间接取
// （scan-attr-refs 契约：`obj['中文']` 会被判为属性引用）
const part = (parts: any, key: string): any => parts?.[key]

describe('formula：准头与命中', () => {
  it('准头 = 轻功系数×2 + 灵敏×1（负值下限 0）', () => {
    expect(aimValue(50, 80)).toBe(180)
    expect(aimValue(0, 0)).toBe(0)
    expect(aimValue(-10, -5)).toBe(0)
  })

  it('命中率 = 90 + (准头比率−0.5)×180：准头高者 >100（不截断），低者 <90', () => {
    const high = computeHitRate({
      attacker: { ...PLAYER, hitBonus: 0 }, defender: { ...ENEMY, dodgeBonus: 0 }, channels: noChannels,
    })
    // 180/(180+120) = 0.6 → 90 + 0.1×180 = 108
    expect(high.value).toBeCloseTo(108, 10)
    expect(part(high.parts, '准头比率')).toBeCloseTo(0.6, 10)
    const low = computeHitRate({
      attacker: { ...ENEMY, hitBonus: 0 }, defender: { ...PLAYER, dodgeBonus: 0 }, channels: noChannels,
    })
    expect(low.value).toBeCloseTo(72, 10)
    // 数学恒等：90 与 K/2 抵消 → 命中率 = 180 × 比率
    expect(BASE_HIT_RATE - (HIT_K / 2)).toBe(0)
  })

  it('双方准头全 0 → 比率兜底 0.5 → 90%（防除零/NaN）', () => {
    const r = computeHitRate({
      attacker: { qinggong: 0, agi: 0, hitBonus: 0 }, defender: { qinggong: 0, agi: 0, dodgeBonus: 0 }, channels: noChannels,
    })
    expect(r.value).toBeCloseTo(90, 10)
    expect(part(r.parts, '准头比率')).toBe(0.5)
  })

  it('旧统计键（命中/闪避点数）与通道叠加，均不截断', () => {
    const r = computeHitRate({
      attacker: { ...PLAYER, hitBonus: 15 },
      defender: { ...ENEMY, dodgeBonus: 25 },
      channels: { source: { 命中率: { flat: 10, percent: 0 } }, target: { 闪避率: { flat: 5, percent: 0 } } },
    })
    // 108 + 15 − 25 + 10 − 5
    expect(r.value).toBeCloseTo(103, 10)
    const miss = computeHitRate({
      attacker: { ...ENEMY, hitBonus: 0 }, defender: { ...PLAYER, dodgeBonus: 0 },
      channels: { source: {}, target: { 闪避率: { flat: 0, percent: 0, set: 999 } } },
    })
    expect(miss.value).toBeLessThan(0)
  })
})

describe('formula：风格与精通', () => {
  it('风格得分 = (1+技能值/1000)×(1+人物值/50)；武功无该系风格 → 技能值 0', () => {
    const scores = styleScores({ 厚重: 60 }, CHAR_STYLE)
    expect(scores[0]).toBeCloseTo(1.8, 10)
    expect(scores[1]).toBeCloseTo(1.908, 10)
    expect(scores[2]).toBeCloseTo(1.6, 10)
    const plain = styleScores(undefined, CHAR_STYLE)
    expect(plain[0]).toBeCloseTo(1.8, 10)
    expect(plain[1]).toBeCloseTo(1.8, 10)
    expect(plain[2]).toBeCloseTo(1.6, 10)
    // 技能值 0 不等于"该项不参与"——人物项仍计入（合同假设 1）
    const zero = styleScores({ 厚重: 0 }, { 轻灵: 100, 厚重: 0, 巧技: 0 })
    expect(zero[0]).toBeCloseTo(3, 10)
    expect(zero[1]).toBeCloseTo(1, 10)
    expect(zero[2]).toBeCloseTo(1, 10)
  })

  it('风格系数 = (轻²+厚²+巧²)/(轻+厚+巧)；全 0 → 1.0', () => {
    expect(styleCoefficient({ 厚重: 60 }, CHAR_STYLE)).toBeCloseTo(1.7785347, 6)
    expect(styleCoefficient(undefined, CHAR_STYLE)).toBeCloseTo(1.7384615, 6)
    expect(styleCoefficient(undefined, {})).toBe(1)
    expect(styleCoefficient(undefined, undefined)).toBe(1)
    // 三项相等时 = 该项得分本身
    const equal = styleCoefficient(undefined, { 轻灵: 50, 厚重: 50, 巧技: 50 })
    expect(equal).toBeCloseTo(2, 10)
  })

  it('精通系数 = 1 + 三值和/250（单次乘法，不再双层包裹）', () => {
    expect(masteryCoefficient(CHAR_STYLE)).toBeCloseTo(1.44, 10)
    expect(masteryCoefficient(undefined)).toBe(1)
    expect(masteryCoefficient({ 轻灵: 100, 厚重: 100, 巧技: 100 })).toBeCloseTo(2.2, 10)
  })

  it('威力曲线：默认 0.7+0.05×(L−1)；表取 ≤L 最大档，超出取末档', () => {
    expect(powerCurve({}, 1)).toBeCloseTo(0.7, 10)
    expect(powerCurve({}, 5)).toBeCloseTo(0.9, 10)
    const table = { power_curve: [[1, 1.0], [5, 1.5]] }
    expect(powerCurve(table, 1)).toBe(1.0)
    expect(powerCurve(table, 5)).toBe(1.5)
    expect(powerCurve(table, 9)).toBe(1.5)
    expect(powerCurve(table, 0)).toBe(1.0)
  })

  it('防御基准 = 根骨×0.8 + 定力×0.5', () => {
    expect(defenseBase(50, 30)).toBeCloseTo(55, 10)
    expect(defenseBase(0, 0)).toBe(0)
  })
})

describe('formula：伤害公式', () => {
  const base = {
    weaponBase: 0, skillStyle: { 厚重: 60 }, charStyle: CHAR_STYLE,
  }

  it('(力道×3 + 威力 + 武器) × (1+系数/1000) × 风格 × 精通 + 内力/25', () => {
    const r = computeStandardDamage({ ...base, stat: 100, dark: false, power: 90, categoryCoeff: 50, mp: 480, channels: {} })
    expect(part(r.parts, '力道项')).toBe(300)
    expect(part(r.parts, '武功系数倍率')).toBeCloseTo(1.05, 10)
    expect(part(r.parts, '内力项')).toBeCloseTo(19.2, 10)
    expect(r.value).toBeCloseTo(1067.9663, 3)
  })

  it('暗毒系：属性项名换「灵敏项」，stat 传灵敏', () => {
    const r = computeStandardDamage({ ...base, stat: 80, dark: true, power: 90, categoryCoeff: 40, mp: 485, channels: {} })
    expect(part(r.parts, '灵敏项')).toBe(240)
    expect(part(r.parts, '力道项')).toBeUndefined()
    expect(r.value).toBeCloseTo(898.3663, 3)
  })

  it('其他加成：flat 平加在公式末尾；通道 flat/percent/set 语义', () => {
    const flat = computeStandardDamage({ ...base, stat: 100, dark: false, power: 90, categoryCoeff: 50, mp: 480, channels: { 其他加成: { flat: 50, percent: 0 } } })
    expect(flat.value).toBeCloseTo(1117.9663, 3)
    const pct = computeStandardDamage({ ...base, stat: 100, dark: false, power: 90, categoryCoeff: 50, mp: 480, channels: { 风格系数: { flat: 0, percent: 0.1 } } })
    expect(pct.value).toBeCloseTo(1153.64 + 19.2, 2)
    const set = computeStandardDamage({ ...base, stat: 100, dark: false, power: 90, categoryCoeff: 50, mp: 480, channels: { 武功威力: { flat: 0, percent: 0, set: 0 } } })
    expect(part(set.parts, '武功威力')).toBe(0)
    // 1067.9663 − 90×1.05×1.7785347×1.44 = 825.9434
    expect(set.value).toBeCloseTo(825.9434, 3)
  })

  it('平A：威力与系数为 0，走无技能风格（力道轴）', () => {
    const r = computeDefaultAttack({ stat: 100, weaponBase: 0, categoryCoeff: 0, charStyle: CHAR_STYLE, mp: 500, channels: {} })
    expect(part(r.parts, '武功威力')).toBe(0)
    expect(part(r.parts, '武功系数倍率')).toBe(1)
    // 300 × 1.7384615 × 1.44 + 20（风格系数见上一条断言）
    const style = styleCoefficient(undefined, CHAR_STYLE)
    expect(r.value).toBeCloseTo(300 * style * 1.44 + 20, 3)
    expect(r.value).toBeCloseTo(771.0154, 3)
  })

  it('多段：调用方按段传入威力（总威力/段数），公式不做除法（力道/内力项每段全量）', () => {
    const style = styleCoefficient({ 厚重: 60 }, CHAR_STYLE)
    const per = computeStandardDamage({ ...base, stat: 100, dark: false, power: 81 / 3, categoryCoeff: 50, mp: 500, channels: {} })
    // (300 + 27) × 1.05 × 风格 × 1.44 + 20
    expect(per.value).toBeCloseTo(327 * 1.05 * style * 1.44 + 20, 6)
    // 三段总和 > 同总威力单段（力道/内力项被逐段重复）
    const single = computeStandardDamage({ ...base, stat: 100, dark: false, power: 81, categoryCoeff: 50, mp: 500, channels: {} })
    expect(per.value * 3).toBeGreaterThan(single.value)
  })
})

describe('formula：毒（v1.2）', () => {
  it('技能风格四维包含毒性；风格系数与精通系数都不吃毒性', () => {
    expect(SKILL_STYLE_KEYS).toEqual(['轻灵', '厚重', '巧技', '毒性'])
    // 毒性很大也不影响风格系数/精通系数（只走毒线）
    const withTox = styleCoefficient({ 厚重: 60, 毒性: 900 }, CHAR_STYLE)
    const without = styleCoefficient({ 厚重: 60 }, CHAR_STYLE)
    expect(withTox).toBeCloseTo(without, 10)
    expect(masteryCoefficient({ ...CHAR_STYLE, 毒功: 900 })).toBeCloseTo(masteryCoefficient(CHAR_STYLE), 10)
  })

  it('基础毒伤害 M = 威力 × (1+暗毒系数/1000) × 毒功系数 × 毒功精通系数', () => {
    const r = computePoisonBase({ 技能威力: 90, 人物暗毒系数: 40, 技能毒性: 40, 人物毒功: 40 })
    // 90 × 1.04 × [(1.04)×(1.8)] × 1.2 = 210.263
    expect(part(r.parts, '暗毒倍率')).toBeCloseTo(1.04, 10)
    expect(part(r.parts, '毒功系数')).toBeCloseTo(1.872, 10)
    expect(part(r.parts, '毒功精通系数')).toBeCloseTo(1.2, 10)
    expect(r.M).toBeCloseTo(210.26304, 5)
    expect(r.M应用).toBeCloseTo(r.M, 10)   // 无通道 = 原值
  })

  it('毒源在技能侧：毒性/毒功为 0 时仍有基础毒伤（M = 威力 × 暗毒倍率）', () => {
    const r = computePoisonBase({ 技能威力: 90, 人物暗毒系数: 40, 技能毒性: 0, 人物毒功: 0 })
    expect(r.M).toBeCloseTo(90 * 1.04, 10)
  })

  it('通道「毒伤害」作用于 M′（M 原值不受影响，供 DEBUFF 快照）', () => {
    const r = computePoisonBase({
      技能威力: 90, 人物暗毒系数: 40, 技能毒性: 40, 人物毒功: 40,
      channels: { 毒伤害: { flat: 0, percent: -0.5 } },
    })
    expect(r.M).toBeCloseTo(210.26304, 5)
    expect(r.M应用).toBeCloseTo(105.13152, 5)
    const immune = computePoisonBase({
      技能威力: 90, 人物暗毒系数: 40, 技能毒性: 40, 人物毒功: 40,
      channels: { 毒伤害: { flat: 0, percent: 0, set: 0 } },
    })
    expect(immune.M应用).toBe(0)
  })

  it('持续毒伤 = (1+0.25×(k−1)) × (1%×气血上限 + M×0.1)，取整', () => {
    const mk = (k: number) => computePoisonDot({ k, M: 210.26304, maxHp: 20000 })
    expect(mk(1).value).toBe(221)   // 1.0 × (200 + 21.026) = 221.026
    expect(mk(2).value).toBe(276)   // 1.25 × 221.026 = 276.28
    expect(mk(3).value).toBe(332)   // 1.5  × 221.026 = 331.54
    expect(part(mk(3).parts, '等级倍率')).toBeCloseTo(1.5, 10)
    expect(part(mk(3).parts, '上限项')).toBeCloseTo(200, 10)
    expect(part(mk(3).parts, 'M项')).toBeCloseTo(21.026304, 6)
  })

  it('持续毒伤同样过通道「毒伤害」（减免作用于原值后取整）', () => {
    const r = computePoisonDot({
      k: 3, M: 210.26304, maxHp: 20000,
      channels: { 毒伤害: { flat: 0, percent: -0.5 } },
    })
    expect(r.value).toBe(Math.round(0.5 * 1.5 * (200 + 21.026304)))
    expect(part(r.parts, 'M快照')).toBeCloseTo(210.26304, 5)
  })
})
