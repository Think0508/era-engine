// 注释：属性有效值求值单元测试（2026-09-22，docs/superpowers/specs/2026-09-22-attribute-effective-value-design.md）
// ⚠️ 中文属性名属「结构数据」，必须经 helper 间接取（scan-attr-refs 契约：`obj['中文']` 会被判为属性引用）
import { describe, it, expect, beforeEach } from 'vitest'
import { errorReporter } from './error-reporter'
import {
  configureAttributeEval, readEffective, notifyAttrWrite, bumpDataVersion, __resetAttributeEval,
  registerModifier, removeModifier, clearModifiers, listModifiers,
} from './attribute-eval'

describe('attribute-eval：闸门（零回归保证）', () => {
  beforeEach(() => { __resetAttributeEval() })

  it('未配置任何定义时，一律原样返回裸值（含非数字）', () => {
    const e = { id: 'c1', base: { 力道: 10 } }
    expect(readEffective(e, '力道', 10)).toBe(10)
    expect(readEffective(e, '不存在', 0)).toBe(0)
    expect(readEffective(e, '性别', '女')).toBe('女')
  })

  it('定义了属性但既无 compute 也无修正 → 仍原样返回（恒等）', () => {
    configureAttributeEval({ definitions: { 力道: {} } })
    const e = { id: 'c1', base: { 力道: 10 } }
    expect(readEffective(e, '力道', 10)).toBe(10)
  })

  it('裸值不是数字 → 即使定义了 compute 也原样返回（保护对象型属性）', () => {
    configureAttributeEval({ definitions: { 快乐刻印: { compute: 'x.js' } }, scriptResolver: () => 'return 999' })
    const e = { id: 'c1', abilities: {} }
    const raw = { level: 3, xp: 0 }
    expect(readEffective(e, '快乐刻印', raw)).toBe(raw)
  })

  it('null / 非对象实体不崩，原样返回（entity 守卫是承载的）', () => {
    configureAttributeEval({
      definitions: { 力道: { compute: 'p.js' } },
      scriptResolver: () => 'return base',
      rawReader: () => 0,
    })
    expect(readEffective(null, '力道', 5)).toBe(5)
    expect(readEffective(undefined, '力道', 5)).toBe(5)
  })
})

describe('attribute-eval：缓存与版本失效', () => {
  beforeEach(() => { __resetAttributeEval() })

  it('compute 生效后：桩断言转为派生值（原 Task 1 用例的升级版）', () => {
    configureAttributeEval({
      definitions: { 力道: { compute: 'p.js' } },
      scriptResolver: () => 'return base + 1',
      rawReader: () => 0,
    })
    const e = { id: 'c1' }
    expect(readEffective(e, '力道', 10)).toBe(11)
  })

  it('bumpDataVersion 后仍按当前 raw 正确求值（失效计数由 Task 4 的脚本探针断言）', () => {
    configureAttributeEval({
      definitions: { 力道: { compute: 'p.js' } },
      scriptResolver: () => 'return base',
      rawReader: () => 0,
    })
    const e = { id: 'c1' }
    expect(readEffective(e, '力道', 10)).toBe(10)
    bumpDataVersion()
    expect(readEffective(e, '力道', 10)).toBe(10)
    expect(readEffective(e, '力道', 20)).toBe(20)
  })

  it('不同实体互不干扰（走缓存路径）', () => {
    configureAttributeEval({
      definitions: { 力道: { compute: 'p.js' } },
      scriptResolver: () => 'return base',
      rawReader: () => 0,
    })
    const a = { id: 'a' }
    const b = { id: 'b' }
    expect(readEffective(a, '力道', 10)).toBe(10)
    expect(readEffective(b, '力道', 20)).toBe(20)   // 若缓存不按实体隔离，这里会错误地返回 10
  })

  it('同一 (实体,属性) 换了 raw 必须重算，不得命中旧缓存', () => {
    configureAttributeEval({
      definitions: { 力道: { compute: 'p.js' } },
      scriptResolver: () => 'return base',
      rawReader: () => 0,
    })
    const e = { id: 'c1' }
    expect(readEffective(e, '力道', 10)).toBe(10)
    expect(readEffective(e, '力道', 20)).toBe(20)   // 缓存键若不比对 raw，这里会错误地返回 10
  })
})

