import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'

const KNOWN_LOC_FIELDS = new Set(['id', 'name', 'type', 'parent', 'tags', 'visible', 'exits', 'position', 'collapsed', 'attrs'])
const KNOWN_EDGE_FIELDS = new Set(['from', 'to', 'time_cost', 'condition', 'attrs'])

export interface ExportResult {
  locationsToml: string
  edgesToml: string
  locationCount: number
  edgeCount: number
}

export async function exportToToml(nodes: MapNode[], edges: MapEdge[]): Promise<ExportResult> {
  const { default: stringify } = await import('@iarna/toml/stringify.js')

  const locEntries = nodes.map(n => {
    // Filter attrs to exclude any that shadow known fields
    const safeAttrs = n.attrs ? Object.fromEntries(
      Object.entries(n.attrs).filter(([k]) => !KNOWN_LOC_FIELDS.has(k))
    ) : {}
    return {
      id: n.id,
      name: n.name,
      type: n.type,
      ...(n.parent ? { parent: n.parent } : {}),
      tags: n.tags,
      ...(n.visible ? {} : { visible: false }),
      ...safeAttrs,
    }
  })

  const locationsToml = stringify({ locations: locEntries } as any)

  const edgeEntries = edges.map(e => {
    const safeAttrs = e.attrs ? Object.fromEntries(
      Object.entries(e.attrs).filter(([k]) => !KNOWN_EDGE_FIELDS.has(k))
    ) : {}
    return {
      from: e.from,
      to: e.to,
      time_cost: e.timeCost,
      ...(e.condition ? { condition: e.condition } : {}),
      ...safeAttrs,
    }
  })

  const edgesToml = stringify({ edges: edgeEntries } as any)

  return { locationsToml, edgesToml, locationCount: nodes.length, edgeCount: edges.length }
}
