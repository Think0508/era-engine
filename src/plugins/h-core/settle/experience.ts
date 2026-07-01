// 注释：经验结算（公式#12）
// 经验增加 = 基础经验值 × (1 + 对应能力加成 + 素质修正)

export function gainExperience(
  baseExp: number,
  abilityBonus: number = 0,
  talentBonus: number = 0,
): number {
  return Math.floor(baseExp * (1 + abilityBonus + talentBonus))
}
