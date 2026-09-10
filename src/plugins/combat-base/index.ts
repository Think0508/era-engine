// 注释：combat-base 插件——回合制战斗骨架（战斗本地管线版）
// 2026-08-31 全量重写（grill 合同 v1.0）：战斗孤立场景 + 相位管线 + 效果区 + 反击/递归防护 + 死亡/复活 + 隔离回写
// 2026-09-11 修订（合同 v1.1）：① 公式中间量通道（formula-channels）——效果/天赋可给公式的某一步加值
//   ② 补齐 action_pre（行动前相位：禁技/技能加成）③ 修正 attack_pre/attack_launch/damage_output/
//   damage_on_target/damage_taken 相位的统计被静默丢弃 ④ 命中不再 clamp（>100 必中/<0 必 Miss）
//   ⑤ 效果条目 when_skill 过滤（只在施展该技能时生效）
// 通用战斗机制层：combat-wuxia extends 本插件，覆盖 initiative/hit_rate/base_damage/crit_rate/
// crit_mul/float_mul/defense_value 公式钩子 + combatant_init 编译钩子（被动/天赋→效果区）
//
// 回合循环：每轮重排行动序（initiative 钩子，平速 rng）→ 角色粒度回合（turn_start 相位 → 行动 → turn_end 相位）
// 行动：action_pre 相位（禁技判定 action_block / 技能加成）→ 扣消耗 → on_use → [攻击技] 攻击管线
// 攻击管线（每段一次）：attack_pre → attack_launch → hit_roll → (miss: attack_miss | on_hit →
//   damage_base → damage_crit → damage_output → damage_on_target → damage_mitigate → −防御 → damage_taken) → attack_end
// 整招结束：action_end（连绵复读挂此）
// 防护：递归深度上限 64 断链+上报；反击链一层（isCounter 跳过对方反击类效果）；0 血失去结算资格；死亡检查点立即生效
// 效果区：战斗隔离容器——常驻条目（被动/天赋编译）+ 瞬态效果；复活=清空+重建；战斗结束全清不回写（permanent 统计除外）
// 通道：常驻条目（无 trigger 的 modify_channel）聚合进 combatant.channels；相位条目写进该相位 overlay.channels；
//   公式钩子 ctx.channels = { source: 攻方包, target: 守方包 }，由上层插件（combat-wuxia）读取

import type { PluginContext } from '../../core/types'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { bindingResolver } from '../../core/binding-resolver'
import { errorReporter } from '../../core/error-reporter'
import { registerSkipRule } from '../../core/skip-registry'
import { apiSystem } from '../../core/api'
import { modLoader } from '../../core/mod-loader'
import type { CommandDef } from '../../core/command-registry'
import type { BattleEffectDef } from '../../core/mod-types'
import {
  accumulateChannel, clearChannels, getChannelDefs, mergeChannelBags, normalizeFormulaResult,
  registerChannel, zeroChannelBag, formatChannelBag, formatParts,
} from './formula-channels'
import type { ChannelBag, FormulaRecord } from './formula-channels'
import {
  MOUNT_ACTION, PARAM_VOCAB, POINT_STATS, RATIO_STATS, classifyEffect, displayNameOf,
  normalizeValue, resolveEffectRef, scaleValue, usedParams, valueAmount,
} from './effect-entry'
import type { EffectValue, ResolvedEffect } from './effect-entry'

// ── 类型定义 ────────────────────────────────────────────────────────────

// 相位时机（合同 v3.1 定稿）
export type BattleTrigger =
  | 'on_use' | 'turn_start' | 'action_pre' | 'attack_pre' | 'attack_launch'
  | 'hit_roll' | 'attack_miss' | 'on_hit' | 'damage_base' | 'damage_crit'
  | 'damage_output' | 'damage_on_target' | 'damage_mitigate' | 'damage_taken'
  | 'attack_end' | 'action_end' | 'turn_end' | 'death'

export const BATTLE_TRIGGERS: BattleTrigger[] = [
  'on_use', 'turn_start', 'action_pre', 'attack_pre', 'attack_launch', 'hit_roll',
  'attack_miss', 'on_hit', 'damage_base', 'damage_crit', 'damage_output',
  'damage_on_target', 'damage_mitigate', 'damage_taken', 'attack_end',
  'action_end', 'turn_end', 'death',
]

// 战斗统计键（修正型效果的落点）
// 点数组（吃 value.flat）：hit_bonus / dodge_bonus / crit_rate
// 倍率组（吃 value.percent）：crit_mul / damage_out / damage_in / defense_mult
export type CombatStatKey =
  | 'hit_bonus' | 'dodge_bonus' | 'crit_rate' | 'crit_mul'
  | 'damage_out' | 'damage_in' | 'defense_mult'

export interface CombatStats {
  hit_bonus: number      // 命中%点
  dodge_bonus: number    // 闪避%点（对方）
  crit_rate: number      // 暴击%点
  crit_mul: number       // 暴击倍率加成（加法倍率）
  damage_out: number     // 伤害输出加成（加法倍率）
  damage_in: number      // 减伤/易伤（加法倍率；正 = 减伤，负 = 易伤）
  defense_mult: number   // 防御加减（加法倍率；正 = 加防，负 = 破甲）
}

export interface BattleEffectInst {
  id: string
  name?: string
  trigger?: BattleTrigger
  action: string
  chance: number
  /** 归一化数值（flat + percent × 基准；set 仅通道） */
  value: EffectValue
  /** 每层乘性增量：value × (1 + growth×(层数−1)) */
  growth: number
  target: 'self' | 'enemy'
  duration: 'battle' | 'permanent' | { turns: number }
  remainingTurns: number
  stack: number
  maxStack: number
  priority: number
  category: 'buff' | 'debuff' | 'neutral'
  condition?: string
  usesLeft: number | null   // null=无限
  stat?: CombatStatKey
  /** modify_channel 用：通道名（语义由注册通道的插件解释，base 只当不透明字符串） */
  channel?: string
  /** 只在施展该技能（技能 id）时参与—攻击/伤害类相位与 action_pre 判定用 */
  when_skill?: string
  /** counter/cancel 类：反制使用的技能 id */
  skill?: string
  /** 层数→显示名（缺省 "名字 x层"） */
  levelNames?: string[]
  /** extra_attack 用：每次行动最大追加次数（缺省 1；0 = 不限） */
  maxPerAction?: number
  /** 该实例当前的有效显示名（随层数变化） */
  displayName?: string
  /** 技能引用解析结果（mount_effect 用；不序列化） */
  resolved?: ResolvedEffect
  sourceId: string
}

export interface Combatant {
  entityId: string
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  absorbedMaxMp: number    // 永久吸收（上限），结束回写实体
  dead: boolean
  stats: CombatStats       // 聚合统计（常驻修正）
  channels: ChannelBag     // 聚合中间量通道（常驻修正；相位叠加走 StatOverlay.channels）
  zone: BattleEffectInst[] // 效果区
  talentDamageMods: any[]  // 天赋伤害修正（当次攻击按技能过滤求值，wuxia 填充）
  talentChannelMods: any[] // 天赋通道修正（当次攻击按技能过滤求值，wuxia 填充）
  consumedEffects: string[] // 一次性效果已消耗记录（复活重建时跳过，如神照经）
}

export interface AttackJob {
  source: string
  target: string
  skillId: string | null
  isCounter: boolean
  isOriginal: boolean       // 只有原发行动允许复读
}

export interface CombatScene {
  participants: string[]
  enemies: string[]
  allies: string[]
  combatants: Map<string, Combatant>
  round: number
  order: string[]
  orderIndex: number
  rng: () => number
  pendingJobs: AttackJob[]
  depthBudget: number       // 递归/反击防护预算（每次行动重置）
  /** 追击（extra_attack）本行动的剩余次数（每次行动开始时重置为条目声明的上限） */
  extraAttacksLeft: number
  target: string | null
  /** action_pre 相位产生的叠加（统计+通道）：作用于本次行动的后续全部段，行动开始时重置 */
  actionOverlay: StatOverlay
  /** actionOverlay 的归属者（防止反击/复读作业误用他人行动前叠加） */
  actionOverlayOwner: string | null
}

interface PhaseCtx {
  combat: CombatScene
  job: AttackJob | null
  attacker: Combatant
  defender: Combatant
  pendingDamage: number
  includeSkillEffects: boolean   // 攻击方相位：技能自带效果条目参与
  skillDef?: any
  skillLevel?: number
  canceledRef?: { canceled: boolean }
  blockedRef?: { blocked: boolean }   // action_pre：禁止本次行动（禁技）
}

// 相位叠加（当次结算的临时统计增量 + 临时通道修正）
interface StatOverlay {
  hit_bonus: number
  dodge_bonus: number
  crit_rate: number
  crit_mul: number
  damage_out: number
  damage_in: number
  defense_mult: number
  channels: ChannelBag
}

interface HitResult { damage: number; crit: boolean }

// ── 钩子系统 ────────────────────────────────────────────────────────────
// 覆盖型（子插件独占）：initiative / hit_rate / base_damage / crit_rate / crit_mul / float_mul / defense_value
// 链式（多 handler 依次执行）：battle_start / combatant_init / turn_start / turn_end
type HookHandler = (ctx: any) => any
const hooks = new Map<string, HookHandler[]>()
const overrideHooks = new Map<string, HookHandler>()

const OVERRIDE_HOOK_NAMES = new Set([
  'initiative', 'hit_rate', 'base_damage', 'crit_rate', 'crit_mul', 'float_mul', 'defense_value',
  'is_attack_skill',
])

// ── 战斗动作注册表 ──────────────────────────────────────────────────────
// 动作 handler 签名：(actCtx) => void | Promise<void>
// actCtx = { combat, job, self, target, effect, pendingDamage, overlay, canceledRef }
type BattleActionHandler = (actCtx: any) => void | Promise<void>
const battleActions = new Map<string, BattleActionHandler>()

export function registerBattleAction(name: string, handler: BattleActionHandler): void {
  if (battleActions.has(name)) throw new Error(`战斗动作 '${name}' 重复注册`)
  battleActions.set(name, handler)
}

// ── 施加器注册表（zone 型条目的"怎么挂"）────────────────────────────────
// 缺省施加器 'mount' = 直接挂载（含 merge/层数/时长）；插件可注册专用施加器
// （如 combat-wuxia 的 apply_poison 先算 M 再挂、apply_element 处理冰火相消）。
// ctx: { combat, caster, target, entry: ResolvedEffect, inst, sourceId }
type ApplyHandler = (ctx: any) => void | Promise<void>
const applyHandlers = new Map<string, ApplyHandler>()

export function registerApplyHandler(name: string, handler: ApplyHandler): void {
  applyHandlers.set(name, handler)
}

/** 缺省施加器：按条目规格直接挂载到目标 */
async function defaultMountApply(a: any): Promise<void> {
  await mountInstance(a.combat, a.target, a.entry, { sourceId: a.sourceId })
}

/** 测试用：模块级状态重置（hooks/动作表/施加器表/当前战斗/通道注册表/公式明细） */
export function __resetCombatModule(): void {
  hooks.clear()
  overrideHooks.clear()
  battleActions.clear()
  applyHandlers.clear()
  registerApplyHandler('mount', defaultMountApply)
  currentCombat = null
  clearChannels()
  formulaLog.length = 0
  formulaDetail = false
}

let currentCombat: CombatScene | null = null

// 递归深度上限（合同：64 层强制断链）
const MAX_JOB_DEPTH = 64

// ── 公式明细（调参/调试；战斗结束不清，便于战后查看） ────────────────────
const FORMULA_LOG_LIMIT = 50
const formulaLog: FormulaRecord[] = []
let formulaDetail = false

export function setFormulaDetail(on: boolean): void {
  formulaDetail = !!on
}

export function getFormulaDetail(): boolean {
  return formulaDetail
}

