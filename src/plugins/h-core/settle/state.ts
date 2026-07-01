// 注释：状态值变化（公式#8）
// floor(base × 状态相互修正 × 能力修正 × 素质修正)

export function calcStateChange(
  baseValue: number,
  abilityLevel: number,
  abilityAdjustTable: number[],
): number {
  const abilityAdj = abilityAdjustTable[abilityLevel] ?? abilityAdjustTable[0] ?? 1.0
  return Math.floor(baseValue * abilityAdj)
}
