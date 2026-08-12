// 注释：set-system 插件——广义套装系统
// 套装涵盖装备/武功/天赋三种来源
// 动态检测：角色获得 ability/item/talent 时检查套装，凑齐给天赋/效果
// ⚠️ 标记（2026-08-12 全面审计 I9）：失去件的动态移除**未实现**——脱装备后加成残留
// （注释此前声称"补全"，与实现矛盾，已修正）——移除逻辑依赖套装系统整体设计，待补
// TODO Phase 11: 钩子式效果（先手/反击/反伤等），MVP 只支持 effects 注入

import type { PluginContext } from '../../core/types'
import { entitySystem } from '../../core/entity-system'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import type { SetDef } from '../../core/mod-loader'

// 注释：记录角色当前激活的套装 bonus（用于失去件时移除——移除逻辑依赖套装系统整体设计，未实现）
// Map<charId, Set<bonusKey>>
const activeSetBonuses = new Map<string, Set<string>>()

export function onLoad(_ctx: PluginContext): void {
  // 注释：set-system 无 effect type 注册
}

export function onEnable(ctx: PluginContext): void {
  ctx.api.register('set', {
    // 注释：检查角色的所有套装状态
    checkSets: async (charId: string): Promise<void> => {
      await checkSetsForChar(charId)
    },
    // 注释：获取角色当前激活的套装
    getActiveSets: (charId: string): string[] => {
      return Array.from(activeSetBonuses.get(charId)?.keys() ?? [])
    },
  })

  // 注释：监听 character:changed → 检查套装变化
  ctx.events.on('character:changed', async (payload: any) => {
    if (payload?.id) {
      await checkSetsForChar(payload.id)
    }
  })
}

// 注释：检查角色的所有套装——凑齐给效果，失去件移除
// 2026-08-09：checkSets/applySetBonus 改 async——原 applySetBonus 里
// apiSystem.call 无 await（fire-and-forget），效果执行与后续逻辑/测试断言竞态
async function checkSetsForChar(charId: string): Promise<void> {
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
          await applySetBonus(charId, bonus, charId)
        }
        newActive.add(bonusKey)
      }
    }
  }

  // 注释：失去的 bonus——移除
  // ⚠️ 标记（2026-08-09）：失去件精确移除逻辑未做——依赖套装系统整体设计
  // （记录已给效果/天赋快照 + 精确还原），由系统补齐时统一实现。
  // 当前状态：只记录激活集合，脱装备后加成残留 = 已知缺口（勿局部修补）。
  for (const key of currentActive.keys()) {
    if (!newActive.has(key)) {
      // TODO: 完整移除逻辑（需记录之前给了什么效果/天赋）——依赖套装系统整体设计
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
async function applySetBonus(charId: string, bonus: any, _sourceId: string): Promise<void> {
  // 注释：effects 注入
  if (bonus.effects) {
    await apiSystem.call('effect-system', 'execute', bonus.effects, {
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
