// 注释：绝顶结算（公式#9）
// 部位快感累积 >= 阈值 → 触发绝顶

const STATUS_LEVEL_10_THRESHOLD = 100000

export interface OrgasmResult {
  triggered: boolean
  level: 'small' | 'normal' | 'strong'
  partId: number
  currentOrgasmLevel: number  // orgasm_level 循环 0-2
}

export function checkOrgasm(
  partId: number,
  statusValue: number,
  currentOrgasmLevel: number,
  threshold: number = STATUS_LEVEL_10_THRESHOLD,
): OrgasmResult | null {
  if (statusValue < threshold) return null

  // 注释：强度轮换 0=small 1=normal 2=strong
  const cycle = currentOrgasmLevel % 3
  const levelMap = ['small', 'normal', 'strong'] as const
  return {
    triggered: true,
    level: levelMap[cycle],
    partId,
    currentOrgasmLevel: cycle,
  }
}
