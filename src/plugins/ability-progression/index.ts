// 注释：ability-progression 插件——能力升级（XP/等级/unlocks + erArk 条件驱动升级）
// 2026-08-11 成长系统：双模式升级——mode="xp"（缺省：gain_ability_xp 即时升级）/
// mode="condition"（erArk 式：结算点按 per-level upgrades 检查 needs，满足即升、扣宝珠）
// 结算点调用：sleep-system（睡眠全员）+ h-core（H结束 NPC）→ ctx.api.call('abilities', 'checkUpgrade', charId)
//
// 2026-09-23 秘籍-技能系统（三个 seam + 一条语义收敛）：
//   ① 外部层数上限（registerLevelCapProvider）：xp 模式的"能升到几级"可以由别的插件钳制
//      （秘籍系统：主动技能的上限 = 其依赖秘籍的已修炼层数）。**只在增长时钳制，永不回退已存层数。**
//   ② 外部经验曲线（registerXpCurveProvider）：品级表驱动的成长曲线由秘籍系统提供，
//      本插件保持世界观无关（不认识"秘籍""品级"）。
//   ③ recheck(charId, abilityId?)：外部条件放宽后（秘籍升了一层）立即补升满经验的技能。
//   ④ 到顶后 xp 钳在"下一级所需"（保持满值）——此前是无上限累加，与设计口径不符。

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
import { geometricCost } from '../../core/xp-curve'
import type { AbilityDef } from '../../core/mod-loader'

/** 外部层数上限提供者：返回该角色该能力的**附加层数上限**；`null` = 本提供者不表态。
 *  多个提供者取最小值（与 def.max_level 一起取 min）。抛错 → 忽略该提供者并上报。 */
export type LevelCapProvider = (charId: string, abilityId: string, def: AbilityDef) => number | null
/** 外部经验曲线提供者：返回升到下一级所需经验；`null` = 用 def 自己的曲线。 */
export type XpCurveProvider = (
  charId: string,
  abilityId: string,
  def: AbilityDef,
  currentLevel: number,
) => number | null

const levelCapProviders: LevelCapProvider[] = []
const xpCurveProviders: XpCurveProvider[] = []

/** 注册外部层数上限（秘籍系统用）。同一函数重复注册自动忽略（onEnable 重入/热重载安全） */
export function registerLevelCapProvider(fn: LevelCapProvider): void {
  if (typeof fn === 'function' && !levelCapProviders.includes(fn)) levelCapProviders.push(fn)
}

/** 注册外部经验曲线（秘籍系统用品级表驱动）。同一函数重复注册自动忽略 */
export function registerXpCurveProvider(fn: XpCurveProvider): void {
  if (typeof fn === 'function' && !xpCurveProviders.includes(fn)) xpCurveProviders.push(fn)
}

