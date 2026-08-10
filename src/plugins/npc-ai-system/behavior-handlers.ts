// 注释：行为类型处理器注册表——"状态依赖计算"侧（缝切方案：固定常量在 TOML，
// 计算在处理器）。本次注册 8 种日常类型；H 期在同一个注册表扩展 h_* 类型。
// erArk 对应物：StateMachine/default.py 的状态函数（只保留 NPC 日常部分）

import { apiSystem } from '../../core/api'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import type { BehaviorBlock, BehaviorSpec, WorkTypeDef, EntertainmentTypeDef } from './types'

export interface HandlerContext {
  charId: string
  char: any
  /** 行为规格（ai-behaviors.toml）——处理器可读取 duration/on_complete_effects 等 */
  spec: BehaviorSpec
  /** 目标携带的参数（target.behavior.params） */
  params: Record<string, any>
  /** 行为开始时刻（游戏总分钟数）——erArk：新行为从旧行为结束时刻开始（start_time = end_time） */
  start_time: number
  /** 当前时刻（游戏总分钟数，决策上下文） */
  now: number
}

export type BehaviorHandler = (ctx: HandlerContext) => BehaviorBlock | Promise<BehaviorBlock>

const handlers = new Map<string, BehaviorHandler>()

// 注释：注册行为类型处理器（插件可注册——H 期扩展 h_* 类型）
export function registerBehaviorHandler(type: string, handler: BehaviorHandler): void {
  if (handlers.has(type)) {
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `行为类型处理器 '${type}' 重复注册，后者覆盖`,
    })
  }
  handlers.set(type, handler)
}

export function getBehaviorHandler(type: string): BehaviorHandler | undefined {
  return handlers.get(type)
}

// ── 时长辅助 ──

// 注释：规格时长解析（fixed 或 min~max 随机；缺省 fallback）
// 下限 1 分钟（duration=0 的行为块 end=start ≤ now → 无限连锁——数据错误防御）
export function resolveDuration(spec: BehaviorSpec, fallback = 60): number {
  const d = spec?.duration
  if (!d) return fallback
  let result: number
  if (d.fixed !== undefined) {
    result = d.fixed
  } else if (d.min !== undefined && d.max !== undefined) {
    result = d.min + Math.floor(Math.random() * (d.max - d.min + 1))
  } else {
    result = fallback
  }
  return Math.max(1, result)
}

// 注释：距下一个指定小时（0-23）的分钟数——今天已过则明天（睡眠起床/时段结束用）
export function minutesUntilHour(hour: number): number {
  const time = gameContext.getContext().time
  let m = (hour - time.hour) * 60 - time.minute
  if (m <= 0) m += 24 * 60
  return m
}

// 注释：寻路（map-system findPath；未注册/失败 → null）
async function findPath(from: string, to: string): Promise<{ path: string[]; total_minutes: number } | null> {
  if (!apiSystem.has('map', 'findPath')) return null
  try {
    const result = await apiSystem.call('map', 'findPath', from, to)
    return result ?? null
  } catch {
    return null
  }
}

// ── 10 种日常处理器 ──

// wait——原地等待（erArk WAIT_5/10/30_MIN）
export async function waitHandler(ctx: HandlerContext): Promise<BehaviorBlock> {
  const duration = resolveDuration(ctx.spec, 10)
  return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration }
}

// stay——停留至指定时刻（时间规律 stay 目标用：params.until_hour）
export function stayHandler(ctx: HandlerContext): BehaviorBlock {
  let duration: number
  if (typeof ctx.params.until_hour === 'number') {
    duration = minutesUntilHour(ctx.params.until_hour)
    // 注释：防御——时段只剩 <5 分钟则待满 5 分钟（防 1 分钟行为抖动链；
    // 2026-08-10 排查修复：原实现顺延到"下一小时"会把 [20,23] 规则在 23:58 时
    // 延长到次日 01:00——越界 2 小时）
    if (duration < 5) duration = 5
  } else {
    duration = resolveDuration(ctx.spec, 60)
  }
  return {
    id: ctx.spec.type,
    type: 'stay',
    start_time: ctx.start_time,
    duration,
    target: ctx.params.to,
    params: { ...ctx.params },
  }
}

// ── 寻路失败去重报告（防静默失败 + 防刷屏）——同一 (NPC, 目的地) 只报一次
const reportedUnreachable = new Set<string>()
const UNREACHABLE_REPORT_LIMIT = 200

