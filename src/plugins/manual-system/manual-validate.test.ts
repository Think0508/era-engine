// manual-system 加载期校验测试（2026-09-23）——每条 error 一个反例 + 一个正对照
// 这些字段写错的共同结局是"静默错值"（练不了层 / 成长发到不存在的属性 / 层奖励永远拿不到），
// 所以全部判 error；正对照保证合法数据零 error（不误伤）。

import { describe, it, expect, beforeEach } from 'vitest'
import { parseModData } from '../../core/mod-loader'
import { errorReporter } from '../../core/error-reporter'
import { conditionRegistry } from '../../core/condition-registry'
import { rawTomlMap as fixture } from './manual.test.fixture'

const META = fixture['/mods/manual-test/meta.toml']
const ATTRS = fixture['/mods/manual-test/definitions/attributes.toml']
const TIERS = fixture['/mods/manual-test/definitions/manual-tiers.toml']

/** 用 fixture 的骨架 + 覆盖某个文件 → 解析并返回 error 列表 */
function load(overrides: Record<string, string>): { errors: string[] } {
  const map: Record<string, string> = {
    '/mods/manual-test/meta.toml': META,
    '/mods/manual-test/definitions/attributes.toml': ATTRS,
    '/mods/manual-test/definitions/manual-tiers.toml': TIERS,
    ...overrides,
  }
  errorReporter.clear()
  // 校验器依赖条件注册器（requires/layer_requires 的字段校验）
  conditionRegistry.clear()
  conditionRegistry.registerFromAttributes({ 经验: {}, 悟性: {} })
  parseModData('manual-test', map)
  return { errors: errorReporter.getErrors().map(e => e.message) }
}

const ABILITY = `
[abilities."测试技能"]
name = "测试技能"
type = "active"
max_level = 10
category = "拳掌"
`
const TALENT = `
[talents."测试天赋"]
name = "测试天赋"
max = 1
`

beforeEach(() => errorReporter.clear())

describe('秘籍定义校验', () => {
  it('品级不存在 → error', () => {
    const r = load({
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试秘籍"]
name = "测试秘籍"
tier = "不存在的品级"
category = "拳掌"
max_layer = 10
`,
    })
    expect(r.errors.some(m => m.includes("品级 '不存在的品级'") && m.includes('不存在'))).toBe(true)
  })

  it('kind=skill 缺 category / category 无映射 → error', () => {
    const noCategory = load({
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试秘籍"]
name = "测试秘籍"
tier = "三流"
max_layer = 10
`,
    })
    expect(noCategory.errors.some(m => m.includes('没有 category'))).toBe(true)

    const noMapping = load({
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试秘籍"]
name = "测试秘籍"
tier = "三流"
category = "刀剑"
max_layer = 10
`,
    })
    expect(noMapping.errors.some(m => m.includes('没有映射'))).toBe(true)
  })

  it('kind=internal/passive 不要求 category（正对照）', () => {
    const r = load({
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试内功"]
name = "测试内功"
tier = "三流"
kind = "internal"
max_layer = 10
`,
    })
    expect(r.errors).toEqual([])
  })

  it('layer_rewards 层号越界 / 引用不存在的能力与天赋 → error', () => {
    const r = load({
      '/mods/manual-test/definitions/abilities.toml': ABILITY,
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试秘籍"]
name = "测试秘籍"
tier = "三流"
kind = "internal"
max_layer = 5

[[manuals."测试秘籍".layer_rewards]]
layer = 9
ability = "不存在的能力"

[[manuals."测试秘籍".layer_rewards]]
layer = 2
talent = "不存在的天赋"
`,
    })
    expect(r.errors.some(m => m.includes('层号非法') && m.includes('1..5'))).toBe(true)
    expect(r.errors.some(m => m.includes("不存在的能力 '不存在的能力'"))).toBe(true)
    expect(r.errors.some(m => m.includes("不存在的天赋 '不存在的天赋'"))).toBe(true)
  })

  it('layer_growth 引用未定义属性 / range 形状错 → error', () => {
    const r = load({
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试秘籍"]
name = "测试秘籍"
tier = "三流"
kind = "internal"
max_layer = 5
layer_growth = [ { attr = "不存在属性", flat = 1 }, { attr = "悟性", range = [1] } ]
`,
    })
    expect(r.errors.some(m => m.includes("未定义属性 '不存在属性'"))).toBe(true)
    expect(r.errors.some(m => m.includes('range 必须是'))).toBe(true)
  })

  it('requires / layer_requires 条件引用未注册字段 → error', () => {
    const r = load({
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试秘籍"]
name = "测试秘籍"
tier = "三流"
kind = "internal"
max_layer = 5
requires = "selected.不存在的属性 >= 1"

[[manuals."测试秘籍".layer_requires]]
layer = 3
condition = "selected.也 < 1"
`,
    })
    expect(r.errors.some(m => m.includes('requires 引用了未注册字段'))).toBe(true)
    expect(r.errors.some(m => m.includes('第 3 层的修炼门槛'))).toBe(true)
  })

  it('合法数据（含条件门槛/层奖励/成长）→ 零 error（正对照）', () => {
    const r = load({
      '/mods/manual-test/definitions/abilities.toml': ABILITY,
      '/mods/manual-test/definitions/talents.toml': TALENT,
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试秘籍"]
name = "测试秘籍"
tier = "三流"
kind = "internal"
max_layer = 5
layer_growth = [ { attr = "武学常识", flat = 2 } ]
requires = "selected.悟性 >= 5"

[[manuals."测试秘籍".layer_rewards]]
layer = 3
ability = "测试技能"
talent = "测试天赋"
attributes = [ { attr = "武学常识", flat = 3 } ]

[[manuals."测试秘籍".layer_requires]]
layer = 4
condition = "selected.abilities.测试技能.level >= 2"
`,
    })
    expect(r.errors).toEqual([])
  })
})

