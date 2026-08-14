// 注释：confinement-system 测试——单元（前提/数据模型/公式）+ 集成（装袋→投牢→释放）
// 启动镜像 boot-smoke：loadMod → bindings → condition → 插件全量加载

import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { apiSystem } from '../../core/api'
import { commandRegistry } from '../../core/command-registry'
import { bindingResolver } from '../../core/binding-resolver'
import { conditionRegistry } from '../../core/condition-registry'
import { errorReporter } from '../../core/error-reporter'
import { conditionEngine } from '../../core/condition-engine'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { getPrisoners, getSettings, resetConfinementState, getState } from './state'
import { getUnusedPrisonCell } from './prisoner'
import { calculateEscapeProbability, judgeCanEscape } from './escape'

async function boot(): Promise<void> {
  entitySystem.clear()
  commandRegistry.clear()
  errorReporter.clear()
  conditionEngine.clear()
  resetConfinementState()

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
  const pluginTomls = import.meta.glob('/src/plugins/*/plugin.toml', { import: 'default', eager: true }) as Record<string, string>
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
}

// 注释：注册一个测试角色（模仿 test-mod 角色结构——base-human 模板）
// 能力用 test-mod definitions/abilities.toml 定义的能力（华山剑法带 combat tag、
// 学识带 knowledge tag）——逃脱公式 getByTag 只认 mod 定义的能力
function registerChar(charId: string, overrides: Record<string, any> = {}): void {
  entitySystem.register('character', charId, {
    id: charId,
    name: charId,
    base: { hp: 100, mp: 50, '体力': 100, '气力': 100 },
    abilities: { '华山剑法': { level: 5, xp: 0 }, '学识': { level: 3, xp: 0 } },
    talents: {},
    sp_flag: {},
    current_location: 'town_square',
    ...overrides,
  } as any)
}

