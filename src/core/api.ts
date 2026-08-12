import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'
import { saveGame as saveGameImpl, loadGame as loadGameImpl } from './save-system'

type ApiMethod = (...args: any[]) => Promise<any>

class ApiSystem {
  private registry = new Map<string, Record<string, ApiMethod>>()

  register(namespace: string, methods: Record<string, ApiMethod>): void {
    const existing = this.registry.get(namespace)
    if (existing) {
      for (const key of Object.keys(methods)) {
        if (key in existing) {
          throw new Error(
            `API '${namespace}.${key}' is already registered (duplicate)`,
          )
        }
      }
      Object.assign(existing, methods)
    } else {
      this.registry.set(namespace, { ...methods })
    }
  }

  async call(namespace: string, method: string, ...args: any[]): Promise<any> {
    const ns = this.registry.get(namespace)
    if (!ns) {
      throw new Error(`API namespace '${namespace}' does not exist`)
    }
    const fn = ns[method]
    if (!fn) {
      throw new Error(`API method '${namespace}.${method}' does not exist`)
    }
    return fn(...args)
  }

  has(namespace: string, method: string): boolean {
    const ns = this.registry.get(namespace)
    return !!ns && method in ns
  }

  clear(): void {
    this.registry.clear()
    this.registerEngineAPI()
  }

  registerEngineAPI(): void {
    this.register('engine', {
      getEntity: async (type: string, id: string) =>
        entitySystem.get(type, id),
      'bindings.get': async (entityId: string, key: string) =>
        bindingResolver.get(entityId, key),
      'bindings.set': async (entityId: string, key: string, value: any) => {
        bindingResolver.set(entityId, key, value)
      },
      saveGame: async (slot: string, label?: string) => {
        // 注释：2026-08-12 全面审计：原为空实现 stub（静默成功、实际丢档）——转调 save-system
        await saveGameImpl(slot, null, label)
      },
      loadGame: async (slot: string) => {
        await loadGameImpl(slot)
      },
    })
  }
}

export { ApiSystem }

export const apiSystem = new ApiSystem()
apiSystem.registerEngineAPI()
