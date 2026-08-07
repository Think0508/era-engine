import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CommandExecutor, type ExecutionContext } from './command-executor'
import { commandRegistry } from './command-registry'
import { errorReporter } from './error-reporter'
import { gameContext } from './game-context'

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

  it('premises 不满足时跳过（L1.6 premises 独立字段）', async () => {
    const handler = vi.fn()
    commandRegistry.register({
      id: 'prem-gated',
      label: '前提指令',
      group: 'main_menu',
      modes: ['exploration'],
      premises: ['HAVE_TARGET', 'NOT_H'],
      handler,
      source: 'instructions',
    })
    await executor.execute('prem-gated', makeCtx({ evaluatePremises: () => false }))
    expect(handler).not.toHaveBeenCalled()
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('前提不满足'))).toBe(true)

    // 满足前提时正常执行
    await executor.execute('prem-gated', makeCtx({ evaluatePremises: () => true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fail-safe——有 condition/premises 但调用方未提供求值器 → warning + 跳过（禁止静默放行）', async () => {
    const premHandler = vi.fn()
    commandRegistry.register({
      id: 'no-eval-prem',
      label: '无求值器前提指令',
      group: 'main_menu',
      modes: ['exploration'],
      premises: ['NOT_H'],
      handler: premHandler,
      source: 'instructions',
    })
    const condHandler = vi.fn()
    commandRegistry.register({
      id: 'no-eval-cond',
      label: '无求值器条件指令',
      group: 'main_menu',
      modes: ['exploration'],
      condition: 'location.tags.has_bedroom == true',
      handler: condHandler,
      source: 'instructions',
    })
    // 注释：调用方（旧版 ScreenNumpad 等）不传任何求值器
    await executor.execute('no-eval-prem', makeCtx({ evaluateCondition: undefined, evaluatePremises: undefined }))
    await executor.execute('no-eval-cond', makeCtx({ evaluateCondition: undefined, evaluatePremises: undefined }))
    expect(premHandler).not.toHaveBeenCalled()
    expect(condHandler).not.toHaveBeenCalled()
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('未提供 evaluatePremises'))).toBe(true)
    expect(errors.some(e => e.message.includes('未提供 evaluateCondition'))).toBe(true)
  })

  it('前提求值器抛错 → 捕获 + errorReporter，异常不逃逸 execute()', async () => {
    const handler = vi.fn()
    commandRegistry.register({
      id: 'throw-prem',
      label: '前提抛错指令',
      group: 'main_menu',
      modes: ['exploration'],
      premises: ['HAVE_TARGET'],
      handler,
      source: 'instructions',
    })
    // 注释：不抛异常到调用方（await 正常返回）
    await expect(executor.execute('throw-prem', makeCtx({
      evaluatePremises: () => { throw new Error('前提 handler 崩了') },
    }))).resolves.toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.severity === 'error' && e.message.includes('求值抛错'))).toBe(true)
    // 前提检查在 EXECUTING 包裹之前——未进入执行态，状态栈为空
    expect(executionStates).toEqual([])
  })

  it('timeCost <= 0（-1 = handler 自定义耗时）不自动推进时间、不发负数耗时', async () => {
    const before = gameContext.getContext().time
    commandRegistry.register({
      id: 'no-time',
      label: 'handler 自定义耗时',
      group: 'main_menu',
      modes: ['exploration'],
      timeCost: -1,
      handler: vi.fn(),
      source: 'instructions',
    })
    await executor.execute('no-time', makeCtx())
    // 时间未推进
    const after = gameContext.getContext().time
    expect(after.hour).toBe(before.hour)
    expect(after.day).toBe(before.day)
    // execution_end 发出的是 0 而非 -1（监听者拿不到负数 addTime）
    const endEvt = emittedEvents.find(e => e.event === 'game:execution_end')
    expect(endEvt?.payload.timeCost).toBe(0)
  })
})
