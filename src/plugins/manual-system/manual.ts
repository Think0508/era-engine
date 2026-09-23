// 注释：manual-system 秘籍内核（2026-09-23）——进度 / 上限 / 修炼 / 发放 / 授予 / 同步
//
// 三条不变量（全部有测试钉死）：
//   ① **进度挂角色、永久单调**（`char.manuals[秘籍ID] = { level, cap_unlocked? }`）：
//      秘籍实物只是"解锁修炼 + 决定上限"的凭证，卖/丢/被偷都不会回退进度与已得收益。
//   ② **发放只发生在"层数 +1"的同一次事务里**：层数只增 → 不存在重复发放；
//      任何"读档补发/重算补发"路径都不存在（秘籍数据改动对老存档不追溯 = 存档权威）。
//   ③ **上限只在增长时钳制**：`cap` 只决定"还能不能往上练"，永不回退已存层数。

import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { errorReporter } from '../../core/error-reporter'
import { narrativeLog } from '../../core/narrative-log'
import { gameContext } from '../../core/game-context'
import { applyAttrDelta, getEntityAttr } from '../../core/entity-utils'
import { conditionEngine } from '../../core/condition-engine'
import type { ManualDef, ManualLayerGrowth } from '../../core/mod-types'
import { abilityDef, config, getMod, itemDef, manualDef, manualLayerCost, manualsForAbility, maxLayerOf, talentDef, tierDef } from './context'
import { recheckSkillsForManual } from './skills'

export interface ManualProgress {
  level: number
  /** 永久解锁的层数上限（任务/合成写入；只增不减） */
  cap_unlocked?: number
}

export interface ManualState {
  manual: string
  name: string
  level: number
  /** 当前可练上限（min(秘籍 max_layer, max(持有载体 cap, 永久解锁 cap))） */
  cap: number
  maxLayer: number
  /** 再练一层的经验消耗（已满层 → 0） */
  nextCost: number
  canPractice: boolean
  /** 不能修炼的原因（UI 直接显示；canPractice=true 时为空数组） */
  reasons: string[]
  /** 当前持有的载体物品 ID（去重） */
  heldVolumes: string[]
}

export interface PracticeResult {
  ok: boolean
  gained: number
  reasons: string[]
}

function charOf(charId: string): any {
  return entitySystem.get('character', charId)
}

function ensureProgress(char: any, manualId: string): ManualProgress {
  if (!char.manuals || typeof char.manuals !== 'object') char.manuals = {}
  const p = char.manuals[manualId]
  if (!p || typeof p !== 'object') {
    char.manuals[manualId] = { level: 0 }
  } else if (typeof p.level !== 'number' || !Number.isFinite(p.level)) {
    p.level = 0
  }
  return char.manuals[manualId] as ManualProgress
}

/** 当前持有的该秘籍载体（卷册/残本/总纲类剧情物品）——同 ID 多件时全部返回 */
export function heldVolumes(char: any, manualId: string): string[] {
  const out: string[] = []
  for (const entry of (char?.inventory ?? []) as any[]) {
    const acc = itemDef(entry?.itemId)?.manual_access
    if (!acc || acc.manual !== manualId) continue
    if (typeof entry?.count === 'number' && entry.count <= 0) continue
    if (!out.includes(entry.itemId)) out.push(entry.itemId)
  }
  return out
}

/** 可练上限 = min(秘籍 max_layer, max(持有载体 cap, 永久解锁 cap))。
 *  载体没写 cap → 视为该秘籍的 max_layer（完整本只需写 manual = "..."）。 */
export function manualCap(char: any, manualId: string, def: ManualDef): number {
  const maxLayer = maxLayerOf(def)
  let cap = 0
  for (const itemId of heldVolumes(char, manualId)) {
    const c = itemDef(itemId)?.manual_access?.cap
    const v = typeof c === 'number' && Number.isFinite(c) && c > 0 ? Math.floor(c) : maxLayer
    cap = Math.max(cap, v)
  }
  const unlocked = char?.manuals?.[manualId]?.cap_unlocked
  if (typeof unlocked === 'number' && Number.isFinite(unlocked) && unlocked > 0) {
    cap = Math.max(cap, Math.floor(unlocked))
  }
  return Math.min(cap, maxLayer)
}

