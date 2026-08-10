// 注释：事件触发流程（复刻 erArk judge_character_status 语义）
// 1. 候选选择（engine.pick）
// 2. 地点门控：NPC 且文本非空且玩家不同地点 → 跳过（静默事件任意地点）
// 3. 文本插值 + 叙事输出（talk-common 口上引用替换 + {self.X} 实体替换）
// 4. 效果结算（effect-system，target 解析到 interactant）
// 5. 子事件：open_son_options 效果特判挂起选项；玩家选择 → 子事件文本 + 效果

import { entitySystem } from '../../core/entity-system'
import { narrativeLog } from '../../core/narrative-log'
import { modLoader } from '../../core/mod-loader'
import { apiSystem } from '../../core/api'
import { gameContext } from '../../core/game-context'
import { eventBus } from '../../core/event-bus'
import { randomEventEngine, interpolateEventText } from '../../core/random-event'
import type { RandomEventDef } from '../../core/mod-loader'
import type { PendingOption } from './types'

let pending: PendingOption | null = null

export function getPendingOption(): PendingOption | null { return pending }
export function clearPendingOptions(): void {
  if (pending) {
    pending = null
    eventBus.emit('random-event:options_clear', {})
  }
}

/** 触发一次事件选择与结算（无候选事件 → 静默返回） */
export async function triggerEventFor(subjectId: string, behaviorId: string, targetId: string | null): Promise<void> {
  const event = randomEventEngine.pick(behaviorId, { subjectId, targetId })
  if (!event) return
  await runEvent(event, subjectId, targetId)
}

/** 玩家选择子事件选项（index 非法返回 false） */
export async function choosePendingOption(index: number): Promise<boolean> {
  if (!pending) return false
  const opt = pending.options[index]
  if (!opt) return false
  const son = randomEventEngine.getDef(opt.eventId)
  if (!son) return false
  const { subjectId, targetId } = pending
  pending = null
  eventBus.emit('random-event:options_clear', {})
  await runEvent(son, subjectId, targetId)
  return true
}

async function runEvent(event: RandomEventDef, subjectId: string, targetId: string | null): Promise<void> {
  const playerId = modLoader.getMod()?.playerCharacter ?? null
  const isPlayer = subjectId === playerId
  const playerSees = isPlayer || samePlace(subjectId, playerId)
  // 注释：地点门控——NPC 文本事件需玩家同地点（静默事件任意地点）
  if (!isPlayer && event.text && !playerSees) return
  // 注释：文本输出——子事件/父事件用正文段（split('|')[1]），普通事件全文
  if (event.text) {
    const isSon = event.option_son === true
    const hasOptions = (event.effects ?? []).some(e => e.type === 'open_son_options')
    const body = isSon || hasOptions ? (event.text.split('|')[1] ?? event.text) : event.text
    const text = await interpolateText(body, subjectId, targetId)
    narrativeLog.write(text, 'event', 'random-event-system')
  }
  await executeEventEffects(event, subjectId, targetId, playerSees)
}

