import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'
import {
  saveGame as saveGameImpl,
  loadGame as loadGameImpl,
  getSaveSlots as getSaveSlotsImpl,
  getSaveHead as getSaveHeadImpl,
  deleteSave as deleteSaveImpl,
  exportSave as exportSaveImpl,
  importSave as importSaveImpl,
  getSaveMemory as getSaveMemoryImpl,
  setSaveMemory as setSaveMemoryImpl,
} from './save-system'
import { gameContext } from './game-context'
import { conditionEngine } from './condition-engine'
import { getUIText } from './ui-text'

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
        return loadGameImpl(slot)
      },
      // 注释：audit-h 修复（2026-08-12）——文档宣称的 engine API 补齐：
      // enterMode/exitMode/getSaveSlots/deleteSave 此前从未注册，按文档调用即抛错
      enterMode: async (mode: string) => {
        await gameContext.enterMode(mode)
      },
      exitMode: async () => {
        await gameContext.exitMode()
      },
      getSaveSlots: async (modId?: string) => {
        return getSaveSlotsImpl(modId)
      },
      // 注释：存档扩展 API（2026-08-14 存档系统完整复刻）——头部/导入导出/界面记忆
      getSaveHead: async (slotId: string) => {
        return getSaveHeadImpl(slotId)
      },
      exportSave: async (slotId: string) => {
        return exportSaveImpl(slotId)
      },
      importSave: async (json: string) => {
        return importSaveImpl(json)
      },
      getSaveMemory: async (modId?: string) => {
        return getSaveMemoryImpl(modId)
      },
      setSaveMemory: async (mem: any, modId?: string) => {
        setSaveMemoryImpl(mem, modId)
      },
      // 注释：世界观文案查询（mod [ui_text] 覆盖 → 引擎默认 → 原 key）
      'uiText.get': async (key: string) => {
        return getUIText(key)
      },
      deleteSave: async (slotId: string) => {
        await deleteSaveImpl(slotId)
      },
      // 注释：前提注册/求值（condition-engine 能力暴露——mod 插件注册自定义前提
      // 不再依赖 h-core 插件；'premises.evaluate' 供动态求值场景）
      'premises.register': async (id: string, handler: any) => {
        conditionEngine.registerPremise(id, handler)
      },
      'premises.evaluate': async (premises: string[], ctx: any) => {
        return conditionEngine.evaluatePremises(premises, ctx)
      },
      'premises.getRegisteredIds': async () => {
        return conditionEngine.getRegisteredPremiseIds()
      },
    })
  }
}

export { ApiSystem }

export const apiSystem = new ApiSystem()
apiSystem.registerEngineAPI()
