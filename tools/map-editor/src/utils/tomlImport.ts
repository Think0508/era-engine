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

export async function parseLocationsToml(raw: string, _regionId: string): Promise<MapNode[]> {
  const { default: parse } = await import('@iarna/toml/parse-string.js')
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

export async function parseGraphToml(raw: string): Promise<RawEdge[]> {
  const { default: parse } = await import('@iarna/toml/parse-string.js')
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

export async function importFromDir(mapsDir: string): Promise<ImportResult> {
  const allNodes: MapNode[] = []
  const allEdges: MapEdge[] = []

  async function readTomlFiles(dir: string): Promise<{ content: string }[]> {
    const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
    const results: { content: string }[] = []
    const entries = await readDir(dir)
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`
      if (entry.isDirectory) {
        results.push(...await readTomlFiles(fullPath))
      } else if (entry.isFile && entry.name.endsWith('.toml')) {
        results.push({ content: await readTextFile(fullPath) })
      }
    }
    return results
  }

  try {
    const locFiles = await readTomlFiles(`${mapsDir}/locations`)
    for (const { content } of locFiles) {
      allNodes.push(...await parseLocationsToml(content, 'imported'))
    }
  } catch { /* no locations dir */ }

  try {
    const graphFiles = await readTomlFiles(`${mapsDir}/graph`)
    for (const { content } of graphFiles) {
      allEdges.push(...edgesToMapEdges(await parseGraphToml(content)))
    }
  } catch { /* no graph dir */ }

  return { nodes: allNodes, edges: allEdges }
}
