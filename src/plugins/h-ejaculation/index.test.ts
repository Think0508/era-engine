// 注释：h-ejaculation 射精欲衰减路径契约（2026-08-15 C1 修复——B6 小时监听删除）
// 单一衰减路径 = core realtime-settle.settleEjaDecay（行动级，仅玩家/非H/30分钟门控/-10每分钟，
// erArk realtime_settle.py:102-108 语义）；本文件守护：
// 1) addEja 写 last_eaj_add_time（30 分钟门控前提）
// 2) game:hour_changed 不再衰减（防重复实现回归——曾与 realtime-settle 双重衰减）
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
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', {  import: 'default', eager: true }) as Record<string, string>
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

describe('h-ejaculation 射精欲衰减路径契约（C1 修复）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
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

  it('addEja 写 last_eaj_add_time（门控前提：射精欲增加后 30 分钟内不衰减）', async () => {
    setGameTime(8, 0)
    makeChar('player_add', 500, null)
    await apiSystem.call('h-ejaculation', 'addEja', 'player_add', 100)
    const ch = entitySystem.get('character', 'player_add') as any
    expect(ch.base['射精欲']).toBe(600)
    expect(ch.action_info?.last_eaj_add_time).toBe(gameTimeToTotalMinutes(gameContext.getContext().time))
  })

  it('game:hour_changed 不再衰减（单一衰减路径 = realtime-settle 行动级，B6 监听已删）', async () => {
    setGameTime(8, 0)
    const player = entitySystem.get('character', 'player') as any
    player.base['射精欲'] = 1000
    const now = gameTimeToTotalMinutes(gameContext.getContext().time)
    player.action_info = { last_eaj_add_time: now - 120 }
    await eventBus.emit('game:hour_changed', { hour: 9 })
    expect(player.base['射精欲']).toBe(1000)
  })
})
