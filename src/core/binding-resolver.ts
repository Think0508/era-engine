import { entitySystem } from './entity-system'

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

    return entity.base?.[attrKey] ?? null
  }

  set(entityId: string, pluginKey: string, value: any): void {
    const entity = entitySystem.get('character', entityId)
    if (!entity) throw new Error(`角色 ${entityId} 不存在`)

    const mapping = this.findMapping(pluginKey)
    if (!mapping) throw new Error(`找不到 ${pluginKey} 的绑定`)

    const attrKey = mapping[pluginKey]
    if (!entity.base) entity.base = {}
    entity.base[attrKey] = value
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
