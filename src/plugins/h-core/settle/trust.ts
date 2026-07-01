// 注释：信赖度结算（公式#2）——简化版
// 基础 = behavior_duration / 60

export function calcTrust(
  durationMinutes: number,
  favorability: number,
): number {
  // 注释：MVP 简化——信赖 = 时长/60 × 好感修正
  const base = durationMinutes / 60
  const favorMod = 1 + Math.max(0, favorability / 1000)
  return Math.floor(base * favorMod)
}
