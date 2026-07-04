// 注释：好感度/信赖度等级系统（对齐 erArk）

import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'

const STATUS_MOD: Record<string, number> = {
  '恭顺': 0.10, '好意': 0.10, '欲情': 0.10, '快乐': 0.10,
  '羞耻': -0.10, '苦痛': -0.10, '恐怖': -0.30, '抑郁': -0.30, '反感': -0.30,
}

function getStatusLevel(char: any, name: string): number {
  return Math.floor((char?.base?.[name] ?? 0) / 10000)
}

function getAbilityLevel(char: any, abilityId: number): number {
  return char?.abilities?.[abilityId]?.level ?? 0
}

function getFallTalentLevel(char: any): number {
  if (!char?.talents) return 0
  for (let i = 0; i < 4; i++) {
    if (char.talents[201 + i]) return i + 1
    if (char.talents[211 + i]) return i + 1
  }
  return 0
}

function getMarkLevel(char: any, markId: number): number {
  return char?.abilities?.[`mark_${markId}`]?.level ?? 0
}

function calcStatusAdjust(char: any): number {
  let adj = 1.0
  for (const [key, mod] of Object.entries(STATUS_MOD)) {
    const lv = getStatusLevel(char, key)
    if (lv > 0) adj += mod * lv
  }
  return adj
}

export function calcFavorability(charId: string, baseValue: number): number {
  const char = entitySystem.get('character', charId) as any
  if (!char) return Math.floor(baseValue)
  const intimacy = getAbilityLevel(char, 33)
  const abilityAdj = 1.0 + intimacy * 0.2
  const fall = getFallTalentLevel(char)
  const talentAdj = 1.0 + fall * 0.25
  let markAdj = 1.0
  for (const [id, mod] of Object.entries({ 13: 0.2, 14: 0.2, 15: -0.3, 17: -0.3, 18: -1.0 })) {
    const lv = getMarkLevel(char, Number(id))
    if (lv > 0) markAdj += mod * lv
  }
  return Math.floor(baseValue * calcStatusAdjust(char) * abilityAdj * talentAdj * markAdj)
}

// 注释：好感度等级——对齐 erArk get_favorability_level
// 阈值来自 h-config.toml favorability_thresholds
// 返回 { level(0-8), judgeAdd(+0~+300) }
export function getFavorabilityLevel(value: number): { level: number; judgeAdd: number } {
  const cfg = (modLoader.getMod()?.hConfig as any) ?? {}
  const t = cfg.favorability_thresholds ?? [0, 100, 500, 1000, 2500, 5000, 10000, 50000, 100000]
  const add = [0, 10, 25, 50, 75, 100, 150, 225, 300]
  let lv = 0
  for (let i = t.length - 1; i >= 0; i--) { if (value >= t[i]) { lv = i; break } }
  return { level: lv, judgeAdd: add[lv] ?? 0 }
}

// 注释：信赖度等级——对齐 erArk get_trust_level
export function getTrustLevel(value: number): { level: number; judgeAdd: number } {
  const cfg = (modLoader.getMod()?.hConfig as any) ?? {}
  const t = cfg.trust_thresholds ?? [0, 25, 50, 75, 100, 150, 200, 250, 300]
  const add = [0, 25, 50, 75, 100, 150, 200, 300, 500]
  let lv = 0
  for (let i = t.length - 1; i >= 0; i--) { if (value >= t[i]) { lv = i; break } }
  return { level: lv, judgeAdd: add[lv] ?? 0 }
}
