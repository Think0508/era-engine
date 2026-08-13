import type { EntityData } from './types'
import { eventBus } from './event-bus'

class EntitySystem {
  private entities = new Map<string, Map<string, EntityData>>()
  // 注释：角色注册通知批量缓冲（event-bus 有 same-tick 丢弃保护——同步注册循环中逐条 emit
  // 只会处理第一条；微任务合并为一次 emit，payload 含整批角色）
  private pendingCharacterRegs: { id: string; data: EntityData }[] = []
  private flushScheduled = false

  register(type: string, id: string, data: EntityData): void {
    if (!this.entities.has(type)) {
      this.entities.set(type, new Map())
    }
    const pool = this.entities.get(type)!
    if (pool.has(id)) {
      throw new Error(`实体 ${type}:${id} 已存在，ID重复`)
    }
    pool.set(id, data)
    // 注释：角色注册事件（通用机制）——插件监听做幂等初始化（如属性写入方）；
    // fire-and-forget（注册是同步操作，处理器在微任务中执行，只写数据无时序依赖）
    if (type === 'character') {
      this.pendingCharacterRegs.push({ id, data })
      if (!this.flushScheduled) {
        this.flushScheduled = true
        queueMicrotask(() => {
          this.flushScheduled = false
          const batch = this.pendingCharacterRegs
          this.pendingCharacterRegs = []
          void eventBus.emit('character:registered', { characters: batch })
        })
      }
    }
  }

  get(type: string, id: string): EntityData | null {
    return this.entities.get(type)?.get(id) ?? null
  }

  getAll(type: string): EntityData[] {
    const pool = this.entities.get(type)
    return pool ? [...pool.values()] : []
  }

  getAllIds(type: string): string[] {
    const pool = this.entities.get(type)
    return pool ? [...pool.keys()] : []
  }

  clear(): void {
    this.entities.clear()
    // 注释：重置注册通知缓冲（防 clear 后残留批次引用已销毁实体）
    this.pendingCharacterRegs = []
    this.flushScheduled = false
  }
}

export const entitySystem = new EntitySystem()
