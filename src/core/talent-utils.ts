import { entitySystem } from './entity-system'
import { modLoader } from './mod-loader'
import type { TalentModifier } from './mod-loader'
import { evaluateCondition } from './condition'
import { gameContext } from './game-context'
import { narrativeLog } from './narrative-log'

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
    if (!evaluateCondition(mod.condition, gc)) return false
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

/** 检查并自动习得天赋（每次指令执行后调用） */
export function checkTalentGain(charId: string): void {
  const mod = modLoader.getMod()
  if (!mod?.talentDefs) return

  const char = entitySystem.get('character', charId) as any
  if (!char) return
  if (!char.talents) char.talents = {}

  const gc = gameContext.getContext()

  for (const [talentId, def] of Object.entries(mod.talentDefs)) {
    if (!def.gain?.condition) continue
    // 已有该天赋，不重复获得
    if (char.talents[talentId]) continue

    try {
      if (evaluateCondition(def.gain.condition, gc)) {
        const newLevel = (char.talents[talentId] ?? 0) + 1
        char.talents[talentId] = newLevel
        narrativeLog.write(`习得天赋：${def.name}（Lv.${newLevel}）`, 'system', 'talent-utils')

        // 替换类天赋（升级）：移除旧天赋
        if (def.gain.replace) {
          delete char.talents[def.gain.replace]
          const oldDef = mod.talentDefs[def.gain.replace]
          narrativeLog.write(`天赋 ${oldDef?.name ?? def.gain.replace} 已被替换`, 'system', 'talent-utils')
        }
      }
    } catch {
      // 条件求值错误不阻断
    }
  }
}
