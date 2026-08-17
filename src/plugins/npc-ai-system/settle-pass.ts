// 注释：结算通道——game:time_advanced 后的 NPC 全量结算（erArk init_character_behavior 循环对应物）
// 每 pass：
//   1. 窗口自动结算（erArk character_aotu_change_value：行为窗口 ∩ 玩家窗口的时长——
//      疲劳/尿意/饥饿 + 休息恢复/睡眠积累）
//   2. 行为到期（start + duration ≤ now）→ 完成结算（on_complete_effects + move 到达）→
//      决策下一个（门控 → 排班 → 目标搜索）→ 连锁（新行为也到期则同轮继续，上限 MAX_CHAIN）
//   3. 叙事：仅玩家同地点（narrative.ts）
// 性能：全量同步结算（决策永远真实时刻上下文，无追算）；单轮超预算（100ms）时
// 剩余 NPC 排入后续轮次队列（玩家所在+相邻优先当轮）——分帧不产生上下文漂移。

import { eventBus } from '../../core/event-bus'
import { apiSystem } from '../../core/api'
import { gameContext, gameTimeToTotalMinutes } from '../../core/game-context'
import { getEntityAttr, setEntityAttr, ATTR } from '../../core/entity-utils'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { errorReporter } from '../../core/error-reporter'
import { settleTired, settleUrine, settleHunger, sleepPassSettle } from '../../core/realtime-settle'
import { isSkipped } from '../../core/skip-registry'
import { runPreChecks, isPinned } from './pre-check'
import { initBehaviorBlock, isBehaviorExpired, clampBehaviorStart, setBehaviorBlock, trueAddTime } from './behavior-block'
import { searchTarget } from './target-search'
import { getBehaviorHandler, type HandlerContext } from './behavior-handlers'
import { tryScheduleBehavior } from './schedule'
import { getBehaviorSpec, narrateBehaviorStart } from './narrative'
import type { BehaviorBlock } from './types'

// 注释：连锁上限（超长窗口 + 短行为链的防御性封顶——正常长窗口（如睡 12h）也会
// 链 10+ 次，属预期；封顶后强制等待 60 分钟，下一 pass 继续，不产生状态错误）
const MAX_CHAIN = 60
// 注释：单轮预算（毫秒）——超预算剩余 NPC 排后续轮
const PASS_BUDGET_MS = 100

// 注释：后续轮次待处理队列（上一 pass 超预算的剩余 NPC）
let pendingQueue: any[] = []

// 注释：玩家所在 + 直接相邻地点集合（优先当轮结算——玩家可见性最高）
// 注意：apiSystem.call 恒返回 Promise——必须 await（此前同步判 instanceof Promise
// 导致相邻地点永不加入，"相邻优先"静默失效——2026-08-10 排查修复）
async function nearbyLocations(): Promise<Set<string>> {
  const result = new Set<string>()
  const loc = gameContext.getContext().location
  if (!loc) return result
  result.add(loc.id)
  if (apiSystem.has('map', 'getReachable')) {
    try {
      const reachable = await apiSystem.call('map', 'getReachable', loc.id) as any
      if (Array.isArray(reachable)) {
        for (const r of reachable) result.add(r.target)
      }
    } catch {
      // map 未就绪 → 只含玩家所在
    }
  }
  return result
}

// 注释：NPC 窗口自动结算（erArk character_aotu_change_value——按行为类型分支）
function windowSettle(char: any, minutes: number, behaviorType: string): void {
  // 疲劳（erArk settle_tired：仅 SLEEP 跳过，REST 照常积累——NPC 侧 opts={} 同构）
  if (behaviorType !== 'sleep') {
    settleTired(char, minutes, {})
  }
  // 休息恢复（erArk settle_rest，realtime_settle.py:360-395）：
  //   hp_base = 体力上限×0.003+10；mp_base = 气力上限×0.006+20
  //   恢复 = base × 分钟 × adjust（休息室/宿舍 1.0，其他 0.3；武侠语境：
  //   "家" = home_locations 里的地点）
  if (behaviorType === 'rest') {
    restRecovery(char, minutes)
  }
  // 睡眠（erArk settle_sleep，:397-417）：疲劳 2 倍削减 + 熟睡值积累
  if (behaviorType === 'sleep') {
    sleepPassSettle(char, minutes)
  }
  // 尿意 / 饥饿（全角色，erArk :114-135）
  settleUrine(char, minutes)
  settleHunger(char, minutes)
}