/** 记录一次公式计算（中间量明细）；formulaDetail 开启时同时写入叙事日志 */
function recordFormula(rec: {
  hook: string
  sourceId?: string
  targetId?: string
  skillId?: string | null
  hitIdx?: number
  parts?: Record<string, number>
  channels?: { source: ChannelBag; target: ChannelBag }
  value: number
}): void {
  const record: FormulaRecord = {
    hook: rec.hook,
    sourceId: rec.sourceId,
    targetId: rec.targetId,
    skillId: rec.skillId ?? null,
    hitIdx: rec.hitIdx,
    parts: rec.parts ?? {},
    channels: rec.channels ?? { source: zeroChannelBag(), target: zeroChannelBag() },
    value: rec.value,
  }
  formulaLog.push(record)
  if (formulaLog.length > FORMULA_LOG_LIMIT) formulaLog.splice(0, formulaLog.length - FORMULA_LOG_LIMIT)
  if (!formulaDetail) return
  const who = rec.sourceId ? `${getCharName(rec.sourceId)}${rec.targetId ? `→${getCharName(rec.targetId)}` : ''}` : ''
  const bits = [
    `【公式·${rec.hook}】${who}`,
    rec.skillId ? `技能 ${rec.skillId}` : '',
    rec.hitIdx !== undefined ? `第 ${rec.hitIdx + 1} 段` : '',
    `= ${Math.round(rec.value * 100) / 100}`,
  ].filter(Boolean)
  const lines = [bits.join(' ')]
  const partsText = formatParts(record.parts)
  if (partsText) lines.push(`　中间量：${partsText}`)
  const srcText = formatChannelBag(record.channels.source)
  const tgtText = formatChannelBag(record.channels.target)
  if (srcText) lines.push(`　攻方通道：${srcText}`)
  if (tgtText) lines.push(`　守方通道：${tgtText}`)
  narrativeLog.write(lines.join('\n'), 'combat', 'combat-base')
}

/** 战斗内所有单位 → 通道包的合并（常驻 + 若干相位 overlay） */
function channelBagOf(combatant: Combatant | undefined, ...overlays: (StatOverlay | undefined)[]): ChannelBag {
  if (!combatant) return zeroChannelBag()
  return mergeChannelBags(combatant.channels, ...overlays.map(o => o?.channels))
}

/** 常驻统计 + 若干相位 overlay 统计（不修改原对象） */
function addOverlays(base: CombatStats, ...overlays: (StatOverlay | undefined)[]): CombatStats {
  const s = { ...base }
  for (const o of overlays) {
    if (!o) continue
    s.hit_bonus += o.hit_bonus
    s.dodge_bonus += o.dodge_bonus
    s.crit_rate += o.crit_rate
    s.crit_mul += o.crit_mul
    s.damage_out += o.damage_out
    s.damage_in += o.damage_in
    s.defense_mult += o.defense_mult
  }
  return s
}

// ── onLoad：effect type 注册 ─────────────────────────────────────────────

export function onLoad(_ctx: PluginContext): void {
  // 缺省施加器（zone 型条目的 apply 缺省值）
  registerApplyHandler('mount', defaultMountApply)

  effectTypeRegistry.register('start_combat', async (params: any, execCtx: any) => {
    const sourceId = execCtx.sourceId ?? execCtx?._targetIds?.[0]
    await startCombat(params.enemies ?? [], params.allies ?? [sourceId], sourceId)
    return true
  })

  // damage effect type——通用伤害（战斗内：直扣 combatant hp；战斗外：直扣实体）
  effectTypeRegistry.register('damage', async (params: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[]
    for (const targetId of targetIds) {
      const dmg = params?.value ?? params?.amount ?? 1
      if (currentCombat && currentCombat.combatants.has(targetId)) {
        const tt = currentCombat.combatants.get(targetId)!
        await applyDamageTo(currentCombat, tt, dmg, {
          source: execCtx.sourceId ?? 'system', kind: 'external',
        })
      } else {
        const current = bindingResolver.get(targetId, 'hp')
        if (typeof current === 'number') {
          bindingResolver.set(targetId, 'hp', Math.max(0, current - dmg))
          eventBus.emit('character:changed', { id: targetId })
        }
      }
    }
    return true
  })

  // ── 通用战斗动作（本场语义，全部走效果区管线）──
  // 数值一律经 effValue（层数缩放）→ 每个动作声明 percent 的基准（见各动作注释）
  //
  // modify_stat：常驻/瞬态统计修正（无 trigger = 常驻；有 trigger = 该相位临时叠加）
  //   点数组 stat（hit_bonus/dodge_bonus/crit_rate）吃 value.flat；倍率组吃 value.percent
  registerBattleAction('modify_stat', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    if (!inst.stat) return
    if (inst.trigger && actCtx.overlay) {
      accumulateStat(actCtx.overlay, inst.stat, effValue(inst))
    }
    // 常驻型（无 trigger）由 recalcStats 统一聚合
  })

  // modify_channel：公式中间量通道修正（无 trigger = 常驻；有 trigger = 该相位临时叠加）
  // 通道名是不透明字符串（语义由注册它的插件解释，如 combat-wuxia 的 风格系数/准头/防御）
  registerBattleAction('modify_channel', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    if (!inst.channel) return
    if (inst.trigger && actCtx.overlay) {
      accumulateChannelValue(actCtx.overlay.channels, inst.channel, effValue(inst))
    }
    // 常驻型（无 trigger）由 recalcStats 统一聚合
  })

  // mount_effect：zone 型引用的统一入口——把库条目按 apply 施加器挂到目标身上（BUFF/DEBUFF 通用）
  // 时机（on_hit/on_use）与目标（self/enemy）由库条目的 target/apply_at 决定，技能行只传参数
  registerBattleAction(MOUNT_ACTION, async (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst & { resolved?: ResolvedEffect }
    const entry = inst.resolved
    if (!entry) return
    const targetCombatant = entry.target === 'self' ? actCtx.self : (actCtx.target ?? actCtx.self)
    if (!targetCombatant) return
    const applierName = entry.apply ?? 'mount'
    const applier = applyHandlers.get(applierName)
    if (!applier) {
      errorReporter.reportDedup(`battle-apply:${applierName}`, {
        source: 'combat-base', severity: 'error',
        message: `效果 '${inst.id}' 的施加器 '${applierName}' 未注册，挂载被跳过`,
        suggestion: '检查库条目的 apply 字段拼写，或由插件用 registerApply 注册',
      })
      return
    }
    await applier({
      combat: actCtx.combat, caster: actCtx.self, target: targetCombatant,
      entry, inst, sourceId: actCtx.self.entityId,
      job: actCtx.job, skillLevel: actCtx.skillLevel,
    })
  })

  // action_block：禁止本次行动（action_pre 相位用；封穴类）
  // 玩家与 NPC 一致：该次行动作废、轮到下一位（玩家不再"回 IDLE 改选"）
  registerBattleAction('action_block', (actCtx: any) => {
    if (actCtx.blockedRef) actCtx.blockedRef.blocked = true
    narrativeLog.write(`${getCharName(actCtx.self.entityId)} 无法行动！`, 'combat', 'combat-base')
  })

  // periodic_damage：周期伤害（按层缩放）；value.percent 的基准 = 受方最大气血
  registerBattleAction('periodic_damage', async (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const owner = actCtx.self as Combatant
    const dmg = Math.max(0, Math.round(effAmount(inst, owner.maxHp)))
    if (dmg <= 0) return
    await applyDamageTo(actCtx.combat, owner, dmg, { source: inst.sourceId, kind: 'periodic' })
  })

  // heal_hp / heal_mp：回复（封顶）；value.percent 的基准 = 自身最大气血/内力
  registerBattleAction('heal_hp', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const self = actCtx.self as Combatant
    const amount = Math.max(0, Math.round(effAmount(inst, self.maxHp)))
    if (amount <= 0) return
    const before = self.hp
    self.hp = Math.min(self.maxHp, self.hp + amount)
    const healed = self.hp - before
    narrativeLog.write(`${getCharName(self.entityId)} 回复了 ${healed} 点气血`, 'combat', 'combat-base')
  })

  registerBattleAction('heal_mp', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const self = actCtx.self as Combatant
    const amount = Math.max(0, Math.round(effAmount(inst, self.maxMp)))
    if (amount <= 0) return
    const before = self.mp
    self.mp = Math.min(self.maxMp, self.mp + amount)
    const healed = self.mp - before
    narrativeLog.write(`${getCharName(self.entityId)} 回复了 ${healed} 点内力`, 'combat', 'combat-base')
  })

  // leech_hp / leech_mp：吸取转移给自己（value.percent 基准 = 对方最大气血/内力）
  registerBattleAction('leech_hp', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const self = actCtx.self as Combatant, target = actCtx.target as Combatant
    if (!target || target.dead) return
    const amount = Math.max(0, Math.round(effAmount(inst, target.maxHp)))
    if (amount <= 0) return
    const actual = Math.min(amount, target.hp)
    target.hp = Math.max(0, target.hp - actual)
    self.hp = Math.min(self.maxHp, self.hp + actual)
    narrativeLog.write(`${getCharName(self.entityId)} 吸收了 ${actual} 点气血`, 'combat', 'combat-base')
  })

  registerBattleAction('leech_mp', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const self = actCtx.self as Combatant, target = actCtx.target as Combatant
    if (!target || target.dead) return
    const amount = Math.max(0, Math.round(effAmount(inst, target.maxMp)))
    if (amount <= 0) return
    const actual = Math.min(amount, target.mp)
    target.mp = Math.max(0, target.mp - actual)
    self.mp = Math.min(self.maxMp, self.mp + actual)
    narrativeLog.write(`${getCharName(self.entityId)} 吸收了 ${actual} 点内力`, 'combat', 'combat-base')
  })

  // leech_hp_from_damage（饮血）：按**本次实际扣掉的血量**回血给自己；value.percent 基准 = 本次实际伤害
  registerBattleAction('leech_hp_from_damage', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const self = actCtx.self as Combatant
    const dealt = typeof actCtx.pendingDamage === 'number' ? actCtx.pendingDamage : 0
    const amount = Math.max(0, Math.round(effAmount(inst, dealt)))
    if (amount <= 0) return
    const before = self.hp
    self.hp = Math.min(self.maxHp, self.hp + amount)
    narrativeLog.write(`${getCharName(self.entityId)} 饮血回复 ${self.hp - before} 点气血`, 'combat', 'combat-base')
  })

  // extra_attack（追击）：命中后再打一次**同一招**；不递归（作业 isOriginal=false）、照常扣内力
  // 每次行动的次数上限 = 库条目 max_per_action（缺省 1；写 0 = 不限）
  registerBattleAction('extra_attack', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const job = actCtx.job
    if (!job || !job.isOriginal || !job.skillId) return
    const limit = typeof inst.maxPerAction === 'number' ? inst.maxPerAction : 1
    if (limit > 0 && actCtx.combat.extraAttacksLeft <= 0) return
    const mod = modLoader.getMod()
    const def = mod?.abilities?.[job.skillId]
    const cost = typeof def?.cost === 'number' ? def.cost : 0
    const src = actCtx.combat.combatants.get(job.source)
    if (!src) return
    if (src.mp < cost) {
      narrativeLog.write(`${getCharName(job.source)} 内力不足，追击落空`, 'combat', 'combat-base')
      return
    }
    if (cost > 0) src.mp -= cost
    if (limit > 0) actCtx.combat.extraAttacksLeft--
    actCtx.combat.pendingJobs.push({ ...job, isOriginal: false })
    narrativeLog.write(`${getCharName(job.source)} 乘胜追击，再出一招！`, 'combat', 'combat-base')
  })

  registerBattleAction('leech_mp_max', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const self = actCtx.self as Combatant, target = actCtx.target as Combatant
    if (!target || target.dead) return
    const amount = Math.max(0, Math.round(effAmount(inst, target.maxMp)))
    if (amount <= 0) return
    self.maxMp += amount
    self.absorbedMaxMp += amount
    // 目标侧上限削减（钳制：不能低于当前内力；实际削减量记账，结束回写 → NPC 缩水持久化）
    const oldMax = target.maxMp
    target.maxMp = Math.max(target.mp, oldMax - amount)
    target.mp = Math.min(target.mp, target.maxMp)
    const reduction = oldMax - target.maxMp
    target.absorbedMaxMp -= reduction
    narrativeLog.write(`${getCharName(self.entityId)} 吸收了 ${amount} 点内力上限（对方上限 ${oldMax}→${target.maxMp}）`, 'combat', 'combat-base')
  })

  registerBattleAction('mp_drain', (actCtx: any) => {
    const inst = actCtx.effect as BattleEffectInst
    const target = actCtx.target as Combatant
    if (!target || target.dead) return
    const amount = Math.max(0, Math.round(effAmount(inst, target.maxMp)))
    if (amount <= 0) return
    target.mp = Math.max(0, target.mp - amount)
  })

  // reflect：反震（value.percent 基准 = 受击前的待结算伤害；扣防前）
  registerBattleAction('reflect', async (actCtx: any) => {
    const job = actCtx.job
    const inst = actCtx.effect as BattleEffectInst
    if (!job) return
    const raw = Math.round(effAmount(inst, actCtx.pendingDamage))
    if (raw <= 0) return
    const attacker = actCtx.combat.combatants.get(job.source)
    if (!attacker) return
    const reduced = Math.max(0, Math.round(raw * (1 - attacker.stats.damage_in)))
    narrativeLog.write(`${getCharName(actCtx.self.entityId)} 反震出 ${reduced} 点伤害！`, 'combat', 'combat-base')
    await applyDamageTo(actCtx.combat, attacker, reduced, { source: actCtx.self.entityId, kind: 'reflect' })
  })

  // counter：反击（spawn 反击作业——反击链一层：反击作业本身跳过对方反击类效果）
  registerBattleAction('counter', (actCtx: any) => {
    const job = actCtx.job
    const inst = actCtx.effect
    if (!job || job.isCounter) return
    const skillId = inst.skill ?? null
    actCtx.combat.pendingJobs.push({
      source: actCtx.self.entityId,
      target: job.source,
      skillId,
      isCounter: true,
      isOriginal: false,
    })
    narrativeLog.write(`${getCharName(actCtx.self.entityId)} 发动反击！`, 'combat', 'combat-base')
  })

  // cancel：取消伤害（可附带反击，如以柔克刚）——priority 必须高于其他 mitigate 类
  registerBattleAction('cancel', (actCtx: any) => {
    const job = actCtx.job
    const inst = actCtx.effect
    if (!job) return
    if (actCtx.canceledRef) actCtx.canceledRef.canceled = true
    narrativeLog.write(`${getCharName(actCtx.self.entityId)} 化解了攻击，伤害被取消！`, 'combat', 'combat-base')
    const skillId = inst.skill ?? null
    if (skillId && !job.isCounter) {
      actCtx.combat.pendingJobs.push({
        source: actCtx.self.entityId,
        target: job.source,
        skillId,
        isCounter: true,
        isOriginal: false,
      })
    }
  })

  // repeat：复读整招（递归；chance<1 加载校验；再扣消耗；深度预算防护）
  registerBattleAction('repeat', (actCtx: any) => {
    const job = actCtx.job
    if (!job || !job.isOriginal || !job.skillId) return
    const mod = modLoader.getMod()
    const def = mod?.abilities?.[job.skillId]
    const cost = typeof def?.cost === 'number' ? def.cost : 0
    const src = actCtx.combat.combatants.get(job.source)
    if (!src) return
    if (src.mp < cost) {
      narrativeLog.write(`${getCharName(job.source)} 内力不足，无法复读`, 'combat', 'combat-base')
      return
    }
    if (cost > 0) src.mp -= cost
    actCtx.combat.pendingJobs.push({ ...job, isOriginal: true })
    narrativeLog.write(`${getCharName(job.source)} 连绵不绝，复读整招！`, 'combat', 'combat-base')
  })

  // revive：死亡时复活一次（uses 消耗；满状态 + 效果区重建；一次性效果记录已消耗）
  registerBattleAction('revive', async (actCtx: any) => {
    const combatant = actCtx.self
    if (!combatant.dead) return
    combatant.hp = combatant.maxHp
    combatant.mp = combatant.maxMp
    combatant.dead = false
    // 一次性效果记录（神照经类：重建跳过，一场战斗仅一次）
    if (!combatant.consumedEffects.includes(actCtx.effect.id)) {
      combatant.consumedEffects.push(actCtx.effect.id)
    }
    // 效果区清空 + 常驻重建（就像刚以满状态进入战斗）
    combatant.zone = []
    recalcStats(combatant)
    await runChainHooks('combatant_init', { combat: actCtx.combat, combatant })
    recalcStats(combatant)
    narrativeLog.write(`【${getCharName(combatant.entityId)}】满状态复活！`, 'combat', 'combat-base')
    await eventBus.emit('character:changed', { id: combatant.entityId })
  })

  // apply_effect 已并入 zone 型引用（mount_effect + 库条目的 apply 施加器）——不再单独注册动作
}

