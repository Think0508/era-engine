import { entitySystem } from './entity-system'
import { modLoader } from './mod-loader'
import type { TalentDef, TalentModifier } from './mod-loader'
import { conditionEngine } from './condition-engine'
import { gameContext } from './game-context'
import { narrativeLog } from './narrative-log'
import { evaluateUpgradeNeeds } from './upgrade-needs'

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

/** 天赋获得核心逻辑（checkTalentGain / gainTalentManual 共用）——赋予 + 日志 + 替换 */
function grantTalent(char: any, _charId: string, talentId: string, def: TalentDef): boolean {
  if (char.talents[talentId]) return false
  const newLevel = (char.talents[talentId] ?? 0) + 1
  char.talents[talentId] = newLevel
  narrativeLog.write(`习得天赋：${def.name ?? talentId}（Lv.${newLevel}）`, 'system', 'talent-utils')

  // 替换类天赋（升级）：移除旧天赋
  const replace = def.gain?.replace
  if (replace) {
    delete char.talents[replace]
    const oldDef = modLoader.getMod()?.talentDefs?.[replace]
    narrativeLog.write(`天赋 ${oldDef?.name ?? replace} 已被替换`, 'system', 'talent-utils')
  }
  return true
}

/** 按 gain_type 过滤的自动习得检查（erArk gain_talent）：
 *  gain_type 0=随时自动（指令执行后）/ 3=睡觉自动；缺省 0（向后兼容现有 gain.condition 数据）
 *  条件：gain.condition 表达式满足 或 gain.needs 语义化需求满足（erArk gain_need 是 AND 全满足）
 */
export function checkTalentGain(charId: string, gainType = 0): void {
  const mod = modLoader.getMod()
  if (!mod?.talentDefs) return

  const char = entitySystem.get('character', charId) as any
  if (!char) return
  if (!char.talents) char.talents = {}

  const gc = gameContext.getContext()

  for (const [talentId, def] of Object.entries(mod.talentDefs)) {
    if (!def.gain) continue
    // 获得时机过滤（erArk gain_type；缺省 0 随时）
    if ((def.gain.gain_type ?? 0) !== gainType) continue
    // 已有该天赋，不重复获得
    if (char.talents[talentId]) continue

    try {
      let satisfied = false
      if (def.gain.condition) {
        satisfied = conditionEngine.evaluate(def.gain.condition, gc)
      }
      if (!satisfied && def.gain.needs) {
        satisfied = evaluateUpgradeNeeds(char, def.gain.needs).satisfied
      }
      if (satisfied) {
        grantTalent(char, charId, talentId, def)
      }
    } catch {
      // 条件求值错误不阻断
    }
  }
}

/**
 * 手动获得天赋（erArk gain_talent now_gain_type=1）——面板确认后调用，跳过条件直接获得
 * （面板层负责前置检查：共通前提/路线前提/needs 显示）。重复获得静默跳过。
 */
export function gainTalentManual(charId: string, talentId: string): boolean {
  const mod = modLoader.getMod()
  const def = mod?.talentDefs?.[talentId]
  if (!def) return false
  const char = entitySystem.get('character', charId) as any
  if (!char) return false
  if (!char.talents) char.talents = {}
  return grantTalent(char, charId, talentId, def)
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
