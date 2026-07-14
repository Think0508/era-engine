import type { MapNode } from '../types/node'

const HORIZONTAL_GAP = 250
const VERTICAL_GAP = 100

export function autoLayout(nodes: MapNode[]): MapNode[] {
  if (nodes.length === 0) return []
  const result = nodes.map(n => ({ ...n }))

  // Build children map
  const childrenOf = new Map<string | null, MapNode[]>()
  for (const n of result) {
    const key = n.parent ?? '__null__'
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(n)
  }

  // Pass 1: compute subtree width for each node
  const subtreeWidth = new Map<string, number>()
  function computeWidth(id: string | null): number {
    const children = childrenOf.get(id ?? '__null__') ?? []
    if (children.length === 0) return 180
    let total = 0
    for (const child of children) {
      total += computeWidth(child.id)
    }
    total += (children.length - 1) * HORIZONTAL_GAP
    subtreeWidth.set(id ?? '__root__', total)
    return total
  }
  computeWidth(null)

  // Pass 2: position nodes top-down
  function position(parentId: string | null, centerX: number, y: number) {
    const children = childrenOf.get(parentId ?? '__null__') ?? []
    if (children.length === 0) return
    const totalW = subtreeWidth.get(parentId ?? '__root__') ?? 0
    let x = centerX - totalW / 2
    for (const child of children) {
      const childW = subtreeWidth.get(child.id) ?? 180
      const cx = x + childW / 2
      child.position = { x: cx, y }
      position(child.id, cx, y + VERTICAL_GAP)
      x += childW + HORIZONTAL_GAP
    }
  }

  position(null, 400, 100)
  return result
}
