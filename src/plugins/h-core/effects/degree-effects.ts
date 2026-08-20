// 注释：h-core 效果域模块——五度属性 effect（2026-08-21，机制通电小步）
// accumulate_degrees：对目标一次性累加多个「度」（单调不降，只增不减）。
// 设计依据：docs/five-degrees-attributes.md §六（桥契约——统一累加通道）。
// 用法：
//   { type = "accumulate_degrees",
//     params = { degrees = { 屈服度 = 10, 软弱度 = 5 } } }
// 契约：
//   - 无目标 → fail-closed warning（禁止静默通过，对齐 judge_check）
//   - value 非有限数字 / 负数（单调铁律）→ warning + 跳过该度，不扣减
//   - 度名未在 attributes.toml（social）定义 → warning + 跳过（防拼错静默）
//   - 换算系数/性格系数 = TODO（settle/degree.ts DEGREE_CONVERSIONS，恒 1）

import { effectTypeRegistry } from '../../../core/effect-type-registry'
import { entitySystem } from '../../../core/entity-system'
import { errorReporter } from '../../../core/error-reporter'
import { modLoader } from '../../../core/mod-loader'
import { accumulateDegree } from '../settle/degree'

export function registerDegreeEffects(): void {
  effectTypeRegistry.register('accumulate_degrees', async (_p: any, execCtx: any) => {
    const targetIds = execCtx._targetIds as string[] | undefined
    if (!targetIds || targetIds.length === 0) {
      errorReporter.report({
        source: 'h-core:degree-effects',
        severity: 'warning',
        message: 'accumulate_degrees：无目标角色（_targetIds 为空）',
        suggestion: '检查指令 target 解析——需有选中角色或显式 target',
      })
      return
    }
    const degrees = _p?.degrees as Record<string, number> | undefined
    if (!degrees || Object.keys(degrees).length === 0) {
      errorReporter.report({
        source: 'h-core:degree-effects',
        severity: 'warning',
        message: 'accumulate_degrees：degrees 为空或缺失',
        suggestion: 'params.degrees = { 屈服度 = 10 }',
      })
      return
    }
    const mod = modLoader.getMod() as any
    for (const [degree, rawValue] of Object.entries(degrees)) {
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        errorReporter.report({
          source: 'h-core:degree-effects',
          severity: 'warning',
          message: `accumulate_degrees：度 '${degree}' 的值非有限数字（${String(rawValue)}），跳过`,
          suggestion: 'value 须为数字',
        })
        continue
      }
      if (rawValue < 0) {
        errorReporter.report({
          source: 'h-core:degree-effects',
          severity: 'warning',
          message: `accumulate_degrees：度 '${degree}' 收到负值 ${rawValue}——单调铁律（只增不减），丢弃`,
          suggestion: '如需扣减请走后续显式 ADR，不偷改本 effect 的语义',
        })
        continue
      }
      if (mod?.attributes && !mod.attributes[degree]) {
        errorReporter.report({
          source: 'h-core:degree-effects',
          severity: 'warning',
          message: `accumulate_degrees：度 '${degree}' 未在 attributes.toml 定义（拼错？），跳过`,
          suggestion: '检查度名是否已在 h-core 默认层或 mod definitions/attributes.toml 定义（category=social）',
        })
        continue
      }
      for (const id of targetIds) {
        const ch = entitySystem.get('character', id) as any
        if (!ch) {
          errorReporter.report({
            source: 'h-core:degree-effects',
            severity: 'warning',
            message: `accumulate_degrees：角色 '${id}' 不存在，跳过`,
            suggestion: '检查 target/角色 id',
          })
          continue
        }
        accumulateDegree(ch, degree, rawValue)
      }
    }
  })
}
