import { parse } from '@iarna/toml'
import type { MapNode } from '../types/node'
import type { MapEdge, EdgeDirection } from '../types/edge'

interface RawEdge {
  from: string
  to: string
  time_cost?: number
  condition?: string
}

export interface ImportResult {
  nodes: MapNode[]
  edges: MapEdge[]
}

export function parseLocationsToml(raw: string, _regionId: string): MapNode[] {
  const data = parse(raw) as any
  const entries: any[] = data.locations ?? [data]
  const nodes: MapNode[] = []

  for (const loc of entries) {
    if (!loc.id) continue
    nodes.push({
      id: loc.id,
      name: loc.name ?? loc.id,
      type: loc.type ?? 'unknown',
      parent: loc.parent ?? null,
      tags: loc.tags ?? [],
      visible: loc.visible !== false,
      position: { x: 0, y: 0 },
      collapsed: false,
    })
  }
  return nodes
}

export function parseGraphToml(raw: string): RawEdge[] {
  const data = parse(raw) as any
  return (data.edges as RawEdge[]) ?? []
}

export function edgesToMapEdges(raw: RawEdge[]): MapEdge[] {
  return raw.map((e, i) => ({
    id: `edge_${i}`,
    from: e.from,
    to: e.to,
    timeCost: e.time_cost ?? 10,
    direction: 'bidirectional' as EdgeDirection,
    condition: e.condition,
  }))
}