/** 门槛检查（整本 requires + 该层 layer_requires）。`selected.` = 修炼者本人。 */
function checkRequires(char: any, def: ManualDef, targetLayer: number, reasons: string[]): boolean {
  const conds: { cond: string; label: string }[] = []
  if (def.requires) conds.push({ cond: def.requires, label: '修炼要求' })
  for (const lr of def.layer_requires ?? []) {
    if (lr?.layer === targetLayer && lr.condition) conds.push({ cond: lr.condition, label: `第 ${targetLayer} 层门槛` })
  }
  if (conds.length === 0) return true
  const ctx = { ...gameContext.getContext(), selectedCharacterId: char?.id ?? undefined }
  for (const c of conds) {
    let ok = false
    try {
      ok = conditionEngine.evaluate(c.cond, ctx as any)
    } catch (err) {
      errorReporter.reportDedup(`manual-require:${def.tier}:${c.cond}`, {
        source: 'manual-system', severity: 'warning',
        message: `秘籍 '${def.name ?? def.tier}' 的${c.label}求值抛错：${err instanceof Error ? err.message : String(err)}——按不满足处理`,
      })
      ok = false
    }
    if (!ok) {
      reasons.push(`不满足${c.label}（${c.cond}）`)
      return false
    }
  }
  return true
}

/** 取"该层的每层成长"清单：
 *  · 显式 `layer_growth` 优先（替代自动系数成长）；
 *  · 否则 kind=skill → 品级表 `coeff_bands` 里该层所在区间的 roll 范围，落到 category 映射的系数属性；
 *  · 品级表 `auto_growth`（武学常识之类）**恒追加**（与是否手写无关）。 */
function growthFor(def: ManualDef, layer: number): ManualLayerGrowth[] {
  const out: ManualLayerGrowth[] = []
  const tier = tierDef(def)
  if (Array.isArray(def.layer_growth) && def.layer_growth.length > 0) {
    out.push(...def.layer_growth)
  } else if ((def.kind ?? 'skill') === 'skill') {
    const attr = def.category ? getMod()?.manualTiers?.category_attrs?.[def.category] : undefined
    const band = (tier?.coeff_bands ?? []).find(b => layer >= b.from && layer < b.to) ?? null
    if (attr && band && band.max > 0) {
      const min = Math.max(0, Math.floor(band.min))
      const max = Math.max(min, Math.floor(band.max))
      out.push({ attr, range: [min, max] })
    }
  }
  for (const g of tier?.auto_growth ?? []) out.push(g)
  return out
}

function rollGrowth(g: ManualLayerGrowth): number {
  if (Array.isArray(g.range) && g.range.length === 2) {
    const [a, b] = g.range
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0
    return Math.floor(lo + Math.random() * (hi - lo + 1))
  }
  return typeof g.flat === 'number' && Number.isFinite(g.flat) ? g.flat : 0
}

/** 授予能力（你参考文档的规则）：
 *  · 已拥有 → 跳过（视为该奖励不存在）；
 *  · 例外：该能力**分层**（max_level > 0）且目标层更高 → 提升（"事件给的层级更高"那条）；
 *  · `max_level = 0`（无等级被动技能）→ 记为 1 级（完全体）。 */
export function grantAbility(char: any, abilityId: string, wantLevel = 1): void {
  const def = abilityDef(abilityId)
  if (!def) {
    errorReporter.reportDedup(`manual-grant-missing:${abilityId}`, {
      source: 'manual-system', severity: 'warning',
      message: `秘籍奖励引用了不存在的能力 '${abilityId}'——已跳过`,
    })
    return
  }
  if (!char.abilities || typeof char.abilities !== 'object') char.abilities = {}
  const existing = char.abilities[abilityId]
  const target = def.max_level === 0 ? 1 : Math.max(1, Math.floor(wantLevel))
  if (!existing || typeof existing !== 'object') {
    char.abilities[abilityId] = { level: target, xp: 0 }
    return
  }
  const cur = typeof existing.level === 'number' ? existing.level : 0
  if (cur >= target) return
  existing.level = target
  if (typeof existing.xp !== 'number') existing.xp = 0
}

/** 授予天赋（同上规则：已有则跳过；分层天赋取更高层） */
export function grantTalent(char: any, talentId: string, wantLevel = 1): void {
  const def = talentDef(talentId)
  if (!def) {
    errorReporter.reportDedup(`manual-grant-talent-missing:${talentId}`, {
      source: 'manual-system', severity: 'warning',
      message: `秘籍奖励引用了不存在的天赋 '${talentId}'——已跳过`,
    })
    return
  }
  if (!char.talents || typeof char.talents !== 'object') char.talents = {}
  const cur = typeof char.talents[talentId] === 'number' ? char.talents[talentId] : 0
  const target = def.max === 0 ? 1 : Math.max(1, Math.floor(wantLevel))
  if (cur >= target) return
  char.talents[talentId] = target
}

/** 同步"层数随秘籍"的技能（分层被动技能 / 内功）：
 *  level = max(现有层数, min(自身 max_level, max(依赖秘籍的已修炼进度)))——**只升不降**。
 *  主动技能不走这里（它们靠用技能涨经验，上限由 ability-progression 的外部上限提供者钳制）。 */
