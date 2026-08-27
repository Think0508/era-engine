import type { MapNode } from '../types/node'
import type { MapEdge, EdgeDirection } from '../types/edge'

interface RawEdge {
  from: string
  to: string
  time_cost?: number
  condition?: string
  [key: string]: any
}

export interface ImportResult {
  nodes: MapNode[]
  edges: MapEdge[]
}

const KNOWN_LOC_FIELDS = new Set(['id', 'name', 'type', 'parent', 'tags', 'visible'])
const KNOWN_EDGE_FIELDS = new Set(['from', 'to', 'time_cost', 'condition'])

export async function parseLocationsToml(raw: string, _regionId: string): Promise<MapNode[]> {
  const { default: parse } = await import('@iarna/toml/parse-string.js')
  const data = parse(raw) as any
  const entries: any[] = data.locations ?? [data]
  const nodes: MapNode[] = []

  for (const loc of entries) {
    if (!loc.id) continue
    // Collect unknown fields into attrs for round-trip preservation
    const attrs: Record<string, any> = {}
    for (const key of Object.keys(loc)) {
      if (!KNOWN_LOC_FIELDS.has(key)) attrs[key] = loc[key]
    }
    nodes.push({
      id: loc.id,
      name: loc.name ?? loc.id,
      type: loc.type ?? 'unknown',
      parent: loc.parent ?? null,
      tags: loc.tags ?? [],
      visible: loc.visible !== false,
      position: { x: 0, y: 0 },
      collapsed: false,
      attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
    })
  }
  return nodes
}

export async function parseGraphToml(raw: string): Promise<RawEdge[]> {
  const { default: parse } = await import('@iarna/toml/parse-string.js')
  const data = parse(raw) as any
  return (data.edges as RawEdge[]) ?? []
}

function edgeAttrs(e: RawEdge): Record<string, any> {
  const attrs: Record<string, any> = {}
  for (const key of Object.keys(e)) {
    if (!KNOWN_EDGE_FIELDS.has(key)) attrs[key] = e[key]
  }
  return attrs
}

function sameEdgeProps(a: RawEdge, b: RawEdge): boolean {
  return (a.time_cost ?? 10) === (b.time_cost ?? 10)
    && (a.condition ?? null) === (b.condition ?? null)
    && JSON.stringify(edgeAttrs(a)) === JSON.stringify(edgeAttrs(b))
}

export function edgesToMapEdges(raw: RawEdge[]): MapEdge[] {
  const used = new Set<number>()
  const edges: MapEdge[] = []

  for (let i = 0; i < raw.length; i++) {
    if (used.has(i)) continue
    const e = raw[i]
    const reverseIdx = raw.findIndex((r, j) =>
      j !== i && !used.has(j) && r.from === e.to && r.to === e.from && sameEdgeProps(e, r)
    )

    const attrs = edgeAttrs(e)
    edges.push({
      id: `edge_${edges.length}`,
      from: e.from,
      to: e.to,
      timeCost: e.time_cost ?? 10,
      direction: reverseIdx >= 0 ? 'bidirectional' as EdgeDirection : 'directed' as EdgeDirection,
      condition: e.condition,
      attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
    })
    if (reverseIdx >= 0) used.add(reverseIdx)
  }

  return edges
}

export async function importFromDir(mapsDir: string): Promise<ImportResult> {
  const allNodes: MapNode[] = []
  let allEdges: MapEdge[] = []

  async function readTomlFiles(dir: string): Promise<{ content: string }[]> {
    const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
    const results: { content: string }[] = []
    const entries = await readDir(dir)
    for (const entry of entries) {
      if (entry.isFile && entry.name.endsWith('.toml')) {
        results.push({ content: await readTextFile(`${dir}/${entry.name}`) })
      }
    }
    return results
  }

  const { exists } = await import('@tauri-apps/plugin-fs')
  if (await exists(`${mapsDir}/locations`)) {
    const locFiles = await readTomlFiles(`${mapsDir}/locations`)
    for (const { content } of locFiles) {
      allNodes.push(...await parseLocationsToml(content, 'imported'))
    }
  }

  if (await exists(`${mapsDir}/graph`)) {
    const graphFiles = await readTomlFiles(`${mapsDir}/graph`)
    for (const { content } of graphFiles) {
      allEdges.push(...edgesToMapEdges(await parseGraphToml(content)))
    }
  }

  // 多文件 graph 拼接后全局重编号，避免不同文件里相同的 edge_0/edge_1 冲突
  allEdges = allEdges.map((e, i) => ({ ...e, id: `edge_${i}` }))

  return { nodes: allNodes, edges: allEdges }
}
