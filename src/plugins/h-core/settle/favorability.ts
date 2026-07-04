// 注释：好感度结算（公式#1）
// floor(base × status_adjust × ability_adjust × talent_adjust × mark_adjust)
// 调用方传入 baseValue（来自 magnitude_base × add_time 等）
// 各修正系数在运行时从角色数据读取

import { entitySystem } from '../../../core/entity-system'

// 注释：status_id → 每级修正%
const STATUS_MOD: Record<string, number> = {
  '恭顺': 0.10, '好意': 0.10, '欲情': 0.10, '快乐': 0.10,
  '羞耻': -0.10, '苦痛': -0.10, '恐怖': -0.30, '抑郁': -0.30, '反感': -0.30,
}

// 注释：从角色 base 读取状态值的等级（简化用 value/10000 估算 LV）
function getStatusLevel(char: any, name: string): number {
  const val = char?.base?.[name] ?? 0
  return Math.floor(val / 10000)
}

// 注释：从角色的 abilities 读取指定 ID 的能力等级
function getAbilityLevel(char: any, abilityId: number): number {
  return char?.abilities?.[abilityId]?.level ?? 0
}

// 注释：从角色的 talents 读取陷落等级（爱情系 201-204 / 隶属系 211-214）
function getFallTalentLevel(char: any): number {
  if (!char?.talents) return 0
  for (let i = 0; i < 4; i++) {
    if (char.talents[201 + i]) return i + 1
    if (char.talents[211 + i]) return i + 1
  }
  return 0
}

// 注释：查角色的某刻印等级（ability 13-19, 存为 abilities.mark_{id}）
function getMarkLevel(char: any, markId: number): number {
  return char?.abilities?.[`mark_${markId}`]?.level ?? 0
}

// 注释：好感度修正系数——状态修正
function calcStatusAdjust(char: any): number {
  let adjust = 1.0
  for (const [key, mod] of Object.entries(STATUS_MOD)) {
    const lv = getStatusLevel(char, key)
    if (lv > 0) adjust += mod * lv
  }
  return adjust
}

// 注释：能力修正——亲密(33) +20%/lv
function calcAbilityAdjust(char: any): number {
  const intimacy = getAbilityLevel(char, 33)
  return 1.0 + intimacy * 0.2
}

// 注释：素质修正——爱情/隶属陷落 +25%/lv
function calcTalentAdjust(char: any): number {
  const fall = getFallTalentLevel(char)
  return 1.0 + fall * 0.25
}

// 注释：刻印修正
function calcMarkAdjust(char: any): number {
  let adjust = 1.0
  const markMods: Record<number, number> = {
    13: 0.2, 14: 0.2, 15: -0.3, 17: -0.3, 18: -1.0,
  }
  for (const [id, mod] of Object.entries(markMods)) {
    const lv = getMarkLevel(char, Number(id))
    if (lv > 0) adjust += mod * lv
  }
  return adjust
}

export function calcFavorability(charId: string, baseValue: number): number {
  const char = entitySystem.get('character', charId) as any
  if (!char) return Math.floor(baseValue)

  const statusAdj = calcStatusAdjust(char)
  const abilityAdj = calcAbilityAdjust(char)
  const talentAdj = calcTalentAdjust(char)
  const markAdj = calcMarkAdjust(char)

  return Math.floor(baseValue * statusAdj * abilityAdj * talentAdj * markAdj)
}