export function syncManualGrants(char: any): void {
  const mod = getMod()
  if (!mod || !char?.abilities) return
  for (const [abilityId, entry] of Object.entries(char.abilities) as [string, any][]) {
    const def = abilityDef(abilityId)
    if (!def) continue
    if (def.type !== 'passive') continue
    if (typeof def.max_level !== 'number' || def.max_level <= 0) continue
    const deps = manualsForAbility(abilityId)
    if (deps.length === 0) continue
    let progress = 0
    for (const manualId of deps) {
      const lv = char.manuals?.[manualId]?.level
      if (typeof lv === 'number' && Number.isFinite(lv)) progress = Math.max(progress, lv)
    }
    if (progress <= 0) continue
    const target = Math.min(def.max_level, progress)
    const cur = typeof entry?.level === 'number' ? entry.level : 0
    if (cur < target) entry.level = target
  }
}

// 便捷转发（避免 manual.ts 与 context.ts 循环 import：context 不认识实体，只认识定义）

/** 发放第 `layer` 层的全部收益（成长 → 属性奖励 → 技能/天赋 → 同步分层技能）。
 *  **只在层数真的 +1 时调用一次**（幂等不变量见文件头）。`_manualId` 仅用于日志/调试语义。 */
export function grantLayer(char: any, _manualId: string, def: ManualDef, layer: number): void {
  growthLog.length = 0
  for (const g of growthFor(def, layer)) {
    const value = rollGrowth(g)
    if (value === 0) continue
    const applied = applyAttrDelta(char, g.attr, value)
    if (applied) growthLog.push({ attr: g.attr, value })
  }
  for (const r of def.layer_rewards ?? []) {
    if (r?.layer !== layer) continue
    for (const a of r.attributes ?? []) {
      if (typeof a?.flat === 'number' && Number.isFinite(a.flat) && a.flat !== 0) {
        const applied = applyAttrDelta(char, a.attr, a.flat)
        if (applied) growthLog.push({ attr: a.attr, value: a.flat })
      }
    }
    if (r.ability) grantAbility(char, r.ability)
    if (r.talent) grantTalent(char, r.talent)
  }
  syncManualGrants(char)
}

/** 最近一次 grantLayer 的属性成长（叙事日志用；模块级缓冲避免每次构造对象） */
const growthLog: { attr: string; value: number }[] = []
export function lastGrowth(): { attr: string; value: number }[] {
  return [...growthLog]
}

function writeLayerNarrative(char: any, def: ManualDef, layer: number): void {
  const name = char?.name ?? char?.id ?? '？'
  const parts = lastGrowth().map(g => `${g.attr} ${g.value >= 0 ? '+' : ''}${g.value}`)
  const suffix = parts.length > 0 ? `（${parts.join('、')}）` : ''
  narrativeLog.write(`${name}的${def.name ?? ''}练至第 ${layer} 层${suffix}`, 'system', 'manual-system')
}

/** 可修炼状态（UI 与 effect 共用；不改任何状态） */
export function manualState(charId: string, manualId: string): ManualState | null {
  const char = charOf(charId)
  const def = manualDef(manualId)
  if (!char || !def) return null
  const level = typeof char?.manuals?.[manualId]?.level === 'number' ? char.manuals[manualId].level : 0
  const cap = manualCap(char, manualId, def)
  const maxLayer = maxLayerOf(def)
  const target = level + 1
  const reasons: string[] = []
  let canPractice = true
  if (target > maxLayer) {
    canPractice = false
    reasons.push(`已达秘籍上限（${maxLayer} 层）`)
  } else if (target > cap) {
    canPractice = false
    reasons.push(cap <= 0
      ? '未持有该秘籍（或载体只能练到更低层）'
      : `当前只能练到第 ${cap} 层（缺少更完整的秘籍载体）`)
  } else if (!checkRequires(char, def, target, reasons)) {
    canPractice = false
  } else {
    const cost = manualLayerCost(def, target)
    const exp = getEntityAttr(char, config().exp_attr)
    const have = typeof exp === 'number' && Number.isFinite(exp) ? exp : 0
    if (have < cost) {
      canPractice = false
      reasons.push(`${config().exp_attr}不足（需 ${cost}，现有 ${Math.floor(have)}）`)
    }
  }
  const nextCost = target > maxLayer || target > cap ? 0 : manualLayerCost(def, target)
  return {
    manual: manualId,
    name: def.name ?? manualId,
    level,
    cap,
    maxLayer,
    nextCost,
    canPractice,
    reasons,
    heldVolumes: heldVolumes(char, manualId),
  }
}

/** 修炼（唯一支持"花经验买层"的入口）：
 *  `layers = 1` 点一次买一层；`layers = 0` 连修到不能修为止（UI 的"连修"按钮）。
 *  逐层校验：上限 → 门槛 → 经验；任一条不满足即停并把原因写进 reasons（不扣经验、不发收益）。 */
