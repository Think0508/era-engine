// 注释：行为块模型——NPC 恒有行为块（behavior{id,type,start_time,duration}），
// 时间推进后"到期"的行为被结算并决策下一个（erArk character_data.behavior 语义）
// 运行时块存于 char.ai_behavior（引擎独占字段，存档随实体保存）

import { gameContext, gameTimeToTotalMinutes } from '../../core/game-context'
import type { BehaviorBlock } from './types'

// 注释：空块 id（初始未决策状态）——首个结算 pass 立即决策
export const INITIAL_BLOCK_ID = '__init__'

// 注释：角色是否已有合法行为块
export function hasBehaviorBlock(char: any): boolean {
  const b = char?.ai_behavior as BehaviorBlock | undefined
  return !!b && typeof b.start_time === 'number' && typeof b.duration === 'number'
}

// 注释：初始化行为块（无块/缺字段时）——start=当前时刻，duration=0（立即到期，
// 首个结算 pass 决策；erArk SHARE_BLANKLY + init_character_behavior_start_time）
export function initBehaviorBlock(char: any): void {
  if (!char) return
  if (!hasBehaviorBlock(char)) {
    const now = nowMinutes()
    char.ai_behavior = { id: INITIAL_BLOCK_ID, type: 'wait', start_time: now, duration: 0 }
    mirrorState(char, 'wait', INITIAL_BLOCK_ID)
  }
}

// 注释：写入新行为块 + 镜像条件字段（char.state / char.current_behavior——
// condition_fields 消费；follow-system 先例：条件路径只走实体直接键）
export function setBehaviorBlock(char: any, block: BehaviorBlock): void {
  char.ai_behavior = block
  mirrorState(char, block.type, block.id)
}

function mirrorState(char: any, type: string, id: string): void {
  char.state = type
  char.current_behavior = id
}

// 注释：行为是否已到期（start + duration <= now）——erArk judge_character_status_time_over
export function isBehaviorExpired(char: any, nowMinutes: number): boolean {
  const b = char?.ai_behavior as BehaviorBlock | undefined
  if (!b || typeof b.start_time !== 'number') return true
  return b.start_time + (b.duration ?? 0) <= nowMinutes
}

// 注释：钳正行为起始时刻（erArk judge_character_status_time_over 首行：
// `if behavior.start_time > now: behavior.start_time = now`）——时间回拨
// （时停回溯/读档后时钟早于存档时刻）时，未来起始的行为块钳到当前时刻，
// 否则行为永不"到期"（世界冻结）。返回是否钳正过。
export function clampBehaviorStart(char: any, nowMinutes: number): boolean {
  const b = char?.ai_behavior as BehaviorBlock | undefined
  if (!b || typeof b.start_time !== 'number') return false
  if (b.start_time > nowMinutes) {
    b.start_time = nowMinutes
    return true
  }
  return false
}

// 注释：当前时刻（游戏总分钟数）
export function nowMinutes(): number {
  return gameTimeToTotalMinutes(gameContext.getContext().time)
}

// 注释：行为窗口 ∩ 当前时刻的实际时长（erArk get_true_add_time：窗口结算只算
// 行为真实覆盖段——行为已结束的部分由行为完成结算处理，不重复窗口结算）
export function trueAddTime(char: any, now: number): number {
  const b = char?.ai_behavior as BehaviorBlock | undefined
  if (!b) return 0
  const start = Math.max(b.start_time, 0)
  const end = Math.min(start + (b.duration ?? 0), now)
  return Math.max(0, end - start)
}
