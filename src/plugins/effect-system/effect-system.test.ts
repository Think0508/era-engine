import { describe, it, expect, beforeEach } from 'vitest'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { narrativeLog } from '../../core/narrative-log'
import { errorReporter } from '../../core/error-reporter'
import { onLoad, onEnable } from './index'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'

// 注释：effect-system 测试——验证 10 核心类型 + execute 流程 + target 解析 + depends_on + 错误隔离

// 注释：mock PluginContext
function makeMockCtx(): any {
  return {
    api: {
      register: (ns: string, methods: Record<string, Function>) => apiSystem.register(ns, methods as any),
      call: (ns: string, method: string, ...args: any[]) => apiSystem.call(ns, method, ...args),
    },
    commands: { register: () => {}, unregister: () => {} },
    ui: { registerSlot: () => {} },
    parent: null,
    events: {
      on: (e: string, h: Function) => eventBus.on(e, h as any),
      off: (e: string, h: Function) => eventBus.off(e, h as any),
      emit: (e: string, p: any) => eventBus.emit(e, p),
    },
    gameState: { currentLocation: null, player: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 } },
  }
}

describe('effect-system', () => {
  beforeEach(() => {
    effectTypeRegistry.clear()
    entitySystem.clear()
    bindingResolver.loadBindings({})
    narrativeLog.clear()
    errorReporter.clear()
    gameContext.reset()
    apiSystem.clear()
    eventBus.clear()

    // 注释：注册核心 effect types + API
    const ctx = makeMockCtx()
    onLoad(ctx)
    onEnable(ctx)

    // 注释：注册测试角色
    entitySystem.register('character', 'test_char', {
      id: 'test_char',
      base: { hp: 100, attack: 10 },
    })
    bindingResolver.loadBindings({
      test: { hp: 'hp', attack: 'attack' },
    })
  })

  it('set_attribute 走 binding 系统', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'set_attribute', params: { attr: 'hp', value: 50 }, target: 'test_char' },
    ], { sourceId: 'test_char' })
    expect(bindingResolver.get('test_char', 'hp')).toBe(50)
  })

  it('modify_attribute 加减', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'modify_attribute', params: { attr: 'hp', value: -20 }, target: 'test_char' },
    ], { sourceId: 'test_char' })
    expect(bindingResolver.get('test_char', 'hp')).toBe(80)
  })

  it('set_field 直接改实体字段', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'set_field', params: { path: 'abilities.test_skill', value: 3 }, target: 'test_char' },
    ], { sourceId: 'test_char' })
    expect((entitySystem.get('character', 'test_char') as any).abilities.test_skill).toBe(3)
  })

  it('narrative_output 写入日志', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'narrative_output', params: { text: '测试文本', type: 'system' } },
    ], {})
    expect(narrativeLog.length).toBe(1)
    expect(narrativeLog.getEntries()[0].text).toBe('测试文本')
  })

  it('未知 type warning + 跳过', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'nonexistent_type', params: {} },
    ], {})
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('nonexistent_type'))).toBe(true)
  })

  it('depends_on 前置失败则跳过', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { id: 'fail_effect', type: 'nonexistent_type', params: {} },
      { id: 'dep_effect', depends_on: 'fail_effect', type: 'narrative_output', params: { text: '不应执行' } },
    ], {})
    // 注释：dep_effect 被跳过，日志无新条目
    expect(narrativeLog.length).toBe(0)
  })

  it('handler 抛错时错误隔离继续执行', async () => {
    effectTypeRegistry.register('crash_type', () => { throw new Error('崩了') })
    await apiSystem.call('effect-system', 'execute', [
      { type: 'crash_type', params: {} },
      { type: 'narrative_output', params: { text: '仍执行' } },
    ], {})
    // 注释：第二个 effect 仍执行
    expect(narrativeLog.length).toBe(1)
    expect(narrativeLog.getEntries()[0].text).toBe('仍执行')
    expect(errorReporter.getErrors().some(e => e.severity === 'error')).toBe(true)
  })

  it('target=selected 无选中角色时 warning', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'modify_attribute', params: { attr: 'hp', value: -10, target: 'selected' } },
    ], { uiStore: { selectedCharacterId: null } })
    expect(errorReporter.getErrors().some(e => e.message.includes('selected'))).toBe(true)
  })

  it('advance_time 推进时间', async () => {
    await apiSystem.call('effect-system', 'execute', [
      { type: 'advance_time', params: { minutes: 30 } },
    ], {})
    expect(gameContext.getContext().time.minute).toBe(30)
  })

  it('10 核心类型已注册', () => {
    const types = effectTypeRegistry.getAllTypes()
    expect(types).toContain('set_attribute')
    expect(types).toContain('modify_attribute')
    expect(types).toContain('set_field')
    expect(types).toContain('add_item')
    expect(types).toContain('remove_item')
    expect(types).toContain('modify_relation')
    expect(types).toContain('advance_time')
    expect(types).toContain('narrative_output')
    expect(types).toContain('enter_mode')
    expect(types).toContain('exit_mode')
  })
})