describe('confinement-system', () => {
  beforeAll(async () => {
    await boot()
  })

  describe('前提注册', () => {
    it('T_IMPRISONMENT_1/0 真语义（覆盖 sleep-system 占位）', () => {
      registerChar('prisoner_a')
      const ctxA = { ...gameContext.getContext(), selectedCharacterId: 'prisoner_a' }
      expect(conditionEngine.evaluate('premise(T_IMPRISONMENT_1)', ctxA)).toBe(false)
      // 置位
      const c = entitySystem.get('character', 'prisoner_a') as any
      c.sp_flag.imprisonment = true
      expect(conditionEngine.evaluate('premise(T_IMPRISONMENT_1)', ctxA)).toBe(true)
      expect(conditionEngine.evaluate('premise(T_IMPRISONMENT_0)', ctxA)).toBe(false)
      // T_NORMAL_2 覆盖：被监禁 → 非正常（位2 异常语义）
      expect(conditionEngine.evaluate('premise(T_NORMAL_2)', ctxA)).toBe(false)
      c.sp_flag.imprisonment = false
      expect(conditionEngine.evaluate('premise(T_NORMAL_2)', ctxA)).toBe(true)
    })

    it('IN_PRISON 按 location.tags.prison 判定', () => {
      const cell = entitySystem.get('location', 'prison_cell_1') as any
      gameContext.setLocation(cell)
      expect(conditionEngine.evaluate('premise(IN_PRISON)', gameContext.getContext())).toBe(true)
      const square = entitySystem.get('location', 'town_square') as any
      gameContext.setLocation(square)
      expect(conditionEngine.evaluate('premise(IN_PRISON)', gameContext.getContext())).toBe(false)
    })

    it('HAVE_BAG 按携袋 tag 判定（插件默认层物品）', () => {
      const playerId = gameContext.getContext().player?.id!
      const mod = modLoader.getMod()!
      expect(Object.keys(mod.items)).toContain('携袋')
      // 玩家无袋 → false
      expect(conditionEngine.evaluate('premise(HAVE_BAG)', gameContext.getContext())).toBe(false)
      // 加袋 → true
      const player = entitySystem.get('character', playerId) as any
      player.inventory = [{ itemId: '携袋', count: 1 }]
      expect(conditionEngine.evaluate('premise(HAVE_BAG)', gameContext.getContext())).toBe(true)
      player.inventory = []
    })

    it('PL_BAGGING_CHARA / PL_NOT_BAGGING_CHARA', () => {
      registerChar('bag_target')
      registerChar('bag_target_b')
      const ctx = { ...gameContext.getContext(), selectedCharacterId: 'bag_target' }
      expect(conditionEngine.evaluate('premise(PL_BAGGING_CHARA)', ctx)).toBe(false)
      const player = entitySystem.get('character', gameContext.getContext().player?.id!) as any
      if (!player.sp_flag) player.sp_flag = {}
      player.sp_flag.bagging_chara_id = 'bag_target'
      expect(conditionEngine.evaluate('premise(PL_BAGGING_CHARA)', ctx)).toBe(true)
      expect(conditionEngine.evaluate('premise(PL_NOT_BAGGING_CHARA)', ctx)).toBe(false)
      // ⚠️ 2026-08-14 三轮审查回归：搬运 A 时对 B 装袋也应 false（原实现只查"≠搬运对象"→
      // 允许覆盖 A → A 永久离线丢失）
      const ctxB = { ...gameContext.getContext(), selectedCharacterId: 'bag_target_b' }
      expect(conditionEngine.evaluate('premise(PL_NOT_BAGGING_CHARA)', ctxB)).toBe(false)
      player.sp_flag.bagging_chara_id = ''
    })

    it('TARGET_DEEP_UNCONSCIOUS（2026-08-14 审查修复回归）：熟睡/时停可装袋，清醒不可', () => {
      registerChar('sleepy_target')
      const ctx = { ...gameContext.getContext(), selectedCharacterId: 'sleepy_target' }
      const c = entitySystem.get('character', 'sleepy_target') as any
      // 清醒 → false
      c.sp_flag.unconscious_h = 0
      expect(conditionEngine.evaluate('premise(TARGET_DEEP_UNCONSCIOUS)', ctx)).toBe(false)
      // 熟睡（unconscious_h=1）→ true
      c.sp_flag.unconscious_h = 1
      expect(conditionEngine.evaluate('premise(TARGET_DEEP_UNCONSCIOUS)', ctx)).toBe(true)
      // 时停（unconscious_h=3）→ true
      c.sp_flag.unconscious_h = 3
      expect(conditionEngine.evaluate('premise(TARGET_DEEP_UNCONSCIOUS)', ctx)).toBe(true)
      // 催眠体控（unconscious_h=4）→ false（非完全无意识）
      c.sp_flag.unconscious_h = 4
      expect(conditionEngine.evaluate('premise(TARGET_DEEP_UNCONSCIOUS)', ctx)).toBe(false)
      c.sp_flag.unconscious_h = 0
    })
  })

  describe('牢房分配', () => {
    it('getUnusedPrisonCell 返回空牢房（tag=prison 且无囚犯）', () => {
      registerChar('cell_owner')
      const cell1 = getUnusedPrisonCell()
      expect(['prison_cell_1', 'prison_cell_2']).toContain(cell1)
      // 占满两间 → 返回 ''
      getPrisoners()['cell_owner'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 0 }
      const owner = entitySystem.get('character', 'cell_owner') as any
      owner.current_location = 'prison_cell_1'
      // 第二间也占
      getPrisoners()['prisoner_a'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 0 }
      const a = entitySystem.get('character', 'prisoner_a') as any
      a.current_location = 'prison_cell_2'
      expect(getUnusedPrisonCell()).toBe('')
      delete getPrisoners()['cell_owner']
      delete getPrisoners()['prisoner_a']
    })
  })

  describe('逃脱公式', () => {
    it('calculateEscapeProbability 累积（技能×系数，下限 1）', async () => {
      registerChar('escapee', { abilities: { '华山剑法': { level: 10, xp: 0 }, '学识': { level: 0, xp: 0 } } })
      getPrisoners()['escapee'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 0 }
      getSettings().living_condition = 1 // 标准：系数 (1+1)×0.5 = 1
      const add = await calculateEscapeProbability('escapee')
      // ⚠️ 2026-08-14 审查修复断言：原断言 ≥1 是假绿——abilities.getByTag 缺失时技能恒 0、
      // 概率永远只加下限 1%（逃脱几乎不可能）。修复后：战斗 10 + 学识 0 = 10；系数 ≈ 1 → 10
      expect(add).toBeGreaterThanOrEqual(5)
      expect(getPrisoners()['escapee'].escapeProbability).toBeGreaterThanOrEqual(5)
      delete getPrisoners()['escapee']
    })

    it('judgeCanEscape：无监狱长时概率 > 30 逃脱', async () => {
      registerChar('escapee2')
      getPrisoners()['escapee2'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 0 }
      // 概率 29 → 不逃
      getPrisoners()['escapee2'].escapeProbability = 29
      expect(await judgeCanEscape('escapee2')).toBe(false)
      // 概率 31 → 逃
      getPrisoners()['escapee2'].escapeProbability = 31
      expect(await judgeCanEscape('escapee2')).toBe(true)
      delete getPrisoners()['escapee2']
    })

    it('hp/mp 百分比归一化（2026-08-14 五轮审查回归）：有上限时用 当前/上限，而非当前值封顶', async () => {
      // 对抗值路径（judgeCanEscape 有监狱长时）：囚犯 vs 监狱长
      // 囚犯 hp=200/上限400（实际50%）、mp=25/上限100（实际25%）——旧实现 hp 封顶 100% 会虚高
      registerChar('fugitive_pct', {
        abilities: { '华山剑法': { level: 10, xp: 0 }, '学识': { level: 0, xp: 0 } },
        base: { hp: 200, mp: 25, '体力': 200, '气力': 25, '体力上限': 400, '气力上限': 100 },
      })
      registerChar('warden_pct', {
        abilities: { '华山剑法': { level: 5, xp: 0 } },
        base: { hp: 100, mp: 50, '体力': 100, '气力': 50, '体力上限': 100, '气力上限': 100 },
      })
      getPrisoners()['fugitive_pct'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 100 }
      getSettings().living_condition = 1
      getState().wardenId = 'warden_pct'
      // 归一化后：escape = (100/100)×2×0.4×10×0.5×0.25 = 1.0；warden = 5×1.0×0.5 = 2.5 → 逃不脱
      // 旧实现（hp 封顶 100%）：escape = 1×2×0.4×10×1.0×0.25 = 2.0 < 2.5 仍逃不脱——差值小。
      // 强化：囚犯 hp=100/上限200（50%），监狱长 hp=100/上限400（25%）→ 归一化后 warden 更弱
      const warden = entitySystem.get('character', 'warden_pct') as any
      warden.base['体力'] = 100
      warden.base['体力上限'] = 400
      warden.base['气力'] = 100
      warden.base['气力上限'] = 400
      // 归一化：escape = 1×2×0.4×10×0.5×0.25 = 1.0；warden = 5×0.25×0.25 = 0.3125 → 逃脱成功
      // 旧实现（两者都封顶 100%）：escape = 2.0 > warden 5.0？→ warden 5×1×1=5 > 2 逃不脱——差异可辨
      expect(await judgeCanEscape('fugitive_pct')).toBe(true)
      getState().wardenId = null
      delete getPrisoners()['fugitive_pct']
    })
  })

  describe('集成：装袋→投牢→释放', () => {
    it('完整闭环（指令效果直接调用）', async () => {
      registerChar('victim', { current_location: 'town_square' })
      const player = entitySystem.get('character', gameContext.getContext().player?.id!) as any
      player.inventory = [{ itemId: '携袋', count: 1 }]

      // 1. 装袋：目标离线 + be_bagged + 玩家记录
      await apiSystem.call('effect-system', 'execute', [{ type: 'confinement_bagging', params: {} }], {
        sourceId: player.id,
        _targetIds: ['victim'],
        gameStore: { player },
      })
      const victim = entitySystem.get('character', 'victim') as any
      expect(victim.sp_flag.be_bagged).toBe(true)
      expect(victim.sp_flag.offline).toBe(true)
      expect(player.sp_flag.bagging_chara_id).toBe('victim')

      // 2. 移动玩家到牢房 + 投牢
      gameContext.setLocation(entitySystem.get('location', 'prison_cell_1') as any)
      await apiSystem.call('effect-system', 'execute', [{ type: 'confinement_put_into_prison', params: {} }], {
        sourceId: player.id,
        _targetIds: ['victim'],
        gameStore: { player, location: { id: 'prison_cell_1' } },
      })
      expect(victim.sp_flag.be_bagged).toBe(false)
      expect(victim.sp_flag.imprisonment).toBe(true)
      expect(victim.sp_flag.offline).toBe(false)
      expect(victim.current_location).toBe('prison_cell_1')
      expect(player.sp_flag.bagging_chara_id).toBe('')
      expect(getPrisoners()['victim']).toBeDefined()
      // 强制刻印：屈服2（无条件）
      expect(victim.abilities?.['屈服刻印']?.level ?? 0).toBeGreaterThanOrEqual(2)

      // 3. 释放：清 flag/记录/回原宿舍
      await apiSystem.call('effect-system', 'execute', [{ type: 'confinement_set_free', params: {} }], {
        sourceId: player.id,
        _targetIds: ['victim'],
        gameStore: { player },
      })
      expect(victim.sp_flag.imprisonment).toBe(false)
      expect(getPrisoners()['victim']).toBeUndefined()
      // pre_dormitory 为空（无 home_locations）→ 释放保留当前位置
      expect(victim.current_location).toBe('prison_cell_1')
      player.inventory = []
    })

    it('放出袋中人（release_from_bag）不成为囚犯', async () => {
      registerChar('bag_victim2', { current_location: 'town_square' })
      const player = entitySystem.get('character', gameContext.getContext().player?.id!) as any

      await apiSystem.call('effect-system', 'execute', [{ type: 'confinement_bagging', params: {} }], {
        sourceId: player.id,
        _targetIds: ['bag_victim2'],
        gameStore: { player },
      })
      const v2 = entitySystem.get('character', 'bag_victim2') as any
      expect(v2.sp_flag.be_bagged).toBe(true)

      await apiSystem.call('effect-system', 'execute', [{ type: 'confinement_release_from_bag', params: {} }], {
        sourceId: player.id,
        _targetIds: ['bag_victim2'],
        gameStore: { player },
      })
      expect(v2.sp_flag.be_bagged).toBe(false)
      expect(v2.sp_flag.imprisonment).not.toBe(true)
      expect(player.sp_flag.bagging_chara_id).toBe('')
    })
  })

  describe('指令注册', () => {
    it('四条监禁指令已注册且前提完整', () => {
      for (const id of ['bagging_and_moving', 'put_into_prison', 'set_free', 'release_from_bag']) {
        const cmd = commandRegistry.getById(id)
        expect(cmd, `指令 ${id} 应注册`).toBeDefined()
      }
      // 前提引用已注册（validateInstructionData 无误报）
      const errors = errorReporter.getErrors()
      const premiseErrors = errors.filter((e: any) => e.message.includes('未注册前提') || e.message.includes('未注册字段'))
      expect(premiseErrors.length).toBe(0)
    })
  })

  describe('每日结算', () => {
    it('game:new_day 触发逃脱结算（无囚犯不崩）', async () => {
      // 清空囚犯 → 结算空跑无报错
      const ids = Object.keys(getPrisoners())
      for (const id of ids) delete getPrisoners()[id]
      await eventBus.emit('game:new_day', { day: 2, reason: 'natural' })
      expect(errorReporter.getErrors().filter((e: any) => e.message.includes('逃脱结算异常'))).toEqual([])
    })

    it('幽灵记录清理（2026-08-14 三轮审查回归）：角色不存在的囚犯记录被清除', async () => {
      const { settlePrisoners } = await import('./escape')
      // 塞一条角色不存在的记录
      getPrisoners()['ghost_prisoner'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 50 }
      await settlePrisoners()
      expect(getPrisoners()['ghost_prisoner']).toBeUndefined()
    })

    it('事件监听幂等（2026-08-14 六轮审查回归）：重复 onEnable 不双倍结算', async () => {
      // 监狱长 + 训练模式（检测训练执行次数）
      registerChar('warden_idem')
      registerChar('trainee_idem')
      getState().wardenId = 'warden_idem'
      getSettings().training = 1
      const { setTrainingModes } = await import('./warden')
      setTrainingModes([{ id: 1, name: 't', state: '快乐', stateBase: 30, experienceId: 2, experienceValue: 1 }])
      getPrisoners()['trainee_idem'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 0 }
      const trainee = entitySystem.get('character', 'trainee_idem') as any
      trainee.sp_flag.unconscious_h = 0
      trainee.experience = {}
      // 模拟重复 onEnable（HMR/同进程重载）——事件守卫阻止重复监听；
      // 注意：apiSystem.register 对重复方法抛错（引擎既有保护），第二次 onEnable 会抛——
      // 用 try/catch 模拟插件管理器降级路径，验证"即使 API 抛错，事件也不双倍"
      const { onEnable: confinementOnEnable } = await import('./index')
      const stubCtx2: any = {
        api: apiSystem,
        events: eventBus,
        commands: commandRegistry,
        ui: { registerSlot: () => {} },
      }
      await confinementOnEnable(stubCtx2).catch(() => {})
      await confinementOnEnable(stubCtx2).catch(() => {})
      // 触发一次 new_day：若监听重复注册则训练执行 3 次（+3），正确应为 1 次（+1）
      await eventBus.emit('game:new_day', { day: 2, reason: 'natural' })
      expect(trainee.experience[2] ?? 0).toBe(1)
      // 清理
      delete getPrisoners()['trainee_idem']
      getSettings().training = 0
      getState().wardenId = null
    })
  })

  describe('阶段B：追捕委托', () => {
    it('逃脱成功 → 生成动态追捕 scene + 逃犯上线藏匿点', async () => {
      registerChar('fugitive_1', { current_location: 'town_square' })
      getPrisoners()['fugitive_1'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 100 }
      // 概率 100 必逃
      await apiSystem.call('confinement', 'becomePrisoner', 'fugitive_1')
      // 直接调 escapeSuccess（模拟每日判定通过）
      const { escapeSuccess } = await import('./escape')
      await escapeSuccess('fugitive_1')
      const f = entitySystem.get('character', 'fugitive_1') as any
      expect(f.sp_flag.escaping).toBe(true)
      expect(f.sp_flag.imprisonment).toBe(false)
      // 藏匿点上线（非监狱地点）
      expect(f.current_location).not.toBe('prison_cell_1')
      expect(f.current_location).not.toBe('prison_cell_2')
      // 动态 scene 已注册
      const { getFugitives } = await import('./escape')
      expect(getFugitives()['fugitive_1']).toBeDefined()
      const sceneStatus = await apiSystem.call('quest', 'getSceneStatus', 'capture_fugitive_1')
      expect(sceneStatus).toBe('active')
    })

    it('抓回（recapture）→ 空牢房重囚', async () => {
      const { recaptureFugitive } = await import('./escape')
      await recaptureFugitive('fugitive_1')
      const f = entitySystem.get('character', 'fugitive_1') as any
      expect(f.sp_flag.escaping).toBe(false)
      expect(f.sp_flag.imprisonment).toBe(true)
      expect(['prison_cell_1', 'prison_cell_2']).toContain(f.current_location)
      expect(getPrisoners()['fugitive_1']).toBeDefined()
    })

    it('3 日超时未抓回 → 脱逃成功（清 escaping）', async () => {
      registerChar('fugitive_2')
      const { createFugitiveCommission, checkFugitiveDeadline, getFugitives } = await import('./escape')
      await createFugitiveCommission('fugitive_2')
      const info = getFugitives()['fugitive_2']
      expect(info).toBeDefined()
      // 模拟时间推进 4 天（day 1 → 5）
      const t = gameContext.getContext().time
      gameContext.setTime({ ...t, day: t.day + 4 })
      await checkFugitiveDeadline()
      const f2 = entitySystem.get('character', 'fugitive_2') as any
      expect(f2.sp_flag.escaping).toBe(false)
      expect(getFugitives()['fugitive_2']).toBeUndefined()
    })

    it('跨月超时（2026-08-14 审查修复回归）：月末逃脱 → 下月超时判定仍生效', async () => {
      registerChar('fugitive_3')
      const { createFugitiveCommission, checkFugitiveDeadline, getFugitives } = await import('./escape')
      // 月末 28 日逃脱
      const t = gameContext.getContext().time
      gameContext.setTime({ ...t, day: 28, month: 1 })
      await createFugitiveCommission('fugitive_3')
      expect(getFugitives()['fugitive_3']).toBeDefined()
      // 下月 2 日（28→30→1→2 = 4 天 > 3 天）——原实现 day 差 = 2-28 = -26 永不超时
      gameContext.setTime({ ...t, day: 2, month: 2 })
      await checkFugitiveDeadline()
      const f3 = entitySystem.get('character', 'fugitive_3') as any
      expect(f3.sp_flag.escaping).toBe(false)
      expect(getFugitives()['fugitive_3']).toBeUndefined()
    })
  })

  describe('阶段C：训练结算', () => {
    it('setFields 累加（2026-08-14 审查修复回归）：训练不覆盖已有刻印等级', async () => {
      registerChar('trainee')
      const { setTrainingModes, settleTraining } = await import('./warden')
      // 任命监狱长 + 训练模式 6（心理服从：屈服刻印 +1）
      getState().wardenId = gameContext.getContext().player?.id!
      getSettings().training = 6
      setTrainingModes([{
        id: 6, name: 't', state: '好意', stateBase: 20,
        setFields: [{ path: 'abilities.屈服刻印.level', value: 1 }],
        wardenAbility: '经验',
      }])
      getPrisoners()['trainee'] = { imprisonedAt: { ...gameContext.getContext().time }, escapeProbability: 0 }
      const trainee = entitySystem.get('character', 'trainee') as any
      trainee.sp_flag.unconscious_h = 0
      trainee.abilities['屈服刻印'] = { level: 2, xp: 0 }
      // 训练两次 → 2 + 2 = 4（原实现每次覆盖为 1）
      await settleTraining()
      await settleTraining()
      expect(trainee.abilities['屈服刻印'].level).toBe(4)
      delete getPrisoners()['trainee']
      getSettings().training = 0
      getState().wardenId = null
    })
  })

  describe('阶段C：调教助手', () => {
    it('onHStart 拉监狱长入 H（2026-08-14 二次审查回归）：完整 h_state + h_wait 块', async () => {
      // 监狱长与被监禁目标同地点
      registerChar('warden_char', { current_location: 'town_square' })
      registerChar('prisoner_char', { current_location: 'town_square' })
      const prisoner = entitySystem.get('character', 'prisoner_char') as any
      prisoner.sp_flag.imprisonment = true
      getState().wardenId = 'warden_char'
      getSettings().assistant = 1 // 同部位
      getSettings().target = 0 // 仅囚犯

      const { onHStart } = await import('./assistant')
      await onHStart({ ally: gameContext.getContext().player?.id, target: 'prisoner_char' })

      const warden = entitySystem.get('character', 'warden_char') as any
      expect(warden.h_state?.is_h).toBe(true)
      expect(warden.h_state?.sex_assist).toBe(true)
      // 完整结构（orgasm 结算字段不能缺——静默 NaN 防回归）
      expect(warden.h_state.orgasm_count).toBeDefined()
      expect(warden.h_state.insert_position).toBe(-1)
      // h_wait 块（日常 AI 冻结）
      expect(warden.ai_behavior?.type).toBe('h_wait')

      getSettings().assistant = 0
      getState().wardenId = null
      prisoner.sp_flag.imprisonment = false
    })
  })
})
