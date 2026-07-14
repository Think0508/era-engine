export interface MapNode {
  id: string
  name: string
  type: string
  parent: string | null
  tags: string[]
  visible: boolean
  position: { x: number; y: number }
  collapsed: boolean
}
