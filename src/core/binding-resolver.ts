import { entitySystem } from './entity-system'
import { getEntityAttr, setEntityAttr, hasEntityAttr } from './entity-utils'

type RequiredAttr = { type: string; description: string }

class BindingResolver {
  private bindings: Map<string, Record<string, string>> = new Map()

  loadBindings(rawBindings: Record<string, Record<string, string>>): void {
    this.bindings.clear()
    for (const [pluginId, mapping] of Object.entries(rawBindings)) {
      this.bindings.set(pluginId, mapping)
    }
  }

  get(entityId: string, pluginKey: string): any {
    const entity = entitySystem.get('character', entityId)
    if (!entity) return null

    const mapping = this.findMapping(pluginKey)
    if (!mapping) return null

    const attrKey = mapping[pluginKey]
    if (!attrKey) return null

    // 注释：audit-a I2——原只读 entity.base，绑定到 social/combat/economy 类属性读恒 null。
    // 跨命名空间读取；缺失（任何命名空间都无此键）→ null（既有语义保留）
    return hasEntityAttr(entity, attrKey) ? getEntityAttr(entity, attrKey) : null
  }

  // 注释：按插件读自己的绑定映射（2026-08-10）——get() 跨插件搜索首个含 key 的映射，
  // 多个插件绑同名通用键（如 combat-base 与 follow-system 都绑 hp）时会读错属性（静默）。
  // 语义归属明确的读取方（本插件声明的绑定）必须用此方法。
  getForPlugin(pluginId: string, entityId: string, pluginKey: string): any {
    const entity = entitySystem.get('character', entityId)
    if (!entity) return null

    const mapping = this.bindings.get(pluginId)
    if (!mapping) return null

    const attrKey = mapping[pluginKey]
    if (!attrKey) return null

    return hasEntityAttr(entity, attrKey) ? getEntityAttr(entity, attrKey) : null
  }

  set(entityId: string, pluginKey: string, value: any): void {
    const entity = entitySystem.get('character', entityId)
    if (!entity) throw new Error(`角色 ${entityId} 不存在`)

    const mapping = this.findMapping(pluginKey)
    if (!mapping) throw new Error(`找不到 ${pluginKey} 的绑定`)

    const attrKey = mapping[pluginKey]
    // 注释：audit-a I2——原直写 entity.base[attrKey]：属性存在于 social 等命名空间时
    // 产生 base 副本双真相源。setEntityAttr 会写回键已存在的命名空间；键不存在于任何
    // 命名空间时返回 false → 落 base（既有"无键落 base"语义保留）
    if (!setEntityAttr(entity, attrKey, value)) {
      if (!entity.base) entity.base = {}
      entity.base[attrKey] = value
    }
  }

  // 注释：按插件写自己的绑定映射（2026-08-11，与 getForPlugin 对称）——
  // set() 跨插件 findMapping 首键胜出，多插件绑同名通用键时写入目标可能错属性
  setForPlugin(pluginId: string, entityId: string, pluginKey: string, value: any): boolean {
    const entity = entitySystem.get('character', entityId)
    if (!entity) return false

    const mapping = this.bindings.get(pluginId)
    if (!mapping) return false

    const attrKey = mapping[pluginKey]
    if (!attrKey) return false

    if (!setEntityAttr(entity, attrKey, value)) {
      if (!entity.base) entity.base = {}
      entity.base[attrKey] = value
    }
    return true
  }

  private findMapping(pluginKey: string): Record<string, string> | null {
    for (const mapping of this.bindings.values()) {
      if (pluginKey in mapping) return mapping
    }
    return null
  }

  validateRequired(
    pluginId: string,
    required: Record<string, RequiredAttr>,
    modName: string,
  ): string[] {
    const errors: string[] = []
    const mapping = this.bindings.get(pluginId)

    for (const key of Object.keys(required)) {
      if (!mapping || !(key in mapping)) {
        errors.push(
          `模组 '${modName}' 缺少绑定：插件 '${pluginId}' 需要 '${key}'，请检查 bindings.toml`,
        )
      }
    }
    return errors
  }
}

export const bindingResolver = new BindingResolver()