function reportUnreachable(charId: string, to: string): void {
  const key = `${charId}->${to}`
  if (reportedUnreachable.has(key)) return
  if (reportedUnreachable.size >= UNREACHABLE_REPORT_LIMIT) return
  reportedUnreachable.add(key)
  errorReporter.report({
    source: 'npc-ai-system',
    severity: 'warning',
    message: `NPC '${charId}' 无法到达目标地点 '${to}'（寻路失败）`,
    suggestion: '检查地图图数据（maps/graph/）与 parent 链是否连通该地点',
  })
}

export function clearUnreachableReport(): void {
  reportedUnreachable.clear()
}

// move——寻路移动（erArk general_movement_module：move_path + duration = move_time）
export async function moveHandler(ctx: HandlerContext): Promise<BehaviorBlock> {
  const to = ctx.params.to as string | undefined
  if (!to) {
    // 缺目标 → 等待 30 分钟（数据错误显式暴露）
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `move 行为缺少目标地点（目标 '${ctx.spec.type}'）`,
      suggestion: '目标 behavior.params.to 必须写地点 ID',
    })
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: 30 }
  }
  const from = ctx.char.current_location
  if (from === to) {
    return { id: ctx.spec.type, type: 'stay', start_time: ctx.start_time, duration: 30, target: to }
  }
  const path = await findPath(from, to)
  if (!path || path.total_minutes <= 0) {
    // 寻路失败（不可达/图缺失）→ 原地等待 30 分钟 + 去重上报（防静默失败）
    reportUnreachable(ctx.charId, to)
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: 30, target: to }
  }
  return {
    id: ctx.spec.type,
    type: 'move',
    start_time: ctx.start_time,
    duration: path.total_minutes,
    target: to,
    move_path: path.path,
    move_final_target: to,
  }
}

// rest——休息（固定 120 分钟，erArk REST）
export function restHandler(ctx: HandlerContext): BehaviorBlock {
  const duration = resolveDuration(ctx.spec, 120)
  return { id: ctx.spec.type, type: 'rest', start_time: ctx.start_time, duration }
}

// sleep——睡眠到起床时刻（erArk SLEEP：睡到固定时刻，默认 6:00）
// 最短 30 分钟（防抖动链；erArk 睡眠状态机有最短时长约束；2026-08-10 排查：
// 原 min 60 会让 5:30 的 30 分钟小睡被拉长到 60——改为 30）
export function sleepHandler(ctx: HandlerContext): BehaviorBlock {
  const wakeHour = typeof ctx.params.wake_hour === 'number' ? ctx.params.wake_hour : 6
  const duration = Math.max(30, minutesUntilHour(wakeHour))
  return { id: ctx.spec.type, type: 'sleep', start_time: ctx.start_time, duration }
}

// work——工作到班末（params.work_type；时长 = 当前时段结束 - now）
export function workHandler(ctx: HandlerContext): BehaviorBlock {
  const workType = ctx.params.work_type as string | undefined
  const mod = modLoader.getMod() as any
  const def: WorkTypeDef | undefined = workType ? mod?.aiWorkTypes?.[workType] : undefined
  if (!def) {
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `work 行为引用未定义的工种 '${workType}'`,
      suggestion: '检查 ai-work.toml 是否定义了该工种',
    })
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: 30 }
  }
  const hour = gameContext.getContext().time.hour
  const slot = def.time_slots.find(s => hour >= s[0] && hour < s[1])
  const duration = slot ? minutesUntilHour(slot[1]) : resolveDuration(ctx.spec, 60)
  return {
    id: ctx.spec.type,
    type: 'work',
    start_time: ctx.start_time,
    duration,
    target: def.place,
    params: { work_type: workType },
  }
}

// entertainment——娱乐到时段末（params.entertainment_type；erArk 时段 9-12/14-18/19-22）
export function entertainmentHandler(ctx: HandlerContext): BehaviorBlock {
  const entType = ctx.params.entertainment_type as string | undefined
  const mod = modLoader.getMod() as any
  const def: EntertainmentTypeDef | undefined = entType ? mod?.aiEntertainmentTypes?.[entType] : undefined
  if (!def) {
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `entertainment 行为引用未定义的娱乐类型 '${entType}'`,
      suggestion: '检查 ai-entertainment.toml 是否定义了该类型',
    })
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: 30 }
  }
  const endHour = def.period === 'morning' ? 12 : def.period === 'afternoon' ? 18 : 22
  const duration = minutesUntilHour(endHour)
  return {
    id: ctx.spec.type,
    type: 'entertainment',
    start_time: ctx.start_time,
    duration,
    target: def.place,
    params: { entertainment_type: entType },
  }
}

