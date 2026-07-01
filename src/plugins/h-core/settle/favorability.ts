// 注释：好感度结算（公式#1）——MVP 简化
// TODO: 完整公式 floor(base × status_adjust × ability_adjust × talent_adjust × mark_adjust)

export function calcFavorability(baseValue: number): number {
  return Math.floor(baseValue)
}
