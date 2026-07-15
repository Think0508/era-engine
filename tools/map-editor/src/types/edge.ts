export type EdgeDirection = 'directed' | 'reverse' | 'bidirectional'

export interface MapEdge {
  id: string
  from: string
  to: string
  timeCost: number
  direction: EdgeDirection
  condition?: string
  attrs?: Record<string, any>
}
