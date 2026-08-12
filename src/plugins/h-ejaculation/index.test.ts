// 注释：h-ejaculation 射精欲衰减测试（B6 修复——audit-b I5）
// erArk realtime_settle.py:102-108：仅玩家、仅非 H、距上次射精欲增加 > 30 分钟才衰减，
// 衰减量 = int(true_add_time×10)（引擎按每小时 60 分钟结算 = -600）
import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext, gameTimeToTotalMinutes } from '../../core/game-context'
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

function setGameTime(hour: number, minute: number): void {
  gameContext.setTime({ minute, hour, day: 1, month: 1, year: 1 })
}

describe('h-ejaculation 射精欲衰减（B6）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
    // 注释：test-mod roster 已注册 player——复用，不再重复注册
    const existing = entitySystem.get('character', 'player')
    if (!existing) entitySystem.register('character', 'player', { id: 'player', name: '玩家', base: {} } as any)
    gameContext.setPlayer('player')
  })

  function makeChar(id: string, eja: number, lastAddMinAgo: number | null, inH = false): any {
    const char: any = { id, name: id, base: { '射精欲': eja } }
    if (inH) char.h_state = { is_h: true }
    if (lastAddMinAgo != null) {
      const now = gameTimeToTotalMinutes(gameContext.getContext().time)
      char.action_info = { last_eaj_add_time: now - lastAddMinAgo }
    }
    entitySystem.register('character', id, char)
    return char
  }

  it('仅玩家衰减：NPC 射精欲不受影响', async () => {
    setGameTime(8, 0)
    // 玩家复用 beforeAll 注册的实体（test-mod 已注册），直接改字段
    const player = entitySystem.get('character', 'player') as any
    player.base['射精欲'] = 1000
    const now = gameTimeToTotalMinutes(gameContext.getContext().time)
    player.action_info = { last_eaj_add_time: now - 120 }
    const npc = makeChar('npc_eja', 1000, 120)
    await eventBus.emit('game:hour_changed', { hour: 9 })
    expect(player.base['射精欲']).toBe(400)
    expect(npc.base['射精欲']).toBe(1000)
  })

  it('30 分钟门控：距上次射精欲增加 ≤30 分钟不衰减', async () => {
    setGameTime(8, 0)
    const fresh = makeChar('player_fresh', 1000, 10)
    await eventBus.emit('game:hour_changed', { hour: 9 })
    expect(fresh.base['射精欲']).toBe(1000)
  })

  it('H 中不衰减', async () => {
    setGameTime(8, 0)
    const inH = makeChar('player_h', 1000, 120, true)
    await eventBus.emit('game:hour_changed', { hour: 9 })
    expect(inH.base['射精欲']).toBe(1000)
  })

  it('addEja 写 last_eaj_add_time（门控前提：射精欲增加后 30 分钟内不衰减）', async () => {
    setGameTime(8, 0)
    makeChar('player_add', 500, null)
    // 通过 addEja API 增加射精欲（orgasmJudge 积累路径）→ 应写 last_eaj_add_time
    await apiSystem.call('h-ejaculation', 'addEja', 'player_add', 100)
    const ch = entitySystem.get('character', 'player_add') as any
    expect(ch.base['射精欲']).toBe(600)
    expect(ch.action_info?.last_eaj_add_time).toBe(gameTimeToTotalMinutes(gameContext.getContext().time))
    // 门控生效：刚增加后 hour_changed 不衰减
    await eventBus.emit('game:hour_changed', { hour: 9 })
    expect(ch.base['射精欲']).toBe(600)
  })
})
