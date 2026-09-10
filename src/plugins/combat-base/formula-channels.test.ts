// 注释：formula-channels 测试——公式中间量通道机制（combat-base 通用层）
// 覆盖：累加/合并语义（set 覆盖、flat/percent 相加）、通道注册表、钩子返回值归一化、明细格式化，
// 并与 combat-wuxia 的本地 applyChannel 做交叉断言（两处语义必须一致）
import { describe, it, expect, beforeEach } from 'vitest'
import {
  accumulateChannel, applyChannel, channelOf, clearChannels, formatChannelBag, formatParts,
  getChannelDefs, getChannelIds, hasChannel, isChannelBagEmpty, mergeChannelBags,
  normalizeFormulaResult, registerChannel, zeroChannelBag,
} from './formula-channels'
import { applyChannel as wuxiaApplyChannel } from '../combat-wuxia/formula'

// ⚠️ 通道名/中间量名属"结构数据"，不是 attributes.toml 属性——中文 key 必须经变量/helper 间接取
// （scan-attr-refs 契约：`obj['中文']` 会被判为属性引用）
const chan = (bag: any, key: string): any => bag?.[key]

describe('公式通道：累加与合并', () => {
  beforeEach(() => { clearChannels() })

  it('flat/percent 累加；0 值跳过（不产生空条目）；set 覆盖（含 set 0）', () => {
    const bag = zeroChannelBag()
    accumulateChannel(bag, '风格系数', 'percent', 0.1)
    accumulateChannel(bag, '风格系数', 'percent', 0.05)
    accumulateChannel(bag, '风格系数', 'flat', 0)
    expect(chan(bag, '风格系数')).toEqual({ flat: 0, percent: 0.15000000000000002 })
    accumulateChannel(bag, '防御', 'flat', 0)
    expect(chan(bag, '防御')).toBeUndefined() // flat 0 不建条目
    accumulateChannel(bag, '防御', 'set', 0)
    expect(chan(bag, '防御')).toEqual({ flat: 0, percent: 0, set: 0 }) // set 0 有意义（无视防御）
    accumulateChannel(bag, '防御', 'set', 30)
    expect(chan(bag, '防御').set).toBe(30) // 后写覆盖
  })

  it('合并：flat/percent 相加，set 后者覆盖；空包合并不出错', () => {
    const a = zeroChannelBag()
    const b = zeroChannelBag()
    accumulateChannel(a, '武功威力', 'percent', 0.2)
    accumulateChannel(a, '防御', 'set', 10)
    accumulateChannel(b, '武功威力', 'percent', 0.3)
    accumulateChannel(b, '武功威力', 'flat', 15)
    accumulateChannel(b, '防御', 'set', 0)
    const merged = mergeChannelBags(a, b, undefined, null)
    expect(chan(merged, '武功威力').percent).toBeCloseTo(0.5, 10)
    expect(chan(merged, '武功威力').flat).toBe(15)
    expect(chan(merged, '防御').set).toBe(0)
    expect(isChannelBagEmpty(merged)).toBe(false)
    expect(isChannelBagEmpty(zeroChannelBag())).toBe(true)
    expect(isChannelBagEmpty({ 空: { flat: 0, percent: 0 } })).toBe(true)
  })

  it('应用语义：base′ = set ?? base；value = (base′ + flat) × (1 + percent)', () => {
    expect(applyChannel(100, undefined)).toBe(100)
    expect(applyChannel(100, { flat: 20, percent: 0 })).toBe(120)
    expect(applyChannel(100, { flat: 0, percent: 0.5 })).toBe(150)
    expect(applyChannel(100, { flat: 20, percent: 0.5 })).toBe(180)
    expect(applyChannel(100, { flat: 20, percent: 0.5, set: 10 })).toBe(45)
    expect(applyChannel(100, { flat: 0, percent: 9, set: 0 })).toBe(0)
    expect(channelOf({ 命中率: { flat: 10, percent: 0 } }, '命中率')?.flat).toBe(10)
    expect(channelOf(undefined, '命中率')).toBeUndefined()
  })
})

describe('公式通道：注册表', () => {
  beforeEach(() => { clearChannels() })

  it('注册/幂等覆盖/查询/清空', () => {
    registerChannel({ id: '风格系数', label: '风格系数', description: 'a', source: 'combat-wuxia' })
    registerChannel({ id: '风格系数', label: '风格系数（改）', source: 'combat-wuxia' })
    registerChannel({ id: '', label: '空 id 应被忽略' } as any)
    expect(hasChannel('风格系数')).toBe(true)
    expect(getChannelIds()).toEqual(['风格系数'])
    expect(getChannelDefs()[0].label).toBe('风格系数（改）')
    clearChannels()
    expect(getChannelIds()).toEqual([])
  })
})

describe('公式通道：钩子返回值归一化', () => {
  it('number（向后兼容）/{value|damage, parts}/异常值', () => {
    expect(normalizeFormulaResult(120)).toEqual({ value: 120, parts: {} })
    expect(normalizeFormulaResult({ value: 88, parts: { 力道项: 300 } })).toEqual({ value: 88, parts: { 力道项: 300 } })
    expect(normalizeFormulaResult({ damage: 55, parts: { 防御: 55 } })).toEqual({ value: 55, parts: { 防御: 55 } })
    expect(normalizeFormulaResult({ value: 10 })).toEqual({ value: 10, parts: {} })
    expect(normalizeFormulaResult(null)).toEqual({ value: 0, parts: {} })
    expect(normalizeFormulaResult(undefined)).toEqual({ value: 0, parts: {} })
    expect(normalizeFormulaResult(NaN)).toEqual({ value: 0, parts: {} })
    expect(normalizeFormulaResult({ parts: [1, 2] }).parts).toEqual({}) // 数组不是合法 parts
  })
})

describe('公式通道：明细格式化', () => {
  it('通道包与中间量分项文本', () => {
    const bag = zeroChannelBag()
    accumulateChannel(bag, '风格系数', 'percent', 0.1)
    accumulateChannel(bag, '其他加成', 'flat', 50)
    accumulateChannel(bag, '防御', 'set', 0)
    const text = formatChannelBag(bag)
    expect(text).toContain('风格系数 +10%')
    expect(text).toContain('其他加成 +50')
    expect(text).toContain('防御 set 0')
    expect(formatParts({ 力道项: 300, 精通系数: 1.44 })).toContain('力道项=300')
    expect(formatChannelBag(zeroChannelBag())).toBe('')
  })
})

describe('公式通道：与 combat-wuxia 本地实现语义一致（不跨插件 import 的守卫）', () => {
  it('applyChannel 在 base 与 wuxia 两处结果一致', () => {
    const cases: { base: number; mod: any }[] = [
      { base: 100, mod: undefined },
      { base: 100, mod: { flat: 0, percent: 0 } },
      { base: 0, mod: { flat: 10, percent: 0 } },
      { base: 1.7785347, mod: { flat: 0, percent: 0.1 } },
      { base: 55, mod: { flat: 5, percent: 0.2, set: 40 } },
      { base: -3, mod: { flat: 3, percent: 1 } },
    ]
    for (const c of cases) {
      expect(wuxiaApplyChannel(c.base, c.mod)).toBe(applyChannel(c.base, c.mod))
    }
  })
})
