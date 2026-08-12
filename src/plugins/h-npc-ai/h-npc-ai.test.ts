// 注释：h-npc-ai 集成测试——每时间片判定/疲劳退出/逆推/群交 AI/行为块衔接（全插件加载）
// 遵循复刻验证铁律：事件走真实 eventBus；状态断言到具体值
// 测试指令：h-npc-ai 插件默认层 data/default/instructions/h-npc-ai-test.toml（标注测试）

import { conditionEngine } from '../../core/condition-engine'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { gameContext } from '../../core/game-context'
import { entitySystem } from '../../core/entity-system'
import { eventBus } from '../../core/event-bus'
import { apiSystem } from '../../core/api'
import { commandRegistry } from '../../core/command-registry'
import { commandExecutor } from '../../core/command-executor'
import { bindingResolver } from '../../core/binding-resolver'
import { conditionRegistry } from '../../core/condition-registry'
import { errorReporter } from '../../core/error-reporter'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { evaluateBodyPartPrefs, npcActiveH, tryPlActiveH } from './active-h'
import { filterInstructions, partTagsOfPartId } from './filter'
import { runGroupSexAi, onTemplateExecute } from './group-sex-ai'
import { judgeCharacterHStateTick } from './per-tick'
import { setNpcActiveH } from './state'

const PLAYER = 'player'
const GIRL = 'test_girl'

