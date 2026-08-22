// 注释：jj_0~3 前提可达性测试（2026-08 架构复盘重写）
// 权威阴茎数据 = body_shape.阴茎长度(cm)；base.阴茎大小(0-3) 是【派生镜像】，唯一写者 =
// body-shape-system（首触懒物化：分布 5/55/30/10 掷档 → 档内均匀取 cm → 同步镜像）。
// h-ejaculation 不再自持种子（character:registered 掷档已删除——双写者收敛，真实加载
// 中被 attributes default=1 预填短路的惰性死链已移除）。
// 本测试 boot body-shape-system + h-ejaculation，验证：①生产种子路径四档全部可达
// ②镜像=档一致 ③重复读不重掷（懒物化一次）④jj_N 前提按镜像档位通过/排除
// （与 body-shape-system.test.ts 的边界/联动用例互补）。

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { entitySystem } from '../core/entity-system'
import { eventBus } from '../core/event-bus'
import { commandRegistry } from '../core/command-registry'
import { apiSystem } from '../core/api'
import { modLoader } from '../core/mod-loader'
import { conditionEngine } from '../core/condition-engine'
import { onLoad as bsOnLoad, onEnable as bsOnEnable } from './body-shape-system/index'
import { onLoad as ejacOnLoad, onEnable as ejacOnEnable } from './h-ejaculation/index'

const stubCtx: any = { api: apiSystem, events: eventBus, commands: commandRegistry, ui: { registerSlot: () => {} } }

let booted = false
async function ensureBoot(): Promise<void> {
  if (booted) return
  booted = true
  await modLoader.loadMod('test-mod')
  bsOnLoad(stubCtx)
  bsOnEnable(stubCtx)
  ejacOnLoad(stubCtx)
  ejacOnEnable(stubCtx)
}

const call = async (ns: string, method: string, ...args: any[]): Promise<any> =>
  (apiSystem as any).call(ns, method, ...args)

describe('jj_ 阴茎大小前提可达性（生产种子路径）', () => {
  beforeAll(async () => {
    await ensureBoot()
  })

  beforeEach(() => {
    entitySystem.clear()
  })

  it('首触种子：1000 男角色四档均出现（5/55/30/10），且镜像=档一致', async () => {
    for (let i = 0; i < 1000; i++) {
      entitySystem.register('character', `samp_${i}`, { id: `samp_${i}`, base: { 性别: 1 } })
    }
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const id = `samp_${i}`
      await call('body-shape', 'getPenisLength', id)
      const ch = entitySystem.get('character', id) as any
      const rank = ch.base['阴茎大小']
      const v = ch.body_shape['阴茎长度']
      const expectRank = v >= 16 ? 3 : v >= 12 ? 2 : v >= 8 ? 1 : 0
      expect(rank).toBe(expectRank)   // 镜像 = 档
      seen.add(rank)
    }
    for (const r of [0, 1, 2, 3]) expect(seen.has(r)).toBe(true)
  })

  it('重复读取不重掷：同一角色长度/镜像稳定（懒物化只发生一次）', async () => {
    entitySystem.register('character', 'p1', { id: 'p1', base: { 性别: 1 } })
    await call('body-shape', 'getPenisLength', 'p1')
    const ch1 = entitySystem.get('character', 'p1') as any
    const v1 = ch1.body_shape['阴茎长度']
    const rank1 = ch1.base['阴茎大小']
    await call('body-shape', 'getPenisLength', 'p1')
    const ch2 = entitySystem.get('character', 'p1') as any
    expect(ch2.body_shape['阴茎长度']).toBe(v1)
    expect(ch2.base['阴茎大小']).toBe(rank1)
  })

  it('jj_N 前提：显式作者档位首触后按镜像档位通过/排除', async () => {
    entitySystem.register('character', 'a', { id: 'a', base: { 性别: 1, 阴茎大小: 0 } })
    entitySystem.register('character', 'b', { id: 'b', base: { 性别: 1, 阴茎大小: 2 } })
    entitySystem.register('character', 'c', { id: 'c', base: { 性别: 1, 阴茎大小: 3 } })
    for (const [id, want] of [['a', 0], ['b', 2], ['c', 3]] as const) {
      await call('body-shape', 'getPenisLength', id)
      const ctx = { player: null, location: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 }, sourceId: id, selectedCharacterId: id } as any
      for (let s = 0; s <= 3; s++) {
        expect(conditionEngine.getPremiseValue(`jj_${s}`, ctx)).toBe(s === want)
      }
    }
  })
})