import stringify from '@iarna/toml/stringify.js'
import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'

export interface ExportResult {
  locationsToml: string
  edgesToml: string
  locationCount: number
  edgeCount: number
}

export function exportToToml(nodes: MapNode[], edges: MapEdge[]): ExportResult {
  const locEntries = nodes.map(n => ({
    id: n.id,
    name: n.name,
    type: n.type,
    ...(n.parent ? { parent: n.parent } : {}),
    tags: n.tags,
    ...(n.visible ? {} : { visible: false }),
  }))

  const locationsToml = stringify({ locations: locEntries } as any)

  const edgeEntries = edges.map(e => ({
    from: e.from,
    to: e.to,
    time_cost: e.timeCost,
    ...(e.condition ? { condition: e.condition } : {}),
  }))

  const edgesToml = stringify({ edges: edgeEntries } as any)

  return { locationsToml, edgesToml, locationCount: nodes.length, edgeCount: edges.length }
}
