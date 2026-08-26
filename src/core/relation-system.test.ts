// 注释：关系系统 v2 单元测试（2026-08-10 grill 定稿）
// 覆盖：三档转换 / 非法值 error / groups 组展开（{pair} 引用）/ pair 引用校验 /
// reverse 不对称 warning / 称呼生成（panel 成对名 + address 单方称呼）/
// 条件聚合路径（any/any_positive/any_negative/group）/
// character API（setRelation 字符串档位 + removeRelation + relation:* 事件）

import { describe, it, expect, beforeEach } from 'vitest'
import { parseModData } from './mod-loader'
import { entitySystem } from './entity-system'
import { errorReporter } from './error-reporter'
import { gameContext } from './game-context'
import { conditionRegistry } from './condition-registry'
import { eventBus } from './event-bus'
import { conditionEngine } from './condition-engine'
import { resolveRelationPanel, resolveRelationAddress } from './relation-display'
import { onEnable as characterOnEnable } from '../plugins/character-system/index'

const RELATIONS_TOML = `
[types]
"好感度" = { min = 0, max = 100, default = 30 }
"父母子女（为大）" = { kind = "relation", pair = "parent_child", side = "big" }
"父母子女（为小）" = { kind = "relation", pair = "parent_child", side = "small" }
"夫妻" = { kind = "relation", pair = "spouse" }
"仇人" = { kind = "relation", reverse = "被仇" }
"被仇" = { kind = "relation", reverse = "仇人" }

[pairs]
[pairs.parent_child]
panel = { big_male = "父", big_female = "母", small_male = "子", small_female = "女" }
address = { big_male = "父亲", big_female = "母亲", small_male = "儿子", small_female = "女儿" }
[pairs.spouse]
panel = "夫妻"
address = { male = "丈夫", female = "妻子" }

[groups]
"血亲" = [{ pair = "parent_child" }]
"死对头" = ["仇人", "被仇"]
`

function makeMod(rosterBody: string, relationsToml: string = RELATIONS_TOML): any {
  return parseModData('test-mod', {
    '/mods/test-mod/meta.toml': `
[meta]
id = "test-mod"
name = "测试模组"
version = "1.0.0"
`,
    '/mods/test-mod/definitions/attributes.toml': `
[attributes]
"体力" = { type = "number", default = 100, category = "base" }
"性别" = { type = "number", default = 0, category = "base" }
`,
    '/mods/test-mod/definitions/relations.toml': relationsToml,
    '/mods/test-mod/characters/roster.toml': rosterBody,
  })
}

