// 注释：调教助手（阶段C）——监狱长协同 H（erArk h_state.sex_assist + handle_npc_ai_in_h.py:154-157）
// 职责切分（grill Q8 定案，与 erArk 一比一）：
//   confinement-system：判定+选行为（设置12≠0 + 目标被监禁 + 监狱长在场）→ 监狱长 is_h=true
//     + h_state.sex_assist=true → 注册行为源（本文件 registerSexAssistSource）
//   h-npc-ai：per-tick 结算循环识别 sex_assist 参与者 → 向行为源取指令 → executeInstructionForNpc
// 行为源返回指令 id；未注册/返回 null → 监狱长只是"陪着"（不执行行为，不报错）

import { entitySystem } from '../../core/entity-system'
import { errorReporter } from '../../core/error-reporter'
import { executeInstructionForNpc } from './active-h'

// 注释：行为源（confinement-system onEnable 注册）——接收监狱长 id，返回要执行的指令 id 或 null
type SexAssistSource = (wardenId: string) => string | null | Promise<string | null>

let sexAssistSource: SexAssistSource | null = null

// 注释：注册行为源（confinement-system 调用；重复注册覆盖——HMR/重载）
export function registerSexAssistSource(source: SexAssistSource): void {
  sexAssistSource = source
}

export function clearSexAssistSource(): void {
  sexAssistSource = null
}

// 注释：每时间片执行一次助手行为（per-tick 调用）
// ⚠️ 修复（2026-08-14 审查）：原实现每次 game:time_advanced 都执行（哪怕 1 分钟），
// H 内助手行为密度爆炸（1 分钟结算数十次）——erArk 语义是"玩家每次行为结算时助手
// 同步一次"（行为耗时通常 10 分钟）。加最小间隔守卫：距上次助手行为 <5 分钟则跳过
const SEX_ASSIST_MIN_INTERVAL_MINUTES = 5
let lastAssistAtMinutes = -9999

export async function runSexAssist(wardenId: string, nowMinutes?: number): Promise<void> {
  if (!sexAssistSource) return
  const warden = entitySystem.get('character', wardenId) as any
  if (!warden?.h_state?.is_h) return
  // 间隔守卫（nowMinutes 缺省 = 无时钟上下文，放行——测试直调场景）
  if (nowMinutes !== undefined) {
    if (nowMinutes - lastAssistAtMinutes < SEX_ASSIST_MIN_INTERVAL_MINUTES) return
    lastAssistAtMinutes = nowMinutes
  }
  let cmdId: string | null = null
  try {
    cmdId = await sexAssistSource(wardenId)
  } catch (err) {
    errorReporter.report({
      source: 'h-npc-ai',
      severity: 'warning',
      message: `调教助手行为源取指令失败：${err instanceof Error ? err.message : String(err)}`,
    })
    return
  }
  if (!cmdId) return
  // 注释：助手行为赋给玩家执行（与逆推同执行模型——行为方向玩家→监狱长，
  // executeInstructionForNpc 的 targetId = 监狱长）。执行失败（前提不满足等）静默
  await executeInstructionForNpc(cmdId, wardenId)
}
