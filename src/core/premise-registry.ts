type PremiseHandler = (ctx: any) => boolean | number

export class PremiseRegistry {
  private handlers = new Map<string, PremiseHandler>()

  // 注释：注册 key 大小写不敏感（T2 修复）——迁移数据用 erArk 小写原名（dr_position_normal），
  // 手工 TOML 用大写（DR_POSITION_NORMAL），统一 lower 存储避免"注册了但查不到"静默失效
  // 重复注册 = 覆盖且不警告（2026-08-10：同名覆盖是设计特性——mod 插件覆盖通用插件前提
  //（mod-override 运行时 override），且插件重复加载（HMR/测试）是既有场景；警告纯噪音）
  register(id: string, handler: PremiseHandler): void {
    const key = id.toLowerCase()
    this.handlers.set(key, handler)
  }

  evaluate(premises: string[], ctx: any, strict = true): boolean {
    for (const premiseId of premises) {
      const handler = this.handlers.get(premiseId.toLowerCase())
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

  // 注释：权重求值（erArk get_weight_from_premise_dict，weight_all_to_1_flag=True 语义，
  // handle_premise/__init__.py:246-300）——口上/地文的权重区间随机选择用：
  //   high_N 前提 → 权重 +N（N 即权重值，前提须通过）
  //   其余前提 → 满足 +1
  //   任一不满足 → 返回 0（整句淘汰）
  //   空前提集 → 返回 1（无条件口上默认权重）
  // 未知前提：strict=true 时返回 0；strict=false 时跳过（与 evaluate 非严格一致）
  getWeight(premises: string[], ctx: any, strict = false): number {
    if (!premises || premises.length === 0) return 1
    let weight = 0
    for (const premiseId of premises) {
      const key = premiseId.toLowerCase()
      // 注释：high_ 判断用 lower——大写输入（HIGH_5）同样按权重前提处理
      if (key.startsWith('high_')) {
        const n = parseInt(key.slice(5), 10)
        const handler = this.handlers.get(key)
        if (handler) {
          const result = handler(ctx)
          const ok = typeof result === 'boolean' ? result : result > 0
          if (!ok) return 0
          weight += Number.isFinite(n) ? n : 1
        } else if (strict) {
          return 0
        }
        continue
      }
      const handler = this.handlers.get(key)
      if (!handler) {
        if (strict) return 0
        continue
      }
      const result = handler(ctx)
      const ok = typeof result === 'boolean' ? result : result > 0
      if (!ok) return 0
      weight += 1
    }
    return weight
  }

  getRegisteredIds(): string[] {
    return Array.from(this.handlers.keys())
  }

  // 注释：权重求和（erArk search_target 语义，handle_npc_ai.py search_target：
  // `now_weight += premise_judge`，前提返回值即权重，任一个 <=0 整目标淘汰）——
  // NPC AI 目标搜索用。与 getWeight（口上权重：满足 +1 / high_N +N）语义不同：
  // 动态前提（如"疲劳度"返回疲劳等级数值）权重随状态变化，是 AI 偏好（疲惫越重
  // 越想休息）的来源。boolean 前提通过计 1。空前提集 → 1（无条件目标默认权重）。
  // 未知前提：strict=true 时返回 0（淘汰）；strict=false 时跳过。
  getWeightSum(premises: string[], ctx: any, strict = false): number {
    if (!premises || premises.length === 0) return 1
    let sum = 0
    for (const premiseId of premises) {
      const handler = this.handlers.get(premiseId.toLowerCase())
      if (!handler) {
        if (strict) return 0
        continue
      }
      const result = handler(ctx)
      const ok = typeof result === 'boolean' ? result : result > 0
      if (!ok) return 0
      sum += typeof result === 'boolean' ? 1 : result
    }
    return sum
  }

  clear(): void {
    this.handlers.clear()
  }
}

export const premiseRegistry = new PremiseRegistry()
