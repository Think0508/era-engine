import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'
import { findParentCycle } from './autoLayout'

export interface ValidationResult {
  errors: string[]
  warnings: string[]
}

export function validateMap(nodes: MapNode[], edges: MapEdge[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const ids = new Set(nodes.map(n => n.id))

  const seen = new Set<string>()
  for (const n of nodes) {
    if (seen.has(n.id)) errors.push(`重复地点 ID：${n.id}`)
    seen.add(n.id)
  }

  for (const n of nodes) {
    if (n.parent && !ids.has(n.parent)) {
      errors.push(`地点 '${n.id}' 的 parent '${n.parent}' 不存在`)
    }
  }

  for (const e of edges) {
    if (!ids.has(e.from)) errors.push(`边 '${e.id}' 起点 '${e.from}' 不存在`)
    if (!ids.has(e.to)) errors.push(`边 '${e.id}' 终点 '${e.to}' 不存在`)
  }

  const cycle = findParentCycle(nodes)
  if (cycle) errors.push(`parent 环：${cycle.join(' -> ')}`)

  const referenced = new Set<string>()
  for (const e of edges) referenced.add(e.to)
  for (const n of nodes) if (n.parent) referenced.add(n.id)
  for (const n of nodes) {
    if (!n.parent && !referenced.has(n.id)) {
      warnings.push(`顶级地点 '${n.id}' 不可达（无 graph 边指向它，也无 parent）`)
    }
  }

  return { errors, warnings }
}