// ── onEnable ─────────────────────────────────────────────────────────────

export function onEnable(ctx: PluginContext): void {
  registerSkipRule('in_combat', (charId: string) => {
    return !!currentCombat && currentCombat.participants.includes(charId)
  })

  ctx.api.register('combat', {
    getCombatContext: (): any => {
      if (!currentCombat) return null
      return {
        enemies: currentCombat.enemies,
        allies: currentCombat.allies,
        target: currentCombat.target,
      }
    },
    // 战斗状态快照（UI/自定义脚本/子插件读取）
    getCombatState: (): any => {
      if (!currentCombat) return null
      const state: any = {
        round: currentCombat.round,
        order: [...currentCombat.order],
        orderIndex: currentCombat.orderIndex,
        enemies: [...currentCombat.enemies],
        allies: [...currentCombat.allies],
        target: currentCombat.target,
        combatants: {},
      }
      for (const [id, c] of currentCombat.combatants) {
        state.combatants[id] = {
          entityId: id,
          hp: c.hp, maxHp: c.maxHp, mp: c.mp, maxMp: c.maxMp,
          absorbedMaxMp: c.absorbedMaxMp, dead: c.dead,
          stats: { ...c.stats },
          channels: { ...c.channels },
          effects: c.zone.map(z => ({
            id: z.id,
            name: z.displayName ?? z.name ?? z.id,
            stack: z.stack,
            remainingTurns: z.remainingTurns,
            category: z.category,
            trigger: z.trigger,
            action: z.action,
            stat: z.stat,
            channel: z.channel,
            value: { ...z.value },
            growth: z.growth,
            usesLeft: z.usesLeft,
          })),
        }
      }
      return state
    },
    registerHook: (hookName: string, handler: HookHandler): void => {
      if (OVERRIDE_HOOK_NAMES.has(hookName)) {
        overrideHooks.set(hookName, handler)
      } else {
        const list = hooks.get(hookName) ?? []
        list.push(handler)
        hooks.set(hookName, list)
      }
    },
    // 效果区内部操作（combatant_init 编译钩子用——战斗进行中直接加效果条目）
    addZoneEffect: (entityId: string, partial: any): void => {
      const c = currentCombat?.combatants.get(entityId)
      if (!c) return
      c.zone.push(makeInst({ ...partial, sourceId: partial.sourceId ?? entityId }))
      recalcStats(c)
    },
    recalcStats: (entityId: string): void => {
      const c = currentCombat?.combatants.get(entityId)
      if (c) recalcStats(c)
    },
    // 已注册战斗动作名（数据校验用）
    getBattleActionNames: (): string[] => [...battleActions.keys()],
    /** 注册战斗动作（子插件自定义动作：毒结算等；重复注册覆盖 = 热重载安全） */
    registerAction: (name: string, handler: BattleActionHandler): void => {
      battleActions.set(name, handler)
    },
    /** 注册施加器（zone 型条目的"怎么挂"：缺省 mount = 直接挂载；如 毒=apply_poison） */
    registerApply: (name: string, handler: ApplyHandler): void => {
      applyHandlers.set(name, handler)
    },
    getApplyNames: (): string[] => [...applyHandlers.keys()],
    /** 解析一条技能/天赋效果条目（含 { effect = "名", 参数… } 引用）→ { ok, entry } | { ok:false, error } */
    resolveEffect: (raw: any): any => {
      const r = resolveEffectRef(raw, modLoader.getMod()?.battleEffects)
      return r.ok ? { ok: true, entry: r.entry } : { ok: false, error: r.error }
    },
    /**
     * 常驻编译（被动技/天赋）：把解析后的条目直接推进效果区。
     * duration 强制 'battle'（被动 = 会这个就整场常驻），其余参数尊重条目声明。
     */
    addResolvedEffect: (entityId: string, entry: ResolvedEffect, opts?: any): void => {
      const c = currentCombat?.combatants.get(entityId)
      if (!c || !entry) return
      const spec = entry.spec
      c.zone.push(makeInst({
        id: opts?.id ?? entry.id,
        name: entry.name,
        trigger: spec.trigger,
        action: spec.action,
        value: spec.value,
        growth: spec.growth,
        target: entry.target,
        duration: opts?.duration ?? 'battle',
        stack: spec.stacks,
        maxStack: spec.maxStack,
        priority: spec.priority,
        category: spec.category,
        condition: spec.condition,
        uses: spec.uses,
        stat: spec.stat,
        channel: spec.channel,
        skill: spec.skill,
        when_skill: spec.whenSkill,
        levelNames: spec.levelNames,
        maxPerAction: spec.maxPerAction,
        sourceId: entityId,
      }))
      recalcStats(c)
    },
    /**
     * 挂载一个**已解析**的条目到指定战斗单位（施加器内部用；保留条目的层数/合并/时长规格）。
     * value/turns 可覆盖（如毒施加器算出的 M 快照）。
     */
    mountResolved: async (entityId: string, entry: ResolvedEffect, opts?: any): Promise<any> => {
      if (!currentCombat) return null
      const c = currentCombat.combatants.get(entityId)
      if (!c || !entry) return null
      return mountInstance(currentCombat, c, entry, {
        sourceId: opts?.sourceId ?? entityId,
        valueOverride: opts?.value,
        turnsOverride: opts?.turns,
      })
    },
    /**
     * 按库条目 id 挂载到指定战斗单位（缺省施加器/测试用）。
     * params 走参数白名单覆盖（stacks/value/merge…），value/turns 为便捷覆盖。
     */
    mountEffect: async (entityId: string, effectId: string, opts?: any): Promise<any> => {
      if (!currentCombat) return null
      const c = currentCombat.combatants.get(entityId)
      if (!c) return null
      const r = resolveEffectRef(
        opts?.params ? { effect: effectId, ...opts.params } : { effect: effectId },
        modLoader.getMod()?.battleEffects,
      )
      if (!r.ok) {
        errorReporter.reportDedup(`battle-mount:${effectId}`, {
          source: 'combat-base', severity: 'warning',
          message: `挂载 '${effectId}' 失败：${r.error}`,
        })
        return null
      }
      return mountInstance(currentCombat, c, r.entry, {
        sourceId: opts?.sourceId ?? entityId,
        valueOverride: opts?.value,
        turnsOverride: opts?.turns,
      })
    },
    /** 直接扣血（子插件自定义伤害阶段：毒 DoT 等）——走死亡相位/复活/(可选)受伤害后相位 */
    applyDamage: async (entityId: string, amount: number, opts?: any): Promise<void> => {
      if (!currentCombat) return
      const c = currentCombat.combatants.get(entityId)
      if (!c) return
      await applyDamageTo(currentCombat, c, amount, {
        source: opts?.source ?? 'system',
        kind: opts?.kind ?? 'periodic',
        triggerTakenPhase: !!opts?.triggerTakenPhase,
      })
    },
    // ── 公式中间量通道（上层插件注册通道名；mod 数据按名引用）──
    registerChannel: (def: any): void => { registerChannel(def) },
    getChannels: (): any[] => getChannelDefs(),
    // ── 公式明细（调参/调试/UI）──
    getLastFormula: (): FormulaRecord | null => formulaLog.length > 0 ? formulaLog[formulaLog.length - 1] : null,
    getFormulaHistory: (limit?: number): FormulaRecord[] => {
      if (typeof limit !== 'number' || limit <= 0) return [...formulaLog]
      return formulaLog.slice(-limit)
    },
    clearFormulaHistory: (): void => { formulaLog.length = 0 },
    setFormulaDetail: (on: boolean): void => { setFormulaDetail(on) },
    getFormulaDetail: (): boolean => formulaDetail,
    /** 插件自定义公式阶段（毒 DoT 等）记录明细——与内建钩子共用同一环形缓冲 */
    recordFormula: (rec: any): void => { recordFormula(rec) },
    // ── 效果库契约（手册 / 未来拖拽 UI 用）──
    /** 参数词汇表（技能行可覆盖的白名单：中文标签/类型/说明） */
    getParamVocab: (): any[] => PARAM_VOCAB.map(p => ({ ...p })),
    /** 效果库目录：每条库条目的分类、参数、默认值（UI 表单数据源） */
    getEffectCatalog: (): any[] => {
      const defs = modLoader.getMod()?.battleEffects ?? {}
      const out: any[] = []
      for (const id of Object.keys(defs)) {
        const r = resolveEffectRef(id, defs)
        if (!r.ok) { out.push({ id, error: r.error }); continue }
        const e = r.entry
        out.push({
          id,
          name: e.name,
          description: e.description,
          delivery: e.delivery,
          group: classifyEffect(e),
          target: e.target,
          at: e.at,
          settle: e.spec.trigger,
          action: e.spec.action,
          apply: e.apply,
          category: e.spec.category,
          params: usedParams(e),
          defaults: {
            chance: e.chance,
            value: e.spec.value,
            growth: e.spec.growth,
            stacks: e.spec.stacks,
            turns: typeof e.spec.duration === 'object' ? e.spec.duration.turns : undefined,
            merge: e.spec.merge,
            max_stack: e.spec.maxStack,
            uses: e.spec.uses,
          },
          paramLabels: e.paramLabels,
        })
      }
      return out
    },
    // RNG 注入（测试确定性）
    setRng: (fn: () => number): void => {
      if (currentCombat) currentCombat.rng = fn
    },
    start: async (enemies: string[], allies: string[]): Promise<void> => {
      await startCombat(enemies, allies, allies[0])
    },
    // 执行回合行动——兼容旧签名 executeAction(actor, 'attack'|'flee', target)
    // 新签名 executeAction(actor, { type:'skill', skillId?, targetId? })
    executeAction: async (actorId: string, actionOrOptions: any, targetId?: string): Promise<void> => {
      if (typeof actionOrOptions === 'object' && actionOrOptions !== null) {
        await executePlayerAction(actorId, actionOrOptions)
      } else if (actionOrOptions === 'attack') {
        await executePlayerAction(actorId, { type: 'skill', skillId: null, targetId })
      } else if (actionOrOptions === 'flee') {
        await endCombat('', 'fled')
      }
    },
    end: async (winner: string, outcome: string): Promise<void> => {
      await endCombat(winner, outcome)
    },
  })

  // 通用攻击指令（默认攻击）
  const attackCmd: CommandDef = {
    id: 'combat_attack',
    label: '攻击',
    group: 'character_commands',
    modes: ['combat'],
    priority: 5,
    condition: "game.mode == 'combat'",
    source: 'plugin:combat-base',
    handler: async (execCtx: any) => {
      const actorId = execCtx?.gameStore?.player?.id
      const targetId = execCtx?.uiStore?.selectedCharacterId ?? firstAliveEnemy()
      if (!actorId || !targetId || !currentCombat) return
      if (!currentCombat.enemies.includes(targetId)) {
        narrativeLog.write(`${getCharName(actorId)} 不能攻击 ${getCharName(targetId)}，不在战斗中`, 'combat', 'combat-base')
        return
      }
      await executePlayerAction(actorId, { type: 'skill', skillId: null, targetId })
    },
  }
  ctx.commands.register(attackCmd)

  const fleeCmd: CommandDef = {
    id: 'combat_flee',
    label: '逃跑',
    group: 'location_commands',
    modes: ['combat'],
    priority: 90,
    source: 'plugin:combat-base',
    handler: async () => {
      if (currentCombat) {
        await endCombat('', 'fled')
      }
    },
  }
  ctx.commands.register(fleeCmd)

  ctx.events.on('combat:request', async (payload: any) => {
    const player = gameContext.getContext().player
    if (!player) return
    await startCombat(payload?.enemies ?? [], [player.id], player.id)
  })

  ctx.events.on('game:load', () => {
    currentCombat = null
  })
}

