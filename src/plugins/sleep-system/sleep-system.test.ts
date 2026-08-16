// sleep-system 集成测试——睡眠系统（L1.7 全链）
// 全插件加载（PluginManager）；事件走真实 eventBus；断言到具体值（复刻验证铁律 §5）
// 覆盖：前提矩阵（TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1 四象限/窗口边界/T_ACTION_SLEEP/has_bedroom/时停）、
//   睡眠等级阈值、advanceToHour 跨天、updateSleepAll 对全员、睡觉指令全流程（跨天→结算→存档事件）、
//   睡奸结算（settleSleepH：熟睡扣除/WAIT 规避/吵醒→装睡恢复）

import { conditionEngine } from '../../core/condition-engine'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { apiSystem } from '../../core/api'
import { commandRegistry } from '../../core/command-registry'
import { commandExecutor, recordBehaviorHistory, clearBehaviorHistory } from '../../core/command-executor'
import { bindingResolver } from '../../core/binding-resolver'
import { conditionRegistry } from '../../core/condition-registry'
import { errorReporter } from '../../core/error-reporter'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { getSleepLevelInfo } from './sleep-state'
import { updateSleepAll } from './update-sleep'
import { settleSleepH } from '../h-npc-ai/sleep-h'

const PLAYER = 'player'
const GIRL = 'test_girl'

function setTime(hour: number, minute = 0, day = 1): void {
  gameContext.setTime({ minute, hour, day, month: 1, year: 1 })
}

function getChar(id: string): any {
  return entitySystem.get('character', id) as any
}

function premiseCtx(targetId: string | null): any {
  return { selectedCharacterId: targetId }
}

// 注释：为角色制造"睡眠中"状态（sp_flag.sleeping + unconscious_h=1 + 熟睡值）
function makeSleeping(char: any, sleepPoint: number, unconscious = true): void {
  if (!char.sp_flag) char.sp_flag = {}
  char.sp_flag.sleeping = true
  char.sp_flag.unconscious_h = unconscious ? 1 : 0
  char.base['熟睡值'] = sleepPoint
  char.base['疲劳度'] = 30
  char.sleeping = true
}