/** 测试/重载用：清空外部提供者（勿在生产路径调用） */
export function __resetAbilityGrowthProviders(): void {
  levelCapProviders.length = 0
  xpCurveProviders.length = 0
}

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
    // 注释：外部层数上限（秘籍系统注册；见 registerLevelCapProvider 注释）
    registerLevelCapProvider: (fn: LevelCapProvider): void => {
      registerLevelCapProvider(fn)
    },
    // 注释：外部经验曲线（秘籍系统按品级表注册）
    registerXpCurveProvider: (fn: XpCurveProvider): void => {
      registerXpCurveProvider(fn)
    },
    // 注释：补升检查（外部上限放宽后调用，如秘籍升了一层）——把已满经验的 xp 技能升到当前允许的层数
    recheck: (charId: string, abilityId?: string): void => {
      recheck(charId, abilityId)
    },
    // 注释：当前有效层数上限（def.max_level 与外部提供者取 min）——UI/脚本查询用
    getMaxLevel: (charId: string, abilityId: string): number => {
      const char = entitySystem.get('character', charId) as any
      const def = modLoader.getMod()?.abilities?.[abilityId]
      if (!def) return 0
      return effectiveMaxLevel(charId, abilityId, def, char)
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
      // sum(带 tag 或带该被动类别 的能力等级) ≥ 当前等级 × per_level（玩家）/ per_level_npc（NPC）
      // `kind` = 按 passive_kind 聚合（2026-09-23：主动系别/被动类别各自成字段后，类别不再走 tag）
      const mod = modLoader.getMod()
      if (!mod) return false
      const sum = Object.entries(char.abilities ?? {})
        .filter(([abilityId]) => {
          const def = mod.abilities[abilityId] as any
          if (!def) return false
          if (typeof need.kind === 'string') return def.passive_kind === need.kind
          return def.tags?.includes(need.tag as string)
        })
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

// 注释：给予 XP + 升级逻辑（xp 模式，即时）——导出供测试与"无 effect 的直调场景"使用
export function gainXp(charId: string, abilityId: string, xp: number): void {
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
  advanceLevels(charId, abilityId, def, char)

  // 注释：检查升级——循环（可能连升多级）
}

/** 升级循环（gainXp 与 recheck 共用）：
 *  · 闸门 = `def.max_level` 与**外部上限提供者**取 min（秘籍系统钳制主动技能层数）；
 *  · 到顶后把 xp 钳在"下一级所需"——保持满值、不无界累加（2026-09-23 语义收敛）。
 *  永不回退已存层数：上限低于当前层时只是"不再升"，不会降级。 */
function advanceLevels(charId: string, abilityId: string, def: AbilityDef, char: any): void {
  const ability = char?.abilities?.[abilityId]
  if (!ability) return
  const cap = effectiveMaxLevel(charId, abilityId, def, char)
  while (ability.level < cap && ability.xp >= getXpRequired(charId, abilityId, def, ability.level)) {
    ability.xp -= getXpRequired(charId, abilityId, def, ability.level)
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
  // 到顶（def 上限或外加上限）→ xp 保持满值（多余清零）：这是"练到顶了、等着秘籍再上一层"的状态
  if (ability.level >= cap) {
    const req = getXpRequired(charId, abilityId, def, ability.level)
    if (typeof ability.xp === 'number' && ability.xp > req) ability.xp = req
  }
}

/** 补升检查（外部上限放宽后调用；秘籍升层 → 秘籍系统调本函数）：
 *  不增加 xp，只把已满经验的技能升到当前允许的层数。幂等。 */
export function recheck(charId: string, abilityId?: string): void {
  const char = entitySystem.get('character', charId) as any
  if (!char?.abilities) return
  const mod = modLoader.getMod()
  if (!mod) return
  const ids = abilityId ? [abilityId] : Object.keys(char.abilities)
  for (const id of ids) {
    const def = mod.abilities[id]
    if (!def) continue
    if (def.max_level === 0) continue
    if (def.mode === 'condition') continue
    if (char.abilities[id]?.xp === null) continue
    advanceLevels(charId, id, def, char)
  }
}

/** 有效层数上限 = min(def.max_level, 各外部提供者的非 null 返回值)。
 *  · 提供者抛错 → 忽略该提供者 + 去重上报（不阻断升级）；
 *  · def.max_level = 0（无等级）不在本函数语义内（调用方早退）。 */
function effectiveMaxLevel(charId: string, abilityId: string, def: AbilityDef, _char?: any): number {
  let cap = typeof def.max_level === 'number' ? def.max_level : 0
  for (const fn of levelCapProviders) {
    try {
      const v = fn(charId, abilityId, def)
      if (typeof v === 'number' && Number.isFinite(v)) cap = Math.min(cap, v)
    } catch (err) {
      errorReporter.reportDedup(`abilities.level-cap-provider:${abilityId}`, {
        source: 'ability-progression', severity: 'error',
        message: `外部层数上限提供者抛错（能力 '${abilityId}'）：${err instanceof Error ? err.message : String(err)}——已忽略该提供者`,
      })
    }
  }
  return cap
}

/** 获取升到下一级所需 XP（0 基：currentLevel → currentLevel+1）。
 *  顺序：外部曲线提供者（品级表驱动）→ def 自己的 xp_curve。 */
function getXpRequired(charId: string, abilityId: string, def: AbilityDef, currentLevel: number): number {
  for (const fn of xpCurveProviders) {
    try {
      const v = fn(charId, abilityId, def, currentLevel)
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    } catch (err) {
      errorReporter.reportDedup(`abilities.xp-curve-provider:${abilityId}`, {
        source: 'ability-progression', severity: 'error',
        message: `外部经验曲线提供者抛错（能力 '${abilityId}'）：${err instanceof Error ? err.message : String(err)}——已忽略该提供者`,
      })
    }
  }

  const curve = def.xp_curve || 'linear'
  const xpPerLevel = def.xp_per_level

  if (curve === 'linear') {
    return typeof xpPerLevel === 'number' ? xpPerLevel : 100
  } else if (curve === 'exponential') {
    const base = typeof xpPerLevel === 'number' ? xpPerLevel : 100
    return base * Math.pow(2, currentLevel)
  } else if (curve === 'geometric') {
    // 第 n 级 = base × ratio^(n−1)（0 基调用点即 ratio^currentLevel）；缺 ratio → 项目约定 1.15。
    // 算式与归整在 core/xp-curve（与秘籍的每层经验共用同一条曲线）
    const spec = xpPerLevel as { base?: number; ratio?: number } | undefined
    return geometricCost(typeof spec?.base === 'number' ? spec.base : 100, spec?.ratio, currentLevel)
  } else if (curve === 'custom' && Array.isArray(xpPerLevel)) {
    return xpPerLevel[currentLevel] ?? xpPerLevel[xpPerLevel.length - 1] ?? 100
  }
  // 未知 curve：加载期已报 error（mod-validate.validateAbilityXpGrowth），此处兜底 100 不静默改语义
  return 100
}
