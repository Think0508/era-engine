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
import { modLoader } from './mod-loader'

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

  // 注释：同步调用已注册 API——仅限同步实现的方法（如 quest-system 的 getSceneStatus/getVar）；
  // 异步方法（返回 Promise）抛明确错误。条件引擎 resolvePath 等同步求值链用
  callSync(namespace: string, method: string, ...args: any[]): any {
    const ns = this.registry.get(namespace)
    if (!ns) {
      throw new Error(`API namespace '${namespace}' does not exist`)
    }
    const fn = ns[method]
    if (!fn) {
      throw new Error(`API method '${namespace}.${method}' does not exist`)
    }
    const result = fn(...args)
    if (result instanceof Promise) {
      throw new Error(`API method '${namespace}.${method}' is async and cannot be called synchronously`)
    }
    return result
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
      // 注释：能力按 tag 查询（AGENTS §35 声明的标准 API——原实现缺失，2026-08-14 补）。
      // 返回角色所有带该 tag 的能力 [{id, level, xp}]；mod 无此 tag → []
      'abilities.getByTag': async (charId: string, tag: string) => {
        const char = entitySystem.get('character', charId) as any
        if (!char?.abilities) return []
        const mod = modLoader.getMod()
        const result: { id: string; level: number; xp: number }[] = []
        for (const [abilityId, entry] of Object.entries(char.abilities)) {
          const def = mod?.abilities?.[abilityId] as any
          if (!def?.tags?.includes(tag)) continue
          const e = entry as any
          result.push({
            id: abilityId,
            level: typeof e?.level === 'number' ? e.level : 0,
            xp: typeof e?.xp === 'number' ? e.xp : 0,
          })
        }
        return result
      },
      'abilities.hasTag': async (charId: string, tag: string) => {
        const char = entitySystem.get('character', charId) as any
        if (!char?.abilities) return false
        const mod = modLoader.getMod()
        for (const abilityId of Object.keys(char.abilities)) {
          const def = mod?.abilities?.[abilityId] as any
          if (def?.tags?.includes(tag)) return true
        }
        return false
      },
    })
  }
}

export { ApiSystem }

export const apiSystem = new ApiSystem()
apiSystem.registerEngineAPI()
