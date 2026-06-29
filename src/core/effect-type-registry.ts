// 注释：EffectTypeRegistry 在 core 层——通用注册机制
// effect-system 插件填充具体类型实现
// 其他插件（status/ability/inventory）注册自己的 effect type

export type EffectHandler = (params: any, ctx: any) => void | Promise<void> | boolean | Promise<boolean | void>

export interface Effect {
  type: string
  params: any
  id?: string           // 可选，供 depends_on 引用
  depends_on?: string   // 可选，前置 effect id
  target?: string       // self/selected/player/all_enemies/all_allies/target
}

class EffectTypeRegistryClass {
  private handlers = new Map<string, EffectHandler>()

  register(type: string, handler: EffectHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`EffectTypeRegistry: effect type '${type}' 已存在，重复注册被拒绝`)
    }
    this.handlers.set(type, handler)
  }

  getHandler(type: string): EffectHandler | undefined {
    return this.handlers.get(type)
  }

  has(type: string): boolean {
    return this.handlers.has(type)
  }

  clear(): void {
    this.handlers.clear()
  }

  getAllTypes(): string[] {
    return Array.from(this.handlers.keys())
  }
}

export const effectTypeRegistry = new EffectTypeRegistryClass()