// ── 战斗生命周期 ─────────────────────────────────────────────────────────

async function startCombat(enemies: string[], allies: string[], _sourceId: string): Promise<void> {
  let tsActive = false
  try { tsActive = !!apiSystem.callSync('h-time-stop', 'isActive') } catch { /* 插件缺失 */ }
  if (tsActive) {
    narrativeLog.write('时停中无法开始战斗——时间尚未流动', 'system', 'combat-base')
    return
  }
  if (currentCombat) {
    await endCombat('', 'interrupted')
  }
  const participants = [...allies, ...enemies]

  // 公式明细：新战斗清空（保留上一场便于战后查看的语义由 clearFormulaHistory 显式调用）
  formulaLog.length = 0

  currentCombat = {
    participants,
    enemies: [...enemies],
    allies: [...allies],
    combatants: new Map(),
    round: 0,
    order: [],
    orderIndex: 0,
    rng: Math.random,
    pendingJobs: [],
    depthBudget: MAX_JOB_DEPTH,
    extraAttacksLeft: 0,
    target: enemies[0] ?? null,
    actionOverlay: zeroOverlay(),
    actionOverlayOwner: null,
  }
  const scene = currentCombat

  // 构建战斗实体（战斗隔离值 + 效果区初始化）
  for (const id of participants) {
    const c = buildCombatant(id)
    if (!c) {
      errorReporter.report({
        source: 'combat-base', severity: 'error',
        message: `战斗参与者 '${id}' 不是有效角色，战斗中止`,
      })
      currentCombat = null
      return
    }
    scene.combatants.set(id, c)
  }
  // 常驻编译（被动技能/战斗天赋 → 效果区；wuxia 的 combatant_init 钩子）
  for (const id of participants) {
    await runChainHooks('combatant_init', { combat: scene, combatant: scene.combatants.get(id) })
    recalcStats(scene.combatants.get(id)!)
  }
  await runChainHooks('battle_start', { combat: scene })

  await gameContext.enterMode('combat')
  await eventBus.emit('combat:start', { participants })
  narrativeLog.write('战斗开始！', 'combat', 'combat-base')

  await nextTurn()
}

// 战斗实体构建（战斗隔离值：hp/mp 入场快照；战斗中只改 combatant，结束回写）
function buildCombatant(entityId: string): Combatant | null {
  const entity = entitySystem.get('character', entityId)
  if (!entity) return null
  const hp = bindingResolver.get(entityId, 'hp')
  const mp = bindingResolver.get(entityId, 'mp')
  const hpMax = bindingResolver.get(entityId, 'hp_max')
  const mpMax = bindingResolver.get(entityId, 'mp_max')
  const curHp = typeof hp === 'number' ? hp : 0
  const curMp = typeof mp === 'number' ? mp : 0
  return {
    entityId,
    hp: curHp,
    maxHp: typeof hpMax === 'number' && hpMax > 0 ? hpMax : curHp,
    mp: curMp,
    maxMp: typeof mpMax === 'number' && mpMax > 0 ? mpMax : curMp,
    absorbedMaxMp: 0,
    dead: curHp <= 0,
    stats: zeroStats(),
    channels: zeroChannelBag(),
    zone: [],
    talentDamageMods: [],
    talentChannelMods: [],
    consumedEffects: [],
  }
}

function zeroStats(): CombatStats {
  return { hit_bonus: 0, dodge_bonus: 0, crit_rate: 0, crit_mul: 0, damage_out: 0, damage_in: 0, defense_mult: 0 }
}

// 聚合常驻修正（效果区无 trigger 的 modify_stat / modify_channel 条目；数值已含层数缩放）
function recalcStats(c: Combatant): void {
  const s = zeroStats()
  const bag = zeroChannelBag()
  for (const inst of c.zone) {
    if (inst.trigger) continue
    if (inst.action === 'modify_stat' && inst.stat) {
      accumulateStat(s, inst.stat, effValue(inst))
    } else if (inst.action === 'modify_channel' && inst.channel) {
      accumulateChannelValue(bag, inst.channel, effValue(inst))
    }
  }
  c.stats = s
  c.channels = bag
}

/** 实例数值（已按层数乘性缩放）：value × (1 + growth×(层数−1)) */
function effValue(inst: BattleEffectInst): EffectValue {
  return scaleValue(inst.value, inst.growth, inst.stack)
}

/** 实例数值落到具体量：flat + percent × 基准（基准由各动作定义） */
function effAmount(inst: BattleEffectInst, basis: number): number {
  return valueAmount(effValue(inst), basis)
}

/**
 * 统计键累加——**不做单位换算**：点数组只认 value.flat，倍率组只认 value.percent。
 * 用错（点位给 percent / 倍率给 flat）时忽略并报一次 warning（不静默折算）。
 */
function accumulateStat(target: CombatStats | StatOverlay, stat: CombatStatKey, v: EffectValue): void {
  if (POINT_STATS.has(stat)) {
    if (v.percent !== 0) {
      errorReporter.reportDedup(`battle-stat-unit:${stat}`, {
        source: 'combat-base', severity: 'warning',
        message: `统计键 '${stat}' 是点数制，只吃 value.flat；本条给了 percent（已忽略度数）`,
        suggestion: `改写 value = { flat = N }（N = 点数）`,
      })
    }
    target[stat] += v.flat
    return
  }
  if (v.flat !== 0 && RATIO_STATS.has(stat)) {
    errorReporter.reportDedup(`battle-stat-unit:${stat}`, {
      source: 'combat-base', severity: 'warning',
      message: `统计键 '${stat}' 是倍率制，只吃 value.percent；本条给了 flat（已忽略平值）`,
      suggestion: `改写 value = { percent = N }（N = 倍率，0.3 = 30%）`,
    })
  }
  target[stat] += v.percent
}

/** 通道累加：set / flat / percent 可同时给（语义见 formula-channels 的 applyChannel） */
function accumulateChannelValue(bag: ChannelBag, channel: string, v: EffectValue): void {
  if (v.set !== undefined) accumulateChannel(bag, channel, 'set', v.set)
  if (v.flat !== 0) accumulateChannel(bag, channel, 'flat', v.flat)
  if (v.percent !== 0) accumulateChannel(bag, channel, 'percent', v.percent)
}

// 构建效果实例（归一化：数值/层数/时长）
function makeInst(raw: any): BattleEffectInst {
  const durNorm = normDuration(raw.duration ?? 'battle')
  const inst: BattleEffectInst = {
    id: raw.id,
    name: raw.name,
    trigger: raw.trigger as BattleTrigger | undefined,
    action: raw.action,
    chance: typeof raw.chance === 'number' ? raw.chance : 1,
    value: normalizeValue(raw.value),
    growth: typeof raw.growth === 'number' && Number.isFinite(raw.growth) ? raw.growth : 0,
    target: raw.target ?? 'self',
    duration: durNorm,
    remainingTurns: typeof durNorm === 'object' ? durNorm.turns : 0,
    stack: typeof raw.stack === 'number' && Number.isFinite(raw.stack) ? raw.stack : (typeof raw.stacks === 'number' ? raw.stacks : 1),
    maxStack: typeof raw.maxStack === 'number' && Number.isFinite(raw.maxStack)
      ? raw.maxStack
      : (typeof raw.max_stack === 'number' && Number.isFinite(raw.max_stack) ? raw.max_stack : 99),
    priority: typeof raw.priority === 'number' ? raw.priority : 0,
    category: raw.category ?? 'neutral',
    condition: raw.condition,
    usesLeft: typeof raw.uses === 'number' ? raw.uses : null,
    stat: raw.stat as CombatStatKey,
    skill: raw.skill,
    channel: raw.channel,
    when_skill: raw.when_skill,
    levelNames: raw.levelNames,
    maxPerAction: typeof raw.maxPerAction === 'number' ? raw.maxPerAction : 1,
    resolved: raw.resolved,
    sourceId: raw.sourceId ?? '',
  }
  inst.displayName = displayNameOf(inst.name ?? inst.id, inst.levelNames, inst.stack)
  return inst
}