// 注释：休息恢复（erArk settle_rest 公式——方舟设施等级/天赋修正为世界观专属，不搬）
function restRecovery(char: any, minutes: number): void {
  const home = char?.behavior?.home_locations as Record<string, number> | undefined
  const atHome = !!home && !!char?.current_location && home[char.current_location] !== undefined
  const adjust = atHome ? 1.0 : 0.3
  const hpMax = getEntityAttr(char, ATTR.HP_MAX)
  const hp = getEntityAttr(char, ATTR.HP)
  if (typeof hpMax === 'number' && hpMax > 0 && typeof hp === 'number') {
    const hpBase = hpMax * 0.003 + 10
    setEntityAttr(char, ATTR.HP, Math.min(hpMax, hp + Math.floor(hpBase * minutes * adjust)))
  }
  const mpMax = getEntityAttr(char, ATTR.MP_MAX)
  const mp = getEntityAttr(char, ATTR.MP)
  if (typeof mpMax === 'number' && mpMax > 0 && typeof mp === 'number') {
    const mpBase = mpMax * 0.006 + 20
    setEntityAttr(char, ATTR.MP, Math.min(mpMax, mp + Math.floor(mpBase * minutes * adjust)))
  }
}

// 注释：行为完成结算（erArk settle_behavior.handle_settle_behavior）
// move 到达先于效果（位置可能影响效果条件）
// 玩家不在场时：结算数值静默执行（_silent），且显式叙事输出（narrative_output）不执行——
// 远方的 NPC 行为不能被玩家看到（erArk show_info 同图检查同义；此前 _silent 只挡结算
// 摘要，narrative_output 会泄漏到日志——2026-08-10 排查修复）
async function settleCompletion(char: any, block: BehaviorBlock): Promise<void> {
  if (block.type === 'move' && block.move_final_target && char.current_location !== block.move_final_target) {
    const from = char.current_location
    char.current_location = block.move_final_target
    await eventBus.emit('npc:arrived', { character: char.id, from, to: block.move_final_target })
    eventBus.emit('character:changed', { id: char.id })
  }
  const spec = getBehaviorSpec(block.id)
  const effects = spec?.on_complete_effects
  if (effects && effects.length > 0) {
    const sameLocation = char.current_location === gameContext.getContext().location?.id
    const filtered = sameLocation
      ? effects
      : effects.filter(e => e?.type !== 'narrative_output')
    if (filtered.length > 0) {
      try {
        await apiSystem.call('effect-system', 'execute', filtered, {
          sourceId: char.id,
          _targetIds: [char.id],
          _silent: !sameLocation,
        })
      } catch (e) {
        errorReporter.report({
          source: 'npc-ai-system',
          severity: 'warning',
          message: `NPC '${char.id}' 行为 '${block.id}' 完成结算失败：${e instanceof Error ? e.message : String(e)}`,
        })
      }
    }
  }
}