describe('attribute-eval：修正栈与叠加代数', () => {
  beforeEach(() => {
    __resetAttributeEval()
    configureAttributeEval({ definitions: { 力道: {}, 根骨: {} } })
  })
  const e = () => ({ id: 'e1' })

  it('单条 flat / 单条 percent', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 5 })
    expect(readEffective(c, '力道', 100)).toBe(105)
    const c2 = e()
    registerModifier(c2, 'm1', '力道', { percent: 0.5 })
    expect(readEffective(c2, '力道', 100)).toBe(150)
  })

  it('flat 在 percent 之前（会被 percent 放大）', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 20, percent: 0.5 })
    expect(readEffective(c, '力道', 100)).toBe(180)   // (100+20)×1.5，不是 100×1.5+20
  })

  it('多条 percent **相加后只乘一次**（+10% 与 +20% → ×1.30）', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { percent: 0.1 })
    registerModifier(c, 'm2', '力道', { percent: 0.2 })
    expect(readEffective(c, '力道', 100)).toBeCloseTo(130, 10)
  })

  it('set 替换基准，flat/percent 仍作用其上；set 0 归零', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { set: 10, flat: 20, percent: 0.5 })
    expect(readEffective(c, '力道', 100)).toBe(45)    // (10+20)×1.5
    const c2 = e()
    registerModifier(c2, 'm1', '力道', { set: 0 })
    expect(readEffective(c2, '力道', 100)).toBe(0)
  })

  it('多个 set：后者覆盖', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { set: 10 })
    registerModifier(c, 'm2', '力道', { set: 30 })
    expect(readEffective(c, '力道', 100)).toBe(30)
  })

  it('同 (id, attr) 重复注册 = 覆盖（幂等，不累加）', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 5 })
    registerModifier(c, 'm1', '力道', { flat: 7 })
    expect(listModifiers(c).length).toBe(1)
    expect(readEffective(c, '力道', 100)).toBe(107)
  })

  it('removeModifier 按 id（可限定 attr）移除；clearModifiers 清空', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 5 })
    registerModifier(c, 'm2', '根骨', { flat: 3 })
    expect(removeModifier(c, 'm1')).toBe(1)
    expect(readEffective(c, '力道', 100)).toBe(100)
    expect(readEffective(c, '根骨', 100)).toBe(103)
    clearModifiers(c)
    expect(listModifiers(c).length).toBe(0)
    expect(readEffective(c, '根骨', 100)).toBe(100)
  })

  it('修正栈变更使缓存失效（改完立刻生效，不需要额外 bump）', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { flat: 5 })
    expect(readEffective(c, '力道', 100)).toBe(105)
    registerModifier(c, 'm1', '力道', { flat: 50 })
    expect(readEffective(c, '力道', 100)).toBe(150)
    removeModifier(c, 'm1')
    expect(readEffective(c, '力道', 100)).toBe(100)
  })

  it('修正只影响被挂的属性；同一实体其他属性不受影响', () => {
    const c = e()
    registerModifier(c, 'm1', '力道', { percent: 1 })
    expect(readEffective(c, '力道', 100)).toBe(200)
    expect(readEffective(c, '根骨', 100)).toBe(100)
  })

  it('只有修正、没有属性定义时闸门仍拦截（定义是前提）', () => {
    const c = e()
    registerModifier(c, 'm1', '未定义属性', { flat: 99 })
    expect(readEffective(c, '未定义属性', 1)).toBe(1)
  })
})

