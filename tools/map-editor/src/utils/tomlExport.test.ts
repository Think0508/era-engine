import { describe, it, expect } from 'vitest'
import { exportToToml } from './tomlExport'
import parse from '@iarna/toml/parse-string.js'
import type { MapNode } from '../types/node'

describe('tomlExport', () => {
  it('exports nodes to [[locations]] TOML', () => {
    const nodes: MapNode[] = [
      { id: 'a', name: 'A', type: 'r', parent: null, tags: ['x'], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'b', name: 'B', type: 'c', parent: 'a', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
    ]
    const r = exportToToml(nodes, [])
    const parsed = parse(r.locationsToml) as any
    expect(parsed.locations).toHaveLength(2)
    expect(parsed.locations[0].id).toBe('a')
    expect(parsed.locations[1].parent).toBe('a')
  })

  it('exports invisible flag', () => {
    const nodes: MapNode[] = [
      { id: 'x', name: 'X', type: 'r', parent: null, tags: [], visible: false, position: { x: 0, y: 0 }, collapsed: false },
    ]
    const r = exportToToml(nodes, [])
    const parsed = parse(r.locationsToml) as any
    expect(parsed.locations[0].visible).toBe(false)
  })

  it('handles empty input', () => {
    const r = exportToToml([], [])
    expect(r.locationCount).toBe(0)
    expect(r.edgeCount).toBe(0)
  })
})
