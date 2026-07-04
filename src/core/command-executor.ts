// 注释：CommandExecutor 负责指令执行的完整流程
// 1. 查 CommandRegistry.getById
// 2. 再次检查 condition（运行时求值，由调用方传入求值函数）
// 3. 设置 executionState = EXECUTING + emit game:execution_start
// 4. 执行 handler 或 effects
// 5. 回 executionState = IDLE + emit game:execution_end
// 引擎在指令执行前后自动包裹 EXECUTING，effect-system 不关心 executionState

import { commandRegistry } from './command-registry'
import { errorReporter } from './error-reporter'

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
  // 注释：condition 求值函数（供运行时检查指令条件）
  evaluateCondition?: (expr: string) => boolean
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

    // 注释：运行时再次检查 condition（注册时存的是字符串，运行时求值）
    if (cmd.condition && ctx.evaluateCondition) {
      if (!ctx.evaluateCondition(cmd.condition)) {
        errorReporter.report({
          source: 'command-executor',
          severity: 'warning',
          message: `指令 '${id}' 的条件不满足：${cmd.condition}`,
        })
        return
      }
    }

    // 注释：包裹 EXECUTING
    const engine = ctx.engine
    if (engine?.setExecutionState) {
      engine.setExecutionState('EXECUTING')
    }
    if (engine?.emit) {
      await engine.emit('game:execution_start', { commandId: id })
    }

    try {
      if (cmd.handler) {
        await cmd.handler(ctx)
      } else if (cmd.effects) {
        // 注释：effects 类指令——传递 timeCost 给 settle 效果 handler
        const effectCtx = { ...ctx, _timeCost: cmd.timeCost ?? 10 }
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
          // TODO(phase-9): effect-system 插件实现后接入
          errorReporter.report({
            source: 'command-executor',
            severity: 'warning',
            message: `指令 '${id}' 是 effects 类指令，但 effect-system 未注册（Phase 5 原生指令用 handler）`,
          })
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
        await engine.emit('game:execution_end', { commandId: id })
      }
    }
  }
}

// 注释：全局单例
export const commandExecutor = new CommandExecutor()
