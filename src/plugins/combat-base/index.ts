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
export type CombatStatKey =
  | 'hit_bonus' | 'dodge_bonus' | 'crit_rate' | 'crit_mul'
  | 'damage_out' | 'damage_in' | 'defense_mult'

export interface CombatStats {
  hit_bonus: number      // 命中%点
  dodge_bonus: number    // 闪避%点（对方）
  crit_rate: number      // 暴击%点
  crit_mul: number       // 暴击倍率加成（加法）
  damage_out: number     // 伤害输出加成（加法倍率）
  damage_in: number      // 减伤/易伤（加法倍率，护体=-0.3）
  defense_mult: number   // 防御加减（加法倍率，破甲=-0.3）
}

export interface BattleEffectInst {
  id: string
  name?: string
  trigger?: BattleTrigger
  action: string
  chance: number
  value: any
  target: 'self' | 'enemy'
  duration: 'battle' | 'permanent' | { turns: number }
  remainingTurns: number
  stack: number
  maxStack: number
  priority: number
  category: 'buff' | 'debuff' | 'neutral'
  condition?: string
  recursive: boolean
  usesLeft: number | null   // null=无限
  uses?: number             // 定义输入：触发次数（makeInst 时转换到 usesLeft）
  stat?: CombatStatKey
  mode?: 'percent' | 'flat' | 'set'
  skill?: string
  /** modify_channel 用：通道名（语义由注册通道的插件解释，base 只当不透明字符串） */
  channel?: string
  /** 只在施展该技能（技能 id）时参与—攻击/伤害类相位与 action_pre 判定用 */
  when_skill?: string
  /** apply_status 用：要挂的状态 id（battle-effects 条目名） */
  status?: string
  /** apply_status 用：重复挂同一状态时的合并策略（默认 refresh = 现有语义） */
  merge?: 'refresh' | 'strongest' | 'stack'
  /** 同组合并键（缺省 = 状态 id）：毒 的 毒/猛毒/剧毒 共用 "毒"，保证一个目标只有一份毒 */
  merge_group?: string
  /** 毒等自定义状态用：等级（语义由状态定义的动作解释） */
  k?: number
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

// 测试用：模块级状态重置（hooks/动作表/当前战斗/通道注册表/公式明细）
export function __resetCombatModule(): void {
  hooks.clear()
  overrideHooks.clear()
  battleActions.clear()
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
  // modify_stat：常驻/瞬态统计修正（无 trigger = 常驻；有 trigger = 该相位临时叠加）
  registerBattleAction('modify_stat', (actCtx: any) => {
    const inst = actCtx.effect
    if (!inst.stat) return
    if (inst.trigger && actCtx.overlay) {
      accumulateStat(actCtx.overlay, inst.stat, inst.mode ?? 'flat', inst.value * Math.max(1, inst.stack))
    }
    // 常驻型（无 trigger）由 recalcStats 统一聚合
  })

  // modify_channel：公式中间量通道修正（无 trigger = 常驻；有 trigger = 该相位临时叠加）
  // 通道名是不透明字符串（语义由注册它的插件解释，如 combat-wuxia 的 风格系数/命中率/防御）
  registerBattleAction('modify_channel', (actCtx: any) => {
    const inst = actCtx.effect
    if (!inst.channel) return
    const mode = inst.mode ?? 'flat'
    const value = (typeof inst.value === 'number' ? inst.value : 0) * Math.max(1, inst.stack)
    if (inst.trigger && actCtx.overlay) {
      accumulateChannel(actCtx.overlay.channels, inst.channel, mode, value)
    }
    // 常驻型（无 trigger）由 recalcStats 统一聚合
  })

  // apply_status：「挂状态」类别——把 battle-effects 里的状态条目挂到目标身上（BUFF/DEBUFF 通用）
  // 生命周期优先级：词条 turns/duration > 状态定义的 duration > 类别默认（5 回合，含本回合）
  // 重复挂同一状态：merge（词条）> 状态定义 merge > 默认 refresh（刷新回合数）
  // 注：本动作不感知"毒"等具体语义——毒由 combat-wuxia 的 apply_poison 算完 M 后调用同一 helper
  registerBattleAction('apply_status', async (actCtx: any) => {
    const inst = actCtx.effect
    const statusId = inst.status ?? (typeof inst.value === 'object' && inst.value ? inst.value.status : undefined)
    if (!statusId) return
    const targetCombatant = inst.target === 'self' ? actCtx.self : actCtx.target
    if (!targetCombatant) return
    await applyStatusTo(actCtx.combat, targetCombatant, statusId, {
      sourceId: actCtx.self.entityId,
      value: typeof inst.value === 'object' && inst.value ? { ...inst.value } : inst.value,
      turns: typeof inst.turns === 'number' ? inst.turns : undefined,
      merge: inst.merge,
    })
  })

  // action_block：禁止本次行动（action_pre 相位用；如定身/封穴禁止出招）
  // 玩家侧被禁 → 本次行动被拒（回 IDLE 可改选其他行动）；NPC 侧被禁 → 本回合不出手
  registerBattleAction('action_block', (actCtx: any) => {
    if (actCtx.blockedRef) actCtx.blockedRef.blocked = true
    const reason = typeof actCtx.effect?.value === 'string' ? `（${actCtx.effect.value}）` : ''
    narrativeLog.write(`${getCharName(actCtx.self.entityId)} 无法行动${reason}！`, 'combat', 'combat-base')
  })

  // periodic_damage：回合初/相位点扣血（按 stack 缩放）
  registerBattleAction('periodic_damage', async (actCtx: any) => {
    const inst = actCtx.effect
    const dmg = Math.max(1, Math.ceil((typeof inst.value === 'number' ? inst.value : 0) * Math.max(1, inst.stack)))
    await applyDamageTo(actCtx.combat, actCtx.self, dmg, {
      source: inst.sourceId, kind: 'periodic',
    })
  })

  // leech_hp / leech_mp / mp_drain / leech_mp_max：命中后吸收（数值平量 × stack）
  registerBattleAction('leech_hp', (actCtx: any) => {
    const inst = actCtx.effect
    const amount = Math.max(0, Math.round((typeof inst.value === 'number' ? inst.value : 0) * Math.max(1, inst.stack)))
    const self = actCtx.self, target = actCtx.target
    if (!target || target.dead) return
    const actual = Math.min(amount, target.hp)
    target.hp = Math.max(0, target.hp - actual)
    self.hp = Math.min(self.maxHp, self.hp + actual)
    narrativeLog.write(`${getCharName(self.entityId)} 吸收了 ${actual} 点气血`, 'combat', 'combat-base')
  })

  registerBattleAction('leech_mp', (actCtx: any) => {
    const inst = actCtx.effect
    const amount = Math.max(0, Math.round((typeof inst.value === 'number' ? inst.value : 0) * Math.max(1, inst.stack)))
    const self = actCtx.self, target = actCtx.target
    if (!target || target.dead) return
    const actual = Math.min(amount, target.mp)
    target.mp = Math.max(0, target.mp - actual)
    self.mp = Math.min(self.maxMp, self.mp + actual)
    narrativeLog.write(`${getCharName(self.entityId)} 吸收了 ${actual} 点内力`, 'combat', 'combat-base')
  })

  registerBattleAction('leech_mp_max', (actCtx: any) => {
    const inst = actCtx.effect
    const amount = Math.max(0, Math.round((typeof inst.value === 'number' ? inst.value : 0) * Math.max(1, inst.stack)))
    const self = actCtx.self, target = actCtx.target
    if (!target || target.dead) return
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
    const inst = actCtx.effect
    const amount = Math.max(0, Math.round((typeof inst.value === 'number' ? inst.value : 0) * Math.max(1, inst.stack)))
    const target = actCtx.target
    if (!target || target.dead) return
    target.mp = Math.max(0, target.mp - amount)
  })

  // reflect：反震 y% 输出伤害（扣防前；受反震方自己的减伤影响）
  registerBattleAction('reflect', async (actCtx: any) => {
    const job = actCtx.job
    const inst = actCtx.effect
    if (!job) return
    const pct = typeof inst.value === 'number' ? inst.value : 0
    const raw = Math.round(actCtx.pendingDamage * pct)
    const attacker = actCtx.combat.combatants.get(job.source)
    if (!attacker) return
    const reduced = Math.max(0, Math.round(raw * (1 - clamp(attacker.stats.damage_in, -0.9, 0.9))))
    narrativeLog.write(`${getCharName(actCtx.self.entityId)} 反震出 ${reduced} 点伤害！`, 'combat', 'combat-base')
    await applyDamageTo(actCtx.combat, attacker, reduced, { source: actCtx.self.entityId, kind: 'reflect' })
  })

  // counter：反击（spawn 反击作业——反击链一层：反击作业本身跳过对方反击类效果）
  registerBattleAction('counter', (actCtx: any) => {
    const job = actCtx.job
    const inst = actCtx.effect
    if (!job || job.isCounter) return
    const skillId = inst.skill ?? ((typeof inst.value === 'object' && inst.value?.skill) || null)
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
    const skillId = inst.skill ?? ((typeof inst.value === 'object' && inst.value?.skill) || null)
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

  // apply_effect：引效果定义库条目施加（破甲/减闪避/毒/蓄势等）
  registerBattleAction('apply_effect', async (actCtx: any) => {
    const inst = actCtx.effect
    const ref = typeof inst.value === 'object' && inst.value ? inst.value as Record<string, any> : null
    const effectId = (ref?.effect ?? inst.value ?? inst.id) as string
    const mod = modLoader.getMod()
    const def = mod?.battleEffects?.[effectId]
    if (!def) {
      errorReporter.reportDedup(`battle-effect:${effectId}`, {
        source: 'combat-base',
        severity: 'warning',
        message: `战斗效果 '${effectId}' 未在 battle-effects.toml 定义，跳过`,
        suggestion: '检查 definitions/battle-effects.toml（插件默认层亦可）是否定义了该效果',
      })
      return
    }
    const targetCombatant = inst.target === 'self' ? actCtx.self : actCtx.target
    if (!targetCombatant) return
    const overrideValue = typeof ref?.value === 'number' ? ref.value : undefined
    const overDur = ref?.duration
    await applyEffectTo(actCtx.combat, targetCombatant, def, {
      sourceId: actCtx.self.entityId,
      valueOverride: overrideValue,
      durationOverride: overDur,
      // 实例 id 用库条目 id（叠层/触发一次即消/条件判定都按此 id 识别）
      id: effectId,
    })
  })
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
          effects: c.zone.map(z => ({ id: z.id, stack: z.stack, remainingTurns: z.remainingTurns, category: z.category })),
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
    /** 挂状态（「挂状态」类别）：插件自定义动作（如毒）算完 payload 后调它统一挂/刷新 */
    applyStatus: async (entityId: string, statusId: string, opts?: any): Promise<any> => {
      if (!currentCombat) return null
      const c = currentCombat.combatants.get(entityId)
      if (!c) return null
      return applyStatusTo(currentCombat, c, statusId, {
        sourceId: opts?.sourceId ?? entityId,
        value: opts?.value,
        turns: opts?.turns,
        merge: opts?.merge,
      })
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

// 聚合常驻修正（效果区无 trigger 的 modify_stat / modify_channel 条目 × stack）
function recalcStats(c: Combatant): void {
  const s = zeroStats()
  const bag = zeroChannelBag()
  for (const inst of c.zone) {
    if (inst.trigger) continue
    if (inst.action === 'modify_stat' && inst.stat && inst.mode !== 'set') {
      accumulateStat(s, inst.stat, inst.mode ?? 'flat', inst.value * Math.max(1, inst.stack))
    } else if (inst.action === 'modify_channel' && inst.channel) {
      accumulateChannel(bag, inst.channel, inst.mode ?? 'flat', inst.value * Math.max(1, inst.stack))
    }
  }
  c.stats = s
  c.channels = bag
}

function accumulateStat(target: CombatStats | StatOverlay, stat: CombatStatKey, mode: 'percent' | 'flat', value: number): void {
  const pctMode = mode === 'percent'
  switch (stat) {
    case 'hit_bonus':
    case 'dodge_bonus':
    case 'crit_rate':
      // 点数制：flat → 原值（%点）；percent → ×100
      target[stat] += pctMode ? value * 100 : value
      break
    case 'crit_mul':
    case 'damage_out':
    case 'damage_in':
    case 'defense_mult':
      // 倍率制：percent → 原值（0.3=30%）；flat → /100
      target[stat] += pctMode ? value : value / 100
      break
  }
}

// 构建效果实例
function makeInst(raw: Partial<BattleEffectInst> & { id: string; action: string }): BattleEffectInst {
  const durNorm = normalizeDuration(raw.duration ?? 'battle')
  // 「挂状态」类条目（声明了 status）默认「攻击命中后挂给敌人」——作者可省略 trigger/target
  // （自增益类请显式写 trigger = "on_use" / target = "self"；其它类别保持原语义：无 trigger = 常驻修正条目）
  const isStatusApply = (raw as any).status !== undefined
  const trigger = raw.trigger ?? (isStatusApply ? 'on_hit' : undefined)
  const target = raw.target ?? (isStatusApply ? 'enemy' : 'self')
  return {
    id: raw.id,
    name: raw.name,
    trigger: trigger as BattleTrigger | undefined,
    action: raw.action,
    chance: raw.chance ?? 1,
    value: raw.value ?? 0,
    target,
    duration: durNorm,
    remainingTurns: typeof durNorm === 'object' ? durNorm.turns : 0,
    // 注意：定义层的 stack 是叠层策略字符串（refresh/increment/clamp），不是数值——
    // 数值层数在 makeInst/applyEffectTo 中固定为 1（策略在 applyEffectTo 消费）
    stack: typeof raw.stack === 'number' && Number.isFinite(raw.stack) ? raw.stack : 1,
    maxStack: typeof raw.maxStack === 'number' && Number.isFinite(raw.maxStack)
      ? raw.maxStack
      : (typeof (raw as any).max_stack === 'number' && Number.isFinite((raw as any).max_stack) ? (raw as any).max_stack : 99),
    priority: raw.priority ?? 0,
    category: raw.category ?? 'neutral',
    condition: raw.condition,
    recursive: raw.recursive ?? false,
    usesLeft: typeof raw.uses === 'number' ? raw.uses : null,
    stat: raw.stat as CombatStatKey,
    mode: raw.mode,
    skill: raw.skill,
    channel: raw.channel,
    when_skill: (raw as any).when_skill,
    status: (raw as any).status,
    merge: (raw as any).merge,
    merge_group: (raw as any).merge_group,
    k: (raw as any).k,
    sourceId: raw.sourceId ?? '',
  }
}

function normalizeDuration(d: any): 'battle' | 'permanent' | { turns: number } {
  if (d === 'battle' || d === 'permanent') return d
  if (typeof d === 'number') return { turns: Math.max(1, Math.round(d)) }
  if (d && typeof d === 'object' && typeof d.turns === 'number') return { turns: Math.max(1, Math.round(d.turns)) }
  return 'battle'
}

// 施加效果（引用库定义 / 技能效果条目）
export async function applyEffectTo(
  combat: CombatScene,
  combatant: Combatant,
  def: BattleEffectDef,
  opts: { sourceId: string; valueOverride?: number; durationOverride?: any; id?: string },
): Promise<void> {
  void combat
  const inst = makeInst({
    ...def,
    id: opts.id ?? (def as any).id ?? (def as any).name ?? 'effect',
    value: opts.valueOverride ?? def.value ?? 0,
    duration: opts.durationOverride ?? def.duration ?? 'battle',
    sourceId: opts.sourceId,
  } as any)
  // 同 id 叠层策略
  const existing = combatant.zone.find(z => z.id === inst.id)
  const stackMode = def.stack ?? 'refresh'
  if (existing) {
    if (stackMode === 'clamp') return
    if (stackMode === 'increment') {
      existing.stack = Math.min(existing.maxStack, existing.stack + 1)
      if (typeof inst.duration === 'object') existing.remainingTurns = inst.duration.turns
    } else { // refresh
      existing.stack = 1
      if (typeof inst.duration === 'object') existing.remainingTurns = inst.duration.turns
    }
    recalcStats(combatant)
    return
  }
  combatant.zone.push(inst)
  recalcStats(combatant)
}

// ── 挂状态（apply_status 类别的公共实现）────────────────────────────────
// 「挂状态」= 技能/效果条目在命中或某相位把 battle-effects 里的一个**状态**挂到目标身上：
//   · 生命周期：词条 turns > 状态定义 duration > 类别默认 5 回合（含本回合，`{turns:5}`）
//   · 实例合并组：状态定义的 merge_group（缺省 = 状态 id）——毒 的 毒/猛毒/剧毒 三条定义共用
//     组 "毒"，因此一个目标身上永远只有**一份**毒（对外显示名随最强那一级）
//   · 合并策略：merge（词条）> 状态定义 merge > 默认 refresh（刷新回合数，不叠层）
//     - refresh   ：同 id 刷新回合数（现有语义）
//     - strongest ：k 取高、value 内数值取大、回合重置；新 k ≥ 旧 k 时连显示名一起升级
//     - stack     ：走既有叠层语义（stack+1，受 max_stack 限制）
// 返回挂上/刷新后的实例。
export async function applyStatusTo(
  combat: CombatScene,
  combatant: Combatant,
  statusId: string,
  opts: { sourceId: string; value?: any; turns?: number; merge?: BattleEffectInst['merge'] },
): Promise<BattleEffectInst | null> {
  if (!currentCombat || combat !== currentCombat) return null
  const def = modLoader.getMod()?.battleEffects?.[statusId] as BattleEffectDef | undefined
  if (!def) {
    errorReporter.reportDedup(`battle-status:${statusId}`, {
      source: 'combat-base', severity: 'warning',
      message: `状态 '${statusId}' 未在 battle-effects.toml 定义，挂状态被跳过`,
      suggestion: '检查该状态的来源条目里的 status 名，或在 battle-effects.toml 补定义',
    })
    return null
  }
  const 状态定义回合数 = typeof def.duration === 'object' && typeof (def.duration as any)?.turns === 'number'
    ? (def.duration as any).turns as number
    : undefined
  // 类别默认 5 回合（含本回合）——仅"挂状态"类别适用，不影响其它 effects 的整场缺省
  const 回合数 = (typeof opts.turns === 'number' ? opts.turns : undefined) ?? 状态定义回合数 ?? 5
  const merge = opts.merge ?? (def as any).merge ?? 'refresh'
  const group = (def as any).merge_group ?? statusId
  const 新k = typeof (def as any).k === 'number' ? (def as any).k as number : undefined

  const existing = combatant.zone.find(z => ((z as any).merge_group ?? z.id) === group)
  if (existing) {
    if (merge === 'stack') {
      existing.stack = Math.min(existing.maxStack, existing.stack + 1)
      existing.remainingTurns = 回合数
      existing.duration = { turns: 回合数 }
      recalcStats(combatant)
      return existing
    }
    if (merge === 'strongest') {
      const 旧k = typeof existing.k === 'number' ? existing.k : 0
      existing.value = mergeStrongestValue(existing.value, opts.value)
      existing.remainingTurns = 回合数
      existing.duration = { turns: 回合数 }
      // 升级：更强的那一级接管显示名（更弱的一击只刷新 M/回合数，不降级）
      if (新k !== undefined && 新k >= 旧k) {
        existing.id = statusId
        existing.name = (def as any).name
        existing.k = 新k
      }
      recalcStats(combatant)
      return existing
    }
    // refresh（默认）
    existing.stack = 1
    if (opts.value !== undefined) existing.value = opts.value
    existing.remainingTurns = 回合数
    existing.duration = { turns: 回合数 }
    recalcStats(combatant)
    return existing
  }

  const inst = makeInst({
    ...def,
    id: statusId,
    value: opts.value ?? (def as any).value ?? 0,
    duration: { turns: 回合数 },
    merge: merge as any,
    merge_group: group,
    sourceId: opts.sourceId,
  } as any)
  combatant.zone.push(inst)
  recalcStats(combatant)
  narrativeLog.write(`${getCharName(combatant.entityId)} 被挂上【${(def as any).name ?? statusId}】（${回合数} 回合）`, 'combat', 'combat-base')
  return inst
}

/** merge='strongest'：数值字段取较大者（对象递归；非数值取新值） */
function mergeStrongestValue(oldValue: any, newValue: any): any {
  if (typeof newValue === 'number' && typeof oldValue === 'number') return Math.max(oldValue, newValue)
  if (newValue && typeof newValue === 'object' && !Array.isArray(newValue)) {
    const out: Record<string, any> = { ...(oldValue && typeof oldValue === 'object' ? oldValue : {}) }
    for (const [k, v] of Object.entries(newValue)) {
      out[k] = mergeStrongestValue(out[k], v)
    }
    return out
  }
  return newValue
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
  tickDurations(actor)
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
  }
  combat.orderIndex++
  await nextTurn()
}

// 回合初 duration 扣减（相位结算后）
function tickDurations(c: Combatant): void {
  let changed = false
  for (let i = c.zone.length - 1; i >= 0; i--) {
    const inst = c.zone[i]
    if (typeof inst.duration === 'object') {
      inst.remainingTurns--
      if (inst.remainingTurns <= 0) {
        c.zone.splice(i, 1)
        changed = true
      }
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
  // 注意在扣消耗之前——被禁则内力不扣、行动作废（玩家回 IDLE 可改选其他行动）
  const blockedRef = { blocked: false }
  combat.actionOverlay = zeroOverlay()
  combat.actionOverlayOwner = actorId
  await runPhaseWithOverlay(combat, 'action_pre', actor, makePhaseCtx(combat, null, actor, combat.combatants.get(targetId) ?? actor, {
    skillDef, skillLevel, blockedRef,
  }), combat.actionOverlay)
  if (!currentCombat) return
  if (blockedRef.blocked) return

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
  pending = Math.max(0, Math.round(pending * (1 - clamp(dmgInReduction, -0.9, 0.9))))
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
  if (final > 0) {
    await applyDamageTo(combat, defender, final, { source: job.source, kind: 'hit' })
  }
  if (!currentCombat || combat !== currentCombat) return { damage: final, crit: isCrit }
  if (defender.dead || defender.hp <= 0) {
    narrativeLog.write(`${getCharName(defender.entityId)} 倒下了！`, 'combat', 'combat-base')
  } else {
    await runPhaseStats(combat, 'damage_taken', defender, { ...baseCtx, pendingDamage: final })
  }
  // 出手结束（命中路径）
  await runPhase(combat, 'attack_end', attacker, baseCtx)
  return { damage: final, crit: isCrit }
}

// 扣血 + 死亡处理（检查点：死亡相位 → 复活 → 胜负检查由调用方）
export async function applyDamageTo(
  combat: CombatScene,
  target: Combatant,
  damage: number,
  opts: { source: string; kind: 'hit' | 'periodic' | 'reflect' | 'external'; triggerTakenPhase?: boolean },
): Promise<void> {
  void opts
  if (damage <= 0 || target.dead) return
  const prev = target.hp
  target.hp = Math.max(0, target.hp - Math.round(damage))
  narrativeLog.write(`${getCharName(target.entityId)} 受到 ${Math.round(damage)} 点伤害（HP: ${prev}→${target.hp}）`, 'combat', 'combat-base')
  if (target.hp <= 0 && !target.dead) {
    target.dead = true
    // 死亡相位（神照经等复活，优先于一切）
    await runPhase(combat, 'death', target, makePhaseCtx(combat, null, target, target))
    if (target.dead) {
      narrativeLog.write(`${getCharName(target.entityId)} 力竭倒地。`, 'combat', 'combat-base')
    }
  }
  // 受伤害后相位（v1.2：周期伤害/毒等"简化流程"的伤害也可声明触发——受伤害后效果照常生效）
  if (opts.triggerTakenPhase && currentCombat === combat && !target.dead) {
    await runPhase(combat, 'damage_taken', target, makePhaseCtx(combat, null, target, target, { pendingDamage: Math.round(damage) }))
  }
  // 串行 await：避免多发 character:changed 在异步分发中互相 same-tick 覆盖
  await eventBus.emit('character:changed', { id: target.entityId })
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
    const effects = def?.effects as BattleEffectDef[] | undefined
    if (Array.isArray(effects)) {
      const level = getSkillLevel(owner.entityId, skillId)
      for (const e of effects) {
        if (!e) continue
        // 「挂状态」类条目（声明了 status）默认攻击命中后触发——与 makeInst 的默认保持一致
        const trig = (e as any).trigger ?? ((e as any).status !== undefined ? 'on_hit' : undefined)
        if (trig !== phase) continue
        if (typeof e.min_level === 'number' && level < e.min_level) continue
        filtered.push(makeInst({ ...e, trigger: trig, id: `${skillId}#${e.action}`, sourceId: owner.entityId } as any))
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