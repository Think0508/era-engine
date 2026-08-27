import type { MapNode } from './node'
import type { MapEdge } from './edge'

export interface VisualMapContext {
  backgroundPath?: string
  bgImageWidth?: number
  bgImageHeight?: number
  nodePositions?: Record<string, { x: number; y: number }>
}

export interface MapProject {
  version: number
  name: string
  sourcePath?: string
  viewport: { x: number; y: number; zoom: number }
  backgroundPath?: string
  bgImageWidth?: number
  bgImageHeight?: number
  visualMaps?: Record<string, VisualMapContext>
  tagColors?: Record<string, string>
  nodes: MapNode[]
  edges: MapEdge[]
}