function normDuration(d: any): 'battle' | 'permanent' | { turns: number } {
  if (d === 'battle' || d === 'permanent') return d
  if (typeof d === 'number') return { turns: Math.max(1, Math.round(d)) }
  if (d && typeof d === 'object' && typeof d.turns === 'number') return { turns: Math.max(1, Math.round(d.turns)) }
  return 'battle'
}

// ── 挂载（zone 型条目的公共实现）────────────────────────────────────────
// 一个 zone 效果 = 库条目（时机/目标/结算动作/默认参数）+ 技能引用（参数覆盖，已由 resolveEffectRef 合并）。
// 生命周期：技能行 turns > 库条目 duration > zone 默认 5 回合（含本回合）。
// 重复施加按 merge 合并：
//   refresh（缺省）：按本次声明的数值/层数重新施加，只重置时长
//   stack         ：层数累加（受 max_stack 限制），基础数值不变（层数由 growth 放大）
//   strongest     ：本次层数 ≥ 现有层数才升级（数值取大），否则只重置时长——弱的一击不降级

function maxValue(a: EffectValue, b: EffectValue): EffectValue {
  const out: EffectValue = { flat: Math.max(a.flat, b.flat), percent: Math.max(a.percent, b.percent) }
  const set = b.set ?? a.set
  if (set !== undefined) out.set = set
  return out
}

export async function mountInstance(
  combat: CombatScene,
  owner: Combatant,
  entry: ResolvedEffect,
  opts: { sourceId: string; valueOverride?: EffectValue; turnsOverride?: number },
): Promise<BattleEffectInst | null> {
  if (!currentCombat || combat !== currentCombat) return null
  const spec = entry.spec
  const value = opts.valueOverride ?? spec.value
  const turns = opts.turnsOverride ?? (typeof spec.duration === 'object' ? spec.duration.turns : undefined)
  const duration: BattleEffectInst['duration'] = turns !== undefined
    ? { turns: Math.max(1, Math.round(turns)) }
    : spec.duration

  const existing = owner.zone.find(z => z.id === entry.id)
  if (existing) {
    if (typeof duration === 'object') {
      existing.remainingTurns = duration.turns
      existing.duration = duration
    }
    if (spec.merge === 'stack') {
      existing.stack = Math.min(existing.maxStack, existing.stack + spec.stacks)
    } else if (spec.merge === 'strongest') {
      if (spec.stacks >= existing.stack) {
        existing.stack = spec.stacks
        existing.value = maxValue(existing.value, value)
        existing.name = entry.name
        existing.levelNames = spec.levelNames
      }
    } else {
      existing.stack = spec.stacks
      existing.value = value
      existing.name = entry.name
      existing.levelNames = spec.levelNames
    }
    existing.growth = spec.growth
    existing.category = spec.category
    existing.displayName = displayNameOf(existing.name ?? existing.id, existing.levelNames, existing.stack)
    recalcStats(owner)
    if (!entry.apply) reportMount(owner, existing)
    return existing
  }

  const inst = makeInst({
    id: entry.id,
    name: entry.name,
    trigger: spec.trigger as BattleTrigger | undefined,
    action: spec.action,
    chance: 1,
    value,
    growth: spec.growth,
    target: entry.target,
    duration,
    stack: spec.stacks,
    maxStack: spec.maxStack,
    priority: spec.priority,
    category: spec.category,
    condition: spec.condition,
    uses: spec.uses,
    stat: spec.stat,
    channel: spec.channel,
    skill: spec.skill,
    when_skill: spec.whenSkill,
    levelNames: spec.levelNames,
    maxPerAction: spec.maxPerAction,
    sourceId: opts.sourceId,
  })
  owner.zone.push(inst)
  recalcStats(owner)
  reportMount(owner, inst)
  return inst
}

/** 挂载日志（施加器自己写更具体日志时可以设 apply 跳过本条） */
function reportMount(owner: Combatant, inst: BattleEffectInst): void {
  const turns = typeof inst.duration === 'object' ? `（${inst.remainingTurns} 回合）` : ''
  narrativeLog.write(`${getCharName(owner.entityId)} 被挂上【${inst.displayName ?? inst.id}】${turns}`, 'combat', 'combat-base')
}

// ── 回合循环 ─────────────────────────────────────────────────────────────

function aliveActors(combat: CombatScene): string[] {
  return combat.participants.filter(id => {
    const c = combat.combatants.get(id)
    return c && !c.dead && c.hp > 0
  })
}

// 每轮重排行动序（initiative 钩子；平速 rng）
// 每个参战者只求值一次（排序比较器内多次调用会重复触发钩子/明细记录，且带状态钩子结果不稳定）
function buildRound(combat: CombatScene): void {
  const alive = aliveActors(combat)
  const initiative = new Map<string, number>()
  for (const id of alive) {
    const c = combat.combatants.get(id)
    const channels = { source: channelBagOf(c), target: zeroChannelBag() }
    const norm = normalizeFormulaResult(callHook('initiative', { sourceId: id, combat, source: c, channels }))
    initiative.set(id, norm.value)
    recordFormula({ hook: 'initiative', sourceId: id, parts: norm.parts, channels, value: norm.value })
  }
  const order = alive.slice().sort((a, b) => {
    const ia = initiative.get(a) ?? 0
    const ib = initiative.get(b) ?? 0
    if (ia === ib) return combat.rng() < 0.5 ? -1 : 1
    return ib - ia
  })
  combat.round++
  combat.order = order
  combat.orderIndex = 0
  narrativeLog.write(`—— 第 ${combat.round} 轮 ——`, 'combat', 'combat-base')
}

async function nextTurn(): Promise<void> {
  if (!currentCombat) return
  const combat = currentCombat
  if (await checkBattleEnd()) return

  if (combat.orderIndex >= combat.order.length) {
    buildRound(combat)
  }
  // 防御性跳死（复活时序等边界）
  let guard = 0
  while (combat.orderIndex < combat.order.length) {
    const c = combat.combatants.get(combat.order[combat.orderIndex])
    if (c && !c.dead && c.hp > 0) break
    combat.orderIndex++
    if (++guard > combat.participants.length * 3 + 1) break
  }
  if (combat.orderIndex >= combat.order.length) {
    if (await checkBattleEnd()) return
    buildRound(combat)
  }
  const actorId = combat.order[combat.orderIndex]
  const actor = combat.combatants.get(actorId)!
  if (actor.dead || actor.hp <= 0) { await advanceTurn(); return }

  // 回合初相位（毒结算/到期削减在相位后）
  await runPhase(combat, 'turn_start', actor, makePhaseCtx(combat, null, actor, actor))
  tickDurations(actor, 'turn_start')
  if (!currentCombat) return
  if (await checkBattleEnd()) return
  if (actor.dead || actor.hp <= 0) { await advanceTurn(); return }

  await runChainHooks('turn_start', { actorId, combat })

  // 玩家或玩家控制的队友 → 回 IDLE 等指令
  if (combat.allies.includes(actorId)) {
    narrativeLog.write(`轮到 ${getCharName(actorId)} 行动。`, 'combat', 'combat-base')
    return
  }
  // NPC 自动行动
  await npcAutoAction(actorId)
  if (!currentCombat) return
  await advanceTurn()
}

async function advanceTurn(): Promise<void> {
  if (!currentCombat) return
  const combat = currentCombat
  const actorId = combat.order[combat.orderIndex]
  const actor = combat.combatants.get(actorId)
  if (actor) {
    await runPhase(combat, 'turn_end', actor, makePhaseCtx(combat, null, actor, actor))
    await runChainHooks('turn_end', { actorId, combat })
    // turn_end 结算的条目在相位之后再扣时长（turns = N 恰好结算 N 次）
    if (currentCombat === combat) tickDurations(actor, 'turn_end')
  }
  combat.orderIndex++
  await nextTurn()
}

// 回合初/回合末的 duration 扣减（相位结算之后）
// 分桶规则：settle === 'turn_end' 的条目在 turn_end 相位之后扣，其余在 turn_start 相位之后扣
// ——保证 turns = N 对两种结算相位都恰好结算 N 次（与施加时机无关）
function tickDurations(c: Combatant, phase: 'turn_start' | 'turn_end'): void {
  let changed = false
  for (let i = c.zone.length - 1; i >= 0; i--) {
    const inst = c.zone[i]
    if (typeof inst.duration !== 'object') continue
    const bucket = inst.trigger === 'turn_end' ? 'turn_end' : 'turn_start'
    if (bucket !== phase) continue
    inst.remainingTurns--
    if (inst.remainingTurns <= 0) {
      c.zone.splice(i, 1)
      changed = true
    }
  }
  if (changed) recalcStats(c)
}

// ── 行动执行 ─────────────────────────────────────────────────────────────

// 玩家侧行动（指令/API 入口）
async function executePlayerAction(actorId: string, options: { type: string; skillId?: string | null; targetId?: string }): Promise<void> {
  if (!currentCombat) return
  const combat = currentCombat
  const actor = combat.combatants.get(actorId)
  if (!actor || actor.dead) return
  // 必须是当前行动者（玩家或玩家控制的队友）
  if (combat.order[combat.orderIndex] !== actorId) {
    narrativeLog.write(`还没轮到 ${getCharName(actorId)}。`, 'combat', 'combat-base')
    return
  }
  if (options.type === 'flee') {
    await endCombat('', 'fled')
    return
  }
  const targetId = options.targetId ?? combat.target ?? combat.enemies[0] ?? null
  if (!targetId || !combat.combatants.has(targetId)) {
    narrativeLog.write('没有攻击目标。', 'combat', 'combat-base')
    return
  }
  combat.target = targetId

  // 技能校验（无 skillId = 默认攻击）
  const skillId = options.skillId ?? null
  const skillDef = skillId ? modLoader.getMod()?.abilities?.[skillId] : null
  if (skillId && !skillDef) {
    errorReporter.reportDedup(`combat-skill:${skillId}`, {
      source: 'combat-base', severity: 'warning',
      message: `技能 '${skillId}' 不存在，行动被拒绝`,
    })
    return
  }
  // 消耗校验（默认攻击无消耗）
  const cost = typeof skillDef?.cost === 'number' ? skillDef.cost : 0
  if (actor.mp < cost) {
    narrativeLog.write(`${getCharName(actorId)} 内力不足，无法使用 ${skillDef?.name ?? skillId}（需 ${cost}）`, 'combat', 'combat-base')
    return
  }

  const skillLevel = getSkillLevel(actorId, skillId ?? '')
  const formulaStart = formulaLog.length

  // action_pre 相位：用技能前生效的效果（禁技 action_block / 对该技能加成 modify_stat·modify_channel）
  // 注意在扣消耗之前——被禁则内力不扣、**该次行动作废（轮到下一位）**，玩家与 NPC 一致
  const blockedRef = { blocked: false }
  combat.actionOverlay = zeroOverlay()
  combat.actionOverlayOwner = actorId
  combat.extraAttacksLeft = 1
  await runPhaseWithOverlay(combat, 'action_pre', actor, makePhaseCtx(combat, null, actor, combat.combatants.get(targetId) ?? actor, {
    skillDef, skillLevel, blockedRef,
  }), combat.actionOverlay)
  if (!currentCombat) return
  if (blockedRef.blocked) {
    await advanceTurn()
    return
  }

  if (cost > 0) actor.mp -= cost
  if (skillDef) {
    narrativeLog.write(`${getCharName(actorId)} 使用 ${skillDef.name ?? skillId}！`, 'combat', 'combat-base')
  }

  const result: any = { damage: 0, hits: 0, crits: 0 }

  // on_use 效果（蓄势类：蛤蟆功）
  await runPhase(combat, 'on_use', actor, makePhaseCtx(combat, null, actor, actor, { skillDef, skillLevel }))
  if (!currentCombat) return
  combat.depthBudget = MAX_JOB_DEPTH

  // 有 power（或子插件判定为攻击技）= 攻击技；否则 = 增益/架势技（本回合不攻击）
  const isAttack = (await callHookAsync('is_attack_skill', { skill: skillDef }))
    ?? (typeof skillDef?.power === 'number')
  if (skillDef && isAttack) {
    const totals = await battleRunAction(actorId, skillId, targetId, skillLevel)
    result.damage = totals.damage
    result.hits = totals.hits
    result.crits = totals.crits
  } else if (!skillDef) {
    const totals = await battleRunAction(actorId, null, targetId, skillLevel)
    result.damage = totals.damage
    result.hits = totals.hits
    result.crits = totals.crits
  }
  result.formulas = formulaLog.slice(formulaStart)

  await eventBus.emit('combat:turn', {
    actor: actorId,
    action: skillId ? (skillDef?.power !== undefined ? 'skill' : 'skill_buff') : 'attack',
    skillId,
    target: combat.target,
    result,
  })
  await checkBattleEnd()
  if (!currentCombat) return
  await advanceTurn()
}

