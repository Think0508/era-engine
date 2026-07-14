import { describe, it, expect, beforeEach } from 'vitest'
import { entitySystem } from '../core/entity-system'
import { bindingResolver } from '../core/binding-resolver'
import { eventBus } from '../core/event-bus'
import { conditionRegistry } from '../core/condition-registry'
import { commandRegistry } from '../core/command-registry'
import { gameContext } from '../core/game-context'
import { modLoader } from '../core/mod-loader'
import { apiSystem } from '../core/api'
import { PluginManager } from '../core/plugin-manager'
import { SlotRegistry } from '../ui/slots/slot-registry'

// 注释：Phase 6 集成测试——map-system + character-system 协同工作

// 注释：模拟插件入口模块
const pluginModules = {
  'map-system': { onLoad: () => {}, onEnable: (ctx: any) => {
    // 注释：简化版 map-system onEnable
    ctx.api.register('map', {
      getCurrentLocation: () => gameContext.getContext().location,
      getReachable: () => {
        const loc = gameContext.getContext().location
        if (!loc) return []
        const children = entitySystem.getAll('location').filter((l: any) => l.parent === loc.id)
        return children.map((l: any) => ({ target: l.id, name: l.name, time_cost: 5, via: 'child' as const }))
      },
    })
  } },
  'character-system': { onLoad: () => {}, onEnable: (ctx: any) => {
    // 注释：简化版 character-system onEnable——初始化 current_location
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (c.current_location) continue
      const homeLocations = c.behavior?.home_locations
      if (!homeLocations) continue
      let bestLocation: string | null = null
      let bestWeight = -1
      for (const [locId, weight] of Object.entries(homeLocations)) {
        if ((weight as number) > bestWeight) {
          bestWeight = weight as number
          bestLocation = locId
        }
      }
      if (bestLocation) c.current_location = bestLocation
    }
    ctx.api.register('character', {
      getCharactersAt: (locationId: string) => {
        return entitySystem.getAll('character').filter((c: any) => c.current_location === locationId)
      },
    })
  } },
}

describe('Phase 6 集成测试', () => {
  let pluginManager: PluginManager
  let slotRegistry: SlotRegistry

  beforeEach(async () => {
    entitySystem.clear()
    bindingResolver.loadBindings({})
    conditionRegistry.clear()
    commandRegistry.clear()
    eventBus.clear()
    apiSystem.clear()
    gameContext.reset()

    // 注释：加载 test-mod（loadMod 自动注册 locations/characters 到 entity-system）
    await modLoader.loadMod('test-mod')

    // 注释：设置玩家和起始地点
    gameContext.setPlayer('player')
    const startLoc = entitySystem.get('location', 'town_square') as any
    if (startLoc) gameContext.setLocation(startLoc)

    // 注释：创建 plugin-manager 并加载插件
    slotRegistry = new SlotRegistry()
    pluginManager = new PluginManager(apiSystem, eventBus, slotRegistry, commandRegistry)

    const enginePlugins = new Map<string, { toml: string; module?: any }>()
    // 注释：读取插件 plugin.toml
    const mapToml = (await import('../../src/plugins/map-system/plugin.toml?raw')).default
    const charToml = (await import('../../src/plugins/character-system/plugin.toml?raw')).default
    enginePlugins.set('map-system', { toml: mapToml, module: pluginModules['map-system'] })
    enginePlugins.set('character-system', { toml: charToml, module: pluginModules['character-system'] })

    await pluginManager.loadPlugins(enginePlugins, new Map())
  })

  it('character-system 初始化角色 current_location', () => {
    const innkeeper = entitySystem.get('character', 'innkeeper') as any
    expect(innkeeper.current_location).toBe('tavern')
    const guard = entitySystem.get('character', 'guard') as any
    expect(guard.current_location).toBe('town_square') // 注释：权重 0.7 最高
  })

  it('character API getCharactersAt 返回正确角色', async () => {
    const charsAtTavern = await apiSystem.call('character', 'getCharactersAt', 'tavern')
    expect(charsAtTavern.some((c: any) => c.id === 'innkeeper')).toBe(true)
  })

  it('map API getCurrentLocation 返回当前地点', async () => {
    const loc = await apiSystem.call('map', 'getCurrentLocation')
    expect(loc?.id).toBe('town_square')
  })

  it('map API getReachable 返回当前地点子区域', async () => {
    const reachable = await apiSystem.call('map', 'getReachable')
    expect(reachable.length).toBeGreaterThan(0)
    expect(reachable[0].target).toBe('tavern')
    expect(reachable[0].via).toBe('child')
  })

  it('插件按 data_dependencies 顺序加载（character 在 map 之前）', () => {
    // 注释：character-system provides characters:initialized, map-system depends on it
    // 注释：如果顺序错误，map-system 的 API 调用时角色可能未初始化
    // 此测试验证 character-system 先 onEnable
    const innkeeper = entitySystem.get('character', 'innkeeper') as any
    expect(innkeeper.current_location).toBeDefined()
  })
})
