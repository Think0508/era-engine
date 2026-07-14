// 注释：HP/MP 变化——精确复刻 erArk common_default.py:27-151
// degree 0=少(HP1/MP3·分), 1=中(HP3/MP6·分), 2=大(HP5/MP10·分)
// 群交: 玩家÷3, NPC÷2 | MP=0 → MP转HP | MP=0+HP<0 → HP×3

export interface HpMpInput {
  charId: string
  addTime: number       // 分钟
  hpValue: number       // -1=程度消耗, 1=程度恢复, 其他=固定值
  mpValue: number       // 同上
  degree: number        // 0|1|2
  hpMax: number
  mpMax: number
  currentHp: number
  currentMp: number
  isGroupSex: boolean
  isPlayer: boolean
  isDead: boolean
  isTimeStop: boolean
}

export interface HpMpResult {
  hp: number            // 体力变化量
  mp: number            // 气力变化量
  hpCritical: boolean   // HP到1 → 触发疲劳检测
}

export interface HpMpTargetResult {
  hp: number
  mp: number
}

const DEGREE_RATES: [number, number][] = [[1, 3], [3, 6], [5, 10]]

export function calcHpMpChange(
  input: HpMpInput,
  target?: { hpMax: number; mpMax: number; currentHp: number; currentMp: number }
): { self: HpMpResult | null; target?: HpMpTargetResult | null } {
  if (input.addTime === 0 && input.hpValue === 0 && input.mpValue === 0)
    return { self: null }
  if (input.isTimeStop || input.isDead)
    return { self: null }

  let hpRate = DEGREE_RATES[input.degree]?.[0] ?? 1
  let mpRate = DEGREE_RATES[input.degree]?.[1] ?? 3

  if (input.isGroupSex) {
    const div = input.isPlayer ? 3 : 2
    hpRate /= div
    mpRate /= div
  }

  const rawMp = (input.mpValue === -1 || input.mpValue === 1)
    ? Math.floor(input.addTime * mpRate * input.mpValue)
    : input.mpValue

  const rawHp = (input.hpValue === -1 || input.hpValue === 1)
    ? Math.floor(input.addTime * hpRate * input.hpValue)
    : input.hpValue

  const newMp = Math.max(0, Math.min(input.mpMax, input.currentMp + rawMp))
  let hpDelta = rawHp
  if (newMp === 0 && rawMp < 0) hpDelta += rawMp
  if (newMp === 0 && rawHp < 0) hpDelta += rawHp * 2
  const newHp = Math.max(1, Math.min(input.hpMax, input.currentHp + hpDelta))

  let targetResult: HpMpTargetResult | undefined
  if (target) {
    const tNewMp = Math.max(0, Math.min(target.mpMax, target.currentMp + rawMp))
    let tHpDelta = rawHp
    if (tNewMp === 0 && rawHp < 0) tHpDelta += rawHp * 2
    const tNewHp = Math.max(1, Math.min(target.hpMax, target.currentHp + tHpDelta))
    targetResult = { hp: tNewHp - target.currentHp, mp: tNewMp - target.currentMp }
  }

  return {
    self: { hp: newHp - input.currentHp, mp: newMp - input.currentMp, hpCritical: newHp <= 1 },
    target: targetResult,
  }
}