// NPC 自动行动——MVP 随机选可用主动技能（或默认攻击）打随机敌方
async function npcAutoAction(actorId: string): Promise<void> {
  if (!currentCombat) return
  const combat = currentCombat
  const actor = combat.combatants.get(actorId)
  if (!actor || actor.dead) return
  const aliveTargets = combat.allies.filter(id => {
    const c = combat.combatants.get(id)
    return c && c.hp > 0
  })
  if (aliveTargets.length === 0) return
  const targetId = aliveTargets[Math.floor(combat.rng() * aliveTargets.length)]

  const usable = getUsableSkills(actorId, actor.mp)
  const pick = usable.length > 0 ? usable[Math.floor(combat.rng() * usable.length)] : null
  const skillId = pick?.id ?? null
  const skillDef = skillId ? modLoader.getMod()?.abilities?.[skillId] : null
  const cost = typeof skillDef?.cost === 'number' ? skillDef.cost : 0

  const skillLevel = getSkillLevel(actorId, skillId ?? '')
  const formulaStart = formulaLog.length

  // action_pre：禁技/技能加成（NPC 被禁 → 本回合不出手，内力不扣）
  const blockedRef = { blocked: false }
  combat.actionOverlay = zeroOverlay()
  combat.actionOverlayOwner = actorId
  combat.extraAttacksLeft = 1
  await runPhaseWithOverlay(combat, 'action_pre', actor, makePhaseCtx(combat, null, actor, combat.combatants.get(targetId) ?? actor, {
    skillDef, skillLevel, blockedRef,
  }), combat.actionOverlay)
  if (!currentCombat) return
  if (blockedRef.blocked) return

  if (cost > 0) actor.mp -= cost
  if (skillDef) {
    narrativeLog.write(`${getCharName(actorId)} 使用 ${skillDef.name ?? skillId}！`, 'combat', 'combat-base')
  } else {
    narrativeLog.write(`${getCharName(actorId)} 攻击了 ${getCharName(targetId)}！`, 'combat', 'combat-base')
  }

  await runPhase(combat, 'on_use', actor, makePhaseCtx(combat, null, actor, actor, { skillDef, skillLevel }))
  if (!currentCombat) return
  combat.depthBudget = MAX_JOB_DEPTH

  const result: any = { damage: 0, hits: 0, crits: 0 }
  const isAttack = (await callHookAsync('is_attack_skill', { skill: skillDef }))
    ?? (typeof skillDef?.power === 'number')
  if (skillDef && isAttack) {
    const totals = await battleRunAction(actorId, skillId, targetId, skillLevel)
    result.damage = totals.damage
    result.hits = totals.hits
    result.crits = totals.crits
  } else if (!skillDef) {
    const totals = await battleRunAction(actorId, null, targetId, skillLevel)
    result.damage = totals.damage
    result.hits = totals.hits
    result.crits = totals.crits
  }
  result.formulas = formulaLog.slice(formulaStart)
  await eventBus.emit('combat:turn', {
    actor: actorId, action: skillDef ? 'skill' : 'attack', skillId, target: targetId, result,
  })
  await checkBattleEnd()
}

// 可用技能列表（主动、有定义、内力足够）
function getUsableSkills(actorId: string, mp: number): { id: string; level: number }[] {
  const mod = modLoader.getMod()
  if (!mod) return []
  const char = entitySystem.get('character', actorId) as any
  if (!char?.abilities) return []
  const result: { id: string; level: number }[] = []
  for (const [abilityId, entry] of Object.entries(char.abilities)) {
    const def = mod.abilities?.[abilityId]
    if (!def || def.type !== 'active') continue
    if (typeof def.cost === 'number' && def.cost > mp) continue
    result.push({ id: abilityId, level: typeof (entry as any)?.level === 'number' ? (entry as any).level : 0 })
  }
  return result
}

function getSkillLevel(actorId: string, skillId: string): number {
  const char = entitySystem.get('character', actorId) as any
  return typeof char?.abilities?.[skillId]?.level === 'number' ? char.abilities[skillId].level : 0
}

// 行动执行主入口：主攻击作业 + 反击/复读作业队列（迭代执行 + 深度预算）
async function battleRunAction(
  actorId: string,
  skillId: string | null,
  targetId: string,
  skillLevel: number,
): Promise<{ damage: number; hits: number; crits: number }> {
  if (!currentCombat) return { damage: 0, hits: 0, crits: 0 }
  const combat = currentCombat
  combat.depthBudget = MAX_JOB_DEPTH
  const skillDef = skillId ? modLoader.getMod()?.abilities?.[skillId] : null
  const totals = { damage: 0, hits: 0, crits: 0 }

  const mainJob: AttackJob = { source: actorId, target: targetId, skillId, isCounter: false, isOriginal: true }
  const mn = await executeJob(combat, mainJob, getJobHits(skillDef), skillLevel, skillDef)
  totals.damage += mn.damage
  totals.hits += mn.hits
  totals.crits += mn.crits
  // 注：action_end（复读触发）在 executeJob 内对原发行动结算（复读作业同样递归走它）
  return totals
}

function getJobHits(skillDef: any): number {
  return skillDef && typeof skillDef.hits === 'number' && skillDef.hits >= 1 ? skillDef.hits : 1
}

// 反击/复读作业队列（迭代，不递归）
async function drainJobs(combat: CombatScene): Promise<void> {
  while (combat.pendingJobs.length > 0) {
    if (combat.depthBudget <= 0) {
      combat.pendingJobs = []
      errorReporter.report({
        source: 'combat-base', severity: 'error',
        message: '战斗结算超过递归深度上限（64），已强制断链',
        suggestion: '检查联动效果（连绵/反击/反震等）是否构成循环触发',
      })
      return
    }
    combat.depthBudget--
    const job = combat.pendingJobs.shift()!
    if (!currentCombat || combat !== currentCombat) return
    const target = combat.combatants.get(job.target)
    if (!target || target.dead || target.hp <= 0) continue
    const jobSkillDef = job.skillId ? modLoader.getMod()?.abilities?.[job.skillId] : null
    await executeJob(combat, job, getJobHits(jobSkillDef), getSkillLevel(job.source, job.skillId ?? ''), jobSkillDef)
    if (!currentCombat || combat !== currentCombat) return
    await checkBattleEnd()
    if (!currentCombat) return
  }
}

// 单作业执行：hits 段 × 完整攻击管线
async function executeJob(
  combat: CombatScene,
  job: AttackJob,
  hits: number,
  skillLevel: number,
  skillDef: any,
): Promise<{ damage: number; hits: number; crits: number }> {
  const attacker = combat.combatants.get(job.source)
  const defender = combat.combatants.get(job.target)
  const out = { damage: 0, hits: 0, crits: 0 }
  if (!attacker || !defender) return out
  if (defender.dead || defender.hp <= 0) return out

  for (let hitIdx = 0; hitIdx < hits; hitIdx++) {
    if (!currentCombat || combat !== currentCombat) return out
    if (defender.dead || defender.hp <= 0) {
      narrativeLog.write(`${getCharName(job.target)} 已倒下，后续 ${hits - hitIdx} 段落空`, 'combat', 'combat-base')
      break
    }
    const r = await executeHit(combat, job, hitIdx, hits, skillLevel, skillDef)
    out.damage += r.damage
    out.hits += 1
    if (r.crit) out.crits += 1
    await checkBattleEnd()
    if (!currentCombat) return out
  }
  // 作业结束后立即结算队列中的反击
  await drainJobs(combat)
  // 原发行动的整招结算完成（action_end：连绵复读递归入口——复读作业同样走这里）
  if (job.isOriginal && currentCombat === combat) {
    const atk = combat.combatants.get(job.source)
    const dfd = combat.combatants.get(job.target)
    if (atk && dfd) {
      await runPhase(combat, 'action_end', atk, makePhaseCtx(combat, job, atk, dfd, { skillDef, skillLevel }))
      await drainJobs(combat)
    }
  }
  return out
}