/** 效果结算：open_son_options 挂起选项；set_interactant 改写后续效果目标；其余走 effect-system */
async function executeEventEffects(event: RandomEventDef, subjectId: string, targetId: string | null, playerSees: boolean): Promise<void> {
  const effects = event.effects ?? []
  if (effects.length === 0) return
  // 注释：open_son_options 特判——收集子事件候选并挂起（erArk 效果 10001 + Event_option_Panel）
  if (effects.some(e => e.type === 'open_son_options')) {
    const sons = randomEventEngine.getSonCandidates(event.behavior, event, { subjectId, targetId })
    if (sons.length > 0) {
      pending = {
        behaviorId: event.behavior,
        subjectId,
        targetId,
        fatherId: event.id,
        playerEvent: subjectId === modLoader.getMod()?.playerCharacter,
        options: sons.map(s => ({
          eventId: s.id,
          text: interpolateEventText(s.text?.split('|')[0] ?? s.id, subjectId, targetId),
        })),
      }
      // 注释：通知 UI 渲染选项条（engine-ui-bridge 同步到 ui-store）
      eventBus.emit('random-event:options', {
        fatherId: event.id,
        options: pending.options,
      })
    }
  }
  // 注释：按顺序执行其余效果——target 解析走 effect-system（省略 target 默认 selected，
  // selected = interactant ?? 触发者自己——erArk 事件效果默认作用于触发者）；
  // set_interactant 改写后续效果的 selected（erArk 目标改写效果）。
  // 玩家不可见（NPC 远处静默事件）：过滤 narrative_output + _silent（数值结算不输出，
  // 对齐 npc-ai settleCompletion 的同地点语义——远处 NPC 属性变化不可见）
  const visibleEffects = playerSees ? effects : effects.filter(e => e.type !== 'narrative_output')
  let selectedId = targetId ?? subjectId
  let batch: any[] = []
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return
    await apiSystem.call('effect-system', 'execute', batch, {
      sourceId: subjectId,
      _eventId: event.id,
      _silent: !playerSees,
      uiStore: { selectedCharacterId: selectedId },
    })
    batch = []
  }
  for (const eff of visibleEffects) {
    if (eff.type === 'open_son_options') continue
    if (eff.type === 'set_interactant') {
      await flush()
      selectedId = await resolveInteractant(eff.params?.mode, subjectId, selectedId)
      continue
    }
    batch.push(eff)
  }
  await flush()
}

/** 解析 set_interactant 模式的目标（erArk 10002/10005/10006/10007/10013）；解析失败保持原目标 */
async function resolveInteractant(mode: string | undefined, subjectId: string, selectedId: string): Promise<string> {
  const playerId = modLoader.getMod()?.playerCharacter ?? null
  switch (mode) {
    case 'player':
      return playerId ?? selectedId
    case 'self':
      return subjectId
    case 'player_target_to_me':
      // 注释：NPC 事件让玩家 UI 选中自己（bridge 的 selectedCharacterId → uiStore 同步 watch 负责 UI）
      gameContext.setSelectedCharacterId(subjectId)
      return selectedId
    case 'masturbator':
      return findMasturbatorAt(subjectId) ?? selectedId
    case 'most_desire':
      return findMostDesireAt(subjectId) ?? selectedId
    default:
      return selectedId
  }
}

/** 当前地点第一个"H 中且无交互对象"的角色（erArk 手淫者目标） */
function findMasturbatorAt(subjectId: string): string | null {
  const subject = entitySystem.get('character', subjectId) as any
  if (!subject?.current_location) return null
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (!c?.id || c.id === subjectId) continue
    if (c.current_location !== subject.current_location) continue
    if (c.h_state?.is_h === true && !c.h_state?.target_character_id) return c.id
  }
  return null
}

/** 当前地点欲望值（base.欲望值）最高者（erArk 10013） */
function findMostDesireAt(subjectId: string): string | null {
  const subject = entitySystem.get('character', subjectId) as any
  if (!subject?.current_location) return null
  let best: string | null = null
  let bestValue = -Infinity
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (!c?.id || c.id === subjectId) continue
    if (c.current_location !== subject.current_location) continue
    const v = Number(c.base?.['欲望值'] ?? 0)
    if (v > bestValue) {
      bestValue = v
      best = c.id
    }
  }
  return best
}

/** 两角色是否同地点（null 安全） */
function samePlace(a: string, b: string | null): boolean {
  if (!b) return false
  const ea = entitySystem.get('character', a) as any
  const eb = entitySystem.get('character', b) as any
  if (!ea || !eb) return false
  return !!ea.current_location && ea.current_location === eb.current_location
}

/** 文本插值：talk-common 口上引用（{变量}）→ 实体占位符（{self.X} 等）；talk-common 未就绪时降级原样 */
async function interpolateText(text: string, subjectId: string, targetId: string | null): Promise<string> {
  let replaced = text
  try {
    replaced = await apiSystem.call('talk-common', 'replace', text, targetId ?? subjectId, subjectId)
  } catch {
    // talk-common 未注册（测试/独立场景）→ 原样
  }
  return interpolateEventText(replaced, subjectId, targetId)
}
