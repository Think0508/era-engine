// 注释：信赖度结算——精确复刻 erArk calculation_trust（common_default.py:752-813）
// fix = 1.0 + 能力修正（亲密/快乐刻印/屈服刻印 +0.2/级，苦痛/恐怖刻印 -0.3/级，反发刻印 -1.0/级）
//       + 素质修正（favorability_adjusts 数据化，与好感共用）
// trust = add_time / 60 × fix
// TODO 香薰(aromatherapy==5 +0.5) / 空气催眠置零（依赖未实装系统）

import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'
import { getFavorabilityTalentAdjust } from './talent-adjust'

function getAbilityLevel(char: any, abilityId: string): number {
  return char?.abilities?.[abilityId]?.level ?? 0
}

// 注释：刻印能力按名查（2026-08-08 审查修复：原 `mark_{id}` 数字键查按名存储的 abilities →
// 恒 0，刻印升级对信赖修正静默失效；h-mark 现统一写按名键）
const MARK_ABILITY: Record<number, string> = {
  13: '快乐刻印', 14: '屈服刻印', 15: '苦痛刻印', 17: '恐怖刻印', 18: '反发刻印',
}

function getMarkLevel(char: any, markId: number): number {
  return char?.abilities?.[MARK_ABILITY[markId]]?.level ?? 0
}

export function calcTrust(charId: string, durationMinutes: number): number {
  const char = entitySystem.get('character', charId) as any
  if (!char) return 0
  // 注释：erArk calculation_trust:764-805——全加法 fix（无状态修正，与好感不同）
  let fix = 1.0
  // 能力修正：亲密(32)/快乐刻印(13)/屈服刻印(14) +0.2/级，苦痛刻印(15)/恐怖刻印(17) -0.3/级，反发刻印(18) -1.0/级
  fix += getAbilityLevel(char, '亲密') * 0.2
  for (const [id, mod] of Object.entries({ 13: 0.2, 14: 0.2, 15: -0.3, 17: -0.3, 18: -1.0 })) {
    const lv = getMarkLevel(char, Number(id))
    fix += mod * lv
  }
  // 素质修正（:780-805）：爱情隶属系/受精妊娠临盆/感情缺乏/讨厌男性
  // TODO 激素（博士信息素 304-306，发起者维度）已按粗筛砍掉（信息素系统，master-list:543）
  fix += getFavorabilityTalentAdjust(modLoader.getMod(), char)
  return (durationMinutes / 60) * fix
}