// 单段攻击管线（合同：attack_pre → attack_launch → hit_roll → [miss|命中链] → attack_end）
async function executeHit(
  combat: CombatScene,
  job: AttackJob,
  hitIdx: number,
  hits: number,
  skillLevel: number,
  skillDef: any,
): Promise<HitResult> {
  const attacker = combat.combatants.get(job.source)!
  const defender = combat.combatants.get(job.target)!
  const baseCtx = makePhaseCtx(combat, job, attacker, defender, { skillDef, skillLevel })

  // a. 出手前　b. 出手时（相位的统计/通道修正作用于本段的命中/暴击/伤害判定）
  // 起点 = action_pre 相位的叠加（本次行动全部段共享；仅归属者可享——反击/复读作业不得借用）
  const actionOverlay = combat.actionOverlayOwner === attacker.entityId ? combat.actionOverlay : zeroOverlay()
  const preOverlay = zeroOverlay()
  await runPhaseWithOverlay(combat, 'attack_pre', attacker, baseCtx, preOverlay)
  await runPhaseWithOverlay(combat, 'attack_launch', attacker, baseCtx, preOverlay)

  // c. 命中判定（命中公式钩子 + hit_roll 相位叠加；不截断——>100 必中 / <0 必 Miss）
  const hitOverlay = await runPhaseStats(combat, 'hit_roll', attacker, baseCtx)
  const hitChannels = {
    source: channelBagOf(attacker, actionOverlay, preOverlay, hitOverlay),
    target: channelBagOf(defender),
  }
  const hitNorm = await runFormulaHook('hit_rate', {
    source: attacker, target: defender, skill: skillDef, hits, hitIdx, combat, channels: hitChannels,
  }, 100)
  const hitRate = hitNorm.value + actionOverlay.hit_bonus + preOverlay.hit_bonus + hitOverlay.hit_bonus
  recordFormula({
    hook: 'hit_rate', sourceId: job.source, targetId: job.target, skillId: job.skillId, hitIdx,
    parts: hitNorm.parts, channels: hitChannels, value: hitRate,
  })
  const isHit = combat.rng() * 100 < hitRate

  if (!isHit) {
    // d. 未命中 → 出手结束
    await runPhase(combat, 'attack_miss', attacker, baseCtx)
    await runPhase(combat, 'attack_end', attacker, baseCtx)
    narrativeLog.write(`${getCharName(defender.entityId)} 闪避了攻击！`, 'combat', 'combat-base')
    return { damage: 0, crit: false }
  }

  // e1. 命中：on_hit（攻击方效果：吸收/施加/乘势/增伤——合同 e5 的"双方效果区"
  // 检查点是 damage_on_target（防御方相位），on_hit 只归攻击方）
  const onHitOverlay = await runPhaseStats(combat, 'on_hit', attacker, baseCtx)
  if (!currentCombat || combat !== currentCombat) return { damage: 0, crit: false }
  const dmgOverlay = await runPhaseStats(combat, 'damage_base', attacker, baseCtx)
  // 出手前/出手时/命中后/基础伤害相位的统计一并作用于本次伤害（原先 attack_* 相位的修正被静默丢弃）
  const mergedStats = addOverlays(attacker.stats, actionOverlay, preOverlay, onHitOverlay, dmgOverlay)
  const baseDamageChannels = {
    source: channelBagOf(attacker, actionOverlay, preOverlay, onHitOverlay, dmgOverlay, hitOverlay),
    target: channelBagOf(defender),
  }
  const baseNorm = await runFormulaHook('base_damage', {
    source: attacker, target: defender, skill: skillDef, hits, hitIdx, combat,
    talentMods: attacker.talentDamageMods, skillLevel, channels: baseDamageChannels,
  }, 0)
  let base = Math.max(0, baseNorm.value * (1 + mergedStats.damage_out))
  recordFormula({
    hook: 'base_damage', sourceId: job.source, targetId: job.target, skillId: job.skillId, hitIdx,
    parts: { ...baseNorm.parts, 基础伤害: base, 伤害加成: mergedStats.damage_out },
    channels: baseDamageChannels, value: base,
  })

  // e2-e3. 暴击
  const critOverlay = await runPhaseStats(combat, 'damage_crit', attacker, baseCtx)
  const critChannels = {
    source: channelBagOf(attacker, actionOverlay, preOverlay, onHitOverlay, dmgOverlay, hitOverlay, critOverlay),
    target: channelBagOf(defender),
  }
  const critStats = addOverlays(attacker.stats, actionOverlay, preOverlay, onHitOverlay, dmgOverlay, critOverlay)
  const critRate = (await runFormulaHook('crit_rate', {
    source: attacker, target: defender, skill: skillDef, combat, channels: critChannels,
  }, 0)).value + critStats.crit_rate
  const isCrit = combat.rng() * 100 < clamp(critRate, 0, 100)
  const critMul = isCrit
    ? (await runFormulaHook('crit_mul', {
        source: attacker, target: defender, skill: skillDef, combat, channels: critChannels,
      }, 1.5)).value + critStats.crit_mul
    : 1

  // e4. 浮动（damage_output 相位的统计/通道作用于最终伤害）
  const outputOverlay = await runPhaseStats(combat, 'damage_output', attacker, baseCtx)
  const floatChannels = {
    source: channelBagOf(attacker, actionOverlay, preOverlay, onHitOverlay, dmgOverlay, hitOverlay, critOverlay, outputOverlay),
    target: channelBagOf(defender),
  }
  const floatNorm = await runFormulaHook('float_mul', {
    combat, source: attacker, target: defender, channels: floatChannels,
  }, 0.9 + combat.rng() * 0.2)
  const floatMul = floatNorm.value
  let pending = Math.max(0, Math.round(base * critMul * floatMul))
  recordFormula({
    hook: 'float_mul', sourceId: job.source, targetId: job.target, skillId: job.skillId, hitIdx,
    parts: { 伤害: base, 暴击率: critRate, 暴击倍率: critMul, 浮动系数: floatMul, 输出伤害: pending },
    channels: floatChannels, value: pending,
  })
  if (isCrit) narrativeLog.write(`**暴击！**`, 'combat', 'combat-base')
  if (outputOverlay.damage_out) {
    pending = Math.max(0, Math.round(pending * (1 + outputOverlay.damage_out)))
  }

  // e5. 伤害落在对方身上（取消类：以柔克刚——priority 最高）
  const canceledRef: any = { canceled: false }
  const onTargetCtx = { ...baseCtx, pendingDamage: pending, canceledRef }
  const onTargetOverlay = await runPhaseStats(combat, 'damage_on_target', defender, onTargetCtx)
  if (!currentCombat || combat !== currentCombat) return { damage: 0, crit: false }
  if (canceledRef.canceled) pending = 0

  // e6. 真伤害前（护体减伤/反震/反击）
  const mitigateOverlay = await runPhaseStats(combat, 'damage_mitigate', defender, { ...onTargetCtx, includeSkillEffects: false })
  if (!currentCombat || combat !== currentCombat) return { damage: 0, crit: false }
  const defenderStats = addOverlays(defender.stats, onTargetOverlay, mitigateOverlay)
  const dmgInReduction = defenderStats.damage_in
  // 减伤/易伤：正 = 减伤、负 = 易伤（破绽类）。**不截断**——易伤侧无上限（伤害加深可无限叠），
  // 数据层负责平衡；校验期对 |damage_in| > 3 的条目发 warning。
  pending = Math.max(0, Math.round(pending * (1 - dmgInReduction)))
  // e7. −防御（归 0 规则）
  const defenderChannels = channelBagOf(defender, onTargetOverlay, mitigateOverlay)
  const defNorm = await runFormulaHook('defense_value', {
    source: attacker, target: defender, skill: skillDef, combat,
    channels: { source: channelBagOf(attacker, actionOverlay, preOverlay, onHitOverlay, dmgOverlay, hitOverlay, critOverlay, outputOverlay), target: defenderChannels },
  }, 0)
  const defVal = defNorm.value
  const final = Math.max(0, pending - defVal)
  recordFormula({
    hook: 'defense_value', sourceId: job.source, targetId: job.target, skillId: job.skillId, hitIdx,
    parts: { ...defNorm.parts, 减伤: dmgInReduction, 防御: defVal, 扣防前: pending, 最终伤害: final },
    channels: { source: zeroChannelBag(), target: defenderChannels }, value: defVal,
  })

  // e8. 扣血 + 受伤害后效果
  // dealt = **实际扣掉的血量**（溢出的过量伤害不计入）——饮血等按实际伤害结算的效果用它
  let dealt = 0
  if (final > 0) {
    dealt = await applyDamageTo(combat, defender, final, { source: job.source, kind: 'hit' })
  }
  if (!currentCombat || combat !== currentCombat) return { damage: final, crit: isCrit }
  if (defender.dead || defender.hp <= 0) {
    narrativeLog.write(`${getCharName(defender.entityId)} 倒下了！`, 'combat', 'combat-base')
  } else {
    await runPhaseStats(combat, 'damage_taken', defender, { ...baseCtx, pendingDamage: dealt })
  }
  // 出手结束（命中路径）——pendingDamage = 本段实际扣血量（miss 路径为 0）
  await runPhase(combat, 'attack_end', attacker, { ...baseCtx, pendingDamage: dealt })
  return { damage: final, crit: isCrit }
}

// 扣血 + 死亡处理（检查点：死亡相位 → 复活 → 胜负检查由调用方）
// 返回**实际扣掉的血量**（0 = 没扣到，如已死亡/伤害为 0/被钳到 0）
export async function applyDamageTo(
  combat: CombatScene,
  target: Combatant,
  damage: number,
  opts: { source: string; kind: 'hit' | 'periodic' | 'reflect' | 'external'; triggerTakenPhase?: boolean },
): Promise<number> {
  void opts
  if (damage <= 0 || target.dead) return 0
  const prev = target.hp
  target.hp = Math.max(0, target.hp - Math.round(damage))
  const dealt = prev - target.hp
  narrativeLog.write(`${getCharName(target.entityId)} 受到 ${Math.round(damage)} 点伤害（HP: ${prev}→${target.hp}）`, 'combat', 'combat-base')
  if (target.hp <= 0 && !target.dead) {
    target.dead = true
    // 死亡相位（神照经等复活，优先于一切）
    await runPhase(combat, 'death', target, makePhaseCtx(combat, null, target, target))
    if (target.dead) {
      narrativeLog.write(`${getCharName(target.entityId)} 力竭倒地。`, 'combat', 'combat-base')
    }
  }
  // 受伤害后相位（周期伤害/毒等"简化流程"的伤害也可声明触发——受伤害后效果照常生效）
  if (opts.triggerTakenPhase && currentCombat === combat && !target.dead) {
    await runPhase(combat, 'damage_taken', target, makePhaseCtx(combat, null, target, target, { pendingDamage: dealt }))
  }
  // 串行 await：避免多发 character:changed 在异步分发中互相 same-tick 覆盖
  await eventBus.emit('character:changed', { id: target.entityId })
  return dealt
}

// ── 相位执行器 ───────────────────────────────────────────────────────────

function makePhaseCtx(
  combat: CombatScene, job: AttackJob | null, attacker: Combatant, defender: Combatant,
  extra?: Partial<PhaseCtx>,
): PhaseCtx {
  return {
    combat, job, attacker, defender, pendingDamage: 0,
    includeSkillEffects: true, ...extra,
  }
}

// 相位（收集效果 + 概率/条件/次数 + 动作分发）
async function runPhase(combat: CombatScene, phase: BattleTrigger, owner: Combatant, ctx: PhaseCtx): Promise<void> {
  if (!currentCombat || combat !== currentCombat) return
  const candidates = collectPhaseEffects(owner, phase, ctx)
  for (const inst of candidates) {
    if (!currentCombat || combat !== currentCombat) break
    if (inst.usesLeft !== null && inst.usesLeft <= 0) continue
    if (inst.chance < 1 && combat.rng() >= inst.chance) continue
    if (inst.condition && !evalBattleCondition(inst.condition, ctx, owner)) continue
    const actCtx: any = {
      combat, job: ctx.job, self: owner,
      target: ctx.job ? combat.combatants.get(ctx.job.target) ?? owner : ctx.defender,
      effect: inst,
      pendingDamage: ctx.pendingDamage,
      overlay: null,
      canceledRef: ctx.canceledRef,
      blockedRef: ctx.blockedRef,
      // 通道包（v1.2）：插件自定义动作（如毒 DoT 的「毒伤害」减免）需要读修正
      channels: { self: channelBagOf(owner), target: channelBagOf(ctx.job ? combat.combatants.get(ctx.job.target) : ctx.defender) },
      skillLevel: ctx.skillLevel,
    }
    try {
      const handler = battleActions.get(inst.action)
      if (!handler) {
        errorReporter.reportDedup(`battle-action:${inst.action}`, {
          source: 'combat-base', severity: 'warning',
          message: `战斗动作 '${inst.action}' 未注册，跳过`,
        })
        continue
      }
      await handler(actCtx)
    } catch (err) {
      errorReporter.report({
        source: 'combat-base', severity: 'error',
        message: `战斗效果 '${inst.id}' (${inst.action}) 执行抛错：${err instanceof Error ? err.message : String(err)}`,
      })
    }
    if (ctx.canceledRef?.canceled) break
    if (inst.usesLeft !== null && inst.usesLeft > 0) {
      inst.usesLeft--
      if (inst.usesLeft <= 0) {
        const idx = owner.zone.indexOf(inst)
        if (idx >= 0) owner.zone.splice(idx, 1)
        recalcStats(owner)
      }
    }
  }
}

// 统计叠加相位（modify_stat 类 → overlay 临时统计）
async function runPhaseStats(combat: CombatScene, phase: BattleTrigger, owner: Combatant, ctx: PhaseCtx): Promise<StatOverlay> {
  const overlay = zeroOverlay()
  await runPhaseWithOverlay(combat, phase, owner, ctx, overlay)
  return overlay
}

