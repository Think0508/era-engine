import { describe, it, expect } from 'vitest'
import { autoLayout } from './autoLayout'
import type { MapNode } from '../types/node'

describe('autoLayout', () => {
  it('positions root at center', () => {
    const nodes: MapNode[] = [
      { id: 'root', name: 'Root', type: 'region', parent: null, tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
    ]
    const laid = autoLayout(nodes)
    expect(laid[0].position).toEqual({ x: 400, y: 100 })
  })

  it('centers children under root', () => {
    const nodes: MapNode[] = [
      { id: 'root', name: 'Root', type: 'region', parent: null, tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'c1', name: 'C1', type: 'city', parent: 'root', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'c2', name: 'C2', type: 'city', parent: 'root', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
    ]
    const laid = autoLayout(nodes)
    const root = laid.find(n => n.id === 'root')!
    const children = laid.filter(n => n.parent === 'root')
    expect(root.position).toEqual({ x: 400, y: 100 })
    // Children centered under root (root at 400, children centered around 400)
    const mid = (children[0].position.x + children[1].position.x) / 2
    expect(Math.abs(mid - root.position.x)).toBeLessThan(1)
    expect(children[0].position.y).toBe(200)
    expect(children[1].position.y).toBe(200)
  })

  it('handles 3-level tree', () => {
    const nodes: MapNode[] = [
      { id: 'r', name: 'R', type: 'region', parent: null, tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'c', name: 'C', type: 'city', parent: 'r', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'gc', name: 'GC', type: 'building', parent: 'c', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
    ]
    const laid = autoLayout(nodes)
    const child = laid.find(n => n.id === 'c')!
    const grandchild = laid.find(n => n.id === 'gc')!
    expect(grandchild.position.y).toBe(300) // r=100, c=200, gc=300
    expect(Math.abs(grandchild.position.x - child.position.x)).toBeLessThan(1)
  })

  it('handles empty input', () => {
    expect(autoLayout([])).toEqual([])
  })
})