describe('h-npc-ai 集成', () => {
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
    const startLoc = entitySystem.get('location', 'town_square') as any
    if (startLoc) gameContext.setLocation(startLoc)

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
  })

  beforeEach(() => {
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
    gameContext.setExecutionState('IDLE')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 注释：辅助——把 NPC 拉入 H（h-core startHScene：双方 h_state + 模式 + h:start 事件）
  async function startH(girlId: string): Promise<void> {
    await apiSystem.call('h-core', 'startHScene', PLAYER, girlId)
    const girl = entitySystem.get('character', girlId) as any
    girl.current_location = (entitySystem.get('character', PLAYER) as any).current_location ?? 'town_square'
    // 注释：恢复体力/疲劳（跨测试泄漏防护——疲劳退出测试会把体力改到 ≤1、疲劳度改到 ≥160，
    // H 中窗口结算会积累疲劳，残留会让后续测试 H 秒退）
    girl.base['体力'] = 100
    girl.base['疲劳度'] = 0
    girl.base['尿意'] = 0
    girl.base['饥饿值'] = 0
    const player = entitySystem.get('character', PLAYER) as any
    player.base['体力'] = 1200
    expect(girl.h_state?.is_h).toBe(true)
  }

  // 注释：辅助——开启群交模式 + 模板 AI 类型
  async function groupSexModeOn(aiType: number): Promise<void> {
    await apiSystem.call('effect-system', 'execute', [{ type: 'group_sex_mode_on', params: {} }], {
      sourceId: PLAYER, _targetIds: [PLAYER], _timeCost: 0,
    })
    const tmpl = await apiSystem.call('h-group-sex', 'getTemplate', PLAYER) as any
    tmpl.npcAiType = aiType
  }

  async function groupSexModeOff(): Promise<void> {
    await apiSystem.call('effect-system', 'execute', [{ type: 'group_sex_mode_off', params: {} }], {
      sourceId: PLAYER, _targetIds: [], _timeCost: 0,
    })
  }

  // ═══════════════ 前提注册 ═══════════════

  it('逆推前提注册——T_NPC_ACTIVE_H / T_NPC_NOT_ACTIVE_H / NPC_ACTIVE_H', () => {
    const ids = conditionEngine.getRegisteredPremiseIds()
    expect(ids).toContain('t_npc_active_h')
    expect(ids).toContain('t_npc_not_active_h')
    expect(ids).toContain('npc_active_h')
  })

  it('T_NPC_ACTIVE_H 求值——逆推中 true / 平时 false', () => {
    const girl = entitySystem.get('character', GIRL) as any
    setNpcActiveH(girl, true)
    expect(conditionEngine.evaluatePremises(['T_NPC_ACTIVE_H'], { ...gameContext.getContext(), selectedCharacterId: GIRL })).toBe(true)
    expect(conditionEngine.evaluatePremises(['T_NPC_NOT_ACTIVE_H'], { ...gameContext.getContext(), selectedCharacterId: GIRL })).toBe(false)
    setNpcActiveH(girl, false)
    expect(conditionEngine.evaluatePremises(['T_NPC_ACTIVE_H'], { ...gameContext.getContext(), selectedCharacterId: GIRL })).toBe(false)
    expect(conditionEngine.evaluatePremises(['T_NPC_NOT_ACTIVE_H'], { ...gameContext.getContext(), selectedCharacterId: GIRL })).toBe(true)
  })

  // ═══════════════ 指令数据与过滤链 ═══════════════

  it('测试指令注册——带 part:/flag: tag 的 SEX 指令就绪', () => {
    for (const id of [
      'h_npc_test_mouth', 'h_npc_test_hand', 'h_npc_test_penis', 'h_npc_test_worship',
      'h_npc_test_breast', 'h_npc_test_vagina', 'h_npc_test_anal', 'h_npc_test_clit',
      'h_npc_test_first_time', 'h_npc_test_no_active', 'h_npc_test_item', 'h_npc_test_cond',
    ]) {
      expect(commandRegistry.getById(id)?.source).toBe('instructions')
    }
    // 逆推 3 指令
    for (const id of ['change_top_and_bottom', 'keep_enjoy', 'try_pl_active_h']) {
      expect(commandRegistry.getById(id)).toBeDefined()
    }
  })

  it('逆推过滤链——部位匹配 / no-active 排除 / item 子类排除 / 前提评估', () => {
    const girl = entitySystem.get('character', GIRL) as any
    girl.h_state = { is_h: true, target_character_id: PLAYER }

    // 部位匹配：part:vagina 只出阴道指令（含 first-time，不含 no-active/item）
    const vaginaCmds = filterInstructions(partTagsOfPartId(4), GIRL)
    expect(vaginaCmds.map(c => c.id)).toContain('h_npc_test_vagina')
    expect(vaginaCmds.map(c => c.id)).not.toContain('h_npc_test_breast')
    expect(vaginaCmds.map(c => c.id)).not.toContain('h_npc_test_no_active')
    expect(vaginaCmds.map(c => c.id)).not.toContain('h_npc_test_item')
    // 破处类在处女身上被跳过
    expect(vaginaCmds.map(c => c.id)).not.toContain('h_npc_test_first_time')
    // 控制类指令排除（flag:control——防止 NPC 逆推选到 keep_enjoy 自循环，erArk 纯指令语义）
    expect(vaginaCmds.map(c => c.id)).not.toContain('keep_enjoy')
    expect(vaginaCmds.map(c => c.id)).not.toContain('try_pl_active_h')
    expect(vaginaCmds.map(c => c.id)).not.toContain('change_top_and_bottom')
    // 前提评估：目标不是 H 时全部过滤（TARGET_IS_H 失败）
    girl.h_state.is_h = false
    const notInH = filterInstructions(partTagsOfPartId(4), GIRL)
    expect(notInH.length).toBe(0)
    // 条件评估：8:00 时 h_npc_test_cond（hour >= 12）被过滤；午后出现（选中必执行一致性）
    girl.h_state.is_h = true
    const morning = filterInstructions(partTagsOfPartId(4), GIRL)
    expect(morning.map(c => c.id)).not.toContain('h_npc_test_cond')
    gameContext.setTime({ minute: 0, hour: 14, day: 1, month: 1, year: 1 })
    const afternoon = filterInstructions(partTagsOfPartId(4), GIRL)
    expect(afternoon.map(c => c.id)).toContain('h_npc_test_cond')
    gameContext.setTime({ minute: 0, hour: 8, day: 1, month: 1, year: 1 })
  })

  it('破处过滤——已破处的目标可选 first-time 指令', () => {
    const girl = entitySystem.get('character', GIRL) as any
    girl.h_state = { is_h: true, target_character_id: PLAYER }
    girl.first_times = { virgin_V: true }
    const cmds = filterInstructions(partTagsOfPartId(4), GIRL)
    expect(cmds.map(c => c.id)).toContain('h_npc_test_first_time')
  })

  // ═══════════════ 部位喜好 ═══════════════

  it('evaluateBodyPartPrefs——部位经验权重 1 + 性技能力权重 10（膣技高 → 偏好阴道）', () => {
    const girl = entitySystem.get('character', GIRL) as any
    girl.experience = { 4: 10 }
    girl.abilities = girl.abilities ?? {}
    girl.abilities['膣技'] = { level: 3, xp: 0 }
    // 固定随机数使加权采样落在高权重部位（阴道：总权重 47，part4 权重 41，roll=0.5×47 落其中）
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(evaluateBodyPartPrefs(GIRL)).toBe(4)
    vi.restoreAllMocks()
    // 阴蒂无经验无能力 → 权重 1（兜底部位池合法）
    const pool = [0, 1, 2, 4, 5, 6, 7]
    for (let i = 0; i < 50; i++) {
      expect(pool).toContain(evaluateBodyPartPrefs(GIRL))
    }
  })

  // ═══════════════ 逆推执行 ═══════════════

  it('逆推执行——npcActiveH 选行为赋给玩家执行（体力扣减落地）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    setNpcActiveH(girl, true)
    girl.experience = { 4: 10 }
    girl.abilities['膣技'] = { level: 3, xp: 0 }
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    const before = girl.base?.['体力'] ?? 0
    const done = await npcActiveH(GIRL)
    expect(done).toBe(true)
    // 测试指令 h_npc_test_vagina：modify_attribute 体力 -5（target=selected=NPC）
    expect(girl.base?.['体力']).toBe(before - 5)
    // 逆推经验（erArk settle_behavior.py:675-680）：NPC 逆推 36 +1、玩家被逆推 37 +1
    expect(girl.experience?.['36'] ?? 0).toBe(1)
    const player = entitySystem.get('character', PLAYER) as any
    expect(player.experience?.['37'] ?? 0).toBe(1)
  })

  it('just_shoot 递减——每时间片 1→2→0（erArk :65-68，玩家部分 flag 归零）', async () => {
    await startH(GIRL)
    const player = entitySystem.get('character', PLAYER) as any
    player.h_state.just_shoot = 1
    await judgeCharacterHStateTick()
    expect(player.h_state.just_shoot).toBe(2)
    await judgeCharacterHStateTick()
    expect(player.h_state.just_shoot).toBe(0)
  })

  it('keep_enjoy 指令——效果链 npc_active_h_act 触发执行器', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    setNpcActiveH(girl, true)
    girl.experience = { 4: 10 }
    girl.abilities['膣技'] = { level: 3, xp: 0 }
    vi.spyOn(Math, 'random').mockReturnValue(0.001)
    const before = girl.base?.['体力'] ?? 0
    const player = entitySystem.get('character', PLAYER) as any
    await commandExecutor.execute('keep_enjoy', {
      api: apiSystem,
      engine: { setExecutionState: () => {}, emit: async () => {} },
      uiStore: { selectedCharacterId: GIRL },
      gameStore: { player },
      sourceId: PLAYER,
      evaluatePremises: (ps: string[]) => { try { return conditionEngine.evaluatePremises(ps, { ...gameContext.getContext(), selectedCharacterId: GIRL }) } catch { return false } },
      evaluateCondition: () => true,
    })
    // 指令前提 T_NPC_ACTIVE_H 满足 → 执行 → NPC 体力 -5
    expect(girl.base?.['体力']).toBe(before - 5)
  })

  it('逆推中普通 H 指令被前提过滤（T_NPC_NOT_ACTIVE_H 失败）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    setNpcActiveH(girl, true)
    // end_h 带 T_NPC_NOT_ACTIVE_H → 逆推中不满足（erArk：h_end 逆推中隐藏）
    expect(conditionEngine.evaluatePremises(['T_NPC_NOT_ACTIVE_H'], { ...gameContext.getContext(), selectedCharacterId: GIRL })).toBe(false)
    // keep_enjoy 的 T_NPC_ACTIVE_H 满足
    expect(conditionEngine.evaluatePremises(['T_NPC_ACTIVE_H'], { ...gameContext.getContext(), selectedCharacterId: GIRL })).toBe(true)
  })

  // ═══════════════ ① 每时间片判定 ═══════════════

  it('h:start → NPC 行为块锁死为 h_wait（冻结日常 AI）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    expect(girl.ai_behavior?.type).toBe('h_wait')
    expect(girl.state).toBe('h_wait')
  })

  it('不同地点结束 H——is_h 且不在玩家场景 → 退出（erArk :95-118）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    girl.current_location = 'tavern'
    await judgeCharacterHStateTick()
    // 1v1（玩家 target=girl）→ endHScene 清 h_state
    expect(girl.h_state).toBeUndefined()
    expect(girl.ai_behavior?.type).toBe('h_end')
  })

  it('h:end → 行为块 h_end（立即过期）→ 下次 settle-pass 重新决策日常行为', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    await apiSystem.call('h-core', 'endHScene', PLAYER)
    expect(girl.h_state).toBeUndefined()
    expect(girl.ai_behavior?.type).toBe('h_end')
    // 下一时间片：settle-pass 决策新行为（连锁）
    await gameContext.advanceTime(10)
    expect(girl.ai_behavior?.type).not.toBe('h_end')
    expect(girl.ai_behavior?.type).not.toBe('h_wait')
  })

  it('时停 NPC 跳过锁死判定（不重置行为块）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    girl.sp_flag = girl.sp_flag ?? {}
    girl.sp_flag.unconscious_h = 3
    girl.ai_behavior = { id: 'h_wait', type: 'h_wait', start_time: 0, duration: 60 }
    await judgeCharacterHStateTick()
    expect(girl.ai_behavior.type).toBe('h_wait')
    expect(girl.h_state?.is_h).toBe(true)
    girl.sp_flag.unconscious_h = 0
  })

  // ═══════════════ 疲劳/HP 退出 ═══════════════

  it('H 中 NPC 窗口结算——疲劳/尿意/饥饿积累（erArk WAIT 行为，H 不会无限持续）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    girl.base['疲劳度'] = 0
    girl.base['尿意'] = 0
    girl.base['饥饿值'] = 0
    await gameContext.advanceTime(60)
    expect(girl.base['疲劳度']).toBeGreaterThan(0)
    expect(girl.base['尿意']).toBeGreaterThan(0)
    expect(girl.base['饥饿值']).toBeGreaterThan(0)
  })

  it('疲劳等级 ≥2 退出——H 中疲劳度 >134.4 触发结束（erArk handle_npc_ai.py:57）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    girl.base['疲劳度'] = 160
    await gameContext.advanceTime(10)
    expect(girl.h_state).toBeUndefined()
    const player = entitySystem.get('character', PLAYER) as any
    expect(player.h_state).toBeUndefined()
  })

  it('NPC 体力≤1 → 普通 H 结束（endHScene 清双方 h_state + 行为块 h_end）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    girl.base['体力'] = 1
    await gameContext.advanceTime(10)
    expect(girl.h_state).toBeUndefined()
    const player = entitySystem.get('character', PLAYER) as any
    expect(player.h_state).toBeUndefined()
  })

  it('玩家体力≤1 → 自动结束 H', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    const player = entitySystem.get('character', PLAYER) as any
    player.base['体力'] = 1
    await gameContext.advanceTime(10)
    expect(girl.h_state).toBeUndefined()
    expect(player.h_state).toBeUndefined()
  })

  it('群交 NPC 体力≤1 → 移出模板；剩余 0 → 结束群交 + 结束 H', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    await groupSexModeOn(0)
    // 先补位（手动分配）+ 第二 NPC（guard）也拉入 H 并分配
    const tmpl = await apiSystem.call('h-group-sex', 'getTemplate', PLAYER) as any
    tmpl.A.mouth = { targetId: GIRL, behaviorId: 'h_npc_test_mouth' }
    const guard = entitySystem.get('character', 'guard') as any
    guard.h_state = { is_h: true, target_character_id: PLAYER }
    guard.current_location = 'town_square'
    guard.ai_behavior = { id: 'h_wait', type: 'h_wait', start_time: 0, duration: 60 }
    tmpl.A.penis = { targetId: 'guard', behaviorId: 'h_npc_test_penis' }

    girl.base['体力'] = 1
    await gameContext.advanceTime(10)
    // 移出后剩 guard 1 人 → 转单人 H（关群交模式，H 保留）；退出 NPC 的 h_state 清空
    const active = await apiSystem.call('h-group-sex', 'isActive')
    expect(active).toBe(false)
    expect(girl.h_state).toBeUndefined()
    expect(guard.h_state?.is_h).toBe(true)
    await apiSystem.call('h-core', 'endHScene', PLAYER)
    await groupSexModeOff()
  })

  // ═══════════════ 群交 AI ═══════════════

  it('群交 AI type 2——空槽补位（随机槽 + 槽位部位指令）', async () => {
    await startH(GIRL)
    await groupSexModeOn(2)
    vi.spyOn(Math, 'random').mockReturnValue(0.001)
    await runGroupSexAi(GIRL)
    const tmpl = await apiSystem.call('h-group-sex', 'getTemplate', PLAYER) as any
    const assigned = Object.values(tmpl.A).some((v: any) => v?.targetId === GIRL || v?.targetIds?.includes(GIRL))
    expect(assigned).toBe(true)
    await apiSystem.call('h-core', 'endHScene', PLAYER)
    await groupSexModeOff()
  })

  it('群交 AI type 1——自慰（行为块 h_masturebate）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    await groupSexModeOn(1)
    await runGroupSexAi(GIRL)
    expect(girl.ai_behavior?.type).toBe('h_masturebate')
    await apiSystem.call('h-core', 'endHScene', PLAYER)
    await groupSexModeOff()
  })

  it('群交 AI type 3——模板执行时抢占（onTemplateExecute 补位）', async () => {
    const guard = entitySystem.get('character', 'guard') as any
    await startH(GIRL)
    guard.h_state = { is_h: true, target_character_id: PLAYER }
    guard.current_location = 'town_square'
    guard.ai_behavior = { id: 'h_wait', type: 'h_wait', start_time: 0, duration: 60 }
    await groupSexModeOn(3)
    vi.spyOn(Math, 'random').mockReturnValue(0.001)
    await onTemplateExecute(PLAYER)
    const tmpl = await apiSystem.call('h-group-sex', 'getTemplate', PLAYER) as any
    const assigned = Object.values(tmpl.A).some((v: any) => v?.targetId === GIRL || v?.targetId === 'guard' || v?.targetIds?.includes(GIRL) || v?.targetIds?.includes('guard'))
    expect(assigned).toBe(true)
    await apiSystem.call('h-core', 'endHScene', PLAYER)
    await groupSexModeOff()
  })

  it('端到端链路：do_h → change_top_and_bottom → keep_enjoy → try_pl_active_h → end_h → 日常恢复', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    const player = entitySystem.get('character', PLAYER) as any
    // 稳定：膣技高 + 固定随机 → NPC 逆推选中阴道指令
    girl.abilities['膣技'] = { level: 3, xp: 0 }
    girl.experience = { 4: 10 }
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    // 注释：真实 H 场景只有 2 人（do_h 前提 SCENE_ONLY_TWO）——无关 NPC 移走，
    // 避免 judge 的他人存在修正干扰夺回判定
    for (const id of ['innkeeper', 'guard', 'test_enemy', 'contract_demo']) {
      const ch = entitySystem.get('character', id) as any
      if (ch) ch.current_location = 'tavern'
    }
    // 注释：显式愤怒 0（愤怒值在测试间被窗口结算等累积波动，影响心情修正的确定性）
    girl.base['愤怒'] = 0

    // 注释：模拟玩家指令面板点击（UI ctx 同构——selected=NPC、source=玩家）
    const execCtx = (targetId: string) => ({
      api: apiSystem,
      engine: { setExecutionState: () => {}, emit: async () => {} },
      uiStore: { selectedCharacterId: targetId },
      gameStore: { player },
      sourceId: PLAYER,
      evaluatePremises: (ps: string[]) => { try { return conditionEngine.evaluatePremises(ps, { ...gameContext.getContext(), selectedCharacterId: targetId }) } catch { return false } },
      evaluateCondition: () => true,
    })

    // 1. 邀请 H → h:start → 双方 h_state + NPC 行为块锁死 h_wait
    await commandExecutor.execute('do_h', execCtx(GIRL))
    expect(girl.h_state?.is_h).toBe(true)
    expect(girl.h_state?.target_character_id).toBe(PLAYER)
    expect(girl.ai_behavior?.type).toBe('h_wait')

    // 2. 交给对方 → npc_active_h 开启
    await commandExecutor.execute('change_top_and_bottom', execCtx(GIRL))
    expect(girl.h_state?.npc_active_h).toBe(true)
    // 逆推中 end_h 前提失败（T_NPC_NOT_ACTIVE_H）——无法正常结束 H（erArk 同款）
    expect(conditionEngine.evaluatePremises(['T_NPC_NOT_ACTIVE_H'], { ...gameContext.getContext(), selectedCharacterId: GIRL })).toBe(false)

    // 3. 继续享受 → NPC 按部位喜好选行为赋给玩家执行（体力 -5 + 时间推进 10 分钟）
    const before = girl.base?.['体力'] ?? 0
    const timeBefore = gameContext.getContext().time
    await commandExecutor.execute('keep_enjoy', execCtx(GIRL))
    expect(girl.base?.['体力']).toBe(before - 5)
    expect(gameContext.getContext().time.minute).not.toBe(timeBefore.minute)

    // 4. 尝试掌握主动权（2 人场景无他人修正；'掌握主动权' 类无处女惩罚：
    //    150 + 心情+20 = 170 ≥ 150 → 成功夺回）
    await commandExecutor.execute('try_pl_active_h', execCtx(GIRL))
    expect(girl.h_state?.npc_active_h).toBe(false)
    expect(conditionEngine.evaluatePremises(['T_NPC_NOT_ACTIVE_H'], { ...gameContext.getContext(), selectedCharacterId: GIRL })).toBe(true)

    // 5. 结束 H → h:end → 行为块 h_end（立即过期）
    await commandExecutor.execute('end_h', execCtx(GIRL))
    expect(girl.h_state).toBeUndefined()
    expect(girl.ai_behavior?.type).toBe('h_end')

    // 6. 时间推进 → settle-pass 重新决策日常行为（AI 衔接）
    await gameContext.advanceTime(10)
    expect(girl.ai_behavior?.type).not.toBe('h_end')
    expect(girl.ai_behavior?.type).not.toBe('h_wait')
  })

  it('try_pl_active_h 失败路径——NPC 愤怒 40（心情 -20 → 130 < 150 → partial 失败，逆推保持）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    setNpcActiveH(girl, true)
    girl.base['愤怒'] = 40
    const ok = await tryPlActiveH(GIRL, 150)
    expect(ok).toBe(false)
    expect(girl.h_state?.npc_active_h).toBe(true)
    girl.base['愤怒'] = 0
  })

  it('群交中 end_h 结束 H → h:end 统一关群交模式（模式残留防护，2026-08-11 审查修复）', async () => {
    await startH(GIRL)
    await groupSexModeOn(0)
    expect(await apiSystem.call('h-group-sex', 'isActive')).toBe(true)
    await apiSystem.call('h-core', 'endHScene', PLAYER)
    expect(await apiSystem.call('h-group-sex', 'isActive')).toBe(false)
  })

  it('run_group_sex_template 指令——模板执行链路接通（槽位结算 + group_sex:template_execute 事件 + 时间推进）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    await groupSexModeOn(0)
    const tmpl = await apiSystem.call('h-group-sex', 'getTemplate', PLAYER) as any
    tmpl.A.mouth = { targetId: GIRL, behaviorId: 'h_npc_test_mouth' }
    const player = entitySystem.get('character', PLAYER) as any
    const before = girl.base['体力']
    const beforeTime = gameContext.getContext().time
    let eventReceived = false
    const handler = (p: any) => { if (p?.charId === PLAYER) eventReceived = true }
    eventBus.on('group_sex:template_execute', handler)
    try {
      await commandExecutor.execute('run_group_sex_template', {
        api: apiSystem,
        engine: { setExecutionState: () => {}, emit: async () => {} },
        uiStore: { selectedCharacterId: GIRL },
        gameStore: { player },
        sourceId: PLAYER,
        evaluatePremises: () => true,
        evaluateCondition: () => true,
      })
    } finally {
      eventBus.off('group_sex:template_execute', handler)
    }
    // 槽位指令结算（h_npc_test_mouth：modify_attribute 体力 -5 → 目标 NPC）
    expect(girl.base['体力']).toBe(before - 5)
    // 事件发出（type 3 抢占链路的输入）
    expect(eventReceived).toBe(true)
    // 时间推进（timeCost=10）
    const afterTime = gameContext.getContext().time
    expect(afterTime.minute).not.toBe(beforeTime.minute)
    await apiSystem.call('h-core', 'endHScene', PLAYER)
    await groupSexModeOff()
  })

  it('群交模板执行——槽位指令 id 映射（指令 id 写入模板，执行管道走 commandRegistry）', async () => {
    const girl = entitySystem.get('character', GIRL) as any
    await startH(GIRL)
    await groupSexModeOn(0)
    const tmpl = await apiSystem.call('h-group-sex', 'getTemplate', PLAYER) as any
    tmpl.A.mouth = { targetId: GIRL, behaviorId: 'h_npc_test_mouth' }
    // 槽位行为标识 = 指令 id（grill Q10 定案）——commandRegistry 可解析
    expect(commandRegistry.getById(tmpl.A.mouth.behaviorId)?.source).toBe('instructions')
    await apiSystem.call('h-core', 'endHScene', PLAYER)
    await groupSexModeOff()
    expect(girl.h_state).toBeUndefined()
  })
})