describe('卷册物品校验', () => {
  it('manual_access.manual 不存在 → error', () => {
    const r = load({
      '/mods/manual-test/definitions/items.toml': `
[items."坏卷册"]
name = "坏卷册"
type = "key"
stackable = false
manual_access = { manual = "不存在的秘籍", cap = 3 }
`,
    })
    expect(r.errors.some(m => m.includes("manual_access.manual '不存在的秘籍' 不存在"))).toBe(true)
  })

  it('cap 非正整数 / 超过 max_layer → error', () => {
    const r = load({
      '/mods/manual-test/definitions/manuals.toml': `
[manuals."测试秘籍"]
name = "测试秘籍"
tier = "三流"
kind = "internal"
max_layer = 5
`,
      '/mods/manual-test/definitions/items.toml': `
[items."零上限"]
name = "零上限"
type = "key"
stackable = false
manual_access = { manual = "测试秘籍", cap = 0 }

[items."超上限"]
name = "超上限"
type = "key"
stackable = false
manual_access = { manual = "测试秘籍", cap = 9 }
`,
    })
    expect(r.errors.some(m => m.includes('cap 必须是 ≥1 的整数'))).toBe(true)
    expect(r.errors.some(m => m.includes('cap=9 超过秘籍') && m.includes('max_layer=5'))).toBe(true)
  })
})

describe('能力成长曲线校验（validateAbilityXpGrowth）', () => {
  it('未知 curve → error；geometric 缺 base → error', () => {
    const r = load({
      '/mods/manual-test/definitions/abilities.toml': `
[abilities."坏曲线"]
name = "坏曲线"
type = "active"
max_level = 5
xp_curve = "logistic"

[abilities."坏几何"]
name = "坏几何"
type = "active"
max_level = 5
xp_curve = "geometric"
xp_per_level = { ratio = 1.15 }
`,
    })
    expect(r.errors.some(m => m.includes("xp_curve 'logistic' 未知"))).toBe(true)
    expect(r.errors.some(m => m.includes('geometric') && m.includes('base'))).toBe(true)
  })

  it('四种合法曲线 → 零 error（正对照）', () => {
    const r = load({
      '/mods/manual-test/definitions/abilities.toml': `
[abilities."线性"]
name = "线性"
type = "active"
max_level = 5
xp_curve = "linear"
xp_per_level = 100

[abilities."指数"]
name = "指数"
type = "active"
max_level = 5
xp_curve = "exponential"
xp_per_level = 100

[abilities."数组"]
name = "数组"
type = "active"
max_level = 5
xp_curve = "custom"
xp_per_level = [100, 200, 400]

[abilities."几何"]
name = "几何"
type = "active"
max_level = 5
xp_curve = "geometric"
xp_per_level = { base = 200, ratio = 1.15 }
`,
    })
    expect(r.errors).toEqual([])
  })
})

describe('装配加成声明校验（equipped_mods）', () => {
  it('引用未定义属性 → error；per_level 合法（有等级概念）', () => {
    const bad = load({
      '/mods/manual-test/definitions/abilities.toml': `
[abilities."坏内功"]
name = "坏内功"
type = "passive"
max_level = 5
equipped_mods = [ { attr = "不存在属性", flat = 1 } ]
`,
    })
    expect(bad.errors.some(m => m.includes('equipped_mods 引用了未定义属性'))).toBe(true)

    const good = load({
      '/mods/manual-test/definitions/abilities.toml': `
[abilities."好内功"]
name = "好内功"
type = "passive"
max_level = 5
equipped_mods = [ { attr = "悟性", flat = 1, per_level = 2 }, { attr = "气血上限", percent = 0.1 } ]
`,
    })
    expect(good.errors).toEqual([])
  })
})
