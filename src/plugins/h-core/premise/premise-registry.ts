// 注释：PremiseRegistry 管理所有的前提 handler
// 插件（子系统）通过 h-core API 调 registerPremise 注册自己的前提
// evaluate 对所有 premises 逐个求值，全真返回 true

type PremiseHandler = (ctx: any) => boolean | number

export class PremiseRegistry {
  private handlers = new Map<string, PremiseHandler>()

  register(id: string, handler: PremiseHandler): void {
    if (this.handlers.has(id)) {
      // 注释：重复注册允许（子系统覆盖基础前提，比如露出系统修改 EXPECTED 前提）
      console.warn(`Premise '${id}' 重复注册，新 handler 覆盖旧`)
    }
    this.handlers.set(id, handler)
  }

  evaluate(premises: string[], ctx: any, strict = true): boolean {
    for (const premiseId of premises) {
      const handler = this.handlers.get(premiseId)
      if (!handler) {
        if (strict) {
          return false
        }
        // 注释：非严格模式 → 未知前提跳过（适用于 scene-dialogue 的 erark 旧前提）
        continue
      }
      const result = handler(ctx)
      if (typeof result === 'boolean' && !result) return false
      if (typeof result === 'number' && result <= 0) return false
    }
    return true
  }

  getRegisteredIds(): string[] {
    return Array.from(this.handlers.keys())
  }

  clear(): void {
    this.handlers.clear()
  }
}
