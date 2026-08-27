import { describe, it, expect } from 'vitest'
import { validateMap } from './validate'
import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'

const node = (id: string, parent: string | null = null): MapNode => ({
  id,
  name: id,
  type: 'region',
  parent,
  tags: [],
  visible: true,
  position: { x: 0, y: 0 },
  collapsed: false,
})

const edge = (id: string, from: string, to: string): MapEdge => ({
  id,
  from,
  to,
  timeCost: 10,
  direction: 'directed',
})

describe('validateMap', () => {
  it('accepts a connected tree with no warnings', () => {
    const nodes = [node('a'), node('b', 'a')]
    const edges = [edge('e1', 'b', 'a')]
    const result = validateMap(nodes, edges)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('reports missing parent', () => {
    const nodes = [node('a', 'ghost')]
    const result = validateMap(nodes, [])
    expect(result.errors.some(e => e.includes("parent 'ghost'"))).toBe(true)
  })

  it('reports edge referencing missing node', () => {
    const result = validateMap([node('a')], [edge('e1', 'a', 'ghost')])
    expect(result.errors.some(e => e.includes("'ghost' 不存在"))).toBe(true)
  })

  it('reports duplicate ids', () => {
    const result = validateMap([node('a'), node('a')], [])
    expect(result.errors.some(e => e.includes('重复地点 ID：a'))).toBe(true)
  })

  it('reports parent cycles', () => {
    const result = validateMap([node('a', 'b'), node('b', 'a')], [])
    expect(result.errors.some(e => e.includes('parent 环'))).toBe(true)
  })

  it('warns about unreachable root', () => {
    const result = validateMap([node('a')], [])
    expect(result.warnings.some(e => e.includes("'a' 不可达"))).toBe(true)
  })
})