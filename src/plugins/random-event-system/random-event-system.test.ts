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
import { getGameStateProviders } from '../../core/save-system'
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
    // 远处 NPC 静默事件的数值结算不得泄漏到叙事日志（_silent + narrative_output 过滤）
    const logs = narrativeLog.getEntries().filter(e => e.type === 'event' || e.source === 'effect-system')
    expect(logs.length).toBe(0)
  })

  it('父事件挂起子选项 → chooseOption 输出子事件文本并结算效果', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_behavior = 'wait'
    player.current_location = 'town_square'
    // move 候选：[move_see_swordsman, move_washroom_sound]——random 0.75 选中父事件（移动链路触发）
    await eventBus.emit('location:enter', { to: 'tavern', from: 'town_square' })
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

  it('文本插值：talk-common 变量替换 / 未知变量原样 / 实体占位符替换', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    // wait 桶候选：[wait_notice_bird（默认层）, move_talk_var（mods）]——random 0.75 选中第二个
    await apiSystem.call('random-event', 'triggerFor', 'player', 'wait', null)
    const logs = narrativeLog.getEntries().filter(e => e.type === 'event')
    expect(logs.length).toBe(1)
    const text = logs[0].text
    expect(text).toContain('玩家')          // {self.name}
    expect(text).not.toContain('{penis}')   // talk-common 词库替换
    expect(text).toContain('{no_such_var}') // 未知变量原样保留
  })

  it('存档接线：random-event gameState provider 的 serialize/restore 往返', () => {
    const provider = getGameStateProviders().find(p => p.id === 'random-event')
    expect(provider).toBeDefined()
    randomEventEngine.recordTriggered('move_see_swordsman')
    randomEventEngine.recordTodayTriggered('chat_gossip')
    const data = provider!.serialize()
    randomEventEngine.restore({ all: [], today: [] })
    provider!.restore(data)
    expect(randomEventEngine.isTriggered('move_see_swordsman')).toBe(true)
    expect(randomEventEngine.isTodayTriggered('chat_gossip')).toBe(true)
  })

  it('玩家移动链路：location:enter {from} → move 行为事件 + current_behavior 镜像', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_location = 'town_square'
    player.current_behavior = 'wait'
    await eventBus.emit('location:enter', { to: 'tavern', from: 'town_square' })
    expect(player.current_behavior).toBe('move')
    const logs = narrativeLog.getEntries().filter(e => e.type === 'event')
    expect(logs.some(l => l.text.includes('剑客'))).toBe(true)
  })

  it('move 指令的 execution_end 不触发事件（只打开地图界面，移动由 location:enter 触发）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_behavior = 'wait'
    await eventBus.emit('game:execution_end', { commandId: 'move', timeCost: 5 })
    expect(player.current_behavior).toBe('wait')
    expect(narrativeLog.getEntries().filter(e => e.type === 'event')).toHaveLength(0)
  })

  it('set_interactant player_target_to_me：gameContext 同步 + 广播 UI 选中事件', async () => {
    const captured: any[] = []
    const handler = (p: any) => { captured.push(p) }
    eventBus.on('random-event:select_character', handler)
    // 注入带 set_interactant 效果的静默事件（无文本 → NPC 任意地点触发）
    randomEventEngine.registerAll([
      { id: 'evt_invite', behavior: 'evt_invite_test', type: 2, effects: [{ type: 'set_interactant', params: { mode: 'player_target_to_me' } }] },
    ])
    await apiSystem.call('random-event', 'triggerFor', GUARD, 'evt_invite_test', null)
    expect(gameContext.getContext().selectedCharacterId).toBe(GUARD)
    expect(captured.length).toBe(1)
    expect(captured[0].characterId).toBe(GUARD)
    eventBus.off('random-event:select_character', handler)
    randomEventEngine.registerAll(modLoader.getMod()?.events ?? [])
  })

  it('NPC 选项在玩家指令结算中挂起 → execution_end 不清（保留到 IDLE 显示）', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_location = 'town_square'
    const guard = entitySystem.get('character', GUARD) as any
    guard.current_location = 'town_square'
    // NPC 行为开始（玩家指令 advanceTime 中）→ 挂起选项
    await eventBus.emit('npc:behavior_started', { character: GUARD, behavior_id: 'rest', type: 'rest' })
    // 等等——rest 桶无父事件，用 move 桶验证：NPC 挂 move 事件？改用直接验证：NPC 父事件挂起后
    // 玩家 execution_end 不清（guard 在 town_square，挂 NPC 事件需挂载键含父事件——rest 无，
    // 用 triggerFor 直接触发 move 桶的父事件模拟 NPC 侧挂起）
    randomEventEngine.registerAll([
      { id: 'npc_father', behavior: 'npc_father_test', type: 0, text: '远处招呼|NPC 向你招手。', effects: [{ type: 'open_son_options', params: {} }] },
      { id: 'npc_son', behavior: 'npc_father_test', type: 0, text: '过去看看|你走了过去。', option_son: true, effects: [] },
    ])
    await apiSystem.call('random-event', 'triggerFor', GUARD, 'npc_father_test', PLAYER)
    expect(await apiSystem.call('random-event', 'getPending')).not.toBeNull()
    // 玩家指令结算 → 不清 NPC 选项
    await eventBus.emit('game:execution_end', { commandId: 'chat', timeCost: 10 })
    expect(await apiSystem.call('random-event', 'getPending')).not.toBeNull()
    // 玩家主动行动开始 → 作废
    await eventBus.emit('game:execution_start', { commandId: 'chat' })
    expect(await apiSystem.call('random-event', 'getPending')).toBeNull()
    randomEventEngine.registerAll(modLoader.getMod()?.events ?? [])
  })

  it('读档（game:load）清挂起选项', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const player = entitySystem.get('character', PLAYER) as any
    player.current_behavior = 'wait'
    player.current_location = 'town_square'
    // move 候选：[move_see_swordsman, move_washroom_sound]——random 0.75 选中父事件
    await eventBus.emit('location:enter', { to: 'tavern', from: 'town_square' })
    expect(await apiSystem.call('random-event', 'getPending')).not.toBeNull()
    await eventBus.emit('game:load', {})
    expect(await apiSystem.call('random-event', 'getPending')).toBeNull()
  })
})