export function practice(charId: string, manualId: string, layers = 1): PracticeResult {
  const char = charOf(charId)
  const def = manualDef(manualId)
  const reasons: string[] = []
  if (!char) return { ok: false, gained: 0, reasons: [`角色 '${charId}' 不存在`] }
  if (!def) return { ok: false, gained: 0, reasons: [`秘籍 '${manualId}' 不存在`] }

  const expAttr = config().exp_attr
  const maxLayer = maxLayerOf(def)
  const want = layers === 0 ? maxLayer : Math.max(1, Math.floor(layers))
  let gained = 0

  for (let i = 0; i < want; i++) {
    const progress = ensureProgress(char, manualId)
    const target = progress.level + 1
    if (target > maxLayer) {
      reasons.push(`已达秘籍上限（${maxLayer} 层）`)
      break
    }
    const cap = manualCap(char, manualId, def)
    if (target > cap) {
      reasons.push(cap <= 0
        ? '未持有该秘籍（或其载体无法再往上练）'
        : `当前只能练到第 ${cap} 层（缺少更完整的秘籍载体）`)
      break
    }
    if (!checkRequires(char, def, target, reasons)) break
    const cost = manualLayerCost(def, target)
    const have = getEntityAttr(char, expAttr)
    const cur = typeof have === 'number' && Number.isFinite(have) ? have : 0
    if (cur < cost) {
      reasons.push(`${expAttr}不足（需 ${cost}，现有 ${Math.floor(cur)}）`)
      break
    }
    if (cost > 0) applyAttrDelta(char, expAttr, -cost)
    progress.level = target
    grantLayer(char, manualId, def, target)
    recheckSkillsForManual(charId, manualId)
    gained++
    writeLayerNarrative(char, def, target)
    eventBus.emit('manual:layer_gained', { character: charId, manual: manualId, layer: target })
  }
  return { ok: gained > 0, gained, reasons }
}

/** 剧情/任务直给层数（**不走经验与门槛**，走同一发放管线；仍受秘籍 max_layer 限制）。
 *  ⚠️ 唯一支持的写法就是本入口——直接 `set_field` 写 manuals 不会发任何成长/技能。 */
export function grantLayers(charId: string, manualId: string, toLayer: number): PracticeResult {
  const char = charOf(charId)
  const def = manualDef(manualId)
  const reasons: string[] = []
  if (!char) return { ok: false, gained: 0, reasons: [`角色 '${charId}' 不存在`] }
  if (!def) return { ok: false, gained: 0, reasons: [`秘籍 '${manualId}' 不存在`] }
  const maxLayer = maxLayerOf(def)
  const target = Math.min(Math.max(0, Math.floor(toLayer)), maxLayer)
  const progress = ensureProgress(char, manualId)
  let gained = 0
  while (progress.level < target) {
    progress.level += 1
    grantLayer(char, manualId, def, progress.level)
    recheckSkillsForManual(charId, manualId)
    gained++
    writeLayerNarrative(char, def, progress.level)
    eventBus.emit('manual:layer_gained', { character: charId, manual: manualId, layer: progress.level })
  }
  if (gained === 0 && progress.level >= target) reasons.push(`层数已是 ${progress.level} 层（不低于目标 ${target}）`)
  return { ok: gained > 0, gained, reasons }
}

/** 永久解锁层数上限（残本合成的"总纲"类特例：消耗掉剧情物品后仍能继续练）。
 *  只增不减；记录挂在进度条目上（`cap_unlocked`），因此即使从未修炼过也会被记下。 */
export function unlockCap(charId: string, manualId: string, cap: number): boolean {
  const char = charOf(charId)
  const def = manualDef(manualId)
  if (!char || !def) return false
  if (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0) return false
  const progress = ensureProgress(char, manualId)
  const target = Math.min(Math.floor(cap), maxLayerOf(def))
  if ((progress.cap_unlocked ?? 0) >= target) return false
  progress.cap_unlocked = target
  eventBus.emit('manual:cap_unlocked', { character: charId, manual: manualId, cap: target })
  return true
}

/** 面板列表：已修炼过的 + 当前持有载体可修炼的（合并去重，按品级/名字排序交给 UI） */
export function listManuals(charId: string): ManualState[] {
  const char = charOf(charId)
  const mod = getMod()
  if (!char || !mod) return []
  const ids = new Set<string>(Object.keys(char.manuals ?? {}))
  for (const entry of (char.inventory ?? []) as any[]) {
    const m = itemDef(entry?.itemId)?.manual_access?.manual
    if (m) ids.add(m)
  }
  const out: ManualState[] = []
  for (const id of ids) {
    const st = manualState(charId, id)
    if (st) out.push(st)
  }
  return out
}
