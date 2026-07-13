// 注释：实行判定（公式#3）
// 精确复刻 erArk Script/Design/instuct_judege.py + attr_calculation.py
// 实行值 = 基准需求 + 各项修正， >= 基准需求 → success，>= 60% → partial
//
// 修正项（按 erArk 顺序）：
//   1. 好感等级 + 信赖等级
//   2. 状态修正（欲情/快乐/恭顺/屈服等 levels）
//   3. 能力修正（亲密/欲望 levels）
//   4. 刻印修正（各刻印 levels）
//   5. 心情修正（愤怒值）
//   6. 陷落修正（爱情/隶属链）
//   7. 天赋个性（淫乱/性好奇/底线/把柄等）

import { getLevel } from '../../../core/entity-utils'
import { entitySystem } from '../../../core/entity-system'

const FAV_THRESHOLDS = [0, 100, 500, 1000, 2500, 5000, 10000, 50000, 100000]
const FAV_JUDGE_ADD = [0, 10, 25, 50, 75, 100, 150, 225, 300]
const TRUST_THRESHOLDS = [0, 25, 50, 75, 100, 150, 200, 250, 300]
const TRUST_JUDGE_ADD = [0, 25, 50, 75, 100, 150, 200, 300, 500]

const LEVEL_10 = [0, 100, 500, 1000, 2500, 6000, 12000, 30000, 50000, 75000, 100000]

export interface JudgeResult {
  success: boolean
  partial: boolean
  retreated: boolean
}

function getStatLevel(char: any, name: string): number {
  const v = (char.params?.[name] ?? 0) as number
  return getLevel(v, LEVEL_10)
}

function getAbilityLevel(char: any, name: string): number {
  const abl = char.abilities?.[name]
  return (abl?.level ?? 0) as number
}

function getTalent(char: any, name: string): number {
  return (char.talents?.[name] ?? 0) as number
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

  let total = judgeBase + favAdd + trustAdd

  if (charId) {
    const char = entitySystem.get('character', charId) as any
    if (char) {
      // 注释：2. 状态修正——欲情+快乐 ×5，恭顺+屈服 ×10，羞耻+抑郁 ×-5，苦痛+恐怖+反感 ×-10
      const addS = getStatLevel(char, '欲情') + getStatLevel(char, '快乐')
      const addL = getStatLevel(char, '恭顺') + getStatLevel(char, '屈服')
      const subS = getStatLevel(char, '羞耻') + getStatLevel(char, '抑郁')
      const subL = getStatLevel(char, '苦痛') + getStatLevel(char, '恐怖') + getStatLevel(char, '反感')
      total += addS * 5 + addL * 10 - subS * 5 - subL * 10

      // 注释：3. 能力修正——亲密×10 + 欲望×5
      const ablIntimacy = getAbilityLevel(char, '亲密')
      const ablDesire = getAbilityLevel(char, '欲望')
      total += ablIntimacy * 10 + ablDesire * 5

      // 注释：4. 刻印修正——快乐/屈服×50，苦痛/无觉×25，反发×-100，恐怖-时姦>0时 ×-50
      const markPleasure = getAbilityLevel(char, '快乐刻印')
      const markSubmit = getAbilityLevel(char, '屈服刻印')
      const markPain = getAbilityLevel(char, '苦痛刻印')
      const markVoid = getAbilityLevel(char, '无觉刻印')
      const markFear = getAbilityLevel(char, '恐怖刻印')
      const markTimestop = getAbilityLevel(char, '时姦刻印')
      const markRebel = getAbilityLevel(char, '反发刻印')
      total += markPleasure * 50 + markSubmit * 50 + markPain * 10 + markVoid * 25
      total -= Math.min(markFear - markTimestop, 0) * 50 + markRebel * 100

      // 注释：5. 心情修正——愤怒值
      const anger = (char.base?.['愤怒'] ?? 0) as number
      total += anger * 20

      // 注释：6. 陷落修正——爱情链(思慕→爱侣)和隶属链(屈从→奴隶)各自累加
      const loveChain = ['思慕', '恋慕', '恋人', '爱侣']
      const subChain = ['屈从', '驯服', '宠物', '奴隶']
      const fallValues = [0, 30, 50, 80, 100]
      let fallAdd = 0
      for (let i = 0; i < loveChain.length; i++) {
        if (getTalent(char, loveChain[i])) fallAdd = Math.max(fallAdd, fallValues[i + 1])
      }
      for (let i = 0; i < subChain.length; i++) {
        if (getTalent(char, subChain[i])) fallAdd = Math.max(fallAdd, fallValues[i + 1])
      }
      total += fallAdd

      // 注释：7. 天赋个性修正
      if (getTalent(char, '淫乱')) total += 50
      if (getTalent(char, '性好奇')) total += 30
      if (getTalent(char, '性冷漠')) total -= 30
      if (getTalent(char, '性无知')) total += 100
      if (getTalent(char, '讨厌男性')) total -= 30
      if (getTalent(char, '难以越过的底线')) total -= 100
      if (getTalent(char, '持有博士把柄')) total += 100
      if (getTalent(char, '被博士持有把柄')) total -= 100
      if (getTalent(char, '女儿')) total += 100
    }
  }

  if (total >= judgeBase) {
    return { success: true, partial: false, retreated: false }
  }
  if (total >= judgeBase * 0.6) {
    return { success: false, partial: true, retreated: false }
  }
  return { success: false, partial: false, retreated: true }
}
