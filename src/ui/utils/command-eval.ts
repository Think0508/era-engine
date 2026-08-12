// 注释：指令求值器工厂——CommandBar/DailyMenu/ScreenNumpad 共用
// 消除"evaluateCondition: () => true"式的条件绕过（静默执行风险）
// 语义与 CommandBar 原 evalCondition 一致：
//   - condition 为 'premises:XXX,YYY' 旧格式 → premiseRegistry 非严格求值
//   - premises 数组（新 schema）→ premiseRegistry 非严格求值
//   - condition 为条件表达式 → evaluateCondition（失败返回 false，不抛）

import { conditionEngine } from '../../core/condition-engine'
import { premiseRegistry } from '../../core/premise-registry'
import { gameContext } from '../../core/game-context'

export interface CommandEvalSources {
  uiStore: any
  gameStore: any
}

export interface CommandEvaluators {
  evaluateCondition: (expr: string) => boolean
  evaluatePremises: (premises: string[]) => boolean
}

export function createCommandEvaluators(sources: CommandEvalSources): CommandEvaluators {
  // 注释：选中角色 = uiStore 选中（与 effect-system resolveTarget('selected') 一致，
  // 不回退到 player——否则 HAVE_TARGET 类前提在无选中时假通过，判定/结算却落空）
  const selectedId = () => sources.uiStore?.selectedCharacterId ?? null

  const evalPremises = (premises: string[]) => {
    if (!premises || premises.length === 0) return true
    // 注释：非严格——未知 erark 前提跳过（未注册前提由 validateInstructionData 加载时警告）
    return premiseRegistry.evaluate(premises, { selectedCharacterId: selectedId() }, false)
  }

  const evalCondition = (expr: string) => {
    if (expr.startsWith('premises:')) {
      const premises = expr.slice(9).split(/[&,]/).map(s => s.trim()).filter(Boolean)
      return evalPremises(premises)
    }
    const gc = gameContext.getContext()
    try {
      return conditionEngine.evaluate(expr, gc)
    } catch {
      return false
    }
  }

  return { evaluateCondition: evalCondition, evaluatePremises: evalPremises }
}
