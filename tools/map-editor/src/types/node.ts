export interface MapNode {
  id: string
  name: string
  type: string
  parent: string | null
  tags: string[]
  visible: boolean
  position: { x: number; y: number }
  collapsed: boolean
  /** 未知 TOML 属性透传（如 description, custom_field 等） */
  attrs?: Record<string, any>
}
