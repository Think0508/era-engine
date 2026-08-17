// 天赋工具（talent-utils）——天赋等级查询 + modifier 公式点计算
// 2026-08-16：天赋获得/自动习得逻辑已迁移至 gain-rule-system 插件（checkTalentGain/
// gainTalentManual/grantTalent 移除——统一调度点：game:execution_end 事件 + checkAuto API）
// 本文件保留：getTalentLevel / sumTalentModifiers / multiplyTalentModifiers（公式点接线用）

import { entitySystem } from './entity-system'
import { modLoader } from './mod-loader'
import type { TalentModifier } from './mod-loader'
import { conditionEngine } from './condition-engine'
import { gameContext } from './game-context'

export interface TalentModifierContext {
  tag?: string
  type?: string
  ability?: string
}

/** 角色某天赋的等级（0=无） */
export function getTalentLevel(charId: string, talentId: string): number {
  const char = entitySystem.get('character', charId) as any
  if (!char?.talents) return 0
  return char.talents[talentId] ?? 0
}

/** 对指定公式点的所有天赋 plus 值求和 */
export function sumTalentModifiers(
  charId: string,
  formula: string,
  ctx: TalentModifierContext,
): number {
  return applyTalentModifiers(charId, formula, ctx, 'plus')
}

/** 对指定公式点的所有天赋 multiply 值求积（1 + sum(每级乘值×等级)） */
export function multiplyTalentModifiers(
  charId: string,
  formula: string,
  ctx: TalentModifierContext,
): number {
  return applyTalentModifiers(charId, formula, ctx, 'multiply')
}

function modifierMatches(ctx: TalentModifierContext, mod: TalentModifier): boolean {
  if (mod.when_tag && mod.when_tag !== ctx.tag) return false
  if (mod.when_type && mod.when_type !== ctx.type) return false
  if (mod.when_ability && mod.when_ability !== ctx.ability) return false
  if (mod.condition) {
    const gc = gameContext.getContext()
    if (!conditionEngine.evaluate(mod.condition, gc)) return false
  }
  return true
}

function applyTalentModifiers(
  charId: string,
  formula: string,
  ctx: TalentModifierContext,
  mode: 'plus' | 'multiply',
): number {
  const char = entitySystem.get('character', charId) as any
  if (!char?.talents) return mode === 'plus' ? 0 : 1

  const mod = modLoader.getMod()
  if (!mod) return mode === 'plus' ? 0 : 1

  let result = mode === 'plus' ? 0 : 1

  for (const [talentId, def] of Object.entries(mod.talentDefs)) {
    const level = char.talents[talentId] ?? 0
    if (level <= 0) continue
    if (!def.modifiers) continue
    for (const m of def.modifiers) {
      if (m.formula !== formula) continue
      if (!modifierMatches(ctx, m)) continue
      if (mode === 'plus') {
        result += (m.plus ?? 0) * level
      } else {
        result += (m.multiply ?? 0) * level
      }
    }
  }

  return result
}
