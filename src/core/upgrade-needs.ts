// 升级/获得需求求值器（2026-08-11 统一）——ability-progression（能力升级 needs）与
// talent-utils（素质获得 gain_need）共用，消除两处重复实现。
// need 类型（erArk need_string 语义化）：A 能力等级 / T 素质存在 / J 宝珠（达标并记录消耗）/
// E 经验数值 / F 好感度 / X 信赖度。J 的消耗由调用方决定（能力升级扣珠；素质获得只检查不扣）。

import { getEntityAttr, ATTR } from './entity-utils'
import type { UpgradeNeed } from './mod-loader'

export interface NeedsEvalResult {
  satisfied: boolean
  // 宝珠消耗记录（id → 数值）——满足时全量记录（一条需求列表可含多个 J，如 90 隐蔽 J9+J16）
  juelCosts: Record<number, number>
}

/** 单条需求求值 */
function evaluateOne(char: any, need: UpgradeNeed): { satisfied: boolean; juelId: number | null; juelCost: number } {
  switch (need.type) {
    case 'ability': {
      const level = char?.abilities?.[need.id as string]?.level ?? 0
      return { satisfied: level >= (need.value ?? 1), juelId: null, juelCost: 0 }
    }
    case 'talent': {
      return { satisfied: !!char?.talents?.[need.id as string], juelId: null, juelCost: 0 }
    }
    case 'juel': {
      const juel = char?.juel?.[String(need.id)] ?? 0
      const enough = juel >= (need.value ?? 1)
      return { satisfied: enough, juelId: enough ? (need.id as number) : null, juelCost: enough ? (need.value ?? 1) : 0 }
    }
    case 'experience': {
      const exp = char?.experience?.[String(need.id)] ?? 0
      return { satisfied: exp >= (need.value ?? 1), juelId: null, juelCost: 0 }
    }
    case 'favorability': {
      const fav = getEntityAttr(char, ATTR.FAVORABILITY)
      return { satisfied: typeof fav === 'number' && fav >= (need.value ?? 1), juelId: null, juelCost: 0 }
    }
    case 'trust': {
      const trust = getEntityAttr(char, ATTR.TRUST)
      return { satisfied: typeof trust === 'number' && trust >= (need.value ?? 1), juelId: null, juelCost: 0 }
    }
    default:
      // ability_sum 等能力级附加判定不在此求值（evaluateExtraNeeds 插件层处理）——列表内出现视为不满足
      return { satisfied: false, juelId: null, juelCost: 0 }
  }
}

/**
 * 需求列表求值（全部满足才 satisfied）——空列表 = 无条件满足。
 * 缺省语义：能力/经验缺失按 0、素质缺失按无、好感/信赖缺失按 0（条件路径默认值，永不抛异常）。
 */
export function evaluateUpgradeNeeds(char: any, needs: UpgradeNeed[] | undefined): NeedsEvalResult {
  if (!needs || needs.length === 0) return { satisfied: true, juelCosts: {} }
  const juelCosts: Record<number, number> = {}
  for (const need of needs) {
    const r = evaluateOne(char, need)
    if (!r.satisfied) return { satisfied: false, juelCosts: {} }
    if (r.juelId !== null) {
      juelCosts[r.juelId] = (juelCosts[r.juelId] ?? 0) + r.juelCost
    }
  }
  return { satisfied: true, juelCosts }
}
