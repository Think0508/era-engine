import type { MapNode } from '../types/node'

const HORIZONTAL_GAP = 250
const VERTICAL_GAP = 100

export function findParentCycle(nodes: MapNode[]): string[] | null {
  const childrenOf = new Map<string, MapNode[]>()
  for (const n of nodes) {
    const key = n.parent ?? '__null__'
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(n)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []

  function dfs(id: string): string[] | null {
    if (visiting.has(id)) {
      const start = stack.indexOf(id)
      return stack.slice(start).concat(id)
    }
    if (visited.has(id)) return null
    visiting.add(id)
    stack.push(id)
    for (const child of childrenOf.get(id) ?? []) {
      const cycle = dfs(child.id)
      if (cycle) return cycle
    }
    stack.pop()
    visiting.delete(id)
    visited.add(id)
    return null
  }

  for (const n of nodes) {
    const cycle = dfs(n.id)
    if (cycle) return cycle
  }
  return null
}

export function wouldCreateParentCycle(nodes: MapNode[], id: string, newParent: string | null): boolean {
  if (!newParent || newParent === id) return newParent === id
  const seen = new Set<string>()
  let cur: string | null = newParent
  while (cur) {
    if (cur === id) return true
    if (seen.has(cur)) break
    seen.add(cur)
    cur = nodes.find(n => n.id === cur)?.parent ?? null
  }
  return false
}

export function autoLayout(nodes: MapNode[]): MapNode[] {
  if (nodes.length === 0) return []
  const cycle = findParentCycle(nodes)
  if (cycle) throw new Error(`parent 环检测：${cycle.join(' -> ')}`)
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
