import { describe, it, expect } from 'vitest'
import { autoLayout } from './autoLayout'
import type { MapNode } from '../types/node'

describe('autoLayout', () => {
  it('positions root node and children', () => {
    const nodes: MapNode[] = [
      { id: 'root', name: 'Root', type: 'region', parent: null, tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'child1', name: 'C1', type: 'city', parent: 'root', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'child2', name: 'C2', type: 'city', parent: 'root', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
    ]
    const laid = autoLayout(nodes)
    const root = laid.find(n => n.id === 'root')!
    expect(root.position.x).toBeGreaterThan(0)
    expect(root.position.y).toBe(100)
    const children = laid.filter(n => n.parent === 'root')
    expect(children[0].position.y).toBe(200)
    expect(children[0].position.x).not.toBe(children[1].position.x)
  })

  it('handles empty input', () => {
    const laid = autoLayout([])
    expect(laid).toEqual([])
  })
})
