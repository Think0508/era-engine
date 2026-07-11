// 注释：H 状态前提——注册基础 H 状态前提 handler
// 前提列表对齐 erArk：NOT_H, TIRED_LE_84, HP_G_1, SCENE_ONLY_TWO 等

import { gameContext } from '../../../core/game-context'
import { entitySystem } from '../../../core/entity-system'
import { modLoader } from '../../../core/mod-loader'
import { getLevel } from '../settle/judge'

function getTargetChar(ctx: any): any {
  const charId = ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId
  if (!charId) return null
  return entitySystem.get('character', charId) as any
}

/** 获取角色所有 PALAM 参数中的最高等级 */
function getMaxParameterLevel(char: any): number {
  if (!char) return 0
  const mod = modLoader.getMod()
  if (!mod?.attributes) return 0
  let maxLv = 0
  for (const [attr, def] of Object.entries(mod.attributes)) {
    if (!('level_thresholds' in (def as any))) continue
    const thresholds = (def as any).level_thresholds as number[]
    if (!thresholds || thresholds.length === 0) continue
    // 从 entity 读取属性值
    let val = 0
    if (char.params && typeof char.params[attr] === 'number') val = char.params[attr]
    else if (char.base && typeof char.base[attr] === 'number') val = char.base[attr]
    if (val <= 0) continue
    const lv = getLevel(val, thresholds)
    if (lv > maxLv) maxLv = lv
  }
  return maxLv
}

export function registerHPremises(registry: any): void {
  registry.register('HAVE_TARGET', (ctx: any) => {
    return (ctx.selectedCharacterId ?? ctx.uiStore?.selectedCharacterId) != null
  })

  registry.register('NOT_H', (ctx: any) => {
    const char = getTargetChar(ctx)
    return !char?.h_state?.is_h
  })

  registry.register('T_NORMAL', (_ctx: any) => {
    return true
  })

  registry.register('TIRED_LE_84', (ctx: any) => {
    const char = getTargetChar(ctx)
    if (!char) return false
    const tired = char?.base?.疲劳度 ?? 0
    return tired <= 134
  })

  registry.register('HP_G_1', (ctx: any) => {
    const char = getTargetChar(ctx)
    if (!char) return false
    const 体力 = char?.base?.体力 ?? 0
    return 体力 > 1
  })

  registry.register('IS_H', (ctx: any) => {
    const char = getTargetChar(ctx)
    return char?.h_state?.is_h === true
  })

  registry.register('SCENE_ONLY_TWO', (_ctx: any) => {
    const loc = gameContext.getContext().location
    if (!loc) return false
    let count = 0
    for (const char of entitySystem.getAll('character')) {
      if ((char as any).current_location === loc.id) count++
    }
    return count <= 2
  })

  registry.register('TECHNIQUE_GE_3', (ctx: any) => {
    const char = getTargetChar(ctx)
    if (!char) return false
    return (char?.abilities?.[30]?.level ?? 0) >= 3
  })

  // ═══ PALAM 等级前提 — high_1 ~ high_10、high_999 ═══
  // 检查目标角色的最高参数等级
  for (let i = 1; i <= 10; i++) {
    const level = i
    registry.register(`high_${level}`, (ctx: any) => {
      const char = getTargetChar(ctx)
      return getMaxParameterLevel(char) >= level
    })
  }

  registry.register('high_999', () => true)

  // ── 简写别名 ──
  registry.register('HIGH_1', (ctx: any) => {
    const char = getTargetChar(ctx)
    return getMaxParameterLevel(char) >= 1
  })

  // ═══ 系统状态前提 ═══
  registry.register('sys_0', () => true)  // 普通状态
  registry.register('sys_1', () => false) // 占位：待实现
  registry.register('sys_2', () => false)
  registry.register('sys_3', () => false)
  registry.register('sys_4', () => false)
  registry.register('sys_5', () => false)
}