// 注释：决策下一个行为——返回是否设定了新行为（false = 异常，等待下一 pass）
async function decideNext(char: any, now: number, oldEnd: number): Promise<boolean> {
  // 1. 前置门控（tired 标记 / 监禁 / 跟随接管）
  if (runPreChecks(char.id, char, now)) {
    // 注释：门控接管——行为 start 对齐旧行为结束（erArk start_time = end_time；
    // 门控内部以 now 起步，此处统一修正——保证窗口结算覆盖"间隙"）
    const block = char.ai_behavior as BehaviorBlock
    block.start_time = oldEnd
    // 注释：对外宣告（门控设了行为块——UI 状态同步；此前缺 announce 导致
    // 监禁/跟随等待的 NPC 状态陈旧——2026-08-10 排查修复）
    await announceBehavior(char, block)
    return true
  }
  // 2. 排班（time_rules / auto 工作 / 娱乐）
  const scheduled = await tryScheduleBehavior(char.id, char, now, oldEnd)
  if (scheduled) {
    setBehaviorBlock(char, scheduled)
    await announceBehavior(char, scheduled)
    return true
  }
  // 3. 目标搜索（前提权重 + 分层）
  const target = searchTarget(char.id, modLoader.getMod()?.aiTargets ?? [])
  if (!target) {
    // 无候选 → 延后重试（erArk start_time += 1 分钟语义：等待 (now - oldEnd) + 1 分钟，
    // 保证 end = now+1 > now，连锁终止，下一 pass 重试）
    setBehaviorBlock(char, {
      id: 'wait', type: 'wait', start_time: oldEnd,
      duration: Math.max(1, now - oldEnd) + 1,
    })
    return true
  }
  const spec = getBehaviorSpec(target.behavior.type)
  if (!spec) {
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `目标 '${target.id}' 引用未定义的行为规格 '${target.behavior.type}'`,
      suggestion: '检查 ai-behaviors.toml 是否定义了该规格',
    })
    setBehaviorBlock(char, { id: 'wait', type: 'wait', start_time: oldEnd, duration: 30 })
    return true
  }
  const handler = getBehaviorHandler(spec.type)
  if (!handler) {
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `行为规格 '${spec.type}' 未注册处理器`,
      suggestion: '检查行为类型是否注册（内置 9 种：wait/stay/move/rest/sleep/work/entertainment/socialize/wander）',
    })
    setBehaviorBlock(char, { id: 'wait', type: 'wait', start_time: oldEnd, duration: 30 })
    return true
  }
  const ctx: HandlerContext = {
    charId: char.id,
    char,
    spec,
    params: target.behavior.params ?? {},
    start_time: oldEnd,
    now,
  }
  try {
    const block = await handler(ctx)
    setBehaviorBlock(char, block)
    await announceBehavior(char, block)
    return true
  } catch (e) {
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `NPC '${char.id}' 决策行为失败：${e instanceof Error ? e.message : String(e)}`,
    })
    setBehaviorBlock(char, { id: 'wait', type: 'wait', start_time: oldEnd, duration: 30 })
    return true
  }
}

// 注释：行为开始对外宣告——npc:behavior_started 事件 + 同地叙事 + character:changed
async function announceBehavior(char: any, block: BehaviorBlock): Promise<void> {
  await eventBus.emit('npc:behavior_started', {
    character: char.id,
    behavior_id: block.id,
    type: block.type,
    duration: block.duration,
    target: block.target,
  })
  narrateBehaviorStart(char, block)
  eventBus.emit('character:changed', { id: char.id })
}