async function runPhaseWithOverlay(
  combat: CombatScene, phase: BattleTrigger, owner: Combatant, ctx: PhaseCtx, overlay: StatOverlay,
): Promise<void> {
  if (!currentCombat || combat !== currentCombat) return
  const candidates = collectPhaseEffects(owner, phase, ctx)
  for (const inst of candidates) {
    if (!currentCombat || combat !== currentCombat) break
    if (inst.usesLeft !== null && inst.usesLeft <= 0) continue
    if (inst.chance < 1 && combat.rng() >= inst.chance) continue
    if (inst.condition && !evalBattleCondition(inst.condition, ctx, owner)) continue
    const actCtx: any = {
      combat, job: ctx.job, self: owner,
      target: ctx.job ? combat.combatants.get(ctx.job.target) ?? owner : ctx.defender,
      effect: inst, pendingDamage: ctx.pendingDamage,
      overlay, canceledRef: ctx.canceledRef,
      blockedRef: ctx.blockedRef,
      channels: { self: channelBagOf(owner, overlay), target: channelBagOf(ctx.job ? combat.combatants.get(ctx.job.target) : ctx.defender) },
      skillLevel: ctx.skillLevel,
    }
    try {
      const handler = battleActions.get(inst.action)
      if (!handler) {
        errorReporter.reportDedup(`battle-action:${inst.action}`, {
          source: 'combat-base', severity: 'warning', message: `战斗动作 '${inst.action}' 未注册，跳过`,
        })
        continue
      }
      await handler(actCtx)
    } catch (err) {
      errorReporter.report({
        source: 'combat-base', severity: 'error',
        message: `战斗效果 '${inst.id}' (${inst.action}) 执行抛错：${err instanceof Error ? err.message : String(err)}`,
      })
    }
    if (ctx.canceledRef?.canceled) break
    if (inst.usesLeft !== null && inst.usesLeft > 0) {
      inst.usesLeft--
      if (inst.usesLeft <= 0) {
        const idx = owner.zone.indexOf(inst)
        if (idx >= 0) owner.zone.splice(idx, 1)
      }
    }
  }
}

// 收集相位候选：效果区 + 攻击方技能自带效果条目（min_level 过滤）+ when_skill 过滤
function collectPhaseEffects(owner: Combatant, phase: BattleTrigger, ctx: PhaseCtx): BattleEffectInst[] {
  const list: BattleEffectInst[] = owner.zone.filter(z => z.trigger === phase)
  // 技能 id 优先取作业，on_use 等行动前相位未建作业时回退 ctx.skillDef
  const skillId = ctx.job?.skillId ?? (ctx.skillDef as any)?.id ?? null
  // when_skill：条目只在施展该技能时参与（不改变 skill 字段原有的"反击用技能"语义）
  const applicable = skillId ? list : list.filter(z => !z.when_skill)
  const filtered = applicable.filter(z => !z.when_skill || z.when_skill === skillId)
  if (ctx.includeSkillEffects && skillId && ctx.attacker.entityId === owner.entityId) {
    const mod = modLoader.getMod()
    const def = mod?.abilities?.[skillId]
    const effects = def?.battle_effects as BattleEffectDef[] | undefined
    if (Array.isArray(effects)) {
      const level = getSkillLevel(owner.entityId, skillId)
      for (const rawEntry of effects) {
        if (!rawEntry) continue
        const r = resolveEffectRef(rawEntry, mod?.battleEffects)
        if (!r.ok) {
          errorReporter.reportDedup(`battle-ref:${skillId}:${JSON.stringify(rawEntry)}`, {
            source: 'combat-base', severity: 'error',
            message: `技能 '${skillId}' 的战斗效果引用无效：${r.error}`,
            suggestion: '检查 definitions/battle-effects.toml 的 [effects] 表',
          })
          continue
        }
        const e = r.entry
        if (e.at !== phase) continue
        if (typeof e.spec.minLevel === 'number' && level < e.spec.minLevel) continue
        const inst = makeInst({
          id: `${skillId}#${e.id}`,
          name: e.name,
          trigger: phase,
          action: e.action,
          chance: e.chance,
          value: e.spec.value,
          growth: e.spec.growth,
          target: e.target,
          duration: typeof e.spec.duration === 'object' ? e.spec.duration : 'battle',
          stack: e.spec.stacks,
          maxStack: e.spec.maxStack,
          priority: e.spec.priority,
          category: e.spec.category,
          condition: e.spec.condition,
          uses: e.spec.uses,
          stat: e.spec.stat,
          channel: e.spec.channel,
          skill: e.spec.skill,
          when_skill: e.spec.whenSkill,
          levelNames: e.spec.levelNames,
          maxPerAction: e.spec.maxPerAction,
          resolved: e,
          sourceId: owner.entityId,
        })
        filtered.push(inst)
      }
    }
  }
  // 反击链一层：反击产生的攻击，对方反击类效果（取消/反震/反击）不参与结算
  if (ctx.job?.isCounter && (phase === 'damage_on_target' || phase === 'damage_mitigate')) {
    return filtered.filter(z => z.action !== 'cancel' && z.action !== 'counter' && z.action !== 'reflect')
      .sort((a, b) => b.priority - a.priority)
  }
  return filtered.sort((a, b) => b.priority - a.priority)
}

// 战斗条件（内置字面量）
function evalBattleCondition(condition: string, ctx: PhaseCtx, owner: Combatant): boolean {
  const has = (who: Combatant, cat: 'buff' | 'debuff') => who.zone.some(z => z.category === cat)
  const target = ctx.job ? (ctx.combat.combatants.get(ctx.job.target) ?? owner) : ctx.defender
  switch (condition.trim()) {
    case 'target_has_debuff': return has(target, 'debuff')
    case 'target_has_buff': return has(target, 'buff')
    case 'self_has_debuff': return has(owner, 'debuff')
    case 'self_has_buff': return has(owner, 'buff')
    default:
      errorReporter.reportDedup(`battle-cond:${condition}`, {
        source: 'combat-base', severity: 'warning',
        message: `未识别的战斗条件 '${condition}'，按通过处理`,
        suggestion: '当前支持：target_has_debuff / target_has_buff / self_has_debuff / self_has_buff',
      })
      return true
  }
}

function zeroOverlay(): StatOverlay {
  return {
    hit_bonus: 0, dodge_bonus: 0, crit_rate: 0, crit_mul: 0,
    damage_out: 0, damage_in: 0, defense_mult: 0,
    channels: zeroChannelBag(),
  }
}

/** 覆盖型公式钩子调用（归一化 + null/undefined 回退默认值） */
async function runFormulaHook(
  hookName: string, ctx: any, fallback: number,
): Promise<{ value: number; parts: Record<string, number> }> {
  const raw = await callHookAsync(hookName, ctx)
  if (raw === null || raw === undefined) return { value: fallback, parts: {} }
  return normalizeFormulaResult(raw)
}

// ── 胜负与回写 ───────────────────────────────────────────────────────────

export async function checkBattleEnd(): Promise<boolean> {
  if (!currentCombat) return false
  const combat = currentCombat
  const enemyAlive = combat.enemies.some(id => {
    const c = combat.combatants.get(id)
    return c && c.hp > 0 && !c.dead
  })
  const allyAlive = combat.allies.some(id => {
    const c = combat.combatants.get(id)
    return c && c.hp > 0 && !c.dead
  })

  if (!allyAlive && !enemyAlive) {
    await endCombat('enemies', 'lose') // 同归于尽 → 判败
    return true
  }
  if (!enemyAlive) {
    await endCombat('allies', 'win')
    return true
  }
  if (!allyAlive) {
    await endCombat('enemies', 'lose')
    return true
  }
  return false
}

// 结束战斗：效果区全清不回写（本场限定）；hp/mp/permanent 吸收回写实体
async function endCombat(winner: string, outcome: string): Promise<void> {
  if (!currentCombat) return
  const combat = currentCombat
  const participants = combat.participants
  currentCombat = null

  for (const c of combat.combatants.values()) {
    await writeBackCombatant(c)
  }

  await gameContext.exitMode()
  await eventBus.emit('combat:end', { winner, outcome, participants })
  narrativeLog.write(`战斗结束（${outcome}）`, 'combat', 'combat-base')
}

async function writeBackCombatant(c: Combatant): Promise<void> {
  // hp/mp 回写（死亡=0 持久）
      try {
        if (bindingResolver.get(c.entityId, 'hp') !== null) {
          bindingResolver.set(c.entityId, 'hp', Math.max(0, c.hp))
        }
        if (bindingResolver.get(c.entityId, 'mp') !== null) {
          bindingResolver.set(c.entityId, 'mp', Math.max(0, Math.min(c.maxMp, c.mp)))
        }
      } catch (err) {
    errorReporter.reportDedup(`combat-writeback:${c.entityId}`, {
      source: 'combat-base', severity: 'warning',
      message: `战斗结束回写失败（${getCharName(c.entityId)}）：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查 bindings.toml 是否绑定了 hp/mp',
    })
  }
  // permanent 吸收（内力上限）：实体 mp_max 累加（负数 = 被吸收流失）
  if (c.absorbedMaxMp !== 0) {
    try {
      const cur = bindingResolver.get(c.entityId, 'mp_max')
      if (typeof cur === 'number') {
        bindingResolver.set(c.entityId, 'mp_max', Math.max(0, cur + c.absorbedMaxMp))
      } else {
        errorReporter.reportDedup(`combat-absorb:${c.entityId}`, {
          source: 'combat-base', severity: 'warning',
          message: `${getCharName(c.entityId)} 的永久吸收（+${c.absorbedMaxMp} 内力上限）无法回写：mp_max 未绑定`,
          suggestion: '在 bindings.toml 为 combat-base 绑定 mp_max（如 内力上限）',
        })
      }
    } catch (err) {
      errorReporter.report({
        source: 'combat-base', severity: 'warning',
        message: `永久吸收回写失败：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }
  await eventBus.emit('character:changed', { id: c.entityId })
}

// ── 钩子工具 ─────────────────────────────────────────────────────────────

function callHook(hookName: string, ctx: any): any {
  const handler = overrideHooks.get(hookName)
  if (!handler) {
    switch (hookName) {
      case 'initiative': return bindingResolver.get(ctx.sourceId, 'speed') ?? 0
      case 'hit_rate': return 100
      case 'base_damage': {
        const atk = bindingResolver.get(ctx.source.entityId, 'attack') ?? 10
        const def = bindingResolver.get(ctx.target.entityId, 'defense') ?? 0
        return Math.max(1, atk - def * 2)
      }
      case 'crit_rate': return 0
      case 'crit_mul': return 1.5
      case 'float_mul': return 0.9 + (ctx.combat?.rng ?? Math.random)() * 0.2
      case 'defense_value': return bindingResolver.get(ctx.target.entityId, 'defense') ?? 0
      case 'is_attack_skill': return typeof ctx.skill?.power === 'number'
    }
    return null
  }
  try {
    return handler(ctx)
  } catch (err) {
    errorReporter.report({
      source: 'combat-base', severity: 'warning',
      message: `钩子 '${hookName}' 抛错：${err instanceof Error ? err.message : String(err)}（已回退默认）`,
    })
    return null
  }
}

async function callHookAsync(hookName: string, ctx: any): Promise<any> {
  const handler = overrideHooks.get(hookName)
  if (!handler) return callHook(hookName, ctx)
  try {
    return await handler(ctx)
  } catch (err) {
    errorReporter.report({
      source: 'combat-base', severity: 'warning',
      message: `钩子 '${hookName}' 抛错：${err instanceof Error ? err.message : String(err)}（已回退默认）`,
    })
    return callHook(hookName, ctx)
  }
}

async function runChainHooks(hookName: string, ctx: any): Promise<void> {
  const list = hooks.get(hookName)
  if (!list) return
  for (const handler of list) {
    try {
      await handler(ctx)
    } catch (err) {
      errorReporter.report({
        source: 'combat-base', severity: 'warning',
        message: `combat hook '${hookName}' 抛错：${err instanceof Error ? err.message : String(err)}（异常已隔离）`,
      })
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function firstAliveEnemy(): string | null {
  if (!currentCombat) return null
  for (const id of currentCombat.enemies) {
    const c = currentCombat.combatants.get(id)
    if (c && c.hp > 0) return id
  }
  return null
}

function getCharName(charId: string): string {
  const char = entitySystem.get('character', charId) as any
  return char?.name ?? charId
}