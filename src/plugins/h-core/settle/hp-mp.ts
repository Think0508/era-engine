// 注释：HP/MP 变化（公式#7）

export function calcHpMpChange(
  baseCost: number,
  _groupCnt: number = 1,
): number {
  // 注释：群交修正（玩家×1/3，NPC×1/2）——TODO 群交系统
  return baseCost
}
