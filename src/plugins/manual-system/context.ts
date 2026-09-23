// 注释：manual-system 共享上下文（2026-09-23 秘籍-技能系统）
// 职责：mod 定义桶读取（manuals / manual-tiers / manual-config）、手册与品级的解析、
//       **能力 → 授予它的秘籍**反向索引（单一真相：秘籍层表；技能侧只留 capped_by 逃生口）。

import { modLoader } from '../../core/mod-loader'
import type { LoadedMod, ManualDef, ManualTierDef, ManualConfig, AbilityDef, TalentDef, ItemDef } from '../../core/mod-types'
import { geometricCost, DEFAULT_XP_RATIO } from '../../core/xp-curve'

/** 秘籍缺省知识上限（参考数值：一般武功最高 10 层；残本/总纲类特例靠载体 cap 表达） */
export const DEFAULT_MAX_LAYER = 10

/** 缺省配置（manual-config.toml 未加载时的兜底；属性名由插件默认层 attributes.toml 提供） */
const DEFAULT_CONFIG: Required<ManualConfig> = {
  exp_attr: '经验',
  slot_attr: '内功位',
  wit_attr: '悟性',
  xp_per_wit: 10,
  kill_exp_divisor: 10,
  first_kill_multiplier: 3,
}

export function getMod(): LoadedMod | null {
  return (modLoader.getMod() as LoadedMod | null) ?? null
}

/** 运行时配置（插件默认层 + mod override） */
export function config(): Required<ManualConfig> {
  const c = getMod()?.manualConfig ?? {}
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const str = (v: unknown, fallback: string): string =>
    typeof v === 'string' && v.length > 0 ? v : fallback
  return {
    exp_attr: str(c.exp_attr, DEFAULT_CONFIG.exp_attr),
    slot_attr: str(c.slot_attr, DEFAULT_CONFIG.slot_attr),
    wit_attr: str(c.wit_attr, DEFAULT_CONFIG.wit_attr),
    xp_per_wit: num(c.xp_per_wit, DEFAULT_CONFIG.xp_per_wit),
    kill_exp_divisor: num(c.kill_exp_divisor, DEFAULT_CONFIG.kill_exp_divisor),
    first_kill_multiplier: num(c.first_kill_multiplier, DEFAULT_CONFIG.first_kill_multiplier),
  }
}

export function manualDef(manualId: string | null | undefined): ManualDef | undefined {
  if (!manualId) return undefined
  return getMod()?.manuals?.[manualId]
}

export function abilityDef(abilityId: string | null | undefined): AbilityDef | undefined {
  if (!abilityId) return undefined
  return getMod()?.abilities?.[abilityId]
}

export function talentDef(talentId: string | null | undefined): TalentDef | undefined {
  if (!talentId) return undefined
  return getMod()?.talentDefs?.[talentId]
}

export function itemDef(itemId: string | null | undefined): ItemDef | undefined {
  if (!itemId) return undefined
  return getMod()?.items?.[itemId]
}

export function tierDef(def: ManualDef | undefined): ManualTierDef | undefined {
  if (!def) return undefined
  return getMod()?.manualTiers?.tiers?.[def.tier]
}

export function maxLayerOf(def: ManualDef | undefined): number {
  const n = def?.max_layer
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_LAYER
}

/** 某一层的经验消耗（1 基层号）：秘籍自设 `xp` 优先，否则按品级表；
 *  内功秘籍用 `xp_base_internal`（相对纯技能秘籍的倍数由 mod 数据决定，武侠 mod 取 ×5）。 */
export function manualLayerCost(def: ManualDef, targetLayer: number): number {
  const tier = tierDef(def)
  const isInternal = (def.kind ?? 'skill') === 'internal'
  const tableBase = isInternal ? tier?.xp_base_internal : tier?.xp_base
  const base = typeof def.xp?.base === 'number' ? def.xp.base : (typeof tableBase === 'number' ? tableBase : 0)
  const ratio = typeof def.xp?.ratio === 'number' ? def.xp.ratio : (tier?.ratio ?? DEFAULT_XP_RATIO)
  return geometricCost(base, ratio, Math.max(0, targetLayer - 1))
}

// ── 反向索引：能力 ← 授予它的秘籍 ─────────────────────────────────────────
// 单一真相 = 秘籍层表；技能定义**不必**再写一遍依赖（双写必然漂移）。
// 能力侧保留可选 `capped_by` 作逃生口（事件直接给的技能也要被某秘籍钳制时），与自动索引取并集。
let indexCache: { mod: unknown; map: Map<string, string[]> } | null = null

function grantIndex(mod: LoadedMod): Map<string, string[]> {
  if (indexCache && indexCache.mod === mod) return indexCache.map
  const map = new Map<string, string[]>()
  for (const [manualId, def] of Object.entries(mod.manuals ?? {})) {
    for (const r of def?.layer_rewards ?? []) {
      const abilityId = r?.ability
      if (typeof abilityId !== 'string' || !abilityId) continue
      const list = map.get(abilityId) ?? []
      if (!list.includes(manualId)) list.push(manualId)
      map.set(abilityId, list)
    }
  }
  indexCache = { mod, map }
  return map
}

/** 依赖（钳制）本能力的秘籍列表 = 自动反向索引 ∪ 显式 capped_by。
 *  空列表 = 该技能不受任何秘籍钳制（NPC 直接授权的技能走这条）。 */
export function manualsForAbility(abilityId: string): string[] {
  const mod = getMod()
  if (!mod) return []
  const out = [...(grantIndex(mod).get(abilityId) ?? [])]
  const explicit = abilityDef(abilityId)?.capped_by ?? []
  for (const m of explicit) if (typeof m === 'string' && !out.includes(m)) out.push(m)
  return out
}

/** 技能经验曲线用的品级：能力自设 `xp_tier` 优先，否则取**授予它的秘籍中技能经验 base 最高者**
 *  （品级越高 base 越大，故"最高 base"= 最高品级）。无来源 → undefined（退回能力自身曲线）。 */
export function skillTierOf(abilityId: string): ManualTierDef | undefined {
  const explicit = abilityDef(abilityId)?.xp_tier
  if (typeof explicit === 'string') {
    const t = getMod()?.manualTiers?.tiers?.[explicit]
    if (t) return t
  }
  let best: ManualTierDef | undefined
  let bestBase = -1
  for (const manualId of manualsForAbility(abilityId)) {
    const t = tierDef(manualDef(manualId))
    const b = t?.xp_base_skill
    if (typeof b === 'number' && b > bestBase) {
      bestBase = b
      best = t
    }
  }
  return best
}

/** 技能的品级蓝耗（`tier.cost`）——技能**没写 `cost`** 时由 combat-base 的蓝耗提供者取用。
 *  返回 null = 该技能没有可用品级/品级没写 cost（→ 不耗内力）。 */
export function skillTierCost(abilityId: string): number | null {
  const tier = skillTierOf(abilityId)
  const cost = tier?.cost
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? Math.floor(cost) : null
}

/** 测试/重载用：清反向索引缓存（mod 对象变更会自动失效，这里只是给测试一个确定性入口） */
export function __resetManualContext(): void {
  indexCache = null
}
