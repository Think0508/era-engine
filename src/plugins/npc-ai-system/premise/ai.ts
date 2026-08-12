// 注释：AI 基础前提——npc-ai-system 注册的前提 handler 库
// 语义：前提返回数值即权重（erArk handle_premise → search_target `now_weight += premise_judge`）——
// 动态前提（疲劳等级等）权重随状态变化，是 AI 偏好（疲惫越重越想休息）的来源。
// handler ctx 约定：{ sourceId = 被决策的 NPC id, selectedCharacterId = 同 NPC }。
//
// ⚠️ 注册必须在 registerAiPremises() 内完成（onLoad 调用）——模块顶层副作用 + clear()
// 会导致前提在 conditionEngine.clear()（测试隔离/模组重载）后永久丢失（2026-08-10
// 排查修复：此前顶层注册 + 空壳函数，go_home_night 等前提目标静默失效）。

import { conditionEngine } from '../../../core/condition-engine'
import { gameContext } from '../../../core/game-context'
import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'
import { getEntityAttr } from '../../../core/entity-utils'

// 注释：疲劳等级（erArk attr_calculation.get_tired_level，:764）——
// 0: ≤0.74×160，1: ≤0.84×160，2: <160，3: ≥160
export function getTiredLevel(tired: number): number {
  const ratio = tired / 160
  if (ratio <= 0.74) return 0
  if (ratio <= 0.84) return 1
  if (ratio < 1) return 2
  return 3
}

function charOf(ctx: any): any {
  return entitySystem.get('character', ctx?.sourceId) as any
}

// 注释：注册全部 AI 前提（onLoad 调用——必须显式调用，见文件头警告）
export function registerAiPremises(): void {
  // ── 疲劳前提（AI_TIRED_LEVEL_N：等级 ≥N 时通过，权重 = 疲劳等级）──
  // erArk：疲惫目标的前提权重随疲惫程度增长——REST/SLEEP 目标权重 = tired_level
  for (const level of [1, 2, 3]) {
    conditionEngine.registerPremise(`AI_TIRED_LEVEL_${level}`, (ctx: any) => {
      const char = charOf(ctx)
      if (!char) return 0
      const tired = getEntityAttr(char, '疲劳度')
      if (typeof tired !== 'number') return 0
      const lv = getTiredLevel(tired)
      return lv >= level ? lv : 0
    })
  }

  // 注释：AI_TIRED——疲惫标记（HP≤1，pre-check 维护 sp_flag.tired）；权重 1
  conditionEngine.registerPremise('AI_TIRED', (ctx: any) => {
    const char = charOf(ctx)
    return !!char?.sp_flag?.tired ? 1 : 0
  })

  // 注释：AI_NIGHT——夜晚（22:00-5:59，对齐 game:night_start=22）；权重 1
  conditionEngine.registerPremise('AI_NIGHT', () => {
    const hour = gameContext.getContext().time.hour
    return hour >= 22 || hour < 6 ? 1 : 0
  })

  // 注释：AI_DAY——白天（6:00-21:59）；权重 1
  conditionEngine.registerPremise('AI_DAY', () => {
    const hour = gameContext.getContext().time.hour
    return hour >= 6 && hour < 22 ? 1 : 0
  })

  // 注释：AI_WORK_TIME——当前在工作时段（工种 time_slots，半开区间 [start, end)——
  // 与排班 hourInRange 一致；2026-08-10 排查修复：此前闭区间在班末小时误判）
  conditionEngine.registerPremise('AI_WORK_TIME', (ctx: any) => {
    const char = charOf(ctx)
    const workTypeId = char?.behavior?.work?.work_type as string | undefined
    const def = workTypeId ? modLoader.getMod()?.aiWorkTypes?.[workTypeId] : undefined
    if (!def) return 0
    const hour = gameContext.getContext().time.hour
    return def.time_slots.some((slot: [number, number]) => hour >= slot[0] && hour < slot[1]) ? 1 : 0
  })

  // 注释：AI_ENTERTAINMENT_TIME——当前在娱乐时段（erArk judge_entertainment_time 三时段）；权重 1
  conditionEngine.registerPremise('AI_ENTERTAINMENT_TIME', () => {
    const hour = gameContext.getContext().time.hour
    if (hour >= 9 && hour < 12) return 1
    if (hour >= 14 && hour < 18) return 1
    if (hour >= 19 && hour < 22) return 1
    return 0
  })

  // 注释：AI_HOME——当前在自己常驻点（home_locations）；权重 1
  conditionEngine.registerPremise('AI_HOME', (ctx: any) => {
    const char = charOf(ctx)
    const home = char?.behavior?.home_locations as Record<string, number> | undefined
    if (!home || !char?.current_location) return 0
    return home[char.current_location] !== undefined ? 1 : 0
  })

  // 注释：AI_NOT_AT_HOME——有 home_locations 且当前不在其中（"回家"目标用）；权重 1
  conditionEngine.registerPremise('AI_NOT_AT_HOME', (ctx: any) => {
    const char = charOf(ctx)
    const home = char?.behavior?.home_locations as Record<string, number> | undefined
    if (!home || Object.keys(home).length === 0) return 0
    return home[char?.current_location] === undefined ? 1 : 0
  })

  // 注释：AI_IMPRISONED——监禁中（sp_flag.imprisonment）；权重 1
  conditionEngine.registerPremise('AI_IMPRISONED', (ctx: any) => {
    const char = charOf(ctx)
    return !!char?.sp_flag?.imprisonment ? 1 : 0
  })
}
