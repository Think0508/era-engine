// 角色生命周期管理
// pending → active（条件满足后动态创建 entity）
// active  → dead（set_field 设 status）

import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { evaluateCondition } from './condition'
import { modLoader, type PendingSpawn } from './mod-loader'
import type { EntityData } from './types'

let processedIds = new Set<string>()

/** 检查所有待激活角色，条件满足的注册到 entity-system */
export function processPendingSpawns(): void {
  const mod = modLoader.getMod() as (typeof modLoader.getMod) extends () => infer R ? R : any
  const pending = (mod as any)?.pendingSpawns as PendingSpawn[] | undefined
  if (!pending || pending.length === 0) return

  const ctx = gameContext.getContext()
  const toRemove: number[] = []

  for (let i = 0; i < pending.length; i++) {
    const spawn = pending[i]
    // 已激活过的不再检查
    if (processedIds.has(spawn.id)) continue

    try {
      const result = evaluateCondition(spawn.condition, ctx)
      if (result) {
        const data = { ...spawn.data, status: 'active' }
        entitySystem.register('character', spawn.id, data)
        processedIds.add(spawn.id)
        toRemove.push(i)
      }
    } catch {
      // condition 求值失败（如依赖的角色不存在），忽略
    }
  }

  // 移除已激活的条目
  if (toRemove.length > 0) {
    const remaining = pending.filter((_, i) => !toRemove.includes(i))
    if (remaining.length === 0) {
      delete (mod as any).pendingSpawns
    } else {
      ;(mod as any).pendingSpawns = remaining
    }
  }
}

/** 标记角色为死亡（不跑 AI、不显示，但 entity 保留供条件查询）*/
export function setCharStatus(charId: string, status: string): void {
  const char = entitySystem.get('character', charId) as any
  if (char) char.status = status
}

/** 重置（用于测试或新游戏）*/
export function resetPendingSpawns(): void {
  processedIds.clear()
}