// socialize——社交（params.to = 角色 ID）：目标角色同地 → 停留；不同地 → 前往其所在地
export async function socializeHandler(ctx: HandlerContext): Promise<BehaviorBlock> {
  const targetCharId = ctx.params.to as string | undefined
  const targetChar = targetCharId ? (entitySystem.get('character', targetCharId) as any) : null
  if (!targetChar) {
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `socialize 行为引用不存在的角色 '${targetCharId}'`,
      suggestion: '目标 behavior.params.to 必须写角色 ID',
    })
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: 30 }
  }
  const targetLoc = targetChar.current_location
  const from = ctx.char.current_location
  if (!targetLoc || targetLoc === from) {
    // 同地（或目标角色无位置）→ 停留
    return {
      id: ctx.spec.type,
      type: 'stay',
      start_time: ctx.start_time,
      duration: resolveDuration(ctx.spec, 60),
      target: targetCharId,
      params: { to: targetCharId },
    }
  }
  // 不同地 → 前往目标角色所在地
  const path = await findPath(from, targetLoc)
  if (!path || path.total_minutes <= 0) {
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: 30 }
  }
  return {
    id: ctx.spec.type,
    type: 'move',
    start_time: ctx.start_time,
    duration: path.total_minutes,
    target: targetLoc,
    move_path: path.path,
    move_final_target: targetLoc,
    params: { to: targetCharId },
  }
}

// wander——闲逛（home_locations 加权随机；无 home_locations → 原地等待）
export async function wanderHandler(ctx: HandlerContext): Promise<BehaviorBlock> {
  const home = ctx.char?.behavior?.home_locations as Record<string, number> | undefined
  if (!home || Object.keys(home).length === 0) {
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: resolveDuration(ctx.spec, 60) }
  }
  const entries = Object.entries(home).map(([locId, weight]) => ({ locId, weight: weight as number }))
  const total = entries.reduce((sum, e) => sum + Math.max(e.weight, 0), 0)
  if (total <= 0) {
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: resolveDuration(ctx.spec, 60) }
  }
  let roll = Math.random() * total
  let picked = entries[0].locId
  for (const e of entries) {
    roll -= Math.max(e.weight, 0)
    if (roll <= 0) {
      picked = e.locId
      break
    }
  }
  // 注释：activity 系数——activity 越低，闲逛时更倾向原地停留（老版本语义保留：
  // activity=0 的角色由 settle-pass 直接跳过，不走到这里）
  const activity = ctx.char?.behavior?.activity ?? 1
  const stayChance = 1 - Math.min(Math.max(activity, 0), 1)
  if (picked === ctx.char.current_location || Math.random() < stayChance) {
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: resolveDuration(ctx.spec, 60) }
  }
  return moveHandler({ ...ctx, params: { to: picked } })
}

// go_home——回家（home_locations 最高权重；erArk 对应物：睡眠/休息前回宿舍的目标前提链）
// 2026-08-10 排查补缺：默认夜间睡眠目标不含"先回家"环节，NPC 会在酒馆原地睡——
// home_locations 形同虚设；本处理器让夜晚不在家的 NPC 先回最高权重家再睡。
export async function goHomeHandler(ctx: HandlerContext): Promise<BehaviorBlock> {
  const home = ctx.char?.behavior?.home_locations as Record<string, number> | undefined
  if (!home || Object.keys(home).length === 0) {
    // 无家（防御——前提 AI_NOT_AT_HOME 已挡，不会走到这里）
    return { id: ctx.spec.type, type: 'wait', start_time: ctx.start_time, duration: 30 }
  }
  let best: string | null = null
  let bestWeight = -1
  for (const [locId, weight] of Object.entries(home)) {
    if ((weight as number) > bestWeight) {
      bestWeight = weight as number
      best = locId
    }
  }
  if (!best || best === ctx.char.current_location) {
    return { id: ctx.spec.type, type: 'stay', start_time: ctx.start_time, duration: 30, target: best ?? undefined }
  }
  return moveHandler({ ...ctx, params: { to: best } })
}

// ── 注册内建处理器（onLoad 调用）──
export function registerBuiltinHandlers(): void {
  registerBehaviorHandler('wait', waitHandler)
  registerBehaviorHandler('stay', stayHandler)
  registerBehaviorHandler('move', moveHandler)
  registerBehaviorHandler('rest', restHandler)
  registerBehaviorHandler('sleep', sleepHandler)
  registerBehaviorHandler('work', workHandler)
  registerBehaviorHandler('entertainment', entertainmentHandler)
  registerBehaviorHandler('socialize', socializeHandler)
  registerBehaviorHandler('wander', wanderHandler)
  registerBehaviorHandler('go_home', goHomeHandler)
}

// 注释：清空处理器（测试/重载用）
export function clearBehaviorHandlers(): void {
  handlers.clear()
}