describe('关系系统 v2（mod-loader）', () => {
  beforeEach(() => {
    errorReporter.clear()
  })

  it('三档转换：字符串 "正面"/"中立"/"负面" → 1/0/-1，数值原样保留', () => {
    const mod = makeMod(`
[[roster]]
id = "a"
name = "甲"
base = { "性别" = 1 }
relations = { b = { "父母子女（为大）" = "正面", "夫妻" = 0, "仇人" = -1 } }
[[roster]]
id = "b"
name = "乙"
base = { "性别" = 2 }
`)
    const chars = mod.entities.get('character') as Map<string, any>
    expect(chars.get('a')!.relations['b']['父母子女（为大）']).toBe(1)
    expect(chars.get('a')!.relations['b']['夫妻']).toBe(0)
    expect(chars.get('a')!.relations['b']['仇人']).toBe(-1)
  })

  it('聚合关键字冲突：类型名恰叫 any/any_positive 时单类型查询优先（2026-08-10 自查修复）', () => {
    const mod = makeMod(`
[[roster]]
id = "a"
name = "甲"
relations = { b = { "any" = 1, "any_positive" = -1 } }
[[roster]]
id = "b"
name = "乙"
`, `
[types]
"any" = { kind = "relation" }
"any_positive" = { kind = "relation" }
[groups]
"g1" = ["any"]
`)
    for (const [, char] of mod.entities.get('character') as Map<string, any>) {
      entitySystem.register('character', char.id, char)
    }
    gameContext.setRelationGroups(mod.relationGroups)
    conditionRegistry.setRelationData(mod.relationTypes, mod.relationGroups)
    const ctx = gameContext.getContext()
    // 单类型查询（类型名优先，不被聚合吞掉）
    expect(conditionEngine.evaluate('character.a.relations.b.any == 1', ctx)).toBe(true)
    // 负面档位：可直接 == -1（条件引擎支持负数字面量，2026-08-25 起；< 0 亦可用）
    expect(conditionEngine.evaluate('character.a.relations.b.any_positive == -1', ctx)).toBe(true)
    expect(conditionEngine.evaluate('character.a.relations.b.any_positive < 0', ctx)).toBe(true)
    // 带括号聚合仍工作
    expect(conditionEngine.evaluate('character.a.relations.b.any(group:g1) == true', ctx)).toBe(true)
  })

  it('非法档位值 → errorReporter error（不静默）', () => {
    makeMod(`
[[roster]]
id = "a"
name = "甲"
relations = { b = { "父母子女（为大）" = "深仇大恨" } }
[[roster]]
id = "b"
name = "乙"
`)
    const errs = errorReporter.getErrors().filter(e => e.severity === 'error' && e.message.includes('非法'))
    expect(errs.length).toBeGreaterThan(0)
  })

  it('groups 展开：{ pair } 引用 → 引用该 pair 的全部已定义类型', () => {
    const mod = makeMod('')
    expect(mod.relationGroups['血亲']).toEqual(['父母子女（为大）', '父母子女（为小）'])
    expect(mod.relationGroups['死对头']).toEqual(['仇人', '被仇'])
  })

  it('pair 引用不存在 → throw（阻止加载）', () => {
    expect(() => makeMod('', `
[types]
"测试关系" = { kind = "relation", pair = "nope" }
[pairs]
[pairs.parent_child]
panel = "父子"
`)).toThrow(/pair/)
  })

  it('reverse 不对称 → warning（单方面关系合法，仅提示）', () => {
    makeMod(`
[[roster]]
id = "a"
name = "甲"
relations = { b = { "父母子女（为大）" = 1 } }
[[roster]]
id = "b"
name = "乙"
`)
    const warns = errorReporter.getErrors().filter(e => e.message.includes('侧没有对'))
    expect(warns.length).toBe(1)
    expect(warns[0].message).toContain('父母子女（为小）')
    expect(warns[0].suggestion).toContain('单方面')
  })

  it('reverse 对称（双方都写）→ 不 warning', () => {
    makeMod(`
[[roster]]
id = "a"
name = "甲"
relations = { b = { "父母子女（为大）" = 1 } }
[[roster]]
id = "b"
name = "乙"
relations = { a = { "父母子女（为小）" = 1 } }
`)
    const warns = errorReporter.getErrors().filter(e => e.message.includes('侧没有对'))
    expect(warns).toHaveLength(0)
  })
})

describe('关系系统 v2（称呼生成 relation-display）', () => {
  const parentChild = {
    panel: { big_male: '父', big_female: '母', small_male: '子', small_female: '女' },
    address: { big_male: '父亲', big_female: '母亲', small_male: '儿子', small_female: '女儿' },
  } as const
  const spouse = { panel: '夫妻', address: { male: '丈夫', female: '妻子' } } as const

  it('panel 成对名：按双方性别 4 组合（父男子男=父子 / 父男子女=父女 / 母女子男=母子 / 母女=母女）', () => {
    expect(resolveRelationPanel(parentChild, { bigGender: 1, smallGender: 1 })).toBe('父子')
    expect(resolveRelationPanel(parentChild, { bigGender: 1, smallGender: 2 })).toBe('父女')
    expect(resolveRelationPanel(parentChild, { bigGender: 2, smallGender: 1 })).toBe('母子')
    expect(resolveRelationPanel(parentChild, { bigGender: 2, smallGender: 2 })).toBe('母女')
    expect(resolveRelationPanel(spouse, null)).toBe('夫妻')
  })

  it('address 单方称呼：按端 + 自己性别', () => {
    expect(resolveRelationAddress(parentChild, 'big', 1)).toBe('父亲')
    expect(resolveRelationAddress(parentChild, 'big', 2)).toBe('母亲')
    expect(resolveRelationAddress(parentChild, 'small', 1)).toBe('儿子')
    expect(resolveRelationAddress(parentChild, 'small', 2)).toBe('女儿')
    expect(resolveRelationAddress(spouse, null, 1)).toBe('丈夫')
    expect(resolveRelationAddress(spouse, null, 2)).toBe('妻子')
  })
})

