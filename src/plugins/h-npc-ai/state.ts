// 注释：H 中 NPC 行为状态管理（2026-08-11 grill Q4 定案）
// 复用 npc-ai-system 的 ai_behavior 行为块 + h_* 类型：
//   h:start → h_wait（长 duration，H 中由跳过集 in_h 冻结，settle-pass 不结算）
//   h:end   → h_end（duration=0 立即过期，下次 settle-pass 完成结算 + 重新决策——日常 AI 衔接零胶水）
// 行为块是实体共享字段（core entity-system），h-npc-ai 直接读写；
// 不调用 npc-ai setBehavior API（该 API 按行为规格生成 + 宣告叙事，H 场景会刷屏）。
// 镜像 condition_fields：char.state / char.current_behavior（与 npc-ai-system 一致）

import { entitySystem } from '../../core/entity-system'
import { gameContext, gameTimeToTotalMinutes } from '../../core/game-context'
import { eventBus } from '../../core/event-bus'

// 注释：H 冻结行为块（h_wait）——duration 取 12 小时，H 中不刷新（冻结块不被结算，
// 也不会过期）；H 结束由 exitHBlock 覆盖
const H_WAIT_DURATION = 12 * 60

// 注释：当前时刻（游戏总分钟数，与 npc-ai-system behavior-block.nowMinutes 同源）
export function nowMinutes(): number {
  return gameTimeToTotalMinutes(gameContext.getContext().time)
}

function mirrorState(char: any, type: string, id: string): void {
  char.state = type
  char.current_behavior = id
}

// 注释：H 开始/维持——把角色的日常行为块替换为 h_wait（冻结）
// 状态切换后 emit character:changed（对齐 npc-ai setBehavior 惯例——bridge 同步 UI、
// set-system 查套装；不 emit 则 H 开始/结束的 NPC 状态陈旧）
export function enterHBlock(char: any): void {
  if (!char?.id) return
  char.ai_behavior = {
    id: 'h_wait', type: 'h_wait',
    start_time: nowMinutes(),
    duration: H_WAIT_DURATION,
  }
  mirrorState(char, 'h_wait', 'h_wait')
  eventBus.emit('character:changed', { id: char.id })
}

// 注释：确认 H 中 NPC 行为块仍为 h_*（防御——群交补位等路径加入 H 的角色可能没走过
// h:start）。已是 h_ 类型则不动（不刷 character:changed）
export function ensureHBlock(char: any): void {
  const b = char?.ai_behavior
  if (b && typeof b.type === 'string' && b.type.startsWith('h_')) return
  enterHBlock(char)
}

// 注释：H 结束——行为块置为 h_end（立即过期）→ 下次 settle-pass 自动重新决策
export function exitHBlock(char: any): void {
  if (!char?.id) return
  char.ai_behavior = {
    id: 'h_end', type: 'h_end',
    start_time: nowMinutes(),
    duration: 0,
  }
  mirrorState(char, 'h_end', 'h_end')
  eventBus.emit('character:changed', { id: char.id })
}

// 注释：对当前所有 is_h 角色执行 enter/exit（h:start/h:end 事件用；玩家不参与
// npc-ai 结算，跳过——避免给玩家写无意义的 h_wait/h_end 块）
export function enterHBlocksForAllInH(): void {
  const playerId = getPlayerId()
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (c?.id === playerId) continue
    if (c?.h_state?.is_h) enterHBlock(c)
  }
}

export function exitHBlocksForAllInH(): void {
  const playerId = getPlayerId()
  for (const char of entitySystem.getAll('character')) {
    const c = char as any
    if (c?.id === playerId) continue
    if (c?.h_state?.is_h) exitHBlock(c)
  }
}

// ── H 状态工具 ──

// 注释：是否 H 中（对齐 erArk sp_flag.is_h —— 本引擎 h_state.is_h，2026-08-10 修复同源）
export function isInH(char: any): boolean {
  return char?.h_state?.is_h === true
}

// 注释：NPC 逆推状态（erArk h_state.npc_active_h + hypnosis.active_h 双源）
export function getNpcActiveH(char: any): boolean {
  return char?.h_state?.npc_active_h === true || char?.hypnosis?.active_h === true
}

export function setNpcActiveH(char: any, on: boolean): void {
  if (!char) return
  // 注释：无 h_state 时自动创建（API/GM 在 H 外调用逆推开关的场景；H 中必有完整 h_state）。
  // 字段对齐 h-core createHState（不跨插件 import——手写完整结构，含二段结算字段，
  // 防止残旧 h_state 被 orgasm 结算读到 undefined 静默出错）
  if (!char.h_state) {
    char.h_state = {
      target_character_id: undefined,
      insert_position: -1,
      current_sex_position: -1,
      current_womb_sex_position: 0,
      orgasm_count: {},
      orgasm_level: {},
      orgasm_edge: 0,
      endure_not_shoot_count: 0,
      shoot_semen_amount: 0,
      just_shoot: 0,
      used_semen_energy_agent: false,
      thick_semen: false,
      bondage_type: 0,
      condom_count: [0, 0],
      sex_toy_level: 0,
      is_h: false,
      turn_count: 0,
      extra_orgasm_feel: {},
      extra_orgasm_count: 0,
      orgasm_edge_count: {},
      time_stop_orgasm_count: {},
      plural_orgasm_set: [],
      shoot_position_body: -1,
      pending_orgasm_feel: {},
    }
  }
  char.h_state.npc_active_h = on
}

// 注释：时停中（erArk/h-time-stop：sp_flag.unconscious_h == 3）
// 时停 NPC 跳过锁死判定（grill Q5 定案：时停 = 时间停止，行为块本来就冻结）
export function isTimeStopped(char: any): boolean {
  return (char?.sp_flag?.unconscious_h ?? 0) === 3
}

// 注释：催眠木头人（erArk hypnosis.blockhead —— 行动锁死 WAIT）
export function isBlockhead(char: any): boolean {
  return char?.hypnosis?.blockhead === true
}

// 注释：体力值（HP≤1 判断读 ch.base['体力']，premise-h.ts:74 先例）
export function getStamina(char: any): number {
  return char?.base?.['体力'] ?? 0
}

// 注释：玩家 ID（mod meta.player_character）
export function getPlayerId(): string | null {
  return gameContext.getContext().player?.id ?? null
}
