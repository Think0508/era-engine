// 注释：h-group-sex SCENE_* 前提同地点过滤测试（B7 修复——audit-b I6）
// 原 SCENE_OVER_TWO/SCENE_ALL_NOT_H/SCENE_ALL_NOT_TIRED 全图扫描（entitySystem.getAll
// 无地点过滤）——500 NPC mod 下 SCENE_ALL_NOT_TIRED 恒 false。修复：按当前地点过滤
//（erArk scene_data.character_list = 同场景，h-hidden 同款修复模式）
import { conditionEngine, premiseWeight } from '../../core/condition-engine'
import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { commandRegistry } from '../../core/command-registry'
import { errorReporter } from '../../core/error-reporter'

async function bootPlugins() {
  const pluginManager = new PluginManager(apiSystem, eventBus, new SlotRegistry(), commandRegistry)
  const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const enginePlugins = new Map<string, { toml: string; module?: any }>()
  for (const [path, toml] of Object.entries(pluginTomls)) {
    const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
    if (!dirName) continue
    enginePlugins.set(dirName, { toml, module: pluginModules[`/src/plugins/${dirName}/index.ts`] ?? undefined })
  }
  await pluginManager.loadPlugins(enginePlugins, new Map())
}

// 注释：前提通过 = 求值权重 > 0（boolean 前提通过计 1）
function premisePasses(id: string): boolean {
  try {
    return premiseWeight(conditionEngine.getPremiseValue(id, { ...gameContext.getContext(), selectedCharacterId: 'player' })) > 0
  } catch {
    return false
  }
}

describe('h-group-sex SCENE_* 前提（B7 同地点过滤）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
  })

  // 注释：幂等注册（多个测试共用 setupScene）
  function ensureChar(id: string, data: any): any {
    const existing = entitySystem.get('character', id)
    if (existing) return existing
    entitySystem.register('character', id, data as any)
    return entitySystem.get('character', id) as any
  }

  function setupScene() {
    // 当前地点 loc_a
    const locA = entitySystem.get('location', 'town_square') as any
    gameContext.setLocation(locA)
    // 先把 test-mod 存量角色全部移到异地（initCharacterLocations 在 boot 时把全员放在 home）
    for (const ch of entitySystem.getAll('character')) {
      if (!['gs_c1', 'gs_c2', 'gs_c3', 'gs_c4'].includes(ch.id)) {
        ;(ch as any).current_location = 'elsewhere'
      }
    }
    // 同地点角色：玩家 + c1（H 中）+ c3（疲劳 80）
    const player = entitySystem.get('character', 'player') as any
    player.current_location = 'town_square'
    ensureChar('gs_c1', { id: 'gs_c1', name: 'c1', current_location: 'town_square', h_state: { is_h: true } })
    ensureChar('gs_c3', { id: 'gs_c3', name: 'c3', current_location: 'town_square', base: { '疲劳度': 80 } })
    // 异地角色：c2（H 中）+ c4（疲劳 80）——不应影响同地点判定
    ensureChar('gs_c2', { id: 'gs_c2', name: 'c2', current_location: 'other_place', h_state: { is_h: true } })
    ensureChar('gs_c4', { id: 'gs_c4', name: 'c4', current_location: 'other_place', base: { '疲劳度': 90 } })
    // 注释：重复 setup 时重置位置（前面的测试可能改过 current_location）
    ;(entitySystem.get('character', 'gs_c1') as any).current_location = 'town_square'
    ;(entitySystem.get('character', 'gs_c3') as any).current_location = 'town_square'
    ;(entitySystem.get('character', 'gs_c2') as any).current_location = 'other_place'
    ;(entitySystem.get('character', 'gs_c4') as any).current_location = 'other_place'
  }

  it('前提已注册（h-group-sex onEnable 实际执行）', () => {
    expect(conditionEngine.getRegisteredPremiseIds().map(id => id.toUpperCase())).toContain('SCENE_OVER_TWO')
    expect(conditionEngine.getRegisteredPremiseIds().map(id => id.toUpperCase())).toContain('SCENE_ALL_NOT_H')
    expect(conditionEngine.getRegisteredPremiseIds().map(id => id.toUpperCase())).toContain('SCENE_ALL_NOT_TIRED')
  })

  it('SCENE_OVER_TWO：只按同地点角色计数（异地角色不计入）', () => {
    setupScene()
    // 同地点 3 人（player + gs_c1 + gs_c3）> 2 → true
    expect(premisePasses('SCENE_OVER_TWO')).toBe(true)
    // 移走一人到异地 → 同地点 2 人 → false（若全图扫描仍 4 人恒 true——本断言区分修复前后）
    ;(entitySystem.get('character', 'gs_c3') as any).current_location = 'other_place'
    expect(premisePasses('SCENE_OVER_TWO')).toBe(false)
  })

  it('SCENE_ALL_NOT_H：同地点有人在 H → false；异地 H 角色不影响', () => {
    setupScene()
    expect(premisePasses('SCENE_ALL_NOT_H')).toBe(false)
    // 同地点全部退出 H → true（异地 gs_c2 仍在 H 不影响）
    ;(entitySystem.get('character', 'gs_c1') as any).h_state.is_h = false
    expect(premisePasses('SCENE_ALL_NOT_H')).toBe(true)
  })

  it('SCENE_ALL_NOT_TIRED：同地点有人疲劳>74 → false；异地疲劳角色不影响', () => {
    setupScene()
    expect(premisePasses('SCENE_ALL_NOT_TIRED')).toBe(false)
    // 同地点疲劳清零 → true（异地 gs_c4 疲劳 90 不影响——原全图扫描在此恒 false）
    ;(entitySystem.get('character', 'gs_c3') as any).base['疲劳度'] = 50
    expect(premisePasses('SCENE_ALL_NOT_TIRED')).toBe(true)
  })
})