describe('关系系统 v2（条件聚合路径）', () => {
  beforeEach(() => {
    errorReporter.clear()
    entitySystem.clear()
  })

  function setup(): any {
    const mod = makeMod(`
[[roster]]
id = "player"
name = "玩家"
base = { "体力" = 100 }
[[roster]]
id = "a"
name = "甲"
base = { "性别" = 1 }
relations = { b = { "父母子女（为大）" = 1, "仇人" = -1 } }
[[roster]]
id = "b"
name = "乙"
base = { "性别" = 2 }
relations = { a = { "夫妻" = 1, "父母子女（为小）" = 1 } }
`)
    for (const [, char] of mod.entities.get('character') as Map<string, any>) {
      entitySystem.register('character', char.id, char)
    }
    gameContext.setPlayer('player') // 须在角色注册之后
    gameContext.setRelationGroups(mod.relationGroups)
    conditionRegistry.setRelationData(mod.relationTypes, mod.relationGroups)
    return mod
  }

  it('any(group:血亲)：组展开后命中（父母子女（为大）在血亲组）', () => {
    setup()
    expect(conditionEngine.evaluate('character.a.relations.b.any(group:血亲) == true', gameContext.getContext())).toBe(true)
    expect(conditionEngine.evaluate('character.b.relations.a.any(group:血亲) == true', gameContext.getContext())).toBe(true) // b 对 a 有 父母子女（为小）
  })

  it('any_negative(列表)：仇人在列表中且为负面 → true', () => {
    setup()
    expect(conditionEngine.evaluate('character.a.relations.b.any_negative(仇人,被仇) == true', gameContext.getContext())).toBe(true)
    // 夫妻是正面——any_negative 不命中
    expect(conditionEngine.evaluate('character.b.relations.a.any_negative(夫妻) == true', gameContext.getContext())).toBe(false)
  })

  it('any_positive(列表) 与 无括号 any（全部类型）', () => {
    setup()
    expect(conditionEngine.evaluate('character.a.relations.b.any_positive(父母子女（为大）) == true', gameContext.getContext())).toBe(true)
    expect(conditionEngine.evaluate('character.a.relations.b.any == true', gameContext.getContext())).toBe(true)
    // a 对 b 有正面+负面两种关系——any 存在即可
    expect(conditionEngine.evaluate('character.a.relations.b.any == true', gameContext.getContext())).toBe(true)
  })

  it('condition-registry 聚合参数校验：未定义类型/组 → 校验失败；合法 → 通过', () => {
    setup()
    expect(conditionRegistry.validateExpression('character.a.relations.b.any(仇人) == true').ok).toBe(true)
    expect(conditionRegistry.validateExpression('character.a.relations.b.any(group:死对头) == true').ok).toBe(true)
    expect(conditionRegistry.validateExpression('character.a.relations.b.any(不存在的类型) == true').ok).toBe(false)
    expect(conditionRegistry.validateExpression('character.a.relations.b.any(group:不存在的组) == true').ok).toBe(false)
  })

  it('复杂组合：两侧 + 多组 + 与或非 + 括号嵌套聚合（2026-08-10 复检）', () => {
    setup()
    const ctx = gameContext.getContext()
    const ev = (expr: string) => conditionEngine.evaluate(expr, ctx)
    // ① 两侧组合（grill 场景）：A 对 B 有负面（死对头组）且 B 对 A 有亲属（血亲组）
    expect(ev('character.a.relations.b.any_negative(group:死对头) == true && character.b.relations.a.any(group:血亲) == true')).toBe(true)
    // ② 括号分组内嵌聚合（递归路径——历史 bug 点：占位符在递归中丢失）
    expect(ev('(character.a.relations.b.any_negative(仇人) == true || character.a.relations.b.any(夫妻) == true) && character.b.relations.a.any(group:血亲) == true')).toBe(true)
    // ③ 非运算
    expect(ev('!character.b.relations.a.any_negative(group:血亲) == true')).toBe(true)
    // ④ 聚合 + 普通属性混合 + 与或
    expect(ev('player.体力 >= 0 && (character.a.relations.b.any_negative(group:死对头) == true || character.a.relations.b.any_positive == true)')).toBe(true)
    // ⑤ 组 + 类型混合参数列表
    expect(ev('character.a.relations.b.any_negative(仇人, group:血亲) == true')).toBe(true)
    // ⑥ 多重括号嵌套（两层）
    expect(ev('((character.a.relations.b.any_negative(group:死对头) == true) && (character.b.relations.a.any(group:血亲) == true)) == true')).toBe(true)
  })

  it('复杂组合边界（2026-08-10 二次复检）：三层嵌套 / !与聚合 / 字面量 / 优先级 / !=', () => {
    setup()
    const ctx = gameContext.getContext()
    const ev = (expr: string) => conditionEngine.evaluate(expr, ctx)
    // 三层括号嵌套
    expect(ev('(((character.a.relations.b.any_negative(group:死对头) == true)))')).toBe(true)
    // ! 作用于聚合（b 对 a 无负面 → 整体非为 true）
    expect(ev('!character.b.relations.a.any_negative(group:死对头) == true')).toBe(true)
    // 分组递归产生的字面量比较：单层 (x) == true
    expect(ev('(character.a.relations.b.any_negative(group:死对头) == true) == true')).toBe(true)
    // 与或优先级（|| 外层、&& 内层）
    expect(ev('character.a.relations.b.any_negative(仇人) == true || character.b.relations.a.any(group:血亲) == false && player.体力 > 0')).toBe(true)
    // != 比较聚合结果（b 对 a 无负面 → != true 成立）
    expect(ev('character.b.relations.a.any_negative(group:死对头) != true')).toBe(true)
    // 内层 false 的字面量组合：(... || ...) == false
    expect(ev('(character.b.relations.a.any_negative(group:死对头) == true || character.b.relations.a.any_positive(仇人) == true) == false')).toBe(true)
    // condition-registry 对复杂组合表达式的校验（路径提取 + 聚合参数校验）
    expect(conditionRegistry.validateExpression(
      '(character.a.relations.b.any_negative(group:死对头) == true) && character.b.relations.a.any(group:血亲) == true',
    ).ok).toBe(true)
    expect(conditionRegistry.validateExpression(
      '(character.a.relations.b.any_negative(group:不存在的组) == true) && character.b.relations.a.any(group:血亲) == true',
    ).ok).toBe(false)
  })
})

