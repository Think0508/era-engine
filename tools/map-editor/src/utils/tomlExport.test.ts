import { describe, it, expect } from 'vitest'
import { parse } from '@iarna/toml'
import { exportToToml } from './tomlExport'

describe('tomlExport', () => {
  it('exports nodes to [[locations]] TOML', async () => {
    const nodes = [
      { id: 'a', name: 'A', type: 'r', parent: null, tags: ['x'], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'b', name: 'B', type: 'c', parent: 'a', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
    ] as any
    const r = await exportToToml(nodes, [])
    expect(r.locationCount).toBe(2)
    expect(r.locationsToml).toContain('id = "a"')
    expect(r.locationsToml).toContain('parent = "a"')
  })

  it('exports invisible flag', async () => {
    const nodes = [
      { id: 'x', name: 'X', type: 'r', parent: null, tags: [], visible: false, position: { x: 0, y: 0 }, collapsed: false },
    ] as any
    const r = await exportToToml(nodes, [])
    expect(r.locationsToml).toContain('visible = false')
  })

  it('handles empty input', async () => {
    const r = await exportToToml([], [])
    expect(r.locationCount).toBe(0)
    expect(r.edgeCount).toBe(0)
  })

  it('exports bidirectional edge as two directed edges', async () => {
    const edges = [
      { id: 'e1', from: 'a', to: 'b', timeCost: 10, direction: 'bidirectional' as const, attrs: undefined },
    ]
    const r = await exportToToml([], edges)
    const parsed = parse(r.edgesToml) as any
    expect(parsed.edges).toHaveLength(2)
    expect(parsed.edges[0]).toMatchObject({ from: 'a', to: 'b', time_cost: 10 })
    expect(parsed.edges[1]).toMatchObject({ from: 'b', to: 'a', time_cost: 10 })
  })

  it('exports reverse edge with from/to swapped', async () => {
    const edges = [
      { id: 'e1', from: 'a', to: 'b', timeCost: 6, direction: 'reverse' as const, attrs: undefined },
    ]
    const r = await exportToToml([], edges)
    const parsed = parse(r.edgesToml) as any
    expect(parsed.edges).toHaveLength(1)
    expect(parsed.edges[0]).toMatchObject({ from: 'b', to: 'a', time_cost: 6 })
  })

  it('exports directed edge as-is', async () => {
    const edges = [
      { id: 'e1', from: 'a', to: 'b', timeCost: 3, direction: 'directed' as const, attrs: undefined },
    ]
    const r = await exportToToml([], edges)
    const parsed = parse(r.edgesToml) as any
    expect(parsed.edges).toHaveLength(1)
    expect(parsed.edges[0]).toMatchObject({ from: 'a', to: 'b', time_cost: 3 })
  })
})
