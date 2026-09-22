// 注释：属性读取接入有效值管线后的集成测试（2026-09-22）
// 覆盖：① 未配置定义时行为不变（零回归）② 定义 + 修正 → 读出有效值
//       ③ setEntityAttr 写后缓存失效 ④ 非数字属性不受影响 ⑤ 下游消费方（clampAttrValue）
//       自动看到有效值（条件引擎/bindings 同走 getEntityAttr，属同一传递性质）
import { describe, it, expect, beforeEach } from 'vitest'
import { getEntityAttr, setEntityAttr, clampAttrValue, ATTR } from './entity-utils'
import { configureAttributeEval, registerModifier, __resetAttributeEval } from './attribute-eval'

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
