// 角色生命周期管理
// pending → active（条件满足后动态创建 entity）
// active  → dead（set_field 设 status）

import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { evaluateCondition } from './condition'
import { modLoader, finalizeCharacterData, type PendingSpawn } from './mod-loader'

let processedIds = new Set<string>()
// 注释：audit-i——上次处理时 pending 条目的 id 签名（跨 loadMod 残留检测用；
// 用 id 集合而非长度——长度相同但内容不同（如 test-mod 的 test_spawn vs 测试注入）会漏检）
let lastPendingIds: string | null = null

/** 检查所有待激活角色，条件满足的注册到 entity-system */
export function processPendingSpawns(): void {
  const mod = modLoader.getMod() as (typeof modLoader.getMod) extends () => infer R ? R : any
  // 注释：audit-i 修复——processedIds 跨 loadMod 残留（reset 零调用方），同 id pending
  // 在新模组加载后永不激活。用 pending 条目的 id 集合签名检测数据变化，变化时清理。
  const pendingIds = ((mod as any)?.pendingSpawns as PendingSpawn[] | undefined)
    ?.map(s => s.id).join(',') ?? ''
  if (lastPendingIds !== null && pendingIds !== lastPendingIds) {
    processedIds.clear()
  }
  lastPendingIds = pendingIds

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
        // 注释：契约最终化兜底（标准角色契约）——pendingSpawns 在 parseModData 已 finalize，
        // 此处防其他来源/未来路径的 pending 数据漏初始化
        if (mod) finalizeCharacterData(spawn.data, mod as any)
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
