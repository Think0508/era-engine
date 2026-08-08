// 注释：好感度/信赖度等级系统（对齐 erArk）

import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'
import { getEntityAttr } from '../../../core/entity-utils'
import { getLevel } from '../../../core/entity-utils'
import { getFavorabilityTalentAdjust, clearTalentAdjustIndex } from './talent-adjust'

const STATUS_MOD: Record<string, number> = {
  '恭顺': 0.10, '好意': 0.10, '欲情': 0.10, '快乐': 0.10,
  '羞耻': -0.10, '苦痛': -0.10, '恐怖': -0.30, '抑郁': -0.30, '反感': -0.30,
}

function getStatusLevel(char: any, name: string): number {
  const mod = modLoader.getMod()
  const def = mod?.attributes?.[name]
  const thresholds = (def as any)?.level_thresholds as number[] | undefined
  if (!thresholds || thresholds.length === 0) return 0
  const value = getEntityAttr(char, name)
  if (typeof value !== 'number' || value <= 0) return 0
  return getLevel(value, thresholds)
}

function getAbilityLevel(char: any, abilityId: string): number {
  return char?.abilities?.[abilityId]?.level ?? 0
}

// 注释：刻印能力按名查（2026-08-08 审查修复：原 `mark_{id}` 数字键查按名存储的 abilities →
// 恒 0，刻印升级对好感/信赖修正静默失效；h-mark 现统一写按名键）
const MARK_ABILITY: Record<number, string> = {
  13: '快乐刻印', 14: '屈服刻印', 15: '苦痛刻印', 17: '恐怖刻印', 18: '反发刻印',
}

function getMarkLevel(char: any, markId: number): number {
  return char?.abilities?.[MARK_ABILITY[markId]]?.level ?? 0
}

export function calcFavorability(charId: string, baseValue: number): number {
  const char = entitySystem.get('character', charId) as any
  if (!char) return Math.floor(baseValue)
  // 注释：erArk calculation_favorability（common_default.py:675-750）——fix 全加法链，int(fix × base)
  let fix = 1.0
  // 状态修正（:690-701）：恭顺/好意/欲情/快乐 +0.1/级，羞耻/苦痛 -0.1/级，恐怖/抑郁/反感 -0.3/级
  for (const [key, mod] of Object.entries(STATUS_MOD)) {
    const lv = getStatusLevel(char, key)
    fix += mod * lv
  }
  // 能力修正（:704-715）：亲密(32)/快乐刻印(13)/屈服刻印(14) +0.2/级，苦痛刻印(15)/恐怖刻印(17) -0.3/级，反发刻印(18) -1.0/级
  fix += getAbilityLevel(char, '亲密') * 0.2
  for (const [id, mod] of Object.entries({ 13: 0.2, 14: 0.2, 15: -0.3, 17: -0.3, 18: -1.0 })) {
    const lv = getMarkLevel(char, Number(id))
    fix += mod * lv
  }
  // 素质修正（:717-748）——数据化：爱情隶属系/受精妊娠临盆/感情缺乏/讨厌男性
  // TODO 激素（博士信息素 304-306，发起者维度）已按粗筛砍掉（信息素系统，master-list:543）
  fix += getFavorabilityTalentAdjust(modLoader.getMod(), char)
  // TODO 香薰(aromatherapy==5 +0.5) / 空气催眠置零（依赖未实装系统）
  return Math.floor(fix * baseValue)
}

export { clearTalentAdjustIndex }

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
