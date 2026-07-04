import { describe, it, expect, beforeEach } from 'vitest'
import { CommandRegistry, type CommandDef } from './command-registry'

describe('command-registry', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
  })

  const makeCmd = (overrides: Partial<CommandDef> = {}): CommandDef => ({
    id: 'talk',
    label: '交谈',
    group: 'character_commands',
    modes: ['exploration'],
    source: 'native',
    ...overrides,
  })

  it('register/getById', () => {
    const cmd = makeCmd()
    registry.register(cmd)
    expect(registry.getById('talk')).toBe(cmd)
  })

  it('register 重复 id 报错', () => {
    registry.register(makeCmd())
    expect(() => registry.register(makeCmd({ source: 'plugin:x' }))).toThrow(/已存在/)
  })

  it('unregister', () => {
    registry.register(makeCmd())
    registry.unregister('talk')
    expect(registry.getById('talk')).toBeUndefined()
  })

  it('getByGroup', () => {
    registry.register(makeCmd({ id: 'talk', group: 'character_commands', priority: 10 }))
    registry.register(makeCmd({ id: 'move', group: 'location_commands', priority: 5 }))
    registry.register(makeCmd({ id: 'save', group: 'main_menu', priority: 0 }))
    const charCmds = registry.getByGroup('character_commands')
    expect(charCmds).toHaveLength(1)
    expect(charCmds[0].id).toBe('talk')
    const mainCmds = registry.getByGroup('main_menu')
    expect(mainCmds).toHaveLength(1)
    expect(mainCmds[0].id).toBe('save')
  })

  it('getByGroup 按 priority 升序', () => {
    registry.register(makeCmd({ id: 'c', priority: 10 }))
    registry.register(makeCmd({ id: 'a', priority: 1 }))
    registry.register(makeCmd({ id: 'b', priority: 5 }))
    const cmds = registry.getByGroup('character_commands')
    expect(cmds.map(c => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('getByMode 过滤模式', () => {
    registry.register(makeCmd({ id: 'talk', modes: ['exploration', 'combat'] }))
    registry.register(makeCmd({ id: 'cast', modes: ['combat'] }))
    registry.register(makeCmd({ id: 'gather', modes: ['exploration'] }))
    expect(registry.getByMode('exploration').map(c => c.id)).toEqual(['talk', 'gather'])
    expect(registry.getByMode('combat').map(c => c.id)).toEqual(['talk', 'cast'])
  })

  it('getByMode + group 联合过滤', () => {
    registry.register(makeCmd({ id: 'talk', group: 'character_commands', modes: ['exploration'] }))
    registry.register(makeCmd({ id: 'move', group: 'location_commands', modes: ['exploration'] }))
    const cmds = registry.getByMode('exploration', 'character_commands')
    expect(cmds).toHaveLength(1)
    expect(cmds[0].id).toBe('talk')
  })

  it('clear', () => {
    registry.register(makeCmd())
    registry.clear()
    expect(registry.getAll()).toHaveLength(0)
  })
})
