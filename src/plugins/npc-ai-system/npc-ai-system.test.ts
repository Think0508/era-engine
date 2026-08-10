// 注释：npc-ai-system 集成测试——结算通道/排班/门控/事件/每日结算/性能（全插件加载）
// 遵循复刻验证铁律：事件走真实 eventBus；状态断言到具体值

import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
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
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { dailySettle } from './index'

const GUARD = 'guard'
const INNKEEPER = 'innkeeper'

describe('npc-ai-system 集成', () => {
  let arrivedEvents: any[] = []
  let behaviorStartedEvents: any[] = []

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

    gameContext.setPlayer('player')
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

    eventBus.on('npc:arrived', (p: any) => { arrivedEvents.push(p) })
    eventBus.on('npc:behavior_started', (p: any) => { behaviorStartedEvents.push(p) })
  })

  beforeEach(() => {
    arrivedEvents = []
    behaviorStartedEvents = []
    // 注释：重置时间（避免跨测试污染；NPC 行为块由 clampBehaviorStart 钳正）
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('初始行为决策——首个结算 pass 后全部 NPC 脱离 __init__', async () => {
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (c.id === 'player') continue
      expect(c.ai_behavior?.id).not.toBeUndefined()
    }
    await gameContext.advanceTime(30)
    for (const char of entitySystem.getAll('character')) {
      const c = char as any
      if (c.id === 'player' || !c.ai_behavior) continue
      expect(c.ai_behavior.id).not.toBe('__init__')
      expect(c.ai_behavior.duration).toBeGreaterThan(0)
      // 镜像条件字段
      expect(c.state).toBe(c.ai_behavior.type)
      expect(c.current_behavior).toBe(c.ai_behavior.id)
    }
  })

  it('AI 前提注册——onLoad 后存在；clear + 重载后恢复（2026-08-10 排查修复：顶层副作用注册被 clear 永久清空）', async () => {
    const ids = premiseRegistry.getRegisteredIds()
    for (const need of ['ai_night', 'ai_not_at_home', 'ai_tired_level_2', 'ai_work_time']) {
      expect(ids).toContain(need)
    }
  })

  it('窗口结算——NPC 随时间积累疲劳/饥饿（erArk character_aotu_change_value）', async () => {
    const innkeeper = entitySystem.get('character', INNKEEPER) as any
    innkeeper.base['饥饿值'] = 0
    innkeeper.base['疲劳度'] = 0
    // activity=0 的酒馆老板：无排班 → 目标搜索兜底 wait/wander → 行为窗口结算
    await gameContext.advanceTime(60)
    expect(innkeeper.base['饥饿值']).toBeGreaterThan(0)
    expect(innkeeper.base['疲劳度']).toBeGreaterThan(0)
  })

  it('排班：工作时段（8-12）→ 在岗 auto_ai 直接工作', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    // 8:00 在 town_square（工作地点）→ 工作行为
    expect(guard.current_location).toBe('town_square')
    expect(guard.ai_behavior.type).toBe('work')
    expect(guard.ai_behavior.target).toBe('town_square')
    expect(guard.ai_behavior.params?.work_type).toBe('gate_duty')
  })

  it('排班：工作时间不在岗 → 前往工作地点（连锁：先移动后工作）', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    // 构造已到期行为块（10 分钟前开始的 5 分钟等待）→ 下一 pass 重新决策
    // 8:00 工作时段 + 不在岗（tavern）→ 连锁：move 回 town_square（到达）→ 工作
    const now = gameContext.getContext().time
    const nowMin = ((((now.year * 12 + (now.month - 1)) * 30 + (now.day - 1)) * 24 + now.hour) * 60 + now.minute)
    guard.ai_behavior = { id: 'wait', type: 'wait', start_time: nowMin - 10, duration: 5 }
    guard.current_location = 'tavern'
    await gameContext.advanceTime(30)
    // 移动已完成（到达 town_square）+ 进入工作
    expect(guard.current_location).toBe('town_square')
    expect(guard.ai_behavior.type).toBe('work')
    expect(arrivedEvents.some(e => e.character === GUARD && e.to === 'town_square')).toBe(true)
  })

  it('排班：娱乐时段（19-22）→ 娱乐行为', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    gameContext.setTime({ minute: 0, hour: 20, day: 1, month: 1, year: 1 })
    await gameContext.advanceTime(10)
    // 守卫晚上去 tavern 喝酒（entertainment evening=drink）
    expect(guard.ai_behavior.type).toBe('entertainment')
    expect(guard.ai_behavior.target).toBe('tavern')
    expect(guard.ai_behavior.params?.entertainment_type).toBe('drink')
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('setBehavior API：强制设定行为（move → 到达 npc:arrived + 位置更新）', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    guard.current_location = 'town_square'
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    await apiSystem.call('npc-ai', 'setBehavior', GUARD, 'move', { to: 'tavern' })
    expect(guard.ai_behavior.type).toBe('move')
    expect(guard.ai_behavior.duration).toBe(5) // graph town_square→tavern time_cost 5

    // 事件已发（behavior_started）
    expect(behaviorStartedEvents.some(e => e.character === GUARD && e.type === 'move')).toBe(true)

    await gameContext.advanceTime(10)
    // 移动完成 → 到达 tavern + 事件；随后工作排班（8:00-12:00 站岗）把他拉回 town_square
    expect(arrivedEvents.some(e => e.character === GUARD && e.to === 'tavern')).toBe(true)
    expect(guard.current_location).toBe('town_square')
    expect(guard.ai_behavior.type).toBe('work')
  })

  it('门控：监禁 → 原地等待（禁移动）', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    // 构造已到期行为块 → 决策被监禁门控接管
    const now = gameContext.getContext().time
    const nowMin = ((((now.year * 12 + (now.month - 1)) * 30 + (now.day - 1)) * 24 + now.hour) * 60 + now.minute)
    guard.sp_flag = { imprisonment: true }
    guard.current_location = 'town_square'
    guard.ai_behavior = { id: 'wait', type: 'wait', start_time: nowMin - 10, duration: 5 }
    await gameContext.advanceTime(30)
    expect(guard.ai_behavior.type).toBe('wait')
    expect(guard.ai_behavior.params?.reason).toBe('imprisonment')
    expect(guard.current_location).toBe('town_square')
    guard.sp_flag = {}
  })

  it('跳过集：战斗参与者冻结（行为块不变）', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    await apiSystem.call('combat', 'start', [GUARD], ['player'])
    const blockBefore = JSON.stringify(guard.ai_behavior)
    await gameContext.advanceTime(60)
    expect(JSON.stringify(guard.ai_behavior)).toBe(blockBefore)
    await apiSystem.call('combat', 'end', 'player', 'win')
  })

  it('跳过集：H 中的 NPC 冻结（h_state.is_h——2026-08-10 修复：此前误用 sp_flag.is_h 永不触发）', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    guard.h_state = { is_h: true }
    const blockBefore = JSON.stringify(guard.ai_behavior)
    await gameContext.advanceTime(60)
    expect(JSON.stringify(guard.ai_behavior)).toBe(blockBefore)
    guard.h_state = undefined
    // 解除后恢复正常结算
    await gameContext.advanceTime(30)
    expect(JSON.stringify(guard.ai_behavior)).not.toBe(blockBefore)
  })

  it('wait_flag：交互中的 NPC 不结算（pin）', async () => {
    const innkeeper = entitySystem.get('character', INNKEEPER) as any
    const blockBefore = JSON.stringify(innkeeper.ai_behavior)
    gameContext.setSelectedCharacterId(INNKEEPER)
    await gameContext.enterMode('dialogue')
    await gameContext.advanceTime(30)
    expect(JSON.stringify(innkeeper.ai_behavior)).toBe(blockBefore)
    await gameContext.exitMode()
    gameContext.setSelectedCharacterId(null)
    // 解除后恢复正常结算——推进 3 小时确保其行为块到期并重新决策
    await gameContext.advanceTime(180)
    expect(JSON.stringify(innkeeper.ai_behavior)).not.toBe(blockBefore)
  })

  it('每日结算：欲望增长仅 NPC（原 core newday-settle 归位，G2 决策）', () => {
    const demo = entitySystem.get('character', 'contract_demo') as any
    demo.base['欲望值'] = 0
    dailySettle()
    expect(demo.base['欲望值']).toBeGreaterThan(0)
    const player = entitySystem.get('character', 'player') as any
    const before = player.base?.['欲望值'] ?? player.params?.['欲望值'] ?? 0
    dailySettle()
    expect(player.base?.['欲望值'] ?? player.params?.['欲望值'] ?? 0).toBe(before)
  })

  // ═══════════════════ 边界回归（2026-08-10 排查修复） ═══════════════════

  it('边界：12:00 工作时段结束（半开区间 [8,12)）→ 不再工作', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    const now = gameContext.getContext().time
    const nowMin = ((((now.year * 12 + (now.month - 1)) * 30 + (now.day - 1)) * 24 + now.hour) * 60 + now.minute)
    guard.ai_behavior = { id: 'wait', type: 'wait', start_time: nowMin - 10, duration: 5 }
    guard.current_location = 'town_square'
    gameContext.setTime({ minute: 0, hour: 12, day: 1, month: 1, year: 1 })
    await gameContext.advanceTime(30)
    // 12:00 不在班（也不在娱乐时段 19-22）→ 目标搜索（wander/等待），绝不再是 work
    expect(guard.ai_behavior.type).not.toBe('work')
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('边界：workHandler 与排班同为半开区间（12:00 不命中 [8,12) 的 slot）', async () => {
    const { workHandler } = await import('./behavior-handlers')
    gameContext.setTime({ minute: 0, hour: 12, day: 1, month: 1, year: 1 })
    const guard = entitySystem.get('character', GUARD) as any
    const block = await workHandler({
      charId: GUARD, char: guard,
      spec: { type: 'work', name: '工作' },
      params: { work_type: 'gate_duty' },
      start_time: 0, now: 0,
    })
    // 不在 slot → 兜底时长（60），且不产生"到 13:00"的班末计算
    expect(block.duration).toBe(60)
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('边界：stayHandler until_hour 剩 <5 分钟 → 待满 5 分钟（不越界延长到次日）', async () => {
    const { stayHandler } = await import('./behavior-handlers')
    gameContext.setTime({ minute: 59, hour: 22, day: 1, month: 1, year: 1 })
    const block = stayHandler({
      charId: 'x', char: {},
      spec: { type: 'stay', name: '停留' },
      params: { until_hour: 23 },
      start_time: 0, now: 0,
    })
    expect(block.duration).toBe(5)
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('边界：sleepHandler 5:30 小睡到 6:00 → 30 分钟（不被拉到 60）', async () => {
    const { sleepHandler } = await import('./behavior-handlers')
    gameContext.setTime({ minute: 30, hour: 5, day: 1, month: 1, year: 1 })
    const block = sleepHandler({
      charId: 'x', char: {},
      spec: { type: 'sleep', name: '睡眠' },
      params: {}, start_time: 0, now: 0,
    })
    expect(block.duration).toBe(30)
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('链路：夜晚不在家 → 先回家再睡（go_home 补缺，erArk 睡宿舍语义）', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    gameContext.setTime({ minute: 0, hour: 23, day: 1, month: 1, year: 1 })
    const now = gameContext.getContext().time
    const nowMin = ((((now.year * 12 + (now.month - 1)) * 30 + (now.day - 1)) * 24 + now.hour) * 60 + now.minute)
    guard.ai_behavior = { id: 'wait', type: 'wait', start_time: nowMin - 10, duration: 5 }
    guard.behavior.home_locations = { town_square: 1.0 }
    guard.current_location = 'tavern'
    // 注释：显式清零疲劳——rest_tired（层40）与 sleep_night（层40）同层加权竞争，
    // 前置测试的窗口结算会隐式积累疲劳（settleTired 含随机）→ flaky（2026-08-11 加固）
    guard.base['疲劳度'] = 0
    await gameContext.advanceTime(60)
    // 连锁：go_home（move 回 town_square）→ 到家 → 夜晚睡眠（不再在酒馆原地睡）
    expect(guard.current_location).toBe('town_square')
    expect(guard.ai_behavior.type).toBe('sleep')
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('端到端：完整昼夜循环（深夜回家→睡眠→起床→上班）——两段真实节奏 pass', async () => {
    const guard = entitySystem.get('character', GUARD) as any
    // 构造：深夜 23:00，在 tavern，家 = town_square，行为已到期
    gameContext.setTime({ minute: 0, hour: 23, day: 1, month: 1, year: 1 })
    const now = gameContext.getContext().time
    const nowMin = ((((now.year * 12 + (now.month - 1)) * 30 + (now.day - 1)) * 24 + now.hour) * 60 + now.minute)
    guard.ai_behavior = { id: 'wait', type: 'wait', start_time: nowMin - 10, duration: 5 }
    guard.behavior.home_locations = { town_square: 1.0 }
    guard.current_location = 'tavern'
    guard.base['疲劳度'] = 80
    guard.base['饥饿值'] = 0

    // 注释：单 pass 内所有连锁决策用 pass 时刻上下文求值（erArk 同——cache.game_time
    // 固定）——超长窗口（如睡 12h）的中间决策以窗口末时刻求值。因此昼夜循环测试
    // 必须拆两段真实节奏 pass：深夜决策发生在晚间的正常 pass。
    // 第一段：23:00 → 0:00（深夜上下文：go_home → 到家 → sleep）
    await gameContext.advanceTime(60)
    expect(guard.current_location).toBe('town_square')
    expect(guard.ai_behavior.type).toBe('sleep')

    // 第二段：0:00 → 11:00（睡眠窗口结算 → 6:00 起床 → 8:00 上班 → 11:00 在班）
    await gameContext.advanceTime(11 * 60)
    expect(guard.ai_behavior.type).toBe('work')
    expect(guard.ai_behavior.target).toBe('town_square')
    // 睡眠削减了疲劳（80 → 睡眠 ~7h 削减 → 起床后低；工作再积累仍 < 80）
    expect(guard.base['疲劳度']).toBeLessThan(80)
    // 12 小时窗口积累了饥饿（0 → 有值）
    expect(guard.base['饥饿值']).toBeGreaterThan(0)
    // 行为时间线连续：当前块的 end 必须 > 当前时刻
    const time = gameContext.getContext().time
    const nowAfter = ((((time.year * 12 + (time.month - 1)) * 30 + (time.day - 1)) * 24 + time.hour) * 60 + time.minute)
    expect(guard.ai_behavior.start_time + guard.ai_behavior.duration).toBeGreaterThan(nowAfter)
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('性能冒烟：500 NPC 单轮结算在预算内', async () => {
    const ids: string[] = []
    for (let i = 0; i < 500; i++) {
      const id = `perf_npc_${i}`
      ids.push(id)
      entitySystem.register('character', id, {
        id,
        name: `测试${i}`,
        base: { '体力': 100, '体力上限': 1000, '气力': 100, '气力上限': 1000, '饥饿值': 0, '疲劳度': 0 },
        behavior: { activity: 0.2, home_locations: { town_square: 1.0 } },
        current_location: 'town_square',
      })
    }
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    const start = performance.now()
    await gameContext.advanceTime(30)
    const elapsed = performance.now() - start
    // 注释：全量 500+ NPC 同步结算——宽松上限（CI 环境波动；singleFork 串行 + 高负载时
    // 全插件集成文件可达 40-50s，本断言只验证"单轮不失控"，3000 在负载下偶发超——
    // 2026-08-10 放宽到 8000：预算 100ms/轮，超预算排后续轮，不阻塞）
    expect(elapsed).toBeLessThan(8000)
    // 全部 NPC 已脱离 __init__
    for (const id of ids) {
      const c = entitySystem.get('character', id) as any
      expect(c.ai_behavior?.id).not.toBe('__init__')
    }
    // 注释：测试文件进程隔离，perf NPC 不清理（无后续断言依赖）
  })
})
