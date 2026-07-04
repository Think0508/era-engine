import type { EntityData } from './types'

class EntitySystem {
  private entities = new Map<string, Map<string, EntityData>>()

  register(type: string, id: string, data: EntityData): void {
    if (!this.entities.has(type)) {
      this.entities.set(type, new Map())
    }
    const pool = this.entities.get(type)!
    if (pool.has(id)) {
      throw new Error(`实体 ${type}:${id} 已存在，ID重复`)
    }
    pool.set(id, data)
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
  }
}

export const entitySystem = new EntitySystem()
