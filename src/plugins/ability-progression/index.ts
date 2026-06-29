// 注释：ability-progression 插件——能力升级（XP/等级/unlocks）
// gain_ability_xp effect + 升级 + unlocks 自动给予 + character:ability_up 事件

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'
import type { AbilityDef } from '../../core/mod-loader'

// 注释：onLoad——注册 gain_ability_xp effect type
export function onLoad(_ctx: PluginContext): void {
  effectTypeRegistry.register('gain_ability_xp', async (params: any, ctx: any) => {
    const targetIds = ctx._targetIds as string[]
    for (const id of targetIds) {
      gainXp(id, params.ability, params.xp)
    }
    return true
  })
}

// 注释：onEnable——注册 ability API
export function onEnable(ctx: PluginContext): void {
  ctx.api.register('abilities', {
    // 注释：获取角色所有带某 tag 的能力
    getByTag: (charId: string, tag: string): any[] => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.abilities) return []
      const mod = modLoader.getMod()
      if (!mod) return []
      return Object.entries(char.abilities)
        .filter(([abilityId]) => {
          const def = mod.abilities[abilityId]
          return def?.tags?.includes(tag)
        })
        .map(([abilityId, data]) => ({ id: abilityId, ...(data as any) }))
    },
    // 注释：检查角色是否有带某 tag 的能力
    hasTag: (charId: string, tag: string): boolean => {
      const char = entitySystem.get('character', charId) as any
      if (!char?.abilities) return false
      const mod = modLoader.getMod()
      if (!mod) return false
      return Object.keys(char.abilities).some(abilityId => {
        return mod.abilities[abilityId]?.tags?.includes(tag)
      })
    },
    // 注释：获取能力等级
    getLevel: (charId: string, abilityId: string): number => {
      const char = entitySystem.get('character', charId) as any
      return char?.abilities?.[abilityId]?.level ?? 0
    },
    // 注释：给予 XP
    gainXp: (charId: string, abilityId: string, xp: number): void => {
      gainXp(charId, abilityId, xp)
    },
  })
}

// 注释：给予 XP + 升级逻辑
function gainXp(charId: string, abilityId: string, xp: number): void {
  const char = entitySystem.get('character', charId) as any
  if (!char?.abilities) return
  const ability = char.abilities[abilityId]
  if (!ability) return

  const mod = modLoader.getMod()
  const def = mod?.abilities[abilityId]
  if (!def) return

  // 注释：无等级能力（max_level=0）——静默跳过
  if (def.max_level === 0) return
  if (ability.xp === null) return

  // 注释：加 XP
  ability.xp += xp

  // 注释：检查升级——循环（可能连升多级）
  while (ability.level < def.max_level && ability.xp >= getXpRequired(def, ability.level)) {
    ability.xp -= getXpRequired(def, ability.level)
    ability.level++

    // 注释：检查 unlocks
    if (def.unlocks) {
      for (const unlock of def.unlocks) {
        if (unlock.at_level === ability.level) {
          if (unlock.ability) {
            // 注释：自动给予子能力
            if (!char.abilities[unlock.ability]) {
              char.abilities[unlock.ability] = { level: 1, xp: 0 }
            }
          }
          if (unlock.talent) {
            // 注释：自动给予天赋
            if (!char.talents) char.talents = {}
            char.talents[unlock.talent] = 1
          }
        }
      }
    }

    // 注释：发出升级事件
    eventBus.emit('character:ability_up', {
      character: charId,
      ability: abilityId,
      newLevel: ability.level,
    })
  }
}

// 注释：获取升到下一级所需 XP
function getXpRequired(def: AbilityDef, currentLevel: number): number {
  const curve = def.xp_curve || 'linear'
  const xpPerLevel = def.xp_per_level

  if (curve === 'linear') {
    return typeof xpPerLevel === 'number' ? xpPerLevel : 100
  } else if (curve === 'exponential') {
    const base = typeof xpPerLevel === 'number' ? xpPerLevel : 100
    return base * Math.pow(2, currentLevel)
  } else if (curve === 'custom' && Array.isArray(xpPerLevel)) {
    return xpPerLevel[currentLevel] ?? xpPerLevel[xpPerLevel.length - 1] ?? 100
  }
  return 100
}
