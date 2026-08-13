// 注释：core 通用随机事件机制（复刻 erArk Script/Design/event.py）
// 纯通用机制：不认识"行为/角色/世界观"——事件按任意字符串挂载键（behavior）分组，
// 角色专属用 adv 字段（任意字符串 id），语义由插件层（random-event-system）赋予。
// 候选筛选 = 挂载键桶 → adv 分桶（side）→ trigger_guard → 前提权重
// （前提返回值即权重求和，0 淘汰）→ condition 布尔门 → 加权随机
// （erArk random.choices 等价）。触发记录：全时 + 今日两个集合（今日每日重置）。

import { conditionEngine, premiseWeight } from './condition-engine'
import type { RandomEventDef } from './mod-loader'
import type { GameContext } from './types'
import { entitySystem } from './entity-system'
import { gameContext } from './game-context'
import { errorReporter } from './error-reporter'
import { weightedRandom } from '../utils/weighted-random'

// 注释：未知前提去重上报（npc-ai target-search reportOnce 同款）——strict 淘汰是
// "事件不触发"的显式暴露，但拼错前提 id 的 mod 作者需要知道为什么——全局去重报一次
const reportedUnknownPremises = new Set<string>()
// 注释：condition 求值失败去重上报（2026-08-13 审计——原 catch 静默）
const reportedConditionErrors = new Set<string>()

export interface EventTriggerContext {
  /** 触发者 id（玩家或 NPC） */
  subjectId: string
  /** interactant（交互对象），可为 null */
  targetId: string | null
  [key: string]: any
}

type Side = 'self' | 'target' | 'any' | 'both'

export class RandomEventEngine {
  private defs = new Map<string, RandomEventDef>()
  private byBehavior = new Map<string, RandomEventDef[]>()
  /** 全时触发记录 */
  private all = new Set<string>()
  /** 今日触发记录 */
  private today = new Set<string>()

  /** 幂等重建索引（插件 onLoad/onEnable 调用） */
  registerAll(defs: RandomEventDef[]): void {
    this.defs = new Map()
    this.byBehavior = new Map()
    for (const d of defs) {
      this.defs.set(d.id, d)
      const list = this.byBehavior.get(d.behavior) ?? []
      list.push(d)
      this.byBehavior.set(d.behavior, list)
    }
  }

  clear(): void {
    this.defs = new Map()
    this.byBehavior = new Map()
    this.all = new Set()
    this.today = new Set()
  }

  getDef(eventId: string): RandomEventDef | undefined {
    return this.defs.get(eventId)
  }

  /** 从行为桶中按权重随机选一个事件（子事件不参与） */
  pick(behaviorId: string, ctx: EventTriggerContext): RandomEventDef | null {
    const candidates = this.collect(behaviorId, ctx, (d) => d.option_son !== true)
    if (candidates.length === 0) return null
    return weightedRandom(candidates.map(c => ({ item: c.event, weight: c.weight })))
  }

  /** 收集父事件的子事件候选：同行为、option_son、子前提 ⊇ 父前提、其余过滤同 pick */
  getSonCandidates(behaviorId: string, father: RandomEventDef, ctx: EventTriggerContext): RandomEventDef[] {
    const fatherPremises = new Set((father.premises ?? []).map(p => p.toLowerCase()))
    return this.collect(behaviorId, ctx, (d) => {
      if (d.option_son !== true) return false
      const sonPremises = new Set((d.premises ?? []).map(p => p.toLowerCase()))
      for (const p of fatherPremises) {
        if (!sonPremises.has(p)) return false
      }
      return true
    }).map(c => c.event)
  }

  recordTriggered(eventId: string): void { this.all.add(eventId) }
  recordTodayTriggered(eventId: string): void { this.today.add(eventId) }
  isTriggered(eventId: string): boolean { return this.all.has(eventId) }
  isTodayTriggered(eventId: string): boolean { return this.today.has(eventId) }
  resetToday(): void { this.today.clear() }

  serialize(): { all: string[]; today: string[] } {
    return { all: [...this.all], today: [...this.today] }
  }

  restore(data?: { all: string[]; today: string[] }): void {
    this.all = new Set(data?.all ?? [])
    this.today = new Set(data?.today ?? [])
  }

