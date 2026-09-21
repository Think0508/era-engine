// 注释：属性有效值求值单元测试（2026-09-22，docs/superpowers/specs/2026-09-22-attribute-effective-value-design.md）
// ⚠️ 中文属性名属「结构数据」，必须经 helper 间接取（scan-attr-refs 契约：`obj['中文']` 会被判为属性引用）
import { describe, it, expect, beforeEach } from 'vitest'
import {
  configureAttributeEval, readEffective, bumpDataVersion, __resetAttributeEval,
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

  it('配置了 compute 的属性：桩阶段仍返回裸值（Task 4 换成派生值）', () => {
    configureAttributeEval({
      definitions: { 力道: { compute: 'p.js' } },
      scriptResolver: () => 'return base + 1',
      rawReader: () => 0,
    })
    const e = { id: 'c1' }
    expect(readEffective(e, '力道', 10)).toBe(10)
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
