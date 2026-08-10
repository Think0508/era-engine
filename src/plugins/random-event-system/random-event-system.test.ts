// 注释：random-event-system 集成测试——玩家/NPC 触发挂钩/地点门控/子事件选项/触发记录（全插件加载）
// 遵循复刻验证铁律：事件走真实 eventBus；状态断言到具体值
// 候选顺序 = 注册顺序（插件默认层 + mod 定义）；Math.random mock 固定选中目标事件

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { apiSystem } from '../../core/api'
import { commandRegistry } from '../../core/command-registry'
import { bindingResolver } from '../../core/binding-resolver'
import { conditionRegistry } from '../../core/condition-registry'
import { premiseRegistry } from '../../core/premise-registry'
import { errorReporter } from '../../core/error-reporter'
import { narrativeLog } from '../../core/narrative-log'
import { randomEventEngine } from '../../core/random-event'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'

const PLAYER = 'player'
const GUARD = 'guard'
const INNKEEPER = 'innkeeper'

describe('random-event-system 集成', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    premiseRegistry.clear()

    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (!mod) throw new Error('模组加载失败')
    bindingResolver.loadBindings(mod.bindings)
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)

    gameContext.setPlayer(PLAYER)
    const startLoc = entitySystem.get('location', 'town_square') as any
    if (startLoc) gameContext.setLocation(startLoc)

    const pluginManager = new PluginManager(apiSystem, eventBus, new SlotRegistry(), commandRegistry)
    const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
    const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const enginePlugins = new Map<string, { toml: string; module?: any }>()
    for (const [path, toml] of Object.entries(pluginTomls)) {
      const dirName = path.match(/\/src\/plugins\/([^/]+)\//)?.[1]
      if (!dirName) continue
      enginePlugins.set(dirName, {
        toml,
        module: pluginModules[`/src/plugins/${dirName}/index.ts`] ?? undefined,
      })
    }
    await pluginManager.loadPlugins(enginePlugins, new Map())
  })

  beforeEach(() => {
    narrativeLog.clear()
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    randomEventEngine.resetToday()
    gameContext.setSelectedCharacterId(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('玩家执行指令 → current_behavior 镜像 + chat 事件文本进叙事日志', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_behavior = 'wait'
    const guard = entitySystem.get('character', GUARD) as any
    guard.base['体力'] = 100
    // 模拟选中 guard（interactant）
    gameContext.setSelectedCharacterId(GUARD)
    await eventBus.emit('game:execution_end', { commandId: 'chat', timeCost: 10 })
    expect(player.current_behavior).toBe('chat')
    const logs = narrativeLog.getEntries().filter(e => e.type === 'event')
    expect(logs.length).toBeGreaterThan(0)
    expect(logs[0].text).toContain('闲聊')
    // 效果执行：体力 -3（target=selected → interactant guard）
    expect(guard.base['体力']).toBe(97)
  })

  it('NPC 同地点 rest 文本事件触发；不同地点不触发', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_location = 'town_square'
    const guard = entitySystem.get('character', GUARD) as any
    guard.current_location = 'town_square'
    await eventBus.emit('npc:behavior_started', { character: GUARD, behavior_id: 'rest', type: 'rest' })
    const logs = narrativeLog.getEntries().filter(e => e.type === 'event')
    expect(logs.some(l => l.text.includes('休息'))).toBe(true)

    narrativeLog.clear()
    const innkeeper = entitySystem.get('character', INNKEEPER) as any
    innkeeper.current_location = 'tavern'
    await eventBus.emit('npc:behavior_started', { character: INNKEEPER, behavior_id: 'rest', type: 'rest' })
    const logs2 = narrativeLog.getEntries().filter(e => e.type === 'event')
    expect(logs2.some(l => l.text.includes('休息'))).toBe(false)
  })

  it('静默事件（无文本）不同地点也触发——效果结算', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_location = 'town_square'
    const innkeeper = entitySystem.get('character', INNKEEPER) as any
    innkeeper.current_location = 'tavern'
    innkeeper.base['体力'] = 100
    // rest 候选：[rest_quiet, rest_silent_mark]——random 0.75 选中第二个（静默）
    await eventBus.emit('npc:behavior_started', { character: INNKEEPER, behavior_id: 'rest', type: 'rest' })
    expect(innkeeper.base['体力']).toBe(98)
  })

  it('父事件挂起子选项 → chooseOption 输出子事件文本并结算效果', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_behavior = 'wait'
    // move 候选：[move_see_swordsman, move_washroom_sound]——random 0.75 选中父事件
    await eventBus.emit('game:execution_end', { commandId: 'move', timeCost: 30 })
    const pending = await apiSystem.call('random-event', 'getPending')
    expect(pending).not.toBeNull()
    expect(pending.options.map((o: any) => o.eventId).sort()).toEqual(['move_washroom_enter', 'move_washroom_leave'])
    // 选择"转身离开"（noop）
    const ok = await apiSystem.call('random-event', 'chooseOption', 1)
    expect(ok).toBe(true)
    const logs = narrativeLog.getEntries().filter(e => e.type === 'event')
    expect(logs.some(l => l.text.includes('离开了浴室'))).toBe(true)
    expect(await apiSystem.call('random-event', 'getPending')).toBeNull()
  })

  it('trigger_guard unseen_today + record_event_today：同日第二次不触发', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    // 第一次：chat 候选 [chat_gossip, chat_today_greeting]——random 0.75 选中 greeting
    await eventBus.emit('game:execution_end', { commandId: 'chat', timeCost: 10 })
    const logs1 = narrativeLog.getEntries().filter(e => e.type === 'event')
    expect(logs1.some(l => l.text.includes('加油'))).toBe(true)
    // 第二次：greeting 被 guard 排除 → 回落到 chat_gossip
    narrativeLog.clear()
    await eventBus.emit('game:execution_end', { commandId: 'chat', timeCost: 10 })
    const logs2 = narrativeLog.getEntries().filter(e => e.type === 'event')
    expect(logs2.some(l => l.text.includes('闲聊'))).toBe(true)
    expect(logs2.some(l => l.text.includes('加油'))).toBe(false)
  })
})
