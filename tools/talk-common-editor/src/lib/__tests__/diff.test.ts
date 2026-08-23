import { describe, expect, it } from 'vitest'
import { diffLines } from '../diff'

describe('diffLines', () => {
  it('相同行标记 same', () => {
    const ops = diffLines(['a', 'b'], ['a', 'b'])
    expect(ops.every((o) => o.type === 'same')).toBe(true)
    expect(ops).toHaveLength(2)
  })

  it('新增行标记 add', () => {
    const ops = diffLines(['a'], ['a', 'b'])
    expect(ops.map((o) => o.type)).toEqual(['same', 'add'])
  })

  it('删除行标记 del', () => {
    const ops = diffLines(['a', 'b'], ['a'])
    expect(ops.map((o) => o.type)).toEqual(['same', 'del'])
  })

  it('修改 = 删 + 增', () => {
    const ops = diffLines(['a', 'old', 'c'], ['a', 'new', 'c'])
    const types = ops.map((o) => o.type)
    expect(types).toEqual(['same', 'del', 'add', 'same'])
  })
})