// 注释：单个 NPC 结算——erArk 循环体结构（character_behavior）：
// 每轮 = 窗口结算（当前行为块 ∩ now，get_true_add_time）→ 未到期则结束本轮；
// 到期则完成结算 + 决策下一个 → 下一轮（新块覆盖的"间隙"也在本轮结算——
// 决策链的每个行为窗口都按重叠段结算）
async function settleOne(char: any, now: number, playerId: string): Promise<void> {
  if (!char?.id || char.id === playerId) return
  if (isSkipped(char.id, char)) return
  initBehaviorBlock(char)

  // 注释：条件→获得 规则检查（gain-rule-system：对齐 erArk character_behavior gain_talent type=0——
  // 每个 NPC 每次行为结算后检查 auto 规则；增量模型，未结算角色不检查）。
  // apiSystem.has 守卫——gain-rule-system 未启用（未注册 API）时静默跳过
  if (apiSystem.has('gain-rule-system', 'checkAuto')) {
    try {
      await apiSystem.call('gain-rule-system', 'checkAuto', char.id, 'npc-settle')
    } catch (e) {
      errorReporter.report({
        source: 'npc-ai-system',
        severity: 'warning',
        message: `NPC '${char.id}' 规则检查失败：${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }

  let chain = 0
  while (chain < MAX_CHAIN) {
    // pin（wait_flag 语义）：玩家正在交互该角色 → 本轮完全不结算（含窗口/钳正——
    // 交互通常分钟级，避免交互期间属性/行为变化；erArk wait_flag 只停决策，此处
    // 更严格——行为块保持不动，交互结束后的 pass 自然补算）
    if (isPinned(char.id)) break

    // 注释：起始时刻钳正（erArk：start > now → start = now）——时间回拨防御
    clampBehaviorStart(char, now)

    // 窗口自动结算（行为窗口 ∩ 玩家窗口——erArk get_true_add_time）
    const addTime = trueAddTime(char, now)
    if (addTime > 0) {
      windowSettle(char, addTime, char.ai_behavior.type)
    }

    // 行为未到期 → 本轮结束
    if (!isBehaviorExpired(char, now)) break

    // 行为到期 → 完成结算 + 决策下一个（连锁）
    const oldBlock = char.ai_behavior as BehaviorBlock
    await settleCompletion(char, oldBlock)
    const oldEnd = oldBlock.start_time + oldBlock.duration
    const decided = await decideNext(char, now, oldEnd)
    if (!decided) break
    chain++
  }
  if (chain >= MAX_CHAIN) {
    // 注释：连锁超限（超长窗口 + 短行为链的防御性封顶——正常长窗口如睡 12h 也会
    // 链 10+ 次，属预期；封顶后强制等待，下一 pass 继续，不产生状态错误）
    setBehaviorBlock(char, { id: 'wait', type: 'wait', start_time: now, duration: 60 })
    // 注释：对外宣告（与正常决策一致——UI 状态刷新）
    eventBus.emit('character:changed', { id: char.id })
  }
}

// 注释：主结算通道——全量同步；超预算排后续轮（玩家所在+相邻优先当轮）
export async function runSettlePass(_minutes: number): Promise<void> {
  const playerId = gameContext.getContext().player?.id
  const now = nowForSettle()
  const nearby = await nearbyLocations()

  // 注释：合并上轮未处理（不能丢）+ 本轮全部（2026-08-10 排查修复：此前 pendingQueue
  // 非空时跳过全员集合——持续超预算下未入队 NPC 永不结算，行为静默过期）
  const fresh = [...entitySystem.getAll('character')].filter(c => !!c?.id && c.id !== playerId)
  const merged = [...pendingQueue]
  pendingQueue = []
  for (const c of fresh) {
    if (!merged.includes(c)) merged.push(c)
  }
  // 注释：优先级排序——玩家所在+相邻优先当轮
  const rank = (c: any): number => {
    if (nearby.has(c?.current_location)) return 0
    return 1
  }
  const sorted = merged.sort((a, b) => rank(a) - rank(b))

  const startTime = performance.now()
  for (let i = 0; i < sorted.length; i++) {
    if (performance.now() - startTime > PASS_BUDGET_MS) {
      pendingQueue = sorted.slice(i)
      break
    }
    try {
      await settleOne(sorted[i], now, playerId)
    } catch (e) {
      // 注释：单角色结算异常不允许拖垮整轮（错误隔离；不静默——上报）
      errorReporter.report({
        source: 'npc-ai-system',
        severity: 'warning',
        message: `NPC '${sorted[i]?.id}' 结算异常：${e instanceof Error ? e.message : String(e)}`,
      })
    }
  }
}

// 注释：当前时刻（游戏总分钟数）
function nowForSettle(): number {
  return gameTimeToTotalMinutes(gameContext.getContext().time)
}

// 注释：清空待处理队列（测试/重载用）
export function resetPendingQueue(): void {
  pendingQueue = []
}
