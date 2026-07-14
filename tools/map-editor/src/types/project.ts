import type { MapNode } from './node'
import type { MapEdge } from './edge'

export interface MapProject {
  version: number
  name: string
  sourcePath?: string
  viewport: { x: number; y: number; zoom: number }
  nodes: MapNode[]
  edges: MapEdge[]
}
