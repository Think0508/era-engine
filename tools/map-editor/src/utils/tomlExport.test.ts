import { describe, it, expect } from 'vitest'
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
})
