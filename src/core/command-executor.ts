// 注释：CommandExecutor 负责指令执行的完整流程
// 1. 查 CommandRegistry.getById
// 2. 再次检查 condition（运行时求值，由调用方传入求值函数）
// 3. 设置 executionState = EXECUTING + emit game:execution_start
// 4. 执行 handler 或 effects
// 5. 回 executionState = IDLE + emit game:execution_end
// 引擎在指令执行前后自动包裹 EXECUTING，effect-system 不关心 executionState

import { commandRegistry } from './command-registry'
import { errorReporter } from './error-reporter'
import { gameContext } from './game-context'
import { entitySystem } from './entity-system'
import { realtimeSettle } from './realtime-settle'
import { newDaySettle } from './newday-settle'
import { processPendingSpawns } from './spawn-system'
import { checkTalentGain } from './talent-utils'

// 注释：玩家指令执行历史（连续重复指令减值用，对齐 erArk cache.pl_pre_behavior_instruce）
// erArk 上限 10 条（character_behavior.py:127-129）；系数在第 5 次触底 0.4
const HISTORY_MAX = 10
export const behaviorHistory: string[] = []
export function recordBehaviorHistory(id: string): void {
  behaviorHistory.push(id)
  if (behaviorHistory.length > HISTORY_MAX) behaviorHistory.shift()
}
export function clearBehaviorHistory(): void {
  behaviorHistory.length = 0
}

// 注释：连续重复指令减值系数（erArk common_default.py:210-231/569-589）
// 玩家对同一目标连续执行同一条指令：第 3 次起系数 = 1 - 0.15×(连续次数-1)，下限 0.4
// 注意：erArk 的"基础指令跳过"（last_instr in [0,1,2]）是死代码——behavior_id 为字符串，
// 与数字比较恒 False → 一切指令（含 wait/move/rest）都参与连续计数
// 最后一条不是连续重复 → 1.0（不衰减）
export function getContinuousAdjust(): number {
  const n = behaviorHistory.length
  if (n < 2 || behaviorHistory[n - 1] !== behaviorHistory[n - 2]) return 1
  const last = behaviorHistory[n - 1]
  let count = 0
  for (let i = n - 1; i >= 0; i--) {
    if (behaviorHistory[i] === last) count++
    else break
  }
  if (count <= 2) return 1
  return Math.max(0.4, 1 - 0.15 * (count - 1))
}

// 注释：ExecutionContext 暴露给 handler 函数的上下文
// 与 PluginContext 不同——原生指令是 UI 层概念，不需要 parent/api.register
export interface ExecutionContext {
  // 注释：UI 状态操作（Pinia store 引用，由 bridge 注入）
  uiStore?: any
  // 注释：游戏状态操作（Pinia store 引用，由 bridge 注入）
  gameStore?: any
  // 注释：core API（GameContext 等，由 bridge 注入）
  engine?: any
  // 注释：PluginContext.api 兼容（供 effects 类指令调 effect-system）
  api?: any
  // 注释：执行源角色 ID（target='self' 时使用）
  sourceId?: string | null
  // 注释：condition 求值函数（供运行时检查指令条件）
  evaluateCondition?: (expr: string) => boolean
  // 注释：premises 求值函数（指令有 premises 字段时使用）
  evaluatePremises?: (premises: string[]) => boolean
}

