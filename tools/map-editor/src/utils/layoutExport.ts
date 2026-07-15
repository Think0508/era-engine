import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'
import type { LayoutProject } from '../types/layout'

export function exportLayout(
  nodes: MapNode[],
  edges: MapEdge[],
  bgWidth: number,
  bgHeight: number,
): LayoutProject {
  const toProp = (px: number, max: number) => (max > 0 ? px / max : 0)

  const layoutNodes = nodes.map(n => {
    const attrs = (n as any).attrs ?? {}
    const clickZones = (attrs.clickZones ?? []).map((z: any) => ({
      x: z.x, y: z.y, w: z.w, h: z.h,
    }))
    const zoom: [number, number] = attrs.zoom ?? [1, 1]
    return {
      id: n.id,
      x: toProp(n.position.x, bgWidth),
      y: toProp(n.position.y, bgHeight),
      w: 0.08,
      h: 0.06,
      clickZones,
      zoom,
    }
  })

  const layoutEdges = edges.map(e => {
    const attrs = (e as any).attrs ?? {}
    const path = (attrs.path ?? []).map((p: any) => ({ x: p.x, y: p.y }))
    const zoom: [number, number] = attrs.zoom ?? [1, 1]
    return { from: e.from, to: e.to, path, zoom }
  })

  return {
    version: 1,
    nodes: layoutNodes,
    edges: layoutEdges,
    subMaps: {},
    zoomLevels: 3,
  }
}
