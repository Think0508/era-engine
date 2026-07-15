export interface LayoutClickZone {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutNode {
  id: string
  x: number
  y: number
  w: number
  h: number
  clickZones: LayoutClickZone[]
  zoom: [number, number]
}

export interface LayoutEdgePathPoint {
  x: number
  y: number
}

export interface LayoutEdge {
  from: string
  to: string
  path: LayoutEdgePathPoint[]
  zoom: [number, number]
}

export interface LayoutProject {
  version: number
  background?: string
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  subMaps: Record<string, string>
  zoomLevels: number
}