export class CommandExecutor {
  // 注释：执行指令——统一入口，CommandBar/ScreenNumpad/键盘输入都调此方法
  async execute(id: string, ctx: ExecutionContext): Promise<void> {
    const cmd = commandRegistry.getById(id)
    if (!cmd) {
      errorReporter.report({
        source: 'command-executor',
        severity: 'warning',
        message: `指令 id='${id}' 不存在`,
        suggestion: '检查指令是否已注册到 CommandRegistry',
      })
      return
    }

    // 注释：运行时再次检查 premises/condition（求值器可能抛错——如前提 handler 异常——
    // 必须捕获：报错 + 跳过，绝不让异常逃逸 execute()（否则不回 IDLE、不恢复执行状态）
    try {
      // 注释：premises 检查——fail-safe：有前提但调用方未提供求值器 → 警告 + 跳过（禁止静默放行）
      if (cmd.premises && cmd.premises.length > 0) {
        if (!ctx.evaluatePremises) {
          errorReporter.report({
            source: 'command-executor',
            severity: 'warning',
            message: `指令 '${id}' 有前提（${cmd.premises.join(', ')}）但调用方未提供 evaluatePremises，跳过执行`,
            suggestion: '调用方需注入 evaluatePremises（premiseRegistry 非严格求值），参考 CommandBar/command-eval',
          })
          return
        }
        if (!ctx.evaluatePremises(cmd.premises)) {
          errorReporter.report({
            source: 'command-executor',
            severity: 'warning',
            message: `指令 '${id}' 的前提不满足：${cmd.premises.join(', ')}`,
          })
          return
        }
      }

      // 注释：condition 检查——fail-safe 同上
      if (cmd.condition) {
        if (!ctx.evaluateCondition) {
          errorReporter.report({
            source: 'command-executor',
            severity: 'warning',
            message: `指令 '${id}' 有条件（${cmd.condition}）但调用方未提供 evaluateCondition，跳过执行`,
            suggestion: '调用方需注入 evaluateCondition（条件表达式求值），参考 CommandBar/command-eval',
          })
          return
        }
        if (!ctx.evaluateCondition(cmd.condition)) {
          errorReporter.report({
            source: 'command-executor',
            severity: 'warning',
            message: `指令 '${id}' 的条件不满足：${cmd.condition}`,
          })
          return
        }
      }
    } catch (err) {
      errorReporter.report({
        source: 'command-executor',
        severity: 'error',
        message: `指令 '${id}' 的前提/条件求值抛错：${err instanceof Error ? err.message : String(err)}`,
        suggestion: '检查前提 handler 与条件表达式',
      })
      return
    }

    // 注释：记录执行历史（连续重复指令减值用）——前提/条件通过后、执行开始前
    recordBehaviorHistory(id)

    // 注释：包裹 EXECUTING
    const engine = ctx.engine
    if (engine?.setExecutionState) {
      engine.setExecutionState('EXECUTING')
    }
    if (engine?.emit) {
      await engine.emit('game:execution_start', { commandId: id })
    }

    const timeCost = cmd.timeCost ?? (cmd.effects ? 10 : 0)
    // 注释：timeCost <= 0（如 -1 = handler 自定义耗时）→ 引擎不自动推进时间，也不进结算公式
    const settleTimeCost = timeCost > 0 ? timeCost : 0

    try {
      // 注释：推进时间（effects 类指令才推进）
      if (timeCost > 0 && cmd.effects) {
        await gameContext.advanceTime(timeCost)
      }

      if (cmd.handler) {
        await cmd.handler(ctx)
      } else if (cmd.effects) {
        const effectCtx = { ...ctx, _timeCost: settleTimeCost }
        if (effectCtx.api?.call) {
          try {
            await effectCtx.api.call('effect-system', 'execute', cmd.effects, effectCtx)
          } catch (err) {
            errorReporter.report({
              source: 'command-executor',
              severity: 'warning',
              message: `指令 '${id}' 的 effects 执行失败：${err instanceof Error ? err.message : String(err)}`,
              suggestion: '检查 effect-system 插件是否已加载',
            })
          }
        } else {
          errorReporter.report({
            source: 'command-executor',
            severity: 'warning',
            message: `指令 '${id}' 是 effects 类指令，但 effect-system 未注册`,
          })
        }
        // 注释：实时结算（疲劳/饥饿/尿意等）
        if (timeCost > 0) {
          const isRest = cmd.id === 'rest' || cmd.id === 'sleep'
          const isSleep = cmd.id === 'sleep'
          const settleOpts = { isRest, isSleep }

          const playerId = gameContext.getContext().player?.id
          if (playerId) {
            const player = entitySystem.get('character', playerId) as any
            if (player) realtimeSettle(player, timeCost, settleOpts)
          }
          for (const char of entitySystem.getAll('character')) {
            const c = char as any
            if (c.id && c.id !== playerId && c.current_location) {
              realtimeSettle(c, timeCost, settleOpts)
            }
          }
          newDaySettle()
          processPendingSpawns()
        }
      } else {
        errorReporter.report({
          source: 'command-executor',
          severity: 'warning',
          message: `指令 '${id}' 既无 handler 也无 effects，无法执行`,
        })
      }
    } catch (err) {
      // 注释：handler/effects 抛错 → error-reporter 报告 + 仍回 IDLE
      errorReporter.report({
        source: 'command-executor',
        severity: 'error',
        message: `指令 '${id}' 执行抛错：${err instanceof Error ? err.message : String(err)}`,
      })
    } finally {
      // 注释：无论成功失败，都回 IDLE
      if (engine?.setExecutionState) {
        engine.setExecutionState('IDLE')
      }
      if (engine?.emit) {
        await engine.emit('game:execution_end', { commandId: id, timeCost: settleTimeCost })
      }
      // 注释：检查天赋自动习得（finally 内防护——异常不得逃逸 execute()）
      try {
        const player = entitySystem.get('character', gameContext.getContext().player?.id ?? '')
        if (player) {
          checkTalentGain((player as any).id)
        }
      } catch (err) {
        errorReporter.report({
          source: 'command-executor',
          severity: 'warning',
          message: `指令 '${id}' 的天赋习得检查抛错：${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }
}

// 注释：全局单例
export const commandExecutor = new CommandExecutor()