describe('attribute-eval：compute 派生', () => {
  beforeEach(() => { __resetAttributeEval() })
  const e = () => ({ id: 'c1', base: { 根骨: 50, 最大气血: 300 } })

  const withScripts = (scripts: Record<string, string>, defs?: Record<string, any>) => {
    configureAttributeEval({
      definitions: defs ?? { 最大气血: { compute: 'calc.js' } },
      scriptResolver: (n: string) => scripts[n],
      rawReader: (ent: any, n: string) => ent.base?.[n] ?? 0,
    })
  }

  it('compute 生效：脚本把 base 当成长项参与（成长不被吞）', () => {
    withScripts({ 'calc.js': 'return base + attrs.get("根骨") * 10' })
    expect(readEffective(e(), '最大气血', 300)).toBe(800)   // 300 + 50×10
  })

  it('其他属性带修正时，compute 读到的是有效值', () => {
    // ⚠️ 偏离 brief 的逐字代码（Task 4 执行期修正）：brief 此处只传 scripts，defs 走默认值
    //    { 最大气血: { compute } }，但 根骨 未定义 → 被闸门 `if (!def) return raw` 拦下，
    //    修正不生效（实得 800 ≠ 期望 900）。闸门是零回归前提（既有用例「只有修正、没有属性
    //    定义时闸门仍拦截（定义是前提）」），实现不得让步；故按 brief helper 自带的 defs 形参
    //    补上 根骨 定义 —— 与同块缓存用例（已声明 根骨: {}）及真实 mod（attributes.toml 里
    //    每个属性都有定义）一致。用例意图（compute 读到带修正的有效值）不变。
    withScripts(
      { 'calc.js': 'return base + attrs.get("根骨") * 10' },
      { 最大气血: { compute: 'calc.js' }, 根骨: {} },
    )
    const c = e()
    registerModifier(c, 'buff', '根骨', { flat: 10 })      // 根骨 50 → 60
    expect(readEffective(c, '最大气血', 300)).toBe(900)     // 300 + 60×10
  })

  it('修正叠在 compute 产物之上（spec D6：先派生后叠修正）', () => {
    withScripts({ 'calc.js': 'return base + attrs.get("根骨") * 10' })
    const c = e()
    registerModifier(c, 'm', '最大气血', { percent: -0.5 })
    expect(readEffective(c, '最大气血', 300)).toBe(400)     // 800 ×0.5
  })

  it('脚本文件缺失 → 回退裸值 + 上报一次', () => {
    withScripts({})
    expect(readEffective(e(), '最大气血', 300)).toBe(300)
    expect(errorReporter.getErrors().some(x => x.message.includes('calc.js'))).toBe(true)
  })

  it('脚本抛错 → 回退裸值 + 上报', () => {
    withScripts({ 'calc.js': 'throw "boom"' })
    expect(readEffective(e(), '最大气血', 300)).toBe(300)
    expect(errorReporter.getErrors().some(x => x.message.includes('calc.js'))).toBe(true)
  })

  it('返回非有限数 → 回退裸值 + 上报', () => {
    withScripts({ 'calc.js': 'return NaN' })
    expect(readEffective(e(), '最大气血', 300)).toBe(300)
    withScripts({ 'calc.js': 'return "不是数字"' })
    expect(readEffective(e(), '最大气血', 300)).toBe(300)
  })

  it('自引用 → 深度护栏断链 + 上报（不栈溢出）', () => {
    withScripts({ 'calc.js': 'return attrs.get("最大气血") + 1' })
    const v = readEffective(e(), '最大气血', 300)
    expect(typeof v).toBe('number')
    expect(errorReporter.getErrors().some(x => x.message.includes('深度上限'))).toBe(true)
  })

  it('缓存：同版本重复读只执行一次脚本；写入后重算', () => {
    let probes = 0
    configureAttributeEval({
      definitions: { 最大气血: { compute: 'calc.js' }, 根骨: {} },
      scriptResolver: () => 'return base + attrs.get("根骨")',
      rawReader: () => { probes++; return 0 },     // 脚本每执行一次就探一次底
    })
    const c = { id: 'c2' }
    expect(readEffective(c, '最大气血', 300)).toBe(300)
    expect(readEffective(c, '最大气血', 300)).toBe(300)
    expect(probes).toBe(1)                          // 第二次命中缓存，脚本没再跑
    notifyAttrWrite(c)
    readEffective(c, '最大气血', 300)
    expect(probes).toBe(2)                          // 写后缓存失效 → 重算
  })
})
