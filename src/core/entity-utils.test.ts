// 注释：属性读取接入有效值管线后的集成测试（2026-09-22）
// 覆盖：① 未配置定义时行为不变（零回归）② 定义 + 修正 → 读出有效值
//       ③ setEntityAttr 写后缓存失效 ④ 非数字属性不受影响 ⑤ 下游消费方（clampAttrValue）
//       自动看到有效值（条件引擎/bindings 同走 getEntityAttr，属同一传递性质）
import { describe, it, expect, beforeEach } from 'vitest'
import { getEntityAttr, setEntityAttr, clampAttrValue, applyAttrDelta, ATTR } from './entity-utils'
import { configureAttributeEval, registerModifier, removeModifier, __resetAttributeEval } from './attribute-eval'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

function mkChar(): any {
  return { id: 'c1', name: '测试', base: { 力道: 100, 体力: 9999, 体力上限: 500 }, abilities: {} }
}

describe('entity-utils × 有效值管线', () => {
  beforeEach(() => { __resetAttributeEval() })

  it('未配置属性定义 → 读出裸值（零回归）', () => {
    const c = mkChar()
    expect(getEntityAttr(c, '力道')).toBe(100)
  })

  it('属性定义 + 修正 → 读出有效值', () => {
    const c = mkChar()
    configureAttributeEval({ definitions: { 力道: {} } })
    registerModifier(c, 'buff', '力道', { percent: 0.5 })
    expect(getEntityAttr(c, '力道')).toBe(150)
  })

  it('setEntityAttr 写入后缓存失效（读到新值 + 修正）', () => {
    const c = mkChar()
    configureAttributeEval({ definitions: { 力道: {} } })
    registerModifier(c, 'buff', '力道', { flat: 10 })
    expect(getEntityAttr(c, '力道')).toBe(110)
    setEntityAttr(c, '力道', 200)
    expect(getEntityAttr(c, '力道')).toBe(210)
  })

  // 注释：派生夹具（中文键走对象字面量，不做 ['中文'] 索引——scan-attr-refs 契约）
  function mkDerivedChar(): any {
    return { id: 'd1', name: '派生', base: { 最大气血: 300, 根骨: 50 } }
  }

  it('setEntityAttr 写依赖属性 → 派生属性重算（版本失效承载）', () => {
    const c = mkDerivedChar()
    configureAttributeEval({
      definitions: { 最大气血: { compute: 'calc.js' }, 根骨: {} },
      scriptResolver: () => 'return base + attrs.get("根骨") * 10',
      // rawReader 由 entity-utils 模块加载时注入，不要覆盖
    })
    expect(getEntityAttr(c, '最大气血')).toBe(800)        // 300 + 50×10
    // 派生属性**自己的裸值没变**（仍是 300）：缓存只能靠 setEntityAttr 里的版本自增失效，
    // 裸值比对救不了它（readEffective 的 raw 比对键是「最大气血」自己的 raw）。
    // 去掉 entity-utils.ts:104 的 notifyAttrWrite(entity) → 这里会仍旧返回 800。
    setEntityAttr(c, '根骨', 60)
    expect(getEntityAttr(c, '最大气血')).toBe(900)        // 300 + 60×10
  })

  it('非数字属性（对象型能力条目）不受管线影响', () => {
    const c = mkChar()
    c.abilities['快乐刻印'] = { level: 3, xp: 0 }
    configureAttributeEval({ definitions: { 快乐刻印: {} } })
    expect(getEntityAttr(c, '快乐刻印')).toEqual({ level: 3, xp: 0 })
  })

  it('缺失属性仍返回 0（既有语义）', () => {
    const c = mkChar()
    expect(getEntityAttr(c, '不存在属性')).toBe(0)
  })

  it('下游消费方自动看到有效值：clampAttrValue 按**修正后**的上限钳制', () => {
    const c = mkChar()
    configureAttributeEval({ definitions: { [ATTR.HP_MAX]: {} } })
    // 体力上限 500 → 修正 +500 → 有效上限 1000；所以 9999 应被钳到 1000 而不是 500
    registerModifier(c, 'eq', ATTR.HP_MAX, { flat: 500 })
    expect(getEntityAttr(c, ATTR.HP_MAX)).toBe(1000)
    expect(clampAttrValue(c, ATTR.HP, 9999)).toBe(1000)
  })
})

