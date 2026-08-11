// 注释：use 注册表——物品 use 值集合（grill Q8：use 未注册 → warning，宽松不阻止加载）
// 引擎内置 use 值在模块加载时注册（clear() 保留内置——测试隔离只清自定义注册）；
// 插件 onLoad 用 useRegistry.register() 注册自定义 use

// 注释：引擎内置 use 值（grill Q2：use 数组化，枚举可扩展）
export const BUILTIN_USE_TYPES = ['self', 'target', 'equip', 'gift', 'key'] as const

class UseRegistry {
  private uses = new Set<string>(BUILTIN_USE_TYPES)

  register(useType: string): void {
    this.uses.add(useType)
  }

  has(useType: string): boolean {
    return this.uses.has(useType)
  }

  all(): string[] {
    return Array.from(this.uses)
  }

  // 注释：清除自定义注册，保留内置 use 值
  clear(): void {
    this.uses = new Set<string>(BUILTIN_USE_TYPES)
  }
}

export const useRegistry = new UseRegistry()
