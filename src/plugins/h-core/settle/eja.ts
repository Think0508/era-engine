// 注释：射精欲读写——h-core → h-ejaculation 的唯一通信路径（跨插件禁止直接 import）
// 铁律遵循：h-core 不直接碰 base['射精欲'] 字段，读写全部走 h-ejaculation 注册的公共 API
// （api.ts 注册的 getEja/setEja/addEja）
//
// 降级策略（与 h-group-sex 同模式）：h-ejaculation 插件未启用时静默降级
// （无射精系统 = 无射精欲概念，eja_climax 缺失已有 execution_end 警告），
// 真实错误（API 存在但调用失败）照报 errorReporter

import { apiSystem } from '../../../core/api'
import { errorReporter } from '../../../core/error-reporter'

function isEjaculationMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  // API namespace/method 不存在 = h-ejaculation 未注册或版本过旧（缺 addEja）
  return msg.includes('h-ejaculation') || msg.includes('未注册') || msg.includes('does not exist')
}

/** 读射精欲（h-ejaculation 未启用 → 0） */
export async function getEja(charId: string): Promise<number> {
  try {
    const v = await apiSystem.call('h-ejaculation', 'getEja', charId)
    return typeof v === 'number' ? v : 0
  } catch (err) {
    if (!isEjaculationMissing(err)) {
      errorReporter.report({
        source: 'h-core',
        severity: 'error',
        message: `读射精欲失败（${charId}）：${err instanceof Error ? err.message : String(err)}`,
      })
    }
    return 0
  }
}

/** 射精欲增加（delta ≤ 0 静默跳过；h-ejaculation 未启用 → 静默降级）
 * 注：delta 为完整增量（调用方自行算好，如 orgasm.ts 的 floor(100 + cur×0.4)）——
 * 本函数不重复读当前值，避免双重累加 */
export async function addEja(charId: string, delta: number): Promise<void> {
  if (delta <= 0) return
  try {
    await apiSystem.call('h-ejaculation', 'addEja', charId, delta)
  } catch (err) {
    if (!isEjaculationMissing(err)) {
      errorReporter.report({
        source: 'h-core',
        severity: 'error',
        message: `射精欲积累失败（${charId}）：${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }
}
