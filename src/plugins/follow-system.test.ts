// 注释：follow-system 测试——跟随系统全链路（全插件加载集成）
// 遵循复刻验证铁律：事件走真实 eventBus（防 stub no-op 测试盲区）；状态断言到具体值

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { eventBus } from '../core/event-bus'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { bindingResolver } from '../core/binding-resolver'
import { conditionRegistry } from '../core/condition-registry'
import { errorReporter } from '../core/error-reporter'
import { narrativeLog } from '../core/narrative-log'
import { PluginManager } from '../core/plugin-manager'
import { SlotRegistry } from '../ui/slots/slot-registry'
import { effectTypeRegistry } from '../core/effect-type-registry'
import { conditionEngine } from '../core/condition-engine'
import { commandExecutor } from '../core/command-executor'
import { makeTestExecCtx } from '../utils/test-helpers'

const TEST_GIRL = 'test_girl'
const GUARD = 'guard'

describe('follow-system 跟随系统', () => {
  let startedEvents: any[] = []
  let endedEvents: any[] = []
  let offlineEvents: any[] = []

  beforeAll(async () => {
    // 注释：1. 清空全局状态（测试隔离）
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()

    // 注释：2. 加载 mod + bindings（默认无绑定 → 疲劳检查降级路径）
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (!mod) throw new Error('模组加载失败')
    bindingResolver.loadBindings({})
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)

    // 注释：3. 设置玩家与起始地点（forest 为测试注册的第三地点，供瞬移测试用）
    entitySystem.register('location', 'forest', { id: 'forest', name: '森林', parent: 'town_square', type: 'field', tags: [] })
    gameContext.setPlayer('player')
    const startLoc = entitySystem.get('location', 'town_square') as any
    if (startLoc) gameContext.setLocation(startLoc)

    // 注释：4. 全量加载插件（含 follow-system/native-instructions）
    const pluginManager = new PluginManager(apiSystem, eventBus, new SlotRegistry(), commandRegistry)
    const pluginModules = import.meta.glob('/src/plugins/*/index.ts', { eager: true }) as Record<string, any>
    const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', {  import: 'default', eager: true }) as Record<string, string>
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

    // 注释：5. 事件捕获（真实 eventBus）
    eventBus.on('follow:started', (p: any) => { startedEvents.push(p) })
    eventBus.on('follow:ended', (p: any) => { endedEvents.push(p) })
    eventBus.on('character:offline', (p: any) => { offlineEvents.push(p) })
  })

  beforeEach(() => {
    startedEvents = []
    endedEvents = []
    offlineEvents = []
    errorReporter.clear()
    // 注释：重置测试角色到基准态（town_square + 未跟随 + 体力充足 + 存活在线）
    for (const id of [TEST_GIRL, GUARD]) {
      const c = entitySystem.get('character', id) as any
      if (!c) continue
      c.sp_flag = { ...(c.sp_flag ?? {}) }
      c.sp_flag.is_follow = 0
      c.sp_flag.offline = false
      c.current_location = 'town_square'
      c.dead = undefined
      if (!c.base) c.base = {}
      c.base.体力 = 80
    }
    gameContext.setLocation(entitySystem.get('location', 'town_square') as any)
  })

  it('插件加载成功（无禁用）', () => {
    expect(errorReporter.getErrors().length).toBe(0)
  })

  it('API：invite/end 状态转换 + 事件（started/ended 带 reason）', async () => {
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const ch = entitySystem.get('character', TEST_GIRL) as any
    expect(ch.sp_flag.is_follow).toBe(1)
    expect(await apiSystem.call('follow', 'isFollowing', TEST_GIRL)).toBe(true)
    expect(await apiSystem.call('follow', 'getMode', TEST_GIRL)).toBe(1)
    expect(await apiSystem.call('follow', 'isControlled', TEST_GIRL)).toBe(true)
    expect(startedEvents).toEqual([{ character: TEST_GIRL, mode: 1 }])

    await apiSystem.call('follow', 'end', TEST_GIRL)
    expect(ch.sp_flag.is_follow).toBe(0)
    expect(endedEvents).toEqual([{ character: TEST_GIRL, reason: 'instruction' }])
  })

  it('API：mode 3 报错不改状态；mode 4 存储 + warning', async () => {
    await apiSystem.call('follow', 'setMode', TEST_GIRL, 3)
    const ch = entitySystem.get('character', TEST_GIRL) as any
    expect(ch.sp_flag.is_follow ?? 0).toBe(0)
    expect(errorReporter.getErrors().some(e => e.message.includes('模式 3'))).toBe(true)

    await apiSystem.call('follow', 'setMode', TEST_GIRL, 4)
    expect(ch.sp_flag.is_follow).toBe(4)
    expect(errorReporter.getErrors().some(e => e.message.includes('召唤'))).toBe(true)
    expect(startedEvents).toEqual([{ character: TEST_GIRL, mode: 4 }])
  })

  it('getFollowers 返回所有跟随者', async () => {
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    await apiSystem.call('follow', 'invite', GUARD)
    const followers = await apiSystem.call('follow', 'getFollowers')
    expect(followers).toContain(TEST_GIRL)
    expect(followers).toContain(GUARD)
  })

  it('瞬移同步：玩家移动 → 原地点跟随者同时到达新地点', async () => {
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    // 注释：非跟随者在原地点——不应被移动
    const guard = entitySystem.get('character', GUARD) as any
    guard.current_location = 'town_square'

    await gameContext.moveTo('forest', 5)

    const girl = entitySystem.get('character', TEST_GIRL) as any
    expect(girl.current_location).toBe('forest')
    expect(guard.current_location).toBe('town_square')
    expect(gameContext.getContext().location?.id).toBe('forest')
  })

  it('瞬移同步：只移动与玩家同位置的跟随者；时停冻结者不移动', async () => {
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.current_location = 'tavern' // 注释：异地跟随者不追（erArk 忠实行为）
    await gameContext.moveTo('forest', 5)
    expect(girl.current_location).toBe('tavern')

    // 注释：时停冻结跟随者不瞬移
    girl.current_location = 'forest'
    girl.sp_flag.is_follow = 1
    girl.sp_flag.unconscious_h = 3
    await gameContext.moveTo('town_square', 5)
    expect(girl.current_location).toBe('forest')
    girl.sp_flag.unconscious_h = 0
  })

  it('瞬移同步：玩家自身防御性跳过（即使被误置 is_follow 也不动）', async () => {
    // 注释：回归测试——teleportFollowers 的 playerId 守卫
    const player = entitySystem.get('character', 'player') as any
    player.sp_flag = { is_follow: 1 }
    player.current_location = 'town_square'
    await gameContext.moveTo('forest', 5)
    expect(player.current_location).toBe('town_square')
    player.sp_flag = {}
  })

  it('死亡跟随者不瞬移、不疲劳解除、不强制移动（防僵尸跟随）', async () => {
    bindingResolver.loadBindings({ 'follow-system': { hp: '体力' } })
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.dead = true
    girl.base.体力 = 1

    // 注释：瞬移跳过
    girl.current_location = 'town_square'
    await gameContext.moveTo('forest', 5)
    expect(girl.current_location).toBe('town_square')

    // 注释：疲劳解除跳过（死亡角色不触发"太累了"）
    await eventBus.emit('game:hour_changed', { hour: 12 })
    expect(girl.sp_flag.is_follow).toBe(1)
    expect(endedEvents).toHaveLength(0)

    // 注释：mode 2 强制移动跳过
    await apiSystem.call('follow', 'setMode', TEST_GIRL, 2)
    girl.current_location = 'tavern'
    await eventBus.emit('game:hour_changed', { hour: 13 })
    expect(girl.current_location).toBe('tavern')
  })

  it('疲劳自动解除：绑定 hp → 体力 ≤1 解除 + 提示 + reason=fatigue', async () => {
    bindingResolver.loadBindings({ 'follow-system': { hp: '体力' } })
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.base.体力 = 1

    const writeSpy = vi.spyOn(narrativeLog, 'write')
    await eventBus.emit('game:hour_changed', { hour: 12 })

    expect(girl.sp_flag.is_follow).toBe(0)
    expect(writeSpy.mock.calls.some(c => String(c[0]).includes('太累了'))).toBe(true)
    expect(endedEvents).toEqual([{ character: TEST_GIRL, reason: 'fatigue' }])
    writeSpy.mockRestore()
  })

  it('疲劳检查降级：未绑定 hp → 体力 ≤1 不解除（warning 不阻塞）', async () => {
    bindingResolver.loadBindings({})
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.base.体力 = 1

    await eventBus.emit('game:hour_changed', { hour: 12 })
    expect(girl.sp_flag.is_follow).toBe(1)
    expect(endedEvents).toHaveLength(0)
  })

  it('疲劳判定读本插件绑定：跨插件同名键（combat-base 也绑 hp）不读错', async () => {
    // 注释：回归测试——bindingResolver.get 跨插件首个映射胜出，combat-base 的 hp→"hp"
    // 排在 follow-system 之前时会读错属性（静默）。getForPlugin 只读自己的映射。
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp', mp: 'mp' },
      'follow-system': { hp: '体力' },
    })
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.base.体力 = 1
    girl.base.hp = 100 // 注释：另一个插件的 hp 属性充足——若读错则不会解除

    await eventBus.emit('game:hour_changed', { hour: 12 })
    expect(girl.sp_flag.is_follow).toBe(0)
    expect(endedEvents).toEqual([{ character: TEST_GIRL, reason: 'fatigue' }])
  })

  it('强制跟随（mode 2）：每小时移动到玩家位置', async () => {
    await apiSystem.call('follow', 'setMode', TEST_GIRL, 2)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.current_location = 'tavern'

    await eventBus.emit('game:hour_changed', { hour: 13 })
    expect(girl.current_location).toBe('town_square')
  })

  it('时停冻结：hour_changed 跳过跟随 AI（不疲劳/不强制）', async () => {
    bindingResolver.loadBindings({ 'follow-system': { hp: '体力' } })
    await apiSystem.call('follow', 'setMode', TEST_GIRL, 2)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.current_location = 'tavern'
    girl.base.体力 = 1
    girl.sp_flag.unconscious_h = 3

    await eventBus.emit('game:hour_changed', { hour: 14 })
    expect(girl.sp_flag.is_follow).toBe(2)
    expect(girl.current_location).toBe('tavern')
    girl.sp_flag.unconscious_h = 0
  })

  it('离线归零：character:offline → 解除跟随 reason=offline', async () => {
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    await apiSystem.call('character', 'setOffline', TEST_GIRL, 'bagged')
    const girl = entitySystem.get('character', TEST_GIRL) as any
    expect(girl.sp_flag.is_follow).toBe(0)
    expect(girl.sp_flag.offline).toBe(true)
    expect(girl.current_location).toBeNull()
    expect(offlineEvents).toEqual([{ id: TEST_GIRL, reason: 'bagged' }])
    expect(endedEvents).toEqual([{ character: TEST_GIRL, reason: 'offline' }])

    // 注释：setOnline 恢复（缺省 home_locations 最高权重）
    await apiSystem.call('character', 'setOnline', TEST_GIRL)
    expect(girl.sp_flag.offline).toBe(false)
    expect(girl.current_location).toBe('town_square')
  })

  it('前提：TARGET_IS_FOLLOW / TARGET_NOT_FOLLOW / NO_TARGET_OR_TARGET_CAN_COOPERATE / IS_FOLLOW_4', () => {
    const gc = gameContext.getContext()
    const ctx = { ...gc, selectedCharacterId: TEST_GIRL }
    expect(conditionEngine.evaluatePremises(['TARGET_NOT_FOLLOW'], ctx)).toBe(true)
    expect(conditionEngine.evaluatePremises(['TARGET_IS_FOLLOW'], ctx)).toBe(false)
    expect(conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE'], ctx)).toBe(true)

    entitySystem.get('character', TEST_GIRL)!.sp_flag.is_follow = 1
    expect(conditionEngine.evaluatePremises(['TARGET_IS_FOLLOW'], ctx)).toBe(true)
    expect(conditionEngine.evaluatePremises(['TARGET_NOT_FOLLOW'], ctx)).toBe(false)

    // 注释：目标不可协同——体力 0 / 时停 / 离线
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.base.体力 = 0
    expect(conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE'], ctx)).toBe(false)
    girl.base.体力 = 80
    girl.sp_flag.unconscious_h = 3
    expect(conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE'], ctx)).toBe(false)
    girl.sp_flag.unconscious_h = 0
    girl.sp_flag.offline = true
    expect(conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE'], ctx)).toBe(false)
    girl.sp_flag.offline = false

    // 注释：无目标 → true（与 HAVE_TARGET AND 后无目标分支失效，erArk 语义）
    expect(conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE'], gc)).toBe(true)

    // 注释：hp 门优先读 follow-system 绑定（跨插件同名键不读错）
    bindingResolver.loadBindings({
      'combat-base': { hp: 'hp', mp: 'mp' },
      'follow-system': { hp: '体力' },
    })
    girl.base.体力 = 0
    girl.base.hp = 100
    expect(conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE'], ctx)).toBe(false)
    girl.base.体力 = 80
    expect(conditionEngine.evaluatePremises(['NO_TARGET_OR_TARGET_CAN_COOPERATE'], ctx)).toBe(true)
    bindingResolver.loadBindings({})

    // 注释：IS_FOLLOW_4 前提（召唤提醒位）
    girl.sp_flag.is_follow = 4
    expect(conditionEngine.evaluatePremises(['IS_FOLLOW_4'], { ...gc, sourceId: TEST_GIRL })).toBe(true)
    girl.sp_flag.is_follow = 0
  })

  it('效果类型 set_follow：mode 变更 + 事件；非法 mode 拒绝', async () => {
    const handler = effectTypeRegistry.getHandler('set_follow')!
    await handler({ mode: 1 }, { _targetIds: [TEST_GIRL] })
    const girl = entitySystem.get('character', TEST_GIRL) as any
    expect(girl.sp_flag.is_follow).toBe(1)
    expect(startedEvents).toEqual([{ character: TEST_GIRL, mode: 1 }])

    // 注释：缺 mode → 拒绝（防复刻批次漏写参数静默变"结束同行"）
    errorReporter.clear()
    const okMissing = await handler({}, { _targetIds: [TEST_GIRL] })
    expect(okMissing).toBe(false)
    expect(girl.sp_flag.is_follow).toBe(1)
    expect(errorReporter.getErrors().some(e => e.message.includes('缺少 mode'))).toBe(true)

    // 注释：无目标 → 拒绝
    const before = girl.sp_flag.is_follow
    const ok = await handler({ mode: 0 }, { _targetIds: [] })
    expect(ok).toBe(false)
    expect(girl.sp_flag.is_follow).toBe(before)

    // 注释：非法 mode（3）→ 拒绝
    const ok2 = await handler({ mode: 3 }, { _targetIds: [TEST_GIRL] })
    expect(ok2).toBe(false)
    expect(girl.sp_flag.is_follow).toBe(1)
  })

  it('API：setMode 对不存在的角色 warning + 拒绝（防静默失败）', async () => {
    errorReporter.clear()
    const ok = await apiSystem.call('follow', 'setMode', 'no_such_char', 1)
    expect(ok).toBe(false)
    expect(errorReporter.getErrors().some(e => e.message.includes("'no_such_char'"))).toBe(true)
  })

  it('口上抑制：跟随者到达不打招呼（greet 过滤器）', async () => {
    const writeSpy = vi.spyOn(narrativeLog, 'write')
    // 注释：未跟随 → 有 greet 口上输出（专属行或通用行，池非空必有其一）
    await apiSystem.call('dialogue', 'triggerScene', 'greet', TEST_GIRL)
    expect(writeSpy.mock.calls.some(c => String(c[0]).includes('招呼') || String(c[0]).includes('哦，是你啊'))).toBe(true)

    // 注释：跟随中 → greet 被过滤器整段抑制（无任何输出）
    writeSpy.mockClear()
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    await apiSystem.call('dialogue', 'triggerScene', 'greet', TEST_GIRL)
    expect(writeSpy.mock.calls.some(c => String(c[0]).includes('招呼') || String(c[0]).includes('哦，是你啊'))).toBe(false)
    writeSpy.mockRestore()
  })

  it('location:enter payload 带 from（跟随系统消费方依赖）', async () => {
    let captured: any = null
    eventBus.on('location:enter', (p: any) => { captured = p })
    await gameContext.moveTo('forest', 5)
    expect(captured.to).toBe('forest')
    expect(captured.from).toBe('town_square')
  })

  it('条件字段注册：character.{id}.following / follow_mode', () => {
    // 注释：跟随状态经条件引擎可求值（注册自 condition_fields）
    entitySystem.get('character', TEST_GIRL)!.sp_flag.is_follow = 1
    expect(conditionEngine.evaluate(`character.${TEST_GIRL}.following == true`, gameContext.getContext())).toBe(true)
    expect(conditionEngine.evaluate(`character.${TEST_GIRL}.follow_mode == 1`, gameContext.getContext())).toBe(true)
    // 注释：指令/口上 condition 的字段校验通过（防复刻批次时误报未注册字段）
    expect(conditionRegistry.validateExpression(`character.${TEST_GIRL}.following == true`).ok).toBe(true)
    expect(conditionRegistry.validateExpression(`character.${TEST_GIRL}.follow_mode >= 1`).ok).toBe(true)
    entitySystem.get('character', TEST_GIRL)!.sp_flag.is_follow = 0
  })

  // ═══════════════════ 时间与条件场景（跨天/睡醒/时停/H/隐奸/存档） ═══════════════════

  it('跨天/睡醒后跟随状态保持（is_follow 持久，无每日归零）', async () => {
    bindingResolver.loadBindings({ 'follow-system': { hp: '体力' } })
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.base.体力 = 50 // 充足，避免疲劳解除干扰

    // 注释：睡觉跨天（8:00 → 次日 6:00，22 个 hour_changed 全部真实触发 runFollowAi）
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    await gameContext.advanceTime(60 * 22)

    expect(girl.sp_flag.is_follow).toBe(1)
    expect(girl.following).toBe(true)
    expect(girl.follow_mode).toBe(1)
    expect(endedEvents).toHaveLength(0)

    // 注释：重置时间避免污染后续测试
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('时停中：跟随者冻结不瞬移/不疲劳/不强制；时停结束后状态保持', async () => {
    bindingResolver.loadBindings({ 'follow-system': { hp: '体力' } })
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.sp_flag.unconscious_h = 3 // 时停冻结（erArk 博士时停可移动，跟随者冻结）

    // 注释：时停中玩家移动 → 冻结跟随者不瞬移
    girl.current_location = 'town_square'
    await gameContext.moveTo('forest', 5)
    expect(girl.current_location).toBe('town_square')

    // 注释：时停中跨小时 → 不疲劳解除、不强制移动
    girl.base.体力 = 1
    girl.current_location = 'tavern'
    await eventBus.emit('game:hour_changed', { hour: 15 })
    expect(girl.sp_flag.is_follow).toBe(1)
    expect(girl.current_location).toBe('tavern')
    expect(endedEvents).toHaveLength(0)

    // 注释：时停结束 → 状态保持；mode 1 不同位置不自动追（忠实 erArk）
    girl.sp_flag.unconscious_h = 0
    girl.base.体力 = 80
    await eventBus.emit('game:hour_changed', { hour: 16 })
    expect(girl.sp_flag.is_follow).toBe(1)
    expect(girl.current_location).toBe('tavern')

    // 注释：玩家回到跟随者身边 → 再次移动 → 跟随恢复
    gameContext.setLocation(entitySystem.get('location', 'forest') as any)
    girl.current_location = 'forest'
    await gameContext.moveTo('town_square', 5)
    expect(girl.current_location).toBe('town_square')
  })

  it('H 中跟随者疲劳解除：解除跟随但不破坏 H 状态', async () => {
    bindingResolver.loadBindings({ 'follow-system': { hp: '体力' } })
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.h_state = { is_h: true }
    girl.base.体力 = 1

    await eventBus.emit('game:hour_changed', { hour: 17 })
    expect(girl.sp_flag.is_follow).toBe(0)
    expect(endedEvents).toEqual([{ character: TEST_GIRL, reason: 'fatigue' }])
    // 注释：H 会话不被跟随解除破坏（erArk is_follow 分支优先，H 后续由 h-core 处理）
    expect(girl.h_state.is_h).toBe(true)
    girl.h_state = undefined
  })

  it('隐奸开始 → 解除跟随（reason=hidden_sex，走 follow API）', async () => {
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const handler = effectTypeRegistry.getHandler('hidden_sex_set_mode')!
    await handler({ mode: 1 }, { _targetIds: [TEST_GIRL] })
    const girl = entitySystem.get('character', TEST_GIRL) as any
    expect(girl.sp_flag.is_follow).toBe(0)
    expect(girl.following).toBe(false)
    expect(endedEvents).toEqual([{ character: TEST_GIRL, reason: 'hidden_sex' }])
    // 注释：清理隐奸标记（h-hidden 的清除效果）
    const clearHandler = effectTypeRegistry.getHandler('hidden_sex_clear')!
    await clearHandler({}, { _targetIds: [TEST_GIRL] })
  })

  it('存档往返：is_follow + 镜像字段保持，跟随继续', async () => {
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.current_location = 'town_square'

    // 注释：模拟存档 JSON 序列化往返（save-system 全量序列化实体）
    const data = JSON.parse(JSON.stringify(girl))
    expect(data.sp_flag.is_follow).toBe(1)
    expect(data.following).toBe(true)
    expect(data.follow_mode).toBe(1)

    // 注释：恢复后（读档路径 = 新实体对象）→ 跟随仍工作
    const restored: any = { ...data }
    entitySystem.register('character', 'restored_girl', restored)
    restored.current_location = 'town_square'
    await gameContext.moveTo('forest', 5)
    expect(restored.current_location).toBe('forest')
  })

  it('跟随者照常被实时结算（玩家行动后疲劳/饥饿增长，无特殊豁免）', async () => {
    await apiSystem.call('follow', 'invite', TEST_GIRL)
    const girl = entitySystem.get('character', TEST_GIRL) as any
    girl.base.饥饿值 = 0
    girl.base.疲劳度 = 0

    // 注释：玩家执行 wait（30 分钟）→ executor 实时结算所有有位置的 NPC（含跟随者）
    await commandExecutor.execute('wait', makeTestExecCtx({ uiStore: { selectedCharacterId: TEST_GIRL } }))

    expect((girl.base.饥饿值 ?? 0)).toBeGreaterThan(0)
    expect((girl.base.疲劳度 ?? 0)).toBeGreaterThan(0)
    expect(girl.sp_flag.is_follow).toBe(1)
    expect(endedEvents).toHaveLength(0)
  })
})
