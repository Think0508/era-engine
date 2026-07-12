type PremiseHandler = (ctx: any) => boolean | number

export class PremiseRegistry {
  private handlers = new Map<string, PremiseHandler>()

  register(id: string, handler: PremiseHandler): void {
    if (this.handlers.has(id)) {
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

export const premiseRegistry = new PremiseRegistry()
