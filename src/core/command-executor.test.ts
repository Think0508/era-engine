import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CommandExecutor, type ExecutionContext } from './command-executor'
import { commandRegistry } from './command-registry'
import { errorReporter } from './error-reporter'

describe('command-executor', () => {
  let executor: CommandExecutor
  let executionStates: string[]
  let emittedEvents: { event: string; payload: any }[]

  beforeEach(() => {
    commandRegistry.clear()
    errorReporter.clear()
    executor = new CommandExecutor()
    executionStates = []
    emittedEvents = []
  })

  function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
    return {
      engine: {
        setExecutionState: (s: string) => executionStates.push(s),
        emit: async (event: string, payload: any) => emittedEvents.push({ event, payload }),
      },
      evaluateCondition: (_expr: string) => true,
      ...overrides,
    }
  }

  it('handler 指令执行成功', async () => {
    const handler = vi.fn()
    commandRegistry.register({
      id: 'test',
      label: '测试',
      group: 'main_menu',
      modes: ['exploration'],
      handler,
      source: 'native',
    })
    await executor.execute('test', makeCtx())
    expect(handler).toHaveBeenCalledOnce()
    // 注释：包裹 EXECUTING → IDLE
    expect(executionStates).toEqual(['EXECUTING', 'IDLE'])
    // 注释：emit 执行开始/结束事件
    expect(emittedEvents.map(e => e.event)).toEqual(['game:execution_start', 'game:execution_end'])
  })

  it('指令不存在时 warning 不崩', async () => {
    await executor.execute('nonexistent', makeCtx())
    const errors = errorReporter.getErrors()
    expect(errors).toHaveLength(1)
    expect(errors[0].severity).toBe('warning')
    expect(errors[0].message).toContain('nonexistent')
  })

  it('condition 不满足时跳过', async () => {
    const handler = vi.fn()
    commandRegistry.register({
      id: 'gated',
      label: '有条件指令',
      group: 'main_menu',
      modes: ['exploration'],
      condition: 'player.hp > 50',
      handler,
      source: 'native',
    })
    await executor.execute('gated', makeCtx({ evaluateCondition: () => false }))
    expect(handler).not.toHaveBeenCalled()
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('条件不满足'))).toBe(true)
  })

  it('handler 抛错时仍回 IDLE', async () => {
    commandRegistry.register({
      id: 'crash',
      label: '会崩的指令',
      group: 'main_menu',
      modes: ['exploration'],
      handler: () => { throw new Error('handler 崩了') },
      source: 'native',
    })
    await executor.execute('crash', makeCtx())
    // 注释：无论成功失败，都回 IDLE
    expect(executionStates).toEqual(['EXECUTING', 'IDLE'])
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.severity === 'error' && e.message.includes('handler 崩了'))).toBe(true)
  })

  it('effects 类指令 effect-system 未注册时 warning', async () => {
    commandRegistry.register({
      id: 'eff-cmd',
      label: '效果指令',
      group: 'main_menu',
      modes: ['exploration'],
      effects: [{ type: 'modify_attribute', params: {} }],
      source: 'native',
    })
    await executor.execute('eff-cmd', makeCtx())
    const errors = errorReporter.getErrors()
    // TODO(phase-9): effect-system 插件实现后接入
    expect(errors.some(e => e.message.includes('effect-system'))).toBe(true)
  })

  it('无 handler 无 effects 时 warning', async () => {
    commandRegistry.register({
      id: 'empty',
      label: '空指令',
      group: 'main_menu',
      modes: ['exploration'],
      source: 'native',
    })
    await executor.execute('empty', makeCtx())
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('既无 handler'))).toBe(true)
  })
})
