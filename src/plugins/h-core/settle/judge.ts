// 注释：实行判定（公式#3）
// 实行值 = 基准需求 + 好感等级修正 + 信赖等级修正 + 状态修正 + 陷落修正 + 能力修正
// 参考 erArk: Script/Design/instuct_judege.py + attr_calculation.py:get_character_fall_level
//
// 状态修正：目标当前最高快感/欲望等级（欲情/快乐/屈服等 Lv 最高值 × STATUS_JUDGE_MUL）
// 陷落修正：爱情链(思慕/恋慕/恋人/爱侣)或隶属链(屈从/驯服/宠物/奴隶)等级 × FALL_JUDGE_MUL
//   爱情链 1-4 级 → +修正；隶属链 1-4 级 → +修正（负的隶属级取绝对值）
//
// erArk 的实现是逐个 talent 检查加固定值，我们改为通用的等级乘系数，更灵活且 mod 可配置

import { getLevel, getEntityAttr } from '../../../core/entity-utils'
import { entitySystem } from '../../../core/entity-system'

const FAV_THRESHOLDS = [0, 100, 500, 1000, 2500, 5000, 10000, 50000, 100000]
const FAV_JUDGE_ADD = [0, 10, 25, 50, 75, 100, 150, 225, 300]
const TRUST_THRESHOLDS = [0, 25, 50, 75, 100, 150, 200, 250, 300]
const TRUST_JUDGE_ADD = [0, 25, 50, 75, 100, 150, 200, 300, 500]

// 注释：状态修正系数——最高快感/欲望等级 × 此值
const STATUS_JUDGE_MUL = 15

// 注释：陷落修正系数——陷落等级 × 此值
const FALL_JUDGE_MUL = 50

// 注释：快感/欲望属性名列表——取这些属性的最高 level 做状态修正
const STATUS_ATTRS = ['欲情', '快乐', '屈服', '羞耻']

// 注释：爱情链 talent ID（h-core 默认 talents.toml 中定义）
const LOVE_TALENT_IDS = ['思慕', '恋慕', '恋人', '爱侣']

// 注释：隶属链 talent ID
const SUB_TALENT_IDS = ['屈从', '驯服', '宠物', '奴隶']

export interface JudgeResult {
  success: boolean
  partial: boolean
  retreated: boolean
}

// 注释：获取角色陷落等级（0=无，1-4=爱情链，-1~-4=隶属链）
function getFallLevel(charId: string): number {
  const char = entitySystem.get('character', charId) as any
  if (!char?.talents) return 0
  for (let i = 0; i < LOVE_TALENT_IDS.length; i++) {
    if (char.talents[LOVE_TALENT_IDS[i]]) return i + 1
  }
  for (let i = 0; i < SUB_TALENT_IDS.length; i++) {
    if (char.talents[SUB_TALENT_IDS[i]]) return -(i + 1)
  }
  return 0
}

// 注释：获取角色最高状态等级（快感/欲望相关 params 的最高 level）
function getMaxStatusLevel(charId: string): number {
  const char = entitySystem.get('character', charId) as any
  if (!char) return 0
  let maxLv = 0
  for (const attr of STATUS_ATTRS) {
    const v = getEntityAttr(char, attr)
    if (typeof v === 'number') {
      const lv = getLevel(v, [0, 100, 500, 1000, 2500, 6000, 12000, 30000, 50000, 75000, 100000])
      if (lv > maxLv) maxLv = lv
    }
  }
  return maxLv
}

export function calcJudge(
  judgeBase: number,
  favorability: number,
  trust: number,
  charId?: string,
): JudgeResult {
  const favLevel = getLevel(favorability, FAV_THRESHOLDS)
  const favAdd = FAV_JUDGE_ADD[favLevel] ?? 0
  const trustLevel = getLevel(trust, TRUST_THRESHOLDS)
  const trustAdd = TRUST_JUDGE_ADD[trustLevel] ?? 0

  // 注释：状态修正——目标当前最高快感/欲望等级 × 系数
  let statusAdd = 0
  if (charId) {
    const statusLv = getMaxStatusLevel(charId)
    statusAdd = statusLv * STATUS_JUDGE_MUL
  }

  // 注释：陷落修正——目标爱情/隶属链等级 × 系数（绝对值）
  let fallAdd = 0
  if (charId) {
    const fallLv = getFallLevel(charId)
    fallAdd = Math.abs(fallLv) * FALL_JUDGE_MUL
  }

  const total = judgeBase + favAdd + trustAdd + statusAdd + fallAdd
  if (total >= judgeBase) {
    return { success: true, partial: false, retreated: false }
  }
  if (total >= judgeBase * 0.6) {
    return { success: false, partial: true, retreated: false }
  }
  return { success: false, partial: false, retreated: true }
}
