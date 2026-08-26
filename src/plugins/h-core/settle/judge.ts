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
//
// 判定链文本（2026-08-25）：calcJudge 同时生成 erArk 风格 calculation_text 的 reason 段，
// 由 judge_check 输出到叙事日志；未实装修正项（醉酒/饮酒/爱情旅馆/助理/激素/H打断等）不生成段。

import { getLevel, getEntityAttr, ATTR } from '../../../core/entity-utils'
import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'
import { gameContext } from '../../../core/game-context'
import { conditionEngine } from '../../../core/condition-engine'
import { errorReporter } from '../../../core/error-reporter'
import {
  isFavoritePosition, isFavoritePart, favoritePartApplies,
  resolvePartKey, getFavoriteConfig, getPositionDisplayName, getPartDisplayName,
} from './favorite'

const FAV_THRESHOLDS = [0, 100, 500, 1000, 2500, 5000, 10000, 50000, 100000]
const FAV_JUDGE_ADD = [0, 10, 25, 50, 75, 100, 150, 225, 300]
const TRUST_THRESHOLDS = [0, 25, 50, 75, 100, 150, 200, 250, 300]
const TRUST_JUDGE_ADD = [0, 25, 50, 75, 100, 150, 200, 300, 500]

const LEVEL_10 = [0, 100, 500, 1000, 2500, 6000, 12000, 30000, 50000, 75000, 100000]

export interface JudgeResult {
  success: boolean
  partial: boolean
  retreated: boolean
  /** 判定链段（erArk calculation_text 的每一段；用于 UI/日志展示） */
  reason?: string[]
  /** 拼接后的完整判定链文本（erArk 风格：段间无分隔、末尾 = 总值） */
  reasonText?: string
}

/** 判定族特殊修正条目（带显示 label） */
export interface JudgeAdjustmentEntry {
  label: string
  value: number
}

/** 判定链段格式化：正数 +名称(数值)，负数 -名称(数值)（2026-08-25 用户定稿） */
function fmtSegment(label: string, value: number): string {
  const sign = value >= 0 ? '+' : '-'
  return `${sign}${label}(${Math.abs(value)})`
}

// 注释：多目标判定结果合并——最坏者胜出（retreated > partial > success）
export function mergeJudgeResult(current: JudgeResult, next: JudgeResult): JudgeResult {
  if (next.retreated) return next
  if (next.partial && !current.retreated) return next
  return current
}

// 注释：状态等级读取（audit-b C2）——原只读 char.params，但欲情/快乐主写路径直写 base
function getStatLevel(char: any, name: string): number {
  const v = (getEntityAttr(char, name) ?? 0) as number
  return getLevel(v, LEVEL_10)
}

function getAbilityLevel(char: any, name: string): number {
  const abl = char.abilities?.[name]
  return (abl?.level ?? 0) as number
}

function getTalent(char: any, name: string): number {
  return (char.talents?.[name] ?? 0) as number
}

// 注释：查 hConfig [judge.adjustments] 表，求 judge_class 对应的特殊修正（含显示 label）
function calcAdjustments(judgeClass: string | undefined, charId: string): JudgeAdjustmentEntry[] {
  if (!judgeClass) return []
  const hc = (modLoader.getMod()?.hConfig as any) ?? {}
  const entries = hc?.judge?.adjustments?.[judgeClass] as { condition: string; value: number; label?: string }[] | undefined
  if (!entries || entries.length === 0) return []
  const char = entitySystem.get('character', charId) as any
  if (!char) return []
  const baseCtx = gameContext.getContext()
  const judgeCtx = { ...baseCtx, selectedCharacterId: charId }
  const result: JudgeAdjustmentEntry[] = []
  for (const entry of entries) {
    try {
      if (conditionEngine.evaluate(entry.condition, judgeCtx)) {
        result.push({
          label: entry.label ?? `${judgeClass}修正`,
          value: entry.value,
        })
      }
    } catch (err) {
      errorReporter.report({
        source: 'h-core/judge',
        severity: 'warning',
        message: `判定族 '${judgeClass}' 的修正条件解析失败：${entry.condition}（${err instanceof Error ? err.message : String(err)}）`,
        suggestion: '检查 h-config.toml [judge.adjustments] 中的 condition 表达式，字段路径须存在于条件手册',
      })
    }
  }
  return result
}

// 注释：S 类判定族（erArk InstructJudge.csv need_type == "S"）——天赋个性修正只对 S 类生效
const S_TYPE_JUDGE_CLASSES = new Set([
  '初级骚扰', '严重骚扰', '性交', 'A性交', 'W性交', 'U开发', 'U性交',
  '口交', '道具', '药物', 'SM', '群交', '隐奸', '露出',
  '掌握主动权',
])

function isSexJudgeClass(judgeClass?: string): boolean {
  return !!judgeClass && S_TYPE_JUDGE_CLASSES.has(judgeClass)
}

