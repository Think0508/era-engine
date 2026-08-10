// 注释：前置门控链——决策前的检查（erArk run_npc_pre_behavior_checks 对应物）
// 可插拔注册表：preCheck 返回 handled=true 表示接管本轮决策（行为已设定，跳过目标搜索）
// 本次注册 3 道：① tired 标记 ② cant_move（监禁） ③ follow 接管
// （助理问安/ H 失神后置——Q8 决策：无机制位，后续用目标前提数据实现）

import { getEntityAttr } from '../../core/entity-utils'
import { gameContext } from '../../core/game-context'
import { errorReporter } from '../../core/error-reporter'
import { setBehaviorBlock } from './behavior-block'
import type { BehaviorBlock } from './types'

export interface PreCheckResult {
  /** true = 本检查接管了本轮决策（行为已设定） */
  handled: boolean
}

export type PreCheckHandler = (charId: string, char: any, now: number) => PreCheckResult

const preChecks = new Map<string, PreCheckHandler>()

export function registerPreCheck(id: string, fn: PreCheckHandler): void {
  if (preChecks.has(id)) {
    errorReporter.report({
      source: 'npc-ai-system',
      severity: 'warning',
      message: `前置门控 '${id}' 重复注册，后者覆盖`,
    })
  }
  preChecks.set(id, fn)
}

// ── ① tired 标记（erArk judge_character_tired_sleep）──
// HP ≤ 1 → sp_flag.tired = true（供目标前提/口上条件查询）；HP > 1 → 清除。
// erArk 中"跟随中疲劳 → 解除跟随 + 口上"由 follow-system 自行处理（既有），
// 此处只维护标记本体（NPC 日常决策的疲惫前提消费它）。
// 2026-08-10 排查修复：无"体力"属性的角色（getEntityAttr 缺失返回 0）此前被
// 恒判为 HP≤1 → tired 永远为 true（静默误报）——加存在性检查
export function tiredGate(_charId: string, char: any, _now: number): PreCheckResult {
  const hp = getEntityAttr(char, '体力')
  const hasHpStat = hasAttr(char, '体力')
  const prev = !!char?.sp_flag?.tired
  const next = hasHpStat && typeof hp === 'number' && hp <= 1
  if (prev !== next) {
    if (!char.sp_flag) char.sp_flag = {}
    char.sp_flag.tired = next
  }
  return { handled: false }
}

// 注释：属性存在性检查（跨命名空间——与 getEntityAttr 的搜索顺序一致；
// getEntityAttr 缺失返回 0，无法区分"存在且为 0"与"不存在"）
function hasAttr(char: any, name: string): boolean {
  if (!char) return false
  if (char[name] !== undefined) return true
  for (const ns of ['base', 'params', 'marks', 'abilities', 'talents', 'flags', 'combat', 'social', 'economy']) {
    const c = char[ns]
    if (c && typeof c === 'object' && c[name] !== undefined) return true
  }
  return false
}

// ── ② cant_move 门控（erArk judge_character_cant_move）──
// 监禁（sp_flag.imprisonment）→ 禁移动：原地等待 60 分钟（不参与目标搜索——
// 移动类目标全部失效；erArk 同时把监禁者强制送回宿舍，武侠语境简化为原地等待——
// 宿舍概念由 mod 的监禁目标/地点实现）。判定字段 mod 可定义：本门控只认
// sp_flag.imprisonment，mod 插件可通过 registerPreCheck 注册更多禁移动判定。
export function cantMoveGate(_charId: string, char: any, now: number): PreCheckResult {
  if (!char?.sp_flag?.imprisonment) return { handled: false }
  const block: BehaviorBlock = {
    id: 'wait',
    type: 'wait',
    start_time: now,
    duration: 60,
    params: { reason: 'imprisonment' },
  }
  setBehaviorBlock(char, block)
  return { handled: true }
}

// ── ③ follow 接管门控（erArk judge_character_follow）──
// 跟随模式 1/2：行为到期 → 原地等待 60 分钟（不决策）——移动由 follow-system 接管
// （瞬移同步/强制跟随），AI 不与之竞争。mode 4（召唤 TODO）不冻结。
// 注：mode 1/2 即被 follow-system 接管（isControlled 定义），无需查 follow API
// （apiSystem.call 恒返回 Promise，同步判定是死代码——2026-08-10 排查移除）
export function followGate(_charId: string, char: any, now: number): PreCheckResult {
  const mode = char?.sp_flag?.is_follow ?? 0
  if (mode !== 1 && mode !== 2) return { handled: false }
  const block: BehaviorBlock = {
    id: 'wait',
    type: 'wait',
    start_time: now,
    duration: 60,
    params: { reason: 'follow' },
  }
  setBehaviorBlock(char, block)
  return { handled: true }
}

// 注释：跑全部门控——任一 handled 即停（顺序 = 注册顺序）
export function runPreChecks(charId: string, char: any, now: number): boolean {
  for (const fn of preChecks.values()) {
    try {
      const result = fn(charId, char, now)
      if (result.handled) return true
    } catch {
      // 门控异常不允许拖垮结算——跳过该门控
    }
  }
  return false
}

// 注释：角色是否被交互 pin 住（wait_flag 语义）——玩家正在对话/指令该角色时
// 不结算其行为（erArk wait_flag：指令中的 NPC 等待）。判定：UI 选中该角色且
// 当前非探索模式（对话/战斗/H 等交互模式）。
export function isPinned(charId: string): boolean {
  const ctx = gameContext.getContext()
  if (ctx.selectedCharacterId !== charId) return false
  return gameContext.getCurrentMode() !== 'exploration'
}

// 注释：清空门控（测试/重载用）
export function clearPreChecks(): void {
  preChecks.clear()
}

// 注释：注册内建三道门控（onLoad 时调用）
export function registerBuiltinPreChecks(): void {
  registerPreCheck('tired', tiredGate)
  registerPreCheck('cant_move', cantMoveGate)
  registerPreCheck('follow', followGate)
}