// ── 属性增量写入：读-改-写必须锁在基础值域（2026-09-22 全分支审查 C1 清扫）──
// 契约一句话：**要写回哪个值，就从哪个值出发读**。读有效值再加 → 修正被烘焙进 base 并反复叠加。
describe('applyAttrDelta × 基础值域读-改-写', () => {
  beforeEach(() => { __resetAttributeEval() })

  it('【无膨胀】挂了 +20 修正时，增量写入只加到基础值上', () => {
    const c = { id: 'a1', base: { 力道: 100 } }
    configureAttributeEval({ definitions: { 力道: {} } })
    registerModifier(c, 'buff', '力道', { flat: 20 })
    expect(getEntityAttr(c, '力道')).toBe(120)          // 有效值 = 100 + 20

    const r1 = applyAttrDelta(c, '力道', 30)
    expect(r1).toEqual({ old: 100, new: 130 })          // old/new 都是**基础值**
    expect(c.base['力道']).toBe(130)                    // base 只加 30，没被烙进 +20
    expect(getEntityAttr(c, '力道')).toBe(150)          // 130 + 20

    // 再操作一次也不会累积烙入
    applyAttrDelta(c, '力道', 30)
    expect(c.base['力道']).toBe(160)
    expect(getEntityAttr(c, '力道')).toBe(180)
  })

  it('若误用有效值做读-改-写，就会复现膨胀（反证本 API 的必要性）', () => {
    const c = { id: 'a2', base: { 力道: 100 } }
    configureAttributeEval({ definitions: { 力道: {} } })
    registerModifier(c, 'buff', '力道', { flat: 20 })
    // 错误写法：读出有效值 120，加 30 写回 base = 150 → 下次有效值 170（+20 被烙进去了）
    setEntityAttr(c, '力道', getEntityAttr(c, '力道') + 30)
    expect(c.base['力道']).toBe(150)
    expect(getEntityAttr(c, '力道')).toBe(170)
  })

  it('opts.max 固定封顶；opts.clamp 只管**常量**上限（maxAttr 属性改由**读时封顶**保证）', () => {
    const c = { id: 'a3', base: { 体力: 90, 体力上限: 500 } }
    configureAttributeEval({ definitions: { [ATTR.HP]: {}, [ATTR.HP_MAX]: {} } })
    registerModifier(c, 'eq', ATTR.HP_MAX, { flat: 100 })
    // 2026-09-23 末轮语义变更（本行原断言 `{old:90, new:600}`）：那正是 R2 —— 写入端按**有效上限**钳制，
    // 等于让"临时上限修正"决定写进基础值多少，撤掉修正后差额永久留下（增益方向越顶、减益方向截断）。
    // 现在：增量按 delta 落**裸值**（90+1000=1090），"不超上限"由**读时封顶投影**保证 —— 读出来是 600。
    expect(applyAttrDelta(c, ATTR.HP, 1000, { clamp: true })).toEqual({ old: 90, new: 1090 })
    expect(getEntityAttr(c, ATTR.HP)).toBe(600)

    const d = { id: 'a4', base: { 精力上限: 9990 } }
    configureAttributeEval({ definitions: { 精力上限: {} } })
    expect(applyAttrDelta(d, '精力上限', 100, { max: 9999 })).toEqual({ old: 9990, new: 9999 })
  })

  it('下限 0；非法 delta → null；缺失属性沿用「缺失 = 0」既有约定', () => {
    const c = { id: 'a5', base: { 力道: 5 } }
    configureAttributeEval({ definitions: { 力道: {} } })
    expect(applyAttrDelta(c, '力道', -100)).toEqual({ old: 5, new: 0 })
    expect(applyAttrDelta(c, '力道', NaN)).toBeNull()
    // 缺失属性：readRawAttr 按全仓既有约定返回 0（不是 undefined）→ 结果为 delta。
    // 与清扫前的 fallback 写法（`char.base[attr] ?? 0` 再 +delta）语义一致，非行为变更。
    expect(applyAttrDelta(c, '未定义过的属性', 10)).toEqual({ old: 0, new: 10 })
  })

  // ── 2026-09-23 末轮（用户裁定）：上限改为**读时封顶** —— 裸值可越顶，读出来的有效值不可以 ──
  // 写入端不再按属性上限钳制（那是 R1/R2 通道），只钳常量上限 + 下限。
  it('【R1】上限减益不再写坏裸值：裸值 100 不会被写成 20（增量照落，读时按有效上限 20 封顶）', () => {
    const c = { id: 'r1', base: { 体力: 100, 体力上限: 120 } }
    configureAttributeEval({ definitions: { [ATTR.HP]: {}, [ATTR.HP_MAX]: {} } })
    registerModifier(c, 'debuff', ATTR.HP_MAX, { flat: -100 })
    expect(getEntityAttr(c, ATTR.HP_MAX)).toBe(20)             // 有效上限 20
    expect(clampAttrValue(c, ATTR.HP, 150)).toBe(20)           // 判据用法不变：clampAttrValue 仍看有效上限
    // 修复前：min(有效上限 20, 100+50) = 20 → 裸值被临时上限**永久**截断（撤修正仍 20 = 永久 −80）
    expect(applyAttrDelta(c, ATTR.HP, 50, { clamp: true })).toEqual({ old: 100, new: 150 })
    expect(c.base[ATTR.HP]).toBe(150)                          // 增量照落裸值（不再被上限截断）
    expect(c.base[ATTR.HP]).not.toBe(20)                       // ← R1 复现点
    expect(getEntityAttr(c, ATTR.HP)).toBe(20)                 // 读时按**有效上限**封顶：上限减益立即削当前值
    removeModifier(c, 'debuff')
    // 撤修正：裸值 150 一分没丢（修复前裸值已被写坏成 20）→ 有效上限回到基础上限 120，故读出 120
    expect(c.base[ATTR.HP]).toBe(150)
    expect(getEntityAttr(c, ATTR.HP)).toBe(120)
  })

  it('【读时封顶】读出来按有效上限封顶：裸值 150 / 上限 100 → 100；上限 +100（有效 200）→ 150', () => {
    const c = { id: 'cap', base: { 体力: 150, 体力上限: 100 } }
    configureAttributeEval({ definitions: { [ATTR.HP]: {}, [ATTR.HP_MAX]: {} } })
    expect(getEntityAttr(c, ATTR.HP)).toBe(100)                // 裸值越顶 → 读出来被有效上限封顶（不会白拿）
    registerModifier(c, 'buff', ATTR.HP_MAX, { flat: 100 })
    expect(getEntityAttr(c, ATTR.HP_MAX)).toBe(200)
    expect(getEntityAttr(c, ATTR.HP)).toBe(150)                // 上限增益真能屯更多（裸值 150 全部读得到）
  })

  it('【正对照】无修正时读出来的值与修复前一致；常量上限钳制与"不反向"守卫逐位不变', () => {
    const c = { id: 'r1c', base: { 体力: 100, 体力上限: 120 } }
    configureAttributeEval({ definitions: { [ATTR.HP]: {}, [ATTR.HP_MAX]: {} } })
    expect(applyAttrDelta(c, ATTR.HP, 50, { clamp: true })).toEqual({ old: 100, new: 150 })
    expect(getEntityAttr(c, ATTR.HP)).toBe(120)                // 修复前也是读到 120（裸值只多存了 30）
    expect(applyAttrDelta(c, ATTR.HP, -200, { clamp: true })).toEqual({ old: 150, new: 0 })
    // ATTR_CAPS 常量分支（疲劳度 160，无 maxAttr）：钳制与"非负增量不减少裸值"守卫都在这条路上
    expect(applyAttrDelta(c, ATTR.FATIGUE, 999, { clamp: true })).toEqual({ old: 0, new: 160 })
    setEntityAttr(c, ATTR.FATIGUE, 200)                        // 裸值已高于常量上限（历史数据/上限被下调）
    expect(applyAttrDelta(c, ATTR.FATIGUE, 10, { clamp: true })).toEqual({ old: 200, new: 200 })
  })
})

