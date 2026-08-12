// 注释：指令求值器工厂——CommandBar/DailyMenu/ScreenNumpad 共用
// 消除"evaluateCondition: () => true"式的条件绕过（静默执行风险）
// 语义：
//   - premises 数组（新 schema）→ conditionEngine 严格求值
//   - condition 为条件表达式（含 premise(X) 命名引用）→ conditionEngine.evaluate（失败返回 false，不抛）

import { conditionEngine } from '../../core/condition-engine'
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
  // 不回退到 player——否则 HAVE_TARGET 类前提在无选中时假通过，判定/结算却落空）；
  // 未知前提（校验层拦截漏网）→ false 不抛（UI 层容错）
  const selectedId = () => sources.uiStore?.selectedCharacterId ?? null

  const evalPremises = (premises: string[]) => {
    if (!premises || premises.length === 0) return true
    try {
      return conditionEngine.evaluatePremises(premises, { ...gameContext.getContext(), selectedCharacterId: selectedId() ?? undefined })
    } catch {
      return false
    }
  }

  const evalCondition = (expr: string) => {
    const gc = gameContext.getContext()
    try {
      return conditionEngine.evaluate(expr, gc)
    } catch {
      return false
    }
  }

  return { evaluateCondition: evalCondition, evaluatePremises: evalPremises }
}
