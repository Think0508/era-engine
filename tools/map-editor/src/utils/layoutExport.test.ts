import { describe, it, expect } from 'vitest'
import { exportLayout } from './layoutExport'
import type { MapNode } from '../types/node'

const node = (id: string, attrs: Record<string, any> = {}): MapNode => ({
  id,
  name: id,
  type: 'region',
  parent: null,
  tags: [],
  visible: true,
  position: { x: 192, y: 108 },
  collapsed: false,
  attrs,
})

describe('layoutExport', () => {
  it('normalizes raw-pixel click zones using background dimensions', () => {
    const nodes = [node('a', { clickZones: [{ x: 960, y: 540, w: 192, h: 108 }] })]
    const layout = exportLayout(nodes, [], 1920, 1080)
    expect(layout.nodes[0].clickZones[0]).toEqual({ x: 0.5, y: 0.5, w: 0.1, h: 0.1 })
  })

  it('keeps already-normalized click zones unchanged', () => {
    const nodes = [node('a', { clickZones: [{ x: 0.3, y: 0.4, w: 0.1, h: 0.2 }] })]
    const layout = exportLayout(nodes, [], 1920, 1080)
    expect(layout.nodes[0].clickZones[0]).toEqual({ x: 0.3, y: 0.4, w: 0.1, h: 0.2 })
  })

  it('embeds background when provided and omits it otherwise', () => {
    expect(exportLayout([], [], 0, 0, 'data:image/png;base64,xxx').background).toBe('data:image/png;base64,xxx')
    expect(exportLayout([], [], 0, 0).background).toBeUndefined()
  })
})