export function calcJudge(
  judgeBase: number,
  favorability: number,
  trust: number,
  charId?: string,
  judgeClass?: string,
  actionPart?: string,
): JudgeResult {
  const reason: string[] = []
  const needLabel = isSexJudgeClass(judgeClass) ? '需要性爱实行值至少为' : '需要基础实行值至少为'
  reason.push(`${needLabel}${judgeBase}\n`)
  reason.push('当前值为：')

  const favLevel = getLevel(favorability, FAV_THRESHOLDS)
  const favAdd = FAV_JUDGE_ADD[favLevel] ?? 0
  const trustLevel = getLevel(trust, TRUST_THRESHOLDS)
  const trustAdd = TRUST_JUDGE_ADD[trustLevel] ?? 0

  let total = judgeBase + favAdd + trustAdd
  reason.push(`好感修正(${favAdd})`)
  reason.push(`+信赖修正(${trustAdd})`)

  if (charId) {
    const char = entitySystem.get('character', charId) as any
    if (char) {
      // 2. 状态修正
      const addS = getStatLevel(char, ATTR.AROUSAL) + getStatLevel(char, ATTR.PLEASURE)
      const addL = getStatLevel(char, ATTR.DEFERENCE) + getStatLevel(char, ATTR.OBEDIENCE)
      const subS = getStatLevel(char, ATTR.SHAME) + getStatLevel(char, ATTR.DEPRESSION)
      const subL = getStatLevel(char, ATTR.PAIN) + getStatLevel(char, ATTR.FEAR) + getStatLevel(char, ATTR.RESENTMENT)
      const statusDelta = addS * 5 + addL * 10 - subS * 5 - subL * 10
      total += statusDelta
      if (statusDelta !== 0) reason.push(fmtSegment('状态修正', statusDelta))

      // 3. 能力修正
      const ablIntimacy = getAbilityLevel(char, ATTR.INTIMACY)
      const ablDesire = getAbilityLevel(char, ATTR.LUST)
      const abilityDelta = ablIntimacy * 10 + ablDesire * 5
      total += abilityDelta
      if (abilityDelta !== 0) reason.push(fmtSegment('能力修正', abilityDelta))

      // 4. 刻印修正
      const markPleasure = getAbilityLevel(char, ATTR.MARK_PLEASURE)
      const markSubmit = getAbilityLevel(char, ATTR.MARK_OBEDIENCE)
      const markPain = getAbilityLevel(char, ATTR.MARK_PAIN)
      const markVoid = getAbilityLevel(char, ATTR.MARK_VOID)
      const markFear = getAbilityLevel(char, ATTR.MARK_FEAR)
      const markTimestop = getAbilityLevel(char, ATTR.MARK_TIMESTOP)
      const markRebel = getAbilityLevel(char, ATTR.MARK_REBEL)
      const markDelta = markPleasure * 50 + markSubmit * 50 + markPain * 10 + markVoid * 25
        - (Math.min(markFear - markTimestop, 0) * 50 + markRebel * 100)
      total += markDelta
      if (markDelta !== 0) reason.push(fmtSegment('全刻印总修正', markDelta))

      // 5. 心情修正
      const anger = (char.base?.[ATTR.ANGER] ?? 0) as number
      let angryLevel = 0
      if (anger <= 5) angryLevel = 1
      else if (anger <= 30) angryLevel = 0
      else if (anger <= 50) angryLevel = -1
      else angryLevel = -3
      const angryDelta = angryLevel * 20
      total += angryDelta
      if (angryDelta !== 0) reason.push(fmtSegment('心情修正', angryDelta))

      // 6. 陷落修正
      const chainMap: Record<string, number> = {
        '思慕': 30, '恋慕': 50, '恋人': 80, '爱侣': 100,
        '屈从': 30, '驯服': 50, '宠物': 80, '奴隶': 100,
      }
      let fallDelta = 0
      for (const [talentId, value] of Object.entries(chainMap)) {
        if (getTalent(char, talentId)) fallDelta += value
      }
      total += fallDelta
      if (fallDelta !== 0) reason.push(fmtSegment('陷落修正', fallDelta))

      // 7. 全判定通用天赋修正
      const hateDelta = getTalent(char, '讨厌男性') * 30
      total -= hateDelta
      if (hateDelta !== 0) reason.push(fmtSegment('讨厌男性', -hateDelta))
      const hardlineDelta = getTalent(char, '难以越过的底线') * 100
      total -= hardlineDelta
      if (hardlineDelta !== 0) reason.push(fmtSegment('难以越过的底线', -hardlineDelta))
      const heldDelta = getTalent(char, '持有博士把柄') * 100
      total += heldDelta
      if (heldDelta !== 0) reason.push(fmtSegment('持有对方把柄', heldDelta))
      const weaknessDelta = getTalent(char, '被博士持有把柄') * 100
      total -= weaknessDelta
      if (weaknessDelta !== 0) reason.push(fmtSegment('被对方持有把柄', -weaknessDelta))
      const daughterDelta = getTalent(char, '女儿') * 100
      total += daughterDelta
      if (daughterDelta !== 0) reason.push(fmtSegment('女儿', daughterDelta))

      // 7b. S 类天赋个性 / 催眠补正
      const isStype = !judgeClass || S_TYPE_JUDGE_CLASSES.has(judgeClass)
      if (isStype) {
        if (getTalent(char, '淫乱')) { total += 50; reason.push(fmtSegment('淫乱', 50)) }
        if (getTalent(char, '性好奇')) { total += 30; reason.push(fmtSegment('性好奇', 30)) }
        if (getTalent(char, '性冷漠')) { total -= 30; reason.push(fmtSegment('性冷漠', -30)) }
        if (getTalent(char, '性无知')) { total += 100; reason.push(fmtSegment('性无知', 100)) }
        const unconsciousH = char?.sp_flag?.unconscious_h ?? 0
        if (unconsciousH >= 4 && unconsciousH <= 7) {
          const deepLv = getTalent(char, '已催眠·深')
          const lightLv = getTalent(char, '已催眠·浅')
          const extremeLv = getTalent(char, '已催眠·极')
          if (extremeLv > 0) {
            total += 9999
            reason.push(fmtSegment('完全催眠', 9999))
          } else {
            if (deepLv > 0) { total += deepLv * 10; reason.push(fmtSegment('催眠', deepLv * 10)) }
            if (lightLv > 0) { total += lightLv * 20; reason.push(fmtSegment('催眠', lightLv * 20)) }
          }
        }
      }
    }

    // 8. 他人存在修正
    const hc = (modLoader.getMod()?.hConfig as any) ?? {}
    const adjTable = hc.ability_lv_adjust ?? [1.0, 1.1, 1.25, 1.4, 1.6, 1.8, 2.1, 2.4, 2.8, 3.2, 4.0]
    const loc = gameContext.getContext().location
    if (charId && loc) {
      const sceneCount = entitySystem.getAll('character').filter((c: any) => c.current_location === loc.id).length
      const target = entitySystem.get('character', charId) as any
      if (sceneCount > 2 && (target?.sp_flag?.unconscious_h ?? 0) === 0) {
        const otherCount = sceneCount - 2
        let otherBase: number
        if (judgeClass === '群交' || judgeClass === '隐奸') otherBase = 60 + 60 * otherCount
        else if (judgeClass && S_TYPE_JUDGE_CLASSES.has(judgeClass)) otherBase = 40 + 40 * otherCount
        else otherBase = 25 + 25 * otherCount
        const exposeLv = target?.abilities?.[ATTR.EXPOSURE]?.level ?? 0
        const exposeAdj = adjTable[Math.min(Math.max(0, exposeLv), 10)] ?? 4.0
        const otherPeople = Math.floor(otherBase * (exposeAdj - 1.6))
        total += otherPeople
        if (otherPeople !== 0) reason.push(fmtSegment('有别人在时的露出修正', otherPeople))
      }
    }

    // 8.5 喜欢的体位/部位（只看客体/被判定方）
    const favCfg = getFavoriteConfig(modLoader.getMod())
    const currentPos = char?.h_state?.current_sex_position
    const POSITION_JUDGE_CLASSES = new Set(['性交', 'A性交', 'W性交'])
    if (typeof currentPos === 'number' && currentPos !== -1 && judgeClass && POSITION_JUDGE_CLASSES.has(judgeClass) && isFavoritePosition(char, currentPos)) {
      const bonus = favCfg.position_judge_bonus
      total += bonus
      reason.push(fmtSegment(`喜欢${getPositionDisplayName(currentPos, modLoader.getMod())}`, bonus))
    }
    if (actionPart) {
      const partKey = resolvePartKey(actionPart)
      if (partKey && isFavoritePart(char, partKey) && favoritePartApplies(char, partKey)) {
        const bonus = favCfg.part_judge_bonus
        total += bonus
        reason.push(fmtSegment(`喜欢${getPartDisplayName(partKey)}`, bonus))
      }
    }

    // 9. 判定族特殊修正
    for (const adj of calcAdjustments(judgeClass, charId)) {
      total += adj.value
      reason.push(fmtSegment(adj.label, adj.value))
    }
  }

  reason.push(` = ${total}\n`)
  const reasonText = reason.join('')

  if (total >= judgeBase) {
    return { success: true, partial: false, retreated: false, reason, reasonText }
  }
  if (total >= judgeBase * 0.6) {
    return { success: false, partial: true, retreated: false, reason, reasonText }
  }
  return { success: false, partial: false, retreated: true, reason, reasonText }
}