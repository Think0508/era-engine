// 注释：状态值变化（公式#8）
// floor(base × 状态相互修正 × 能力修正 × 素质修正)

import { ATTR } from '../../../core/entity-utils'

export function calcStateChange(
  baseValue: number,
  abilityLevel: number,
  abilityAdjustTable: number[],
): number {
  const abilityAdj = abilityAdjustTable[abilityLevel] ?? abilityAdjustTable[0] ?? 1.0
  return Math.floor(baseValue * abilityAdj)
}

// 注释：状态集合常量（对齐 erArk common_default.py:187-190）
// 负面状态：恐怖/抑郁/反感（erArk {18,19,20}）——连续重复指令不减值、无意识时不结算
export const BAD_STATES = new Set<string>([ATTR.FEAR, ATTR.DEPRESSION, ATTR.RESENTMENT])
// 心智状态：习得/恭顺/好意/快乐/先导/屈服/羞耻/恐怖/抑郁/反感（erArk mentel_state_set {9,10,11,13,14,15,16,18,19,20}）
// 深度无意识（时停/睡眠/空气）下不结算
export const MENTAL_STATES = new Set<string>([
  ATTR.LEARN, ATTR.DEFERENCE, ATTR.FONDNESS, ATTR.PLEASURE, ATTR.ANTICIPATION,
  ATTR.OBEDIENCE, ATTR.SHAME, ATTR.FEAR, ATTR.DEPRESSION, ATTR.RESENTMENT,
])