describe('sleep-system 集成', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()

    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (!mod) throw new Error('模组加载失败')
    bindingResolver.loadBindings(mod.bindings)
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)

    gameContext.setPlayer(PLAYER)
    const tavern = entitySystem.get('location', 'tavern') as any
    if (tavern) gameContext.setLocation(tavern)
    gameContext.setSelectedCharacterId(null)

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
  })

  beforeEach(() => {
    setTime(10, 0)
    gameContext.setExecutionState('IDLE')
    gameContext.setSelectedCharacterId(null)
    clearBehaviorHistory()
    vi.restoreAllMocks()
    // 注释：玩家/测试 NPC 状态复位（共享基座——跨测试污染防护）
    const player = getChar(PLAYER)
    if (player) {
      player.base['疲劳度'] = 0
      player.base['体力'] = 100
      player.base['体力上限'] = 100
      player.base['气力'] = 100
      player.base['气力上限'] = 100
      player.base['熟睡值'] = 0
      player.base['射精欲'] = 0
      player.base['精液量'] = 80
      player.base['精液量上限'] = 100
      player.base['额外精液量'] = 0
      player.base['皮肤'] = 0
      player.base['愤怒'] = 0
      player.action_info = {}
      player.sp_flag = {}
      player.h_state = undefined
      player.current_location = 'tavern'
      player.sleeping = false
    }
    const girl = getChar(GIRL)
    if (girl) {
      girl.base['疲劳度'] = 0
      girl.base['体力'] = 100
      girl.base['体力上限'] = 100
      girl.base['熟睡值'] = 0
      girl.base['愤怒'] = 88
      girl.base['皮肤'] = 300
      girl.action_info = {}
      girl.sp_flag = {}
      girl.h_state = undefined
      girl.sleeping = false
      girl.current_location = 'tavern'
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('前提矩阵', () => {
    it('TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1 四象限：疲劳≥120 / 睡眠窗口 / 体力≤1 / 全不满足', () => {
      const player = getChar(PLAYER)
      // ① 疲劳 ≥120（白天 10:00）→ true
      setTime(10, 0)
      player.base['疲劳度'] = 120
      player.base['体力'] = 100
      expect(conditionEngine.evaluatePremises(['TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1'], premiseCtx(null))).toBe(true)
      // ② 疲劳 <120 且非窗口 → false
      player.base['疲劳度'] = 50
      expect(conditionEngine.evaluatePremises(['TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1'], premiseCtx(null))).toBe(false)
      // ③ 睡眠窗口（19:00 ≥ plan_to_sleep_time 18:00）→ true
      setTime(19, 0)
      expect(conditionEngine.evaluatePremises(['TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1'], premiseCtx(null))).toBe(true)
      // ④ 体力 ≤1 → true（白天、低疲劳）
      setTime(10, 0)
      player.base['体力'] = 1
      expect(conditionEngine.evaluatePremises(['TIRED_GE_75_OR_SLEEP_TIME_OR_HP_1'], premiseCtx(null))).toBe(true)
    })

    it('睡眠窗口边界（plan_to_sleep_time=18:00 / plan_to_wake_time=6:00）', () => {
      expect(conditionEngine.evaluatePremises(['GAME_TIME_IS_SLEEP_TIME'], premiseCtx(null))).toBe(false)
      setTime(17, 59)
      expect(conditionEngine.evaluatePremises(['GAME_TIME_IS_SLEEP_TIME'], premiseCtx(null))).toBe(false)
      setTime(18, 0)
      expect(conditionEngine.evaluatePremises(['GAME_TIME_IS_SLEEP_TIME'], premiseCtx(null))).toBe(true)
      setTime(23, 59)
      expect(conditionEngine.evaluatePremises(['GAME_TIME_IS_SLEEP_TIME'], premiseCtx(null))).toBe(true)
      setTime(0, 0)
      expect(conditionEngine.evaluatePremises(['GAME_TIME_IS_SLEEP_TIME'], premiseCtx(null))).toBe(true)
      setTime(5, 59)
      expect(conditionEngine.evaluatePremises(['GAME_TIME_IS_SLEEP_TIME'], premiseCtx(null))).toBe(true)
      setTime(6, 0)
      expect(conditionEngine.evaluatePremises(['GAME_TIME_IS_SLEEP_TIME'], premiseCtx(null))).toBe(false)
      // NOT_SLEEP_TIME 反义
      setTime(6, 0)
      expect(conditionEngine.evaluatePremises(['NOT_SLEEP_TIME'], premiseCtx(null))).toBe(true)
    })

    it('T_ACTION_SLEEP 查目标睡眠状态', () => {
      const girl = getChar(GIRL)
      makeSleeping(girl, 50)
      expect(conditionEngine.evaluatePremises(['T_ACTION_SLEEP'], premiseCtx(GIRL))).toBe(true)
      girl.sp_flag.sleeping = false
      girl.sleeping = false
      expect(conditionEngine.evaluatePremises(['T_ACTION_SLEEP'], premiseCtx(GIRL))).toBe(false)
      expect(conditionEngine.evaluatePremises(['T_ACTION_NOT_SLEEP'], premiseCtx(GIRL))).toBe(true)
    })

    it('IN_DORMITORY_OR_HOTEL = 地点 has_bedroom tag', () => {
      // beforeAll 已把 location 设为 tavern（has_bedroom）
      expect(conditionEngine.evaluatePremises(['IN_DORMITORY_OR_HOTEL'], premiseCtx(null))).toBe(true)
      const square = entitySystem.get('location', 'town_square') as any
      gameContext.setLocation(square)
      expect(conditionEngine.evaluatePremises(['IN_DORMITORY_OR_HOTEL'], premiseCtx(null))).toBe(false)
      gameContext.setLocation(entitySystem.get('location', 'tavern') as any)
    })

    it('TIME_STOP_OFF：时停中 false（h-time-stop 前提）', async () => {
      expect(conditionEngine.evaluatePremises(['TIME_STOP_OFF'], premiseCtx(null))).toBe(true)
      // 通过效果链开启时停（全插件加载，效果已注册）
      await apiSystem.call('effect-system', 'execute', [{ type: 'time_stop_on', params: {} }], {
        sourceId: PLAYER, _targetIds: [PLAYER], _timeCost: 0,
      })
      expect(conditionEngine.evaluatePremises(['TIME_STOP_OFF'], premiseCtx(null))).toBe(false)
      await apiSystem.call('effect-system', 'execute', [{ type: 'time_stop_off', params: {} }], {
        sourceId: PLAYER, _targetIds: [PLAYER], _timeCost: 0,
      })
      expect(conditionEngine.evaluatePremises(['TIME_STOP_OFF'], premiseCtx(null))).toBe(true)
    })
  })

  describe('睡眠等级（Sleep_Level 阈值 30/60/80/100）', () => {
    it('边界：0/30→LV0 半梦半醒；31/60→LV1 浅睡；61/80→LV2 熟睡；81/100/200→LV3 完全深眠', () => {
      expect(getSleepLevelInfo(0).level).toBe(0)
      expect(getSleepLevelInfo(0).name).toBe('半梦半醒')
      expect(getSleepLevelInfo(30).level).toBe(0)
      expect(getSleepLevelInfo(31).level).toBe(1)
      expect(getSleepLevelInfo(60).level).toBe(1)
      expect(getSleepLevelInfo(61).level).toBe(2)
      expect(getSleepLevelInfo(80).level).toBe(2)
      expect(getSleepLevelInfo(81).level).toBe(3)
      expect(getSleepLevelInfo(81).name).toBe('完全深眠')
      expect(getSleepLevelInfo(100).level).toBe(3)
      expect(getSleepLevelInfo(200).level).toBe(3) // 封顶
    })
  })

  describe('advanceToHour / minutesUntilHour（跨天原语）', () => {
    it('minutesUntilHour：23:00→6:00=420；3:00→6:00=180；6:00→6:00=1440（次日）；14:00→6:00=960（跨天）', () => {
      setTime(23, 0)
      expect(gameContext.minutesUntilHour(6)).toBe(420)
      setTime(3, 0)
      expect(gameContext.minutesUntilHour(6)).toBe(180)
      setTime(6, 0)
      expect(gameContext.minutesUntilHour(6)).toBe(1440)
      setTime(14, 0)
      expect(gameContext.minutesUntilHour(6)).toBe(960)
    })

    it('advanceToHour 逐步推进：23:30 → 次日 6:00，new_day 事件发射', async () => {
      setTime(23, 30)
      const newDays: any[] = []
      const listener = (payload: any) => { newDays.push(payload) }
      eventBus.on('game:new_day', listener)
      try {
        const delta = await gameContext.advanceToHour(6)
        expect(delta).toBe(390)
        const t = gameContext.getContext().time
        expect(t.hour).toBe(6)
        expect(t.minute).toBe(0)
        expect(t.day).toBe(2)
        expect(newDays.length).toBe(1)
        expect(newDays[0].reason).toBe('natural')
      } finally {
        eventBus.off('game:new_day', listener)
      }
    })
  })

  describe('updateSleepAll（erArk update_sleep 对全员）', () => {
    it('NPC 分支：愤怒 rand(1,35) / h_interrupt=0 / sleep_h_awake 清 / h_state 清 / daily_reset 清零', async () => {
      const girl = getChar(GIRL)
      girl.base['皮肤'] = 300 // daily_reset（test-mod attributes 标记）→ 归零
      girl.base['愤怒'] = 88
      girl.action_info = { h_interrupt: 5 }
      girl.sp_flag = { sleep_h_awake: true }
      girl.h_state = { is_h: true }
      await updateSleepAll(480)
      expect(girl.base['皮肤']).toBe(0)
      const angry = girl.base['愤怒']
      expect(angry).toBeGreaterThanOrEqual(1)
      expect(angry).toBeLessThanOrEqual(34) // erArk random.randrange(1,35) = 1..34（M1 修复）
      expect(girl.action_info.h_interrupt).toBe(0)
      expect(girl.sp_flag.sleep_h_awake).toBe(false)
      expect(girl.h_state).toBeUndefined()
    })

    it('玩家分支：射精欲清零（无条件）/ day_first_shoot=true / wake_time 记录 / 精液转化（≥6h）', async () => {
      const player = getChar(PLAYER)
      player.base['射精欲'] = 300
      player.base['精液量'] = 80
      player.base['精液量上限'] = 100
      player.base['额外精液量'] = 0
      await updateSleepAll(480)
      expect(player.base['射精欲']).toBe(0)
      expect(player.action_info.day_first_shoot_semen).toBe(true)
      expect(player.action_info.wake_time).toBeDefined()
      expect(player.base['额外精液量']).toBe(40) // floor(80/2)
      // 玩家睡眠标记清除（醒来）
      expect(player.sp_flag?.sleeping).toBeFalsy()
    })

    it('睡眠 <6h：不转化精液但射精欲/首射标记仍重置（erArk 无条件）', async () => {
      const player = getChar(PLAYER)
      player.base['射精欲'] = 300
      player.base['精液量'] = 80
      await updateSleepAll(300)
      expect(player.base['额外精液量']).toBe(0)
      expect(player.base['射精欲']).toBe(0)
      expect(player.action_info.day_first_shoot_semen).toBe(true)
    })
  })

  describe('睡觉指令全流程（跨天 → 效果链 → 睡眠结算 → 全员结算 → 存档事件）', () => {
    it('23:00 在 tavern 睡觉 → 次日 6:00 + 熟睡积累 + 疲劳削减 + 体力恢复 + 存档事件', async () => {
      const player = getChar(PLAYER)
      setTime(23, 0)
      player.base['疲劳度'] = 130
      player.base['体力'] = 50
      player.base['熟睡值'] = 0
      player.base['射精欲'] = 300
      player.base['精液量'] = 80
      player.base['精液量上限'] = 100
      player.base['额外精液量'] = 0
      player.base['皮肤'] = 200 // daily_reset → 归零（updateSleepAll 全员）

      const autosaveEvents: any[] = []
      const listener = (payload: any) => { autosaveEvents.push(payload) }
      eventBus.on('game:autosave_requested', listener)
      try {
        await commandExecutor.execute('sleep', {
          engine: {
            setExecutionState: (s: string) => gameContext.setExecutionState(s as any),
            emit: async (event: string, payload: any) => { await eventBus.emit(event, payload) },
          },
          api: apiSystem,
          evaluatePremises: (premises: string[]) => conditionEngine.evaluatePremises(premises, premiseCtx(null)),
          evaluateCondition: () => true,
        })
      } finally {
        eventBus.off('game:autosave_requested', listener)
      }

      // 跨天到次日 6:00（23:00 + 420 分钟）
      const t = gameContext.getContext().time
      expect(t.day).toBe(2)
      expect(t.hour).toBe(6)
      expect(t.minute).toBe(0)
      // 睡眠结算：熟睡值积累（420×1.5×adjust=630 → 封顶 100）、疲劳 2 倍削减（130-140 → 0）
      expect(player.base['熟睡值']).toBe(100)
      expect(player.base['疲劳度']).toBe(0)
      // 体力公式恢复（50 + floor((0.25+3)×420)=1415 → 封顶 100）
      expect(player.base['体力']).toBe(100)
      // updateSleepAll 玩家分支：射精欲 0 / 首射标记 / 精液转化
      expect(player.base['射精欲']).toBe(0)
      expect(player.action_info.day_first_shoot_semen).toBe(true)
      // 精液转化基数 = 睡眠恢复后的精液量（80 睡前 + 420 分钟 ×1/20min=21 → 封顶 100）→ floor(100/2)=50
      // （documented 偏差：erArk 用睡前精液量转化，本引擎在 realtimeSettle 之后执行）
      expect(player.base['额外精液量']).toBe(50)
      // daily_reset 清零（全员）
      expect(player.base['皮肤']).toBe(0)
      // 睡醒自动存档事件
      expect(autosaveEvents.length).toBe(1)
    })

    it('前提不满足（白天低疲劳）→ 指令被拒，时间不推进', async () => {
      const player = getChar(PLAYER)
      setTime(10, 0)
      player.base['疲劳度'] = 50
      player.base['体力'] = 100
      await commandExecutor.execute('sleep', {
        engine: {
          setExecutionState: (s: string) => gameContext.setExecutionState(s as any),
          emit: async (event: string, payload: any) => { await eventBus.emit(event, payload) },
        },
        api: apiSystem,
        evaluatePremises: (premises: string[]) => conditionEngine.evaluatePremises(premises, premiseCtx(null)),
        evaluateCondition: () => true,
      })
      const t = gameContext.getContext().time
      expect(t.hour).toBe(10)
      expect(t.day).toBe(1)
    })
  })

  describe('睡奸结算（settleSleepH——h-npc-ai 无意识组 ②）', () => {
    function startSleepH(targetSleepPoint: number): void {
      const player = getChar(PLAYER)
      const girl = getChar(GIRL)
      player.h_state = { is_h: true, target_character_id: GIRL }
      player.sp_flag = {}
      makeSleeping(girl, targetSleepPoint)
      girl.h_state = { is_h: true }
      gameContext.setSelectedCharacterId(GIRL)
    }

    it('深睡目标（熟睡值 90/LV3）→ 熟睡值 -= 3t，不吵醒', async () => {
      startSleepH(90)
      await settleSleepH(10)
      const girl = getChar(GIRL)
      // floor(10×3)=30 → 90-30=60 → LV1（60 阈值边界 = LV1 浅睡）→ 触发吵醒判定
      // mock random 大 → weak_rate=0 < randint → 不醒
      vi.spyOn(Math, 'random').mockReturnValue(0.99)
      expect(girl.base['熟睡值']).toBe(60)
      expect(girl.sp_flag.sleep_h_awake ?? false).toBe(false)
    })

    it('WAIT 指令中 → 规避吵醒判定（sleep_level=2，熟睡值不扣）', async () => {
      startSleepH(10)
      recordBehaviorHistory('wait')
      await settleSleepH(10)
      const girl = getChar(GIRL)
      expect(girl.base['熟睡值']).toBe(10) // WAIT 不扣
      expect(girl.sp_flag.sleeping).toBe(true)
    })

    it('半梦半醒目标 + 吵醒成功 → 醒来流程（疲劳/熟睡清零 + 装睡继续 H + 时间推进）', async () => {
      startSleepH(20)
      const girl = getChar(GIRL)
      // 2026-08-16 时停复刻：handleNpcInstructCondition 从"恒继续"改为 erArk 真实判定——
      // 严重骚扰实行判定（600 阈值）+ 陷落三分支（≥3 继续）。本测试目标需满足继续条件：
      // 好感 10000（等级 6 → +150）+ 信赖 300（等级 8 → +500）+ 恋人（陷落修正 +80）+
      // 愤怒 0（+20）= 750 ≥ 600 判定通过；陷落=恋人 → 3 ≥ 3 → 继续 → 装睡
      girl.base['好感度'] = 10000
      girl.base['信赖度'] = 300
      girl.base['愤怒'] = 0
      girl.talents = girl.talents ?? {}
      girl.talents['恋人'] = 1
      // weak_rate = 60-20 + (30-20) = 50；randint(1,100)=1 → 50 ≥ 1 → 醒
      vi.spyOn(Math, 'random').mockReturnValue(0)
      const before = gameContext.getContext().time
      await settleSleepH(10)
      // 吵醒判定清零疲劳（judgeWeakUp :343-344）→ 但装睡继续 H 后 advanceTime(5) 触发
      // per-tick 窗口结算（H 中 NPC 疲劳积累，erArk WAIT 行为同构）→ 5 分钟 +1
      expect(girl.base['疲劳度']).toBe(1)
      expect(girl.base['熟睡值']).toBe(0)
      // 装睡继续 H：pretend_sleep=true + unconscious_h=1 + sleep_h_awake=true；
      // sleeping=false（erArk 恢复后行为=WAIT——settle_sleep_h 不再触发，防醒→恢复死循环）
      expect(girl.sp_flag.sleeping).toBe(false)
      expect(girl.sp_flag.unconscious_h).toBe(1)
      expect(girl.h_state.pretend_sleep).toBe(true)
      // B3 修复断言：装睡继续 H 目标仍是 H 参与方（handleNpcInstructCondition 复位后
      // setPretendSleep 重设——erArk :233）
      expect(girl.h_state.is_h).toBe(true)
      expect(girl.sp_flag.sleep_h_awake).toBe(true)
      // 时间推进 5 分钟（erArk :256）
      const after = gameContext.getContext().time
      const delta = (after.hour * 60 + after.minute) - (before.hour * 60 + before.minute)
      expect(delta).toBe(5)
    })

    it('睡奸结束（任意路径 → h:end）兜底清 H 参与方的睡眠无意识，不误伤无关角色（C1/C2 修复）', async () => {
      const girl = getChar(GIRL)
      startSleepH(50)
      // 模拟 h:start 的参与方行为块（enterHBlocksForAllInH 设 h_wait——onHEnd 按 h_* 块判定参与方）
      girl.ai_behavior = { id: 'h_wait', type: 'h_wait', start_time: 0, duration: 60 }
      girl.sp_flag.sleep_h_awake = true
      girl.sleep_h_awake = true
      girl.h_state.pretend_sleep = true
      // 无关角色（M15 误伤面断言）：催眠(4)/时停(3)/纯睡眠者(unconscious_h=0, sleeping=true, bits)
      entitySystem.register('character', 'hypno_npc', { id: 'hypno_npc', name: '催眠者', base: {}, sp_flag: { unconscious_h: 4, unnormal_flag: 0x30 } })
      entitySystem.register('character', 'ts_npc', { id: 'ts_npc', name: '时停者', base: {}, sp_flag: { unconscious_h: 3, unnormal_flag: 0x30 } })
      entitySystem.register('character', 'sleeper_npc', { id: 'sleeper_npc', name: '睡眠者', base: {}, sp_flag: { sleeping: true, unconscious_h: 0, unnormal_flag: 0x30 }, sleeping: true })
      // 模拟玩家以非 6005 路径结束 H（end_h/体力退出/距离退出都收敛到 endHScene → h:end）
      await apiSystem.call('h-core', 'endHScene', PLAYER)
      // 参与方：睡眠无意识清除，但真睡眠标记保留（H 结束 ≠ 醒来）——B1 语义：
      // sleeping 保留 → unnormal bit5|6 一并保留（睡梦中意识不清醒，不变量成对）
      expect(girl.sp_flag.unconscious_h).toBe(0)
      expect(girl.sp_flag.unnormal_flag ?? 0).toBe(0x30)
      expect(girl.sp_flag.sleep_h_awake).toBe(false)
      // h_state 已被 endHScene 整体清空（pretend_sleep 随 h_state 消失；onHEnd 的清理是双保险）
      expect(girl.h_state).toBeUndefined()
      expect(girl.sp_flag.sleeping).toBe(true)
      // 误伤面：催眠/时停保留（erArk 催眠 unconscious 跨 H 持久；时停由 h-time-stop 管理）
      expect((entitySystem.get('character', 'hypno_npc') as any).sp_flag.unconscious_h).toBe(4)
      expect((entitySystem.get('character', 'ts_npc') as any).sp_flag.unconscious_h).toBe(3)
      // 纯睡眠者：bits 保留（sleeping 与 unnormal 不变量不被破坏）
      const sleeper = entitySystem.get('character', 'sleeper_npc') as any
      expect(sleeper.sp_flag.unconscious_h).toBe(0)
      expect(sleeper.sp_flag.sleeping).toBe(true)
      expect(sleeper.sp_flag.unnormal_flag).toBe(0x30)
    })

    it('unconscious_h_clear 效果同时清 sleeping（睡奸结束的指令路径，C1 修复）', async () => {
      const girl = getChar(GIRL)
      startSleepH(50)
      await apiSystem.call('effect-system', 'execute', [{ type: 'unconscious_h_clear', params: {}, target: 'selected' }], {
        sourceId: PLAYER, _targetIds: [GIRL], _timeCost: 0,
        uiStore: { selectedCharacterId: GIRL },
      })
      expect(girl.sp_flag.unconscious_h).toBe(0)
      expect(girl.sp_flag.sleeping).toBe(false)
    })

    it('unconscious_h_clear wake=false（5046 停止睡眠猥亵）：目标继续睡 + bits 保留（第四轮 A/B 修复）', async () => {
      const girl = getChar(GIRL)
      startSleepH(50)
      await apiSystem.call('effect-system', 'execute', [{ type: 'unconscious_h_clear', params: { wake: false }, target: 'selected' }], {
        sourceId: PLAYER, _targetIds: [GIRL], _timeCost: 0,
        uiStore: { selectedCharacterId: GIRL },
      })
      // 只清无意识奸标记——目标继续睡（sleeping 保留），不变量：sleeping ⟺ bit5|6（0x30 保留）
      expect(girl.sp_flag.unconscious_h).toBe(0)
      expect(girl.sp_flag.sleeping).toBe(true)
      expect(girl.sp_flag.unnormal_flag ?? 0).toBe(0x30)
    })

    it('ask_sleep 效果：目标真实入睡（npc-ai setBehavior sleep 块 + 睡眠标记，M11 修复）', async () => {
      const girl = getChar(GIRL)
      girl.current_location = 'tavern'
      // effect-system execute 返回 void（Promise<void>）——断言副作用而非返回值
      await apiSystem.call('effect-system', 'execute', [{ type: 'ask_sleep', params: {}, target: 'selected' }], {
        sourceId: PLAYER, _targetIds: [GIRL], _timeCost: 10,
        uiStore: { selectedCharacterId: GIRL },
      })
      expect(girl.ai_behavior?.type).toBe('sleep')
      expect(girl.sp_flag.sleeping).toBe(true)
    })

    it('TARGET_ 前缀装睡/醒来前提真语义（★1 修复：地文 7700+ 条引用 + 注册顺序守护）', () => {
      const girl = getChar(GIRL)
      // 未装睡：sleep_h_awake=true 但 pretend_sleep=false → TARGET_NOT_... 为真
      girl.sp_flag = { sleeping: false, sleep_h_awake: true }
      girl.h_state = { pretend_sleep: false }
      expect(conditionEngine.evaluatePremises(['TARGET_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP'], premiseCtx(GIRL))).toBe(false)
      expect(conditionEngine.evaluatePremises(['TARGET_NOT_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP'], premiseCtx(GIRL))).toBe(true)
      // 装睡：两个标记都 true → TARGET_... 为真（真语义覆盖 h-core placeholder 的验证——
      // 若注册顺序反了（h-core 后注册覆盖），此断言失败）
      girl.h_state.pretend_sleep = true
      expect(conditionEngine.evaluatePremises(['TARGET_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP'], premiseCtx(GIRL))).toBe(true)
      expect(conditionEngine.evaluatePremises(['TARGET_NOT_SLEEP_H_AWAKE_BUT_PRETEND_SLEEP'], premiseCtx(GIRL))).toBe(false)
    })
  })

  // ═══════ 成长结算链（2026-08-11：睡眠触发能力升级/素质获得/精力成长/宝珠转换）═══════
  describe('成长结算链（睡眠触发）', () => {
    it('NPC 睡眠触发能力升级（condition 模式 needs + 扣宝珠）', async () => {
      const girl = getChar(GIRL)
      girl.abilities['顺从'] = { level: 0, xp: 0 }
      girl.juel = { '10': 100 } // 恭顺珠（顺从 0→1 主需求 J10 100）
      await updateSleepAll(600)
      expect(girl.abilities['顺从'].level).toBe(1)
      expect(girl.juel['10']).toBe(0)
    })

    it('NPC 睡眠触发 gain_type=3 素质获得（恋慕：亲密4+思慕+信赖100，替换思慕）', async () => {
      const girl = getChar(GIRL)
      girl.abilities['亲密'] = { level: 4, xp: 0 }
      girl.talents['思慕'] = 1
      girl.base['信赖度'] = 100
      await updateSleepAll(600)
      expect(girl.talents['恋慕']).toBe(1)
      expect(girl.talents['思慕']).toBeUndefined() // replace 思慕
    })

    it('睡眠只检查 gain_type=3 的素质（gain_type=0 不误触发）', async () => {
      const girl = getChar(GIRL)
      // 技巧（test-mod 无 gain_type = 0 随时）——满足条件也不应在睡眠时获得
      girl.abilities['技巧'] = { level: 10, xp: 0 }
      await updateSleepAll(600)
      expect(girl.talents['剑骨'] ?? 0).toBe(0)
    })

    it('玩家睡眠触发精力成长（today_sanity_point_cost ≥50 → 精力上限 += round/50）', async () => {
      const player = getChar(PLAYER)
      if (!player.action_info) player.action_info = {}
      player.action_info.today_sanity_point_cost = 50
      const before = player.base['精力上限'] ?? 100
      await updateSleepAll(600)
      expect(player.action_info.today_sanity_point_cost).toBe(0)
      expect(player.base['精力上限']).toBe(before + 1)
    })

    it('睡眠宝珠转换：daily_reset 状态值 → 宝珠 + 清零', async () => {
      const girl = getChar(GIRL)
      girl.juel = {}
      // 快感规范存储 = base（h-core settle_state 写 ch.base；params 是 attributes 落位的死存储）
      girl.base['皮肤'] = 50
      await updateSleepAll(600)
      expect(girl.juel['0']).toBe(50) // 皮肤快感珠（level 0 → 100%）
      expect(girl.base['皮肤']).toBe(0)
    })

    it('完整闭环：状态值 → 转珠 → 能力升级消耗珠（一条链）', async () => {
      const girl = getChar(GIRL)
      // 恭顺状态 100（level 1 → 100%）→ 恭顺珠(10) = 100；顺从 0→1 需 J10 100（扣光）
      girl.abilities['顺从'] = { level: 0, xp: 0 }
      girl.juel = {}
      girl.base['恭顺'] = 100
      await updateSleepAll(600)
      // 转珠：恭顺 100 → 恭顺珠 100（升级前）
      expect(girl.juel['10']).toBe(0) // 被升级消耗
      expect(girl.base['恭顺']).toBe(0) // 状态清零
      expect(girl.abilities['顺从'].level).toBe(1) // 升级成功
    })
  })
})
