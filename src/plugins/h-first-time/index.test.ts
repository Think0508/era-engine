// 注释：h-first-time 测试——first_time_check/first_kiss_check 效果
// 2026-08-09：处女天赋联动删除（标准角色契约分层审计——双源漂移修复，
// talk-common 口上条件 talents.肛门处女 == 0 依赖破处后天赋翻转）

import { describe, it, expect, beforeAll } from 'vitest'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { entitySystem } from '../../core/entity-system'
import { onLoad, onEnable } from './index'

describe('h-first-time', () => {
  beforeAll(() => {
    entitySystem.clear()
    effectTypeRegistry.clear()
    onLoad({} as any)
  })

  function runEffect(type: string, params: any, targetIds: string[]): void {
    const handler = effectTypeRegistry.getHandler(type)
    if (!handler) throw new Error(`effect type '${type}' 未注册`)
    handler(params, { _targetIds: targetIds })
  }

  function makeChar(id: string, init: any = {}): any {
    const char: any = { id, name: id, ...init }
    entitySystem.register('character', id, char)
    return char
  }

  it('first_time_check virgin_V：破处标记 + first_records + 移除阴道处女天赋', () => {
    const char = makeChar('t_v', {
      talents: { '阴道处女': 1, '肛门处女': 1, '无接吻经验': 1 },
      abilities: { '性无知': { level: 1, xp: 0 } },
      equipment: { panties: '内裤' },
    })
    runEffect('first_time_check', { key: 'virgin_V' }, ['t_v'])

    expect(char.first_times['virgin_V']).toBe(true)
    expect(char.first_records['virgin_V']).toBeDefined()
    expect(char.first_records['virgin_V'].time).toBeTruthy()
    // 只删对应天赋，其余处女天赋保留
    expect(char.talents['阴道处女']).toBeUndefined()
    expect(char.talents['肛门处女']).toBe(1)
    expect(char.talents['无接吻经验']).toBe(1)
    // 既有行为回归：性无知移除 + 处女血
    expect(char.abilities['性无知']).toBeUndefined()
    expect(char.equipment_blood?.panties).toBe(true)
  })

  it('first_time_check 各键删除对应处女天赋（A/U/W）', () => {
    const cases = [
      { key: 'virgin_A', talent: '肛门处女' },
      { key: 'virgin_U', talent: '尿道处女' },
      { key: 'virgin_W', talent: '子宫处女' },
    ]
    for (const c of cases) {
      const char = makeChar(`t_${c.key}`, { talents: { [c.talent]: 1 } })
      runEffect('first_time_check', { key: c.key }, [char.id])
      expect(char.first_times[c.key]).toBe(true)
      expect(char.talents[c.talent]).toBeUndefined()
    }
  })

  it('first_kiss_check：初吻标记 + 移除无接吻经验天赋', () => {
    const char = makeChar('t_kiss', { talents: { '无接吻经验': 1, '阴道处女': 1 } })
    runEffect('first_kiss_check', {}, ['t_kiss'])

    expect(char.first_times['virgin_KISS']).toBe(true)
    expect(char.first_records['virgin_KISS']).toBeDefined()
    expect(char.talents['无接吻经验']).toBeUndefined()
    expect(char.talents['阴道处女']).toBe(1)
  })

  it('已破处再次触发：跳过（不覆盖记录、不重复写）', () => {
    const char = makeChar('t_repeat', {
      first_times: { virgin_V: true },
      first_records: { virgin_V: { time: '1-1-1 8:0', place: 'old', position: '' } },
      talents: {},
    })
    runEffect('first_time_check', { key: 'virgin_V' }, ['t_repeat'])

    expect(char.first_records['virgin_V'].place).toBe('old')
  })

  it('无 talents 对象：不崩', () => {
    const char = makeChar('t_no_talents')
    runEffect('first_time_check', { key: 'virgin_V' }, ['t_no_talents'])
    expect(char.first_times['virgin_V']).toBe(true)
  })

  it('setFirstTime 公共 API：与 first_time_check 一致，同步移除对应处女天赋', () => {
    let api: any = {}
    onEnable({ api: { register: (ns: string, methods: any) => { if (ns === 'h-first-time') api = methods } } } as any)
    const char = makeChar('t_api', { talents: { '阴道处女': 1, '肛门处女': 1 } })

    api.setFirstTime('t_api', 'virgin_V')

    expect(char.first_times['virgin_V']).toBe(true)
    expect(char.talents['阴道处女']).toBeUndefined()
    expect(char.talents['肛门处女']).toBe(1)
  })
})