  private collect(
    behaviorId: string,
    ctx: EventTriggerContext,
    extraFilter: (d: RandomEventDef) => boolean,
  ): { event: RandomEventDef; weight: number }[] {
    const list = this.byBehavior.get(behaviorId) ?? []
    const out: { event: RandomEventDef; weight: number }[] = []
    // 注释：未知前提检测用注册表快照（每 collect 一次，避免每个前提都拷贝列表）
    const registered = new Set(conditionEngine.getRegisteredPremiseIds())
    for (const d of list) {
      if (!extraFilter(d)) continue
      if (!this.matchAdv(d, ctx)) continue
      if (!this.matchGuard(d)) continue
      if (d.condition) {
        // 注释：运行时防御——condition 合法性已由插件层加载校验（validateEventData），
        // 此处防运行时不匹配的抛错中断整个事件系统：单事件条件异常 → 跳过该事件
        // （2026-08-13 审计：原 catch 静默——表达式错误/前提缺失时事件永不触发且无痕迹，补去重上报）
        try {
          if (!conditionEngine.evaluate(d.condition, this.condCtx(ctx))) continue
        } catch (err) {
          if (!reportedConditionErrors.has(d.id)) {
            reportedConditionErrors.add(d.id)
            errorReporter.report({
              source: 'random-event',
              severity: 'warning',
              message: `事件 '${d.id}' 的 condition 求值失败：${err instanceof Error ? err.message : String(err)}`,
              suggestion: '检查事件 condition 表达式（字段路径/前提拼写）',
            })
          }
          continue
        }
      }
      for (const p of d.premises ?? []) {
        if (!registered.has(p.toLowerCase())) {
          if (!reportedUnknownPremises.has(p.toLowerCase())) {
            reportedUnknownPremises.add(p.toLowerCase())
            errorReporter.report({
              source: 'random-event',
              severity: 'warning',
              message: `事件前提 '${p}' 未注册（前提拼写错误或未在任何插件 onLoad 注册）`,
              suggestion: '检查事件 premises 拼写；已注册前提见插件文档（可用：' + conditionEngine.getRegisteredPremiseIds().join(', ') + '）',
            })
          }
        }
      }
      // 注释：前提权重求和（erArk `now_weight += premise_judge`：返回值即权重，boolean 通过计 1；
      // 未知前提由注册表快照检查淘汰——数据错误显式暴露为"事件不触发"，不静默放行）；
      // NaN 权重防御（handler 异常返回值）
      const weight = this.sumPremisesWeight(d.premises ?? [], this.premiseCtx(ctx))
      if (!Number.isFinite(weight) || weight <= 0) continue
      out.push({ event: d, weight })
    }
    return out
  }

  private matchAdv(d: RandomEventDef, ctx: EventTriggerContext): boolean {
    if (!d.adv) return true
    const subjectMatch = ctx.subjectId === d.adv
    const targetMatch = ctx.targetId != null && ctx.targetId === d.adv
    switch ((d.side ?? 'any') as Side) {
      case 'self': return subjectMatch
      case 'target': return targetMatch
      case 'both': return subjectMatch && targetMatch
      case 'any': return subjectMatch || targetMatch
    }
  }

  private matchGuard(d: RandomEventDef): boolean {
    switch (d.trigger_guard) {
      case 'seen_once': return this.all.has(d.id)
      case 'unseen_once': return !this.all.has(d.id)
      case 'seen_today': return this.today.has(d.id)
      case 'unseen_today': return !this.today.has(d.id)
      default: return true
    }
  }

  private premiseCtx(ctx: EventTriggerContext): GameContext {
    return {
      ...gameContext.getContext(),
      selectedCharacterId: ctx.subjectId,
      sourceId: ctx.subjectId,
      targetCharacterId: ctx.targetId,
    } as GameContext
  }

  // 注释：前提权重求和（erArk search_target 语义：任一前提 <= 0 整事件淘汰，求和即权重）
  private sumPremisesWeight(premises: string[], ctx: GameContext): number {
    if (!premises || premises.length === 0) return 1
    let sum = 0
    for (const p of premises) {
      let value: boolean | number
      try {
        value = conditionEngine.getPremiseValue(p, ctx)
      } catch {
        return 0
      }
      if (premiseWeight(value) <= 0) return 0
      sum += premiseWeight(value)
    }
    return sum
  }

  private condCtx(ctx: EventTriggerContext): GameContext {
    return { ...gameContext.getContext(), selectedCharacterId: ctx.subjectId } as GameContext
  }
}

export const randomEventEngine = new RandomEventEngine()

// 注释：通用文本插值——{self.X}/{target.X}/{player.X}/{location.X} 从实体数据读取。
// 属性名由数据决定（core 不预设）；{变量}（talk-common 口上引用，无点号）由插件层处理。
export function interpolateEventText(text: string, subjectId: string, targetId: string | null): string {
  if (!text) return text
  const playerId = gameContext.getContext().player?.id ?? null
  const locId = gameContext.getContext().location?.id ?? null
  return text.replace(/\{([^.}]+)\.([^.}]+)\}/g, (match, obj, prop) => {
    let id: string | null = null
    if (obj === 'self') id = subjectId
    else if (obj === 'target') id = targetId
    else if (obj === 'player') id = playerId
    else if (obj === 'location') id = locId
    if (id == null) return match
    const entity = entitySystem.get('character', id) ?? entitySystem.get('location', id)
    if (!entity) return match
    const v = (entity as any)?.[prop]
    return v !== undefined ? String(v) : match
  })
}
