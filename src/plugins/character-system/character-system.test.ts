// 注释：character-system 离线生命周期测试（2026-08-10 前置）
// 离线 = 角色从活动世界消失：置 sp_flag.offline + 清位置 + 发 character:offline；
// 各"在场活动状态"属主监听该事件清自己的领域（follow-system 已接入）。

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { onEnable } from './index'

describe('character-system 离线生命周期', () => {
  let charApi: Record<string, Function> = {}
  let offlineEvents: any[] = []
  let onlineEvents: any[] = []

  const mockCtx: any = {
    api: {
      register: (ns: string, methods: Record<string, Function>) => {
        if (ns === 'character') charApi = { ...methods }
      },
      call: async () => {},
    },
    events: { on: () => {}, off: () => {}, emit: async () => {} },
    commands: { register: () => {}, unregister: () => {} },
    ui: { registerSlot: () => {} },
    parent: null,
    gameState: { currentLocation: null, player: null, time: { minute: 0, hour: 8, day: 1, month: 1, year: 1 } },
  }

  beforeAll(() => {
    // 注释：先注册实体，再 onEnable——initCharacterLocations 覆盖全部实体
    entitySystem.register('character', 'offline_demo', {
      id: 'offline_demo', name: '离线者',
      sp_flag: { offline: true },
      behavior: { activity: 0.5, home_locations: { town_square: 1.0, tavern: 0.3 } },
    })
    entitySystem.register('character', 'online_demo', {
      id: 'online_demo', name: '在线者',
      behavior: { activity: 0.5, home_locations: { town_square: 0.3, tavern: 0.7 } },
    })
    entitySystem.register('character', 'noloc_demo', {
      id: 'noloc_demo', name: '无家者',
    })
    onEnable(mockCtx)

    eventBus.on('character:offline', (p: any) => { offlineEvents.push(p) })
    eventBus.on('character:online', (p: any) => { onlineEvents.push(p) })
  })

  beforeEach(() => {
    offlineEvents = []
    onlineEvents = []
  })

  it('initCharacterLocations：离线角色不重放回地图；在线角色按最高权重落位', () => {
    const offline = entitySystem.get('character', 'offline_demo') as any
    const online = entitySystem.get('character', 'online_demo') as any
    const noloc = entitySystem.get('character', 'noloc_demo') as any
    expect(offline.current_location).toBeUndefined()
    expect(online.current_location).toBe('tavern')
    expect(noloc.current_location).toBeUndefined()
  })

  it('setOffline：置位 + 清位置 + 发事件 + 幂等', () => {
    const online = entitySystem.get('character', 'online_demo') as any
    expect(online.current_location).toBe('tavern')
    charApi.setOffline('online_demo', 'bagged')
    expect(online.sp_flag.offline).toBe(true)
    expect(online.current_location).toBeNull()
    expect(offlineEvents).toEqual([{ id: 'online_demo', reason: 'bagged' }])
    expect(charApi.isOffline('online_demo')).toBe(true)

    // 注释：幂等——重复调用不重复发事件
    offlineEvents = []
    charApi.setOffline('online_demo')
    expect(offlineEvents).toHaveLength(0)
  })

  it('setOnline：恢复在线 + 位置（显式优先，缺省用 home 最高权重）+ 事件', () => {
    const online = entitySystem.get('character', 'online_demo') as any
    // 注释：显式位置
    charApi.setOnline('online_demo', 'town_square')
    expect(online.sp_flag.offline).toBe(false)
    expect(online.current_location).toBe('town_square')
    expect(onlineEvents).toEqual([{ id: 'online_demo' }])
    expect(charApi.isOffline('online_demo')).toBe(false)

    // 注释：缺省位置 → home_locations 最高权重
    charApi.setOffline('online_demo')
    onlineEvents = []
    charApi.setOnline('online_demo')
    expect(online.current_location).toBe('tavern')
  })

  it('setOnline 幂等：不在离线态不重复发事件', () => {
    onlineEvents = []
    charApi.setOnline('online_demo', 'tavern')
    expect(onlineEvents).toHaveLength(0)
  })

  // 注释：⚠️ 2026-08-14 第五轮审查——initLocations API（世界重建后重新分配 NPC 位置）
  it('initLocations API：清空位置后重新按权重分配（已有位置跳过）', () => {
    const online = entitySystem.get('character', 'online_demo') as any
    const noloc = entitySystem.get('character', 'noloc_demo') as any
    // 模拟世界重建：清空位置
    online.current_location = undefined
    noloc.current_location = undefined
    charApi.initLocations()
    // 在线者按最高权重回落位
    expect(online.current_location).toBe('tavern')
    // 无 home_locations 者仍无位置
    expect(noloc.current_location).toBeUndefined()
    // 幂等：已有位置不动
    online.current_location = 'town_square'
    charApi.initLocations()
    expect(online.current_location).toBe('town_square')
  })
})