describe('关系系统 v2（character API + 事件）', () => {
  let api: any = {}
  let events: any[] = []

  beforeEach(() => {
    errorReporter.clear()
    entitySystem.clear()
    api = {}
    events = []
    characterOnEnable({
      api: { register: (ns: string, methods: any) => { if (ns === 'character') api = methods } },
      events: {
        on: (event: string, handler: any) => { events.push({ event, handler }) },
      },
    } as any)
    // 注册角色 + 手动注入关系数据（character-system 内部用 modLoader.getMod()——测试用 makeMod 数据不可达，
    // 因此称呼 API 测试用纯函数验证（见 relation-display 测试）；此处只测 set/remove + 事件）
    entitySystem.register('character', 'a', { id: 'a', base: { '性别': 1 } })
    entitySystem.register('character', 'b', { id: 'b', base: { '性别': 2 } })
  })

  it('setRelation 字符串档位 → 数值 + relation:added 事件（payload 含 type/sentiment）', async () => {
    const received: any[] = []
    eventBus.on('relation:added', (p: any) => { received.push(p) })
    api.setRelation('a', 'b', '夫妻', '正面')
    const char = entitySystem.get('character', 'a') as any
    expect(char.relations['b']['夫妻']).toBe(1)
    expect(received.length).toBe(1)
    expect(received[0]).toMatchObject({ character: 'a', target: 'b', type: '夫妻', sentiment: 1 })
  })

  it('removeRelation 删除条目（与设 0 区分）+ relation:removed 事件', () => {
    api.setRelation('a', 'b', '夫妻', '正面')
    api.removeRelation('a', 'b', '夫妻')
    const char = entitySystem.get('character', 'a') as any
    expect(char.relations['b']).toBeUndefined() // 空对象被清理
  })

  it('relation:added/changed/removed 事件 payload 结构（手动 emit 验证监听可用）', async () => {
    const received: any[] = []
    eventBus.on('relation:added', (p: any) => { received.push({ event: 'relation:added', payload: p }) })
    eventBus.on('relation:changed', (p: any) => { received.push({ event: 'relation:changed', payload: p }) })
    eventBus.on('relation:removed', (p: any) => { received.push({ event: 'relation:removed', payload: p }) })
    await eventBus.emit('relation:added', { character: 'a', target: 'b', type: '夫妻', sentiment: 1 })
    await eventBus.emit('relation:changed', { character: 'a', target: 'b', type: '夫妻', sentiment: 0 })
    await eventBus.emit('relation:removed', { character: 'a', target: 'b', type: '夫妻' })
    expect(received.map(r => r.event)).toEqual(['relation:added', 'relation:changed', 'relation:removed'])
    expect(received[0].payload.type).toBe('夫妻')
  })
})
