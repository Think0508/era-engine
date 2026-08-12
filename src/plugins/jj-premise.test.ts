// 注释：jj_0~3 前提可达性测试（2026-08-13 阴茎大小写入方修复）——
// 此前全库无写入方 → 恒 1 档 → jj_0 地文不可达、jj_1 错误常显。
// 修复后：角色注册触发 character:registered → h-ejaculation 按分布幂等初始化。

import { describe, it, expect, beforeEach } from 'vitest'
import { entitySystem } from '../core/entity-system'
import { eventBus } from '../core/event-bus'
import { commandRegistry } from '../core/command-registry'
import { apiSystem } from '../core/api'
import { conditionEngine } from '../core/condition-engine'
import { onLoad as ejacOnLoad, onEnable as ejacOnEnable } from './h-ejaculation/index'

const stubCtx: any = { api: apiSystem, events: eventBus, commands: commandRegistry, ui: { registerSlot: () => {} } }

// 注释：模块级 boot（effectTypeRegistry 重复注册会抛错——onLoad 只执行一次）
let booted = false
function ensureBoot(): void {
  if (booted) return
  booted = true
  ejacOnLoad(stubCtx)
  ejacOnEnable(stubCtx)
}

describe('jj_ 阴茎大小前提可达性', () => {
  beforeEach(() => {
    entitySystem.clear()
    // 注释：不清 conditionEngine（jj_ 前提由 boot 注册，clear 会丢失）
    ensureBoot()
  })

  it('角色注册时阴茎大小被初始化（幂等）', async () => {
    entitySystem.register('character', 'p1', { id: 'p1', base: { 体力: 80 } })
    // 注释：初始化在微任务批量事件中执行
    await new Promise(r => setTimeout(r, 10))
    const ch = entitySystem.get('character', 'p1') as any
    expect([0, 1, 2, 3]).toContain(ch.base['阴茎大小'])
    // 幂等：已有值不被覆盖
    ch.base['阴茎大小'] = 2
    entitySystem.register('character', 'p2', { id: 'p2' })
    await new Promise(r => setTimeout(r, 10))
    expect((entitySystem.get('character', 'p1') as any).base['阴茎大小']).toBe(2)
    expect([0, 1, 2, 3]).toContain((entitySystem.get('character', 'p2') as any).base['阴茎大小'])
  })

  it('分布采样：1000 角色四档均出现（jj_0~3 全部可达）', async () => {
    for (let i = 0; i < 1000; i++) {
      entitySystem.register('character', `samp_${i}`, { id: `samp_${i}`, base: { 体力: 50 } })
    }
    // 等待异步初始化事件全部完成
    await new Promise(r => setTimeout(r, 50))
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const ch = entitySystem.get('character', `samp_${i}`) as any
      seen.add(ch?.base?.['阴茎大小'])
    }
    for (const size of [0, 1, 2, 3]) {
      expect(seen.has(size)).toBe(true)
    }
  })

  it('jj_N 前提在对应档位角色上通过、其他档位不通过', async () => {
    for (let i = 0; i < 100; i++) {
      entitySystem.register('character', `jj_samp_${i}`, { id: `jj_samp_${i}`, base: { 体力: 50 } })
    }
    await new Promise(r => setTimeout(r, 50))
    let anyPass0 = false
    let anyPass1 = false
    let anyPass2 = false
    let anyPass3 = false
    let consistent = true
    for (let i = 0; i < 100; i++) {
      const id = `jj_samp_${i}`
      const ch = entitySystem.get('character', id) as any
      const size = ch?.base?.['阴茎大小']
      const ctx = { player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, getEntity: () => null, sourceId: id, selectedCharacterId: id } as any
      for (let s = 0; s <= 3; s++) {
        const pass = conditionEngine.getPremiseValue(`jj_${s}`, ctx) === true
        if (s === size) {
          if (!pass) consistent = false
        } else if (pass) {
          consistent = false
        }
      }
      if (size === 0) anyPass0 = true
      if (size === 1) anyPass1 = true
      if (size === 2) anyPass2 = true
      if (size === 3) anyPass3 = true
    }
    expect(consistent).toBe(true)
    expect(anyPass0 || anyPass1 || anyPass2 || anyPass3).toBe(true)
  })
})
