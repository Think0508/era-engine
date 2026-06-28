import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

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
      saveGame: async (_slot: string) => {},
      loadGame: async (_slot: string) => {},
    })
  }
}

export { ApiSystem }

export const apiSystem = new ApiSystem()
apiSystem.registerEngineAPI()
