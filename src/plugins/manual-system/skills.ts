// 注释：manual-system 技能经验与层数钳制（2026-09-23）
//
// 三件事：
//  ① 闸门 `isTrainee`：玩家本人 **或** 在队/跟随者才积累技能经验（NPC 用技能不算）；
//  ② 每次使用主动技能 → 技能经验 = 悟性有效值 × xp_per_wit
//     （"这一次真的用了这招"由 combat-base 的 `combat:skill_used` 决定：内力已扣、行动未被作废；
//      命中与否不影响——经验是练招的报酬，不是打中的报酬）；
//  ③ 注册给 ability-progression 的两个外部提供者：
//     · 层数上限 = 该技能依赖的秘籍的已修炼进度最大值（**该角色毫无进度则返回 null = 不钳制**，
//       这是"NPC 直接授权的技能零影响"的机制保证）；
//     · 经验曲线 = 技能品级（授予它的秘籍里技能经验 base 最高者，或能力自设 xp_tier）。

import { apiSystem } from '../../core/api'
import { entitySystem } from '../../core/entity-system'
import { getEntityAttr } from '../../core/entity-utils'
import { errorReporter } from '../../core/error-reporter'
import { isPlayerChar } from '../../core/game-context'
import { geometricCost } from '../../core/xp-curve'
import type { AbilityDef } from '../../core/mod-types'
import { abilityDef, config, manualsForAbility, skillTierCost, skillTierOf } from './context'

/** 受训者闸门：玩家本人，或处于跟随/在队状态的角色（走 follow API；插件缺失 → 仅玩家）。
 *  队友系统将来落地时只需替换这一个谓词——技能经验的数据结构不用动。 */
export function isTrainee(charId: string): boolean {
  if (isPlayerChar(charId)) return true
  try {
    return !!apiSystem.callSync('follow', 'isFollowing', charId)
  } catch {
    return false // follow-system 未启用 → 只有玩家积累
  }
}

/** `combat:skill_used` 处理：给施动者加技能经验（非受训者/未拥有/无等级技能直接忽略） */
export async function onSkillUsed(payload: any): Promise<void> {
  const actor = payload?.actor
  const skillId = payload?.skillId
  if (typeof actor !== 'string' || typeof skillId !== 'string') return
  if (!isTrainee(actor)) return
  const char = entitySystem.get('character', actor) as any
  if (!char) return
  const def = abilityDef(skillId)
  if (!def) return
  if (def.max_level === 0) return   // 无等级技能（视为 1 级永久）不参与经验
  if (def.mode === 'condition') return
  const entry = char.abilities?.[skillId]
  if (!entry || typeof entry.level !== 'number') return  // 未拥有 → 不计算（获得后才开始积累）
  const cfg = config()
  const wit = getEntityAttr(char, cfg.wit_attr)
  const w = typeof wit === 'number' && Number.isFinite(wit) ? wit : 0
  const gain = w * cfg.xp_per_wit
  if (!(gain > 0)) return
  try {
    await apiSystem.call('abilities', 'gainXp', actor, skillId, gain)
  } catch (err) {
    errorReporter.reportDedup('manual-skill-xp-api', {
      source: 'manual-system', severity: 'warning',
      message: `技能经验写入失败（abilities.gainXp）：${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

/** ability-progression 的外部层数上限提供者（签名见该插件 registerLevelCapProvider） */
export function levelCapProvider(charId: string, abilityId: string, _def: AbilityDef): number | null {
  const char = entitySystem.get('character', charId) as any
  if (!char) return null
  const manuals = manualsForAbility(abilityId)
  if (manuals.length === 0) return null   // 无依赖秘籍 → 不钳制
  let any = false
  let progress = 0
  for (const manualId of manuals) {
    const lv = char.manuals?.[manualId]?.level
    if (typeof lv === 'number' && Number.isFinite(lv)) {
      any = true
      progress = Math.max(progress, lv)
    }
  }
  if (!any) return null   // 有依赖声明但毫无进度 → 不钳制（NPC / 事件灌的技能 / 未开练的玩家）
  return progress
}

/** ability-progression 的外部经验曲线提供者：技能品级表（xp_base_skill）驱动 */
export function xpCurveProvider(
  _charId: string,
  abilityId: string,
  def: AbilityDef,
  currentLevel: number,
): number | null {
  if (def?.xp_curve === 'geometric') return null   // 能力自带曲线 → 交给 ability-progression
  const tier = skillTierOf(abilityId)
  const base = tier?.xp_base_skill
  if (typeof base !== 'number' || !(base > 0)) return null
  return geometricCost(base, tier?.ratio, currentLevel)
}

/** combat-base 的**技能蓝耗提供者**：技能没写 `cost` 时按品级表给蓝耗（`manual-tiers.toml` 的 `cost`）。
 *  技能显式写了 `cost` → 不表态（返回 null），由 combat-base 直接用显式值。 */
export function skillCostProvider(charId: string, skillId: string, _def: AbilityDef): number | null {
  // charId 目前不参与（蓝耗按品级，与角色无关）；保留签名以便将来做"按角色打折"
  void charId
  return skillTierCost(skillId)
}

/** 秘籍升层后的补升：把"依赖该秘籍且已满经验"的技能立刻升一级（幂等） */
export function recheckSkillsForManual(charId: string, manualId: string): void {
  const char = entitySystem.get('character', charId) as any
  if (!char?.abilities) return
  for (const abilityId of Object.keys(char.abilities)) {
    if (!manualsForAbility(abilityId).includes(manualId)) continue
    try {
      apiSystem.callSync('abilities', 'recheck', charId, abilityId)
    } catch {
      // ability-progression 未加载（单插件测试）→ 无补升可言，静默
    }
  }
}
