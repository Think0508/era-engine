// 注释：实行判定（公式#3）
// 实行值 = 基准需求 + 好感等级修正 + 信赖等级修正 + 状态修正 + 陷落修正 + 能力修正

import { getLevel } from '../../../core/entity-utils'

const FAV_THRESHOLDS = [0, 100, 500, 1000, 2500, 5000, 10000, 50000, 100000]
const FAV_JUDGE_ADD = [0, 10, 25, 50, 75, 100, 150, 225, 300]
const TRUST_THRESHOLDS = [0, 25, 50, 75, 100, 150, 200, 250, 300]
const TRUST_JUDGE_ADD = [0, 25, 50, 75, 100, 150, 200, 300, 500]

export interface JudgeResult {
  success: boolean
  partial: boolean
  retreated: boolean
}

export function calcJudge(
  judgeBase: number,
  favorability: number,
  trust: number,
): JudgeResult {
  const favLevel = getLevel(favorability, FAV_THRESHOLDS)
  const favAdd = FAV_JUDGE_ADD[favLevel] ?? 0
  const trustLevel = getLevel(trust, TRUST_THRESHOLDS)
  const trustAdd = TRUST_JUDGE_ADD[trustLevel] ?? 0

  let statusAdd = 0
  // TODO: 从 ctx.statusLevels 算各状态修正
  let fallAdd = 0
  // TODO: getFallLevel × 倍率

  const total = judgeBase + favAdd + trustAdd + statusAdd + fallAdd
  if (total >= judgeBase) {
    return { success: true, partial: false, retreated: false }
  }
  if (total >= judgeBase * 0.6) {
    return { success: false, partial: true, retreated: false }
  }
  return { success: false, partial: false, retreated: true }
}
