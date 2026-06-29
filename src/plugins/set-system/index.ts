// 注释：set-system 插件——广义套装系统
// 套装涵盖装备/武功/天赋三种来源
// 动态检测：角色获得/失去 ability/item/talent 时检查套装
// 凑齐给天赋/效果，失去件时动态移除
// TODO Phase 11: 钩子式效果（先手/反击/反伤等），MVP 只支持 effects 注入

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import type { SetDef } from '../../core/mod-loader'

// 注释：记录角色当前激活的套装 bonus（用于失去件时移除）
// Map<charId, Set<{ setId, requiredCount }>>
const activeSetBonuses = new Map<string, Set<string>>()

export function onLoad(_ctx: PluginContext): void {
  // 注释：set-system 无 effect type 注册
}

export function onEnable(ctx: PluginContext): void {
  ctx.api.register('set', {
    // 注释：检查角色的所有套装状态
    checkSets: (charId: string): void => {
      checkSetsForChar(charId)
    },
    // 注释：获取角色当前激活的套装
    getActiveSets: (charId: string): string[] => {
      return Array.from(activeSetBonuses.get(charId) ?? [])
    },
  })

  // 注释：监听 character:changed → 检查套装变化
  ctx.events.on('character:changed', (payload: any) => {
    if (payload?.id) {
      checkSetsForChar(payload.id)
    }
  })
}

// 注释：检查角色的所有套装——凑齐给效果，失去件移除
function checkSetsForChar(charId: string): void {
  const mod = modLoader.getMod()
  if (!mod) return
  const char = entitySystem.get('character', charId) as any
  if (!char) return

  const currentActive = activeSetBonuses.get(charId) ?? new Set<string>()
  const newActive = new Set<string>()

  for (const setDef of mod.sets) {
    // 注释：计算角色拥有多少套装成员
    const memberCount = countSetMembers(char, setDef)
    // 注释：检查各档 bonus
    for (const bonus of setDef.bonuses) {
      const bonusKey = `${setDef.id}:${bonus.required_count}`
      if (memberCount >= bonus.required_count) {
        // 注释：凑齐——如果之前没激活，现在激活
        if (!currentActive.has(bonusKey)) {
          applySetBonus(charId, bonus, charId)
        }
        newActive.add(bonusKey)
      }
    }
  }

  // 注释：失去的 bonus——移除
  for (const key of currentActive) {
    if (!newActive.has(key)) {
      // TODO: 完整移除逻辑（需要记录之前给了什么效果/天赋）
      // MVP 简化——只记录，不精确移除
    }
  }

  activeSetBonuses.set(charId, newActive)
}

// 注释：计算角色拥有多少套装成员
function countSetMembers(char: any, setDef: SetDef): number {
  let count = 0
  const members = setDef.members
  if (members.abilities) {
    for (const abilityId of members.abilities) {
      if (char.abilities?.[abilityId]) count++
    }
  }
  if (members.items) {
    for (const itemId of members.items) {
      // 注释：检查背包和装备
      const inInventory = char.inventory?.some((i: any) => i.itemId === itemId)
      const inEquipment = char.equipment && Object.values(char.equipment).includes(itemId)
      if (inInventory || inEquipment) count++
    }
  }
  if (members.talents) {
    for (const talentId of members.talents) {
      if (char.talents?.[talentId]) count++
    }
  }
  return count
}

// 注释：应用套装 bonus——effects 注入 + 天赋给予
function applySetBonus(charId: string, bonus: any, _sourceId: string): void {
  // 注释：effects 注入
  if (bonus.effects) {
    apiSystem.call('effect-system', 'execute', bonus.effects, {
      sourceId: charId,
      _targetIds: [charId],
    })
  }
  // 注释：天赋给予
  if (bonus.talent) {
    const char = entitySystem.get('character', charId) as any
    if (char) {
      if (!char.talents) char.talents = {}
      if (!char.talents[bonus.talent]) {
        char.talents[bonus.talent] = 1
      }
    }
  }
}
