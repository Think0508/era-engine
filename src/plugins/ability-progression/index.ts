// 注释：ability-progression 插件——能力升级（XP/等级/unlocks + erArk 条件驱动升级）
// 2026-08-11 成长系统：双模式升级——mode="xp"（缺省：gain_ability_xp 即时升级）/
// mode="condition"（erArk 式：结算点按 per-level upgrades 检查 needs，满足即升、扣宝珠）
// 结算点调用：sleep-system（睡眠全员）+ h-core（H结束 NPC）→ ctx.api.call('abilities', 'checkUpgrade', charId)

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { ATTR } from '../../core/entity-utils'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { evaluateUpgradeNeeds } from '../../core/upgrade-needs'
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
    // 注释：条件驱动升级结算（erArk handle_ability.gain_ability）——遍历 mode=condition 能力，
    // 按 per-level needs 循环连升（升级消耗宝珠）。结算点（睡眠/H结束）调用。
    checkUpgrade: (charId: string): void => {
      checkUpgrade(charId)
    },
  })
}

// 注释：角色性别归一（本引擎 1=男 2=女；erArk sex 0=男 1=女）——sex_need 匹配用
function sexMatches(char: any, sexNeed: number | undefined): boolean {
  if (sexNeed === undefined || sexNeed === -1) return true
  const sex = char?.base?.[ATTR.SEX] ?? 0
  const isFemale = sex >= 2
  // erArk sex_need：0=男限定 1=女限定
  return sexNeed === 0 ? !isFemale : isFemale
}

// 注释：能力级附加判定（erArk extra_ability_check 数据化）——全部满足才可升
function evaluateExtraNeeds(char: any, charId: string, def: AbilityDef, currentLevel: number): boolean {
  if (!def.extra_needs?.length) return true
  for (const need of def.extra_needs) {
    if (need.type === 'ability_sum') {
      // sum(带 tag 的能力等级) ≥ 当前等级 × per_level（玩家）/ per_level_npc（NPC）
      const mod = modLoader.getMod()
      if (!mod) return false
      const sum = Object.entries(char.abilities ?? {})
        .filter(([abilityId]) => mod.abilities[abilityId]?.tags?.includes(need.tag as string))
        .reduce((acc, [, data]) => acc + ((data as any)?.level ?? 0), 0)
      const isPlayer = charId === gameContext.getContext().player?.id
      const perLevel = isPlayer
        ? (need.per_level ?? 1)
        : (need.per_level_npc ?? need.per_level ?? 1)
      if (sum < currentLevel * perLevel) return false
    } else {
      // 注释：未知附加需求类型（2026-08-13 审计：原静默 return false——该能力升级被
      // 永久阻塞且无痕迹；补去重上报。语义：数据错误 → 不满足（保守，不误放行））
      const key = `${def.id}:${need.type}`
      if (!reportedExtraNeedErrors.has(key)) {
        reportedExtraNeedErrors.add(key)
        errorReporter.report({
          source: 'ability-progression',
          severity: 'warning',
          message: `能力 '${def.id}' 的 extra_needs 含未知类型 '${need.type}'（该能力无法升级）`,
          suggestion: '检查 extra_needs 的类型（目前支持 ability_sum）',
        })
      }
      return false
    }
  }
  return true
}

// 注释：extra_needs 未知类型去重上报（2026-08-13 审计）
const reportedExtraNeedErrors = new Set<string>()

// 注释：条件驱动升级结算（erArk handle_ability.gain_ability：遍历全能力 → 每能力 while 连升）
// 主需求不满足时尝试备选需求（up_need2）；升级扣宝珠；触发 character:ability_up + 叙事日志
// needs 求值走 core 共享器 evaluateUpgradeNeeds（与 talent-utils 素质获得统一，无重复实现）
export function checkUpgrade(charId: string): void {
  const char = entitySystem.get('character', charId) as any
  if (!char?.abilities) return
  const mod = modLoader.getMod()
  if (!mod) return

  for (const [abilityId, ability] of Object.entries(char.abilities)) {
    const def = mod.abilities[abilityId]
    if (def?.mode !== 'condition') continue
    const entry = def.upgrades
    if (!entry || entry.length === 0) continue
    const data = ability as { level: number }

    // 循环连升（erArk while True：升到不满足或达上限）
    while (true) {
      const currentLevel = data.level
      // 性别限定（erArk sex_need）
      if (!sexMatches(char, def.sex_need)) break
      const next = entry[currentLevel]
      if (!next) break // 缺升级条目 = 不可升（值域上限，upgrades 长度即天然上限——不硬编码 8）

      // 主需求 → 备选需求
      let judge = evaluateUpgradeNeeds(char, next.needs)
      if (!judge.satisfied && next.backup_needs?.length) {
        const backup = evaluateUpgradeNeeds(char, next.backup_needs)
        if (backup.satisfied) judge = backup
      }
      // 能力级附加判定（技巧聚合等）
      if (judge.satisfied && !evaluateExtraNeeds(char, charId, def, currentLevel)) {
        judge = { satisfied: false, juelCosts: {} }
      }
      if (!judge.satisfied) break

      // 升级 + 扣宝珠（erArk check_upgrade_requirements 的 jule_dict 扣减——全量 J 消耗）
      data.level = currentLevel + 1
      if (Object.keys(judge.juelCosts).length > 0) {
        if (!char.juel) char.juel = {}
        for (const [juelId, cost] of Object.entries(judge.juelCosts)) {
          char.juel[juelId] = (char.juel[juelId] ?? 0) - cost
        }
      }

      narrativeLog.write(
        `${char.name ?? charId}的${def.name ?? abilityId}提升到${data.level}级`,
        'system',
        'ability-progression',
      )
      eventBus.emit('character:ability_up', {
        character: charId,
        ability: abilityId,
        newLevel: data.level,
      })
    }
  }
}

// 注释：给予 XP + 升级逻辑（xp 模式，即时）
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
  // 注释：condition 模式能力不走 XP（升级唯一入口 = checkUpgrade 结算点；双通道会混乱）
  if (def.mode === 'condition') return

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
