import type { MapNode } from '../types/node'

const HORIZONTAL_GAP = 250
const VERTICAL_GAP = 100

export function autoLayout(nodes: MapNode[]): MapNode[] {
  const result = nodes.map(n => ({ ...n }))
  const childrenMap = new Map<string | null, MapNode[]>()
  for (const n of result) {
    const key = n.parent ?? '__null__'
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(n)
  }

  function layoutSub(parentId: string | null, startX: number, y: number): number {
    const children = childrenMap.get(parentId ?? '__null__') ?? []
    if (children.length === 0) return 0

    // Calculate total subtree width
    let totalWidth = 0
    const widths: number[] = []
    for (const child of children) {
      const subWidth = layoutSub(child.id, 0, y + VERTICAL_GAP)
      const w = Math.max(180, subWidth)
      widths.push(w)
      totalWidth += w
    }
    totalWidth += (children.length - 1) * HORIZONTAL_GAP

    // Position children centered under parent
    let x = startX - totalWidth / 2
    for (let i = 0; i < children.length; i++) {
      const cx = x + widths[i] / 2
      children[i].position = { x: cx, y }
      x += widths[i] + HORIZONTAL_GAP
    }
    return totalWidth
  }

  layoutSub(null, 400, 100)
  return result
}