describe('bindingResolver.getRaw × 基础值读取', () => {
  beforeEach(() => {
    __resetAttributeEval()
    entitySystem.clear()
    bindingResolver.loadBindings({ 'test-plugin': { hp: '体力' } })
  })

  it('get 给有效值，getRaw 给基础值（同一绑定键）', () => {
    const c = { id: 'b1', name: '绑定', base: { 体力: 100 } }
    entitySystem.register('character', 'b1', c)
    configureAttributeEval({ definitions: { 体力: {} } })
    registerModifier(c, 'buff', '体力', { flat: 20 })
    expect(bindingResolver.get('b1', 'hp')).toBe(120)      // 有效值
    expect(bindingResolver.getRaw('b1', 'hp')).toBe(100)   // 基础值
  })

  it('未绑定 / 实体不存在 / 属性缺失 → null（与 get 一致）', () => {
    expect(bindingResolver.getRaw('b1', 'hp')).toBeNull()          // 实体不存在
    const c = { id: 'b2', name: '空', base: {} }
    entitySystem.register('character', 'b2', c)
    expect(bindingResolver.getRaw('b2', 'hp')).toBeNull()          // 属性缺失
    expect(bindingResolver.getRaw('b2', '未绑定的键')).toBeNull()   // 无映射
  })
})
