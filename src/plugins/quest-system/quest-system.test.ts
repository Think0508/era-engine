// 注释：quest-system 战斗步骤测试（B3 修复——audit-c I3）
// 原实现 allies 传空数组（玩家不在参战者）+ 不监听 combat:end → combat 步骤永不推进
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { commandRegistry } from '../../core/command-registry'
import { commandExecutor } from '../../core/command-executor'
import { errorReporter } from '../../core/error-reporter'
import { narrativeLog } from '../../core/narrative-log'
import { effectTypeRegistry } from '../../core/effect-type-registry'
import { getGameStateProviders } from '../../core/save-system'
import type { Quest } from '../../core/mod-loader'
import { parseConversationRef, resolveConversation } from '../../core/mod-loader'

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

describe('quest-system combat 步骤推进（B3）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
    gameContext.setPlayer('player')
    const startLoc = entitySystem.get('location', 'town_square') as any
    if (startLoc) gameContext.setLocation(startLoc)
    entitySystem.register('character', 'enemy_bandit', {
      id: 'enemy_bandit',
      name: '山贼',
      base: { hp: 30, attack: 5 },
      current_location: 'town_square',
    })
  })

  afterEach(() => {
    const mod = modLoader.getMod()!
    mod.quests.delete('combat_test_quest')
    gameContext.reset()
  })

  function installQuest(stepOverrides: Partial<Quest> = {}) {
    const mod = modLoader.getMod()!
    const quest: Quest = {
      id: 'combat_test_quest',
      title: '战斗测试任务',
      type: 'main',
      display: 'hidden',
      steps: [
        { id: 'fight', type: 'combat', enemies: ['enemy_bandit'], on_win: 'final', on_lose: 'failed' },
        { id: 'final', type: 'reward', effects: [{ type: 'narrative_output', params: { text: '胜利' } }], next: 'not_exist' },
        { id: 'failed', type: 'reward', effects: [{ type: 'narrative_output', params: { text: '失败' } }], next: 'not_exist' },
      ],
      ...stepOverrides,
    }
    mod.quests.set('combat_test_quest', quest)
    return quest
  }

  it('combat 步骤启动时 allies 含玩家（不再传空数组）', async () => {
    installQuest()
    await apiSystem.call('quest', 'start', 'combat_test_quest')
    const combatCtx = await apiSystem.call('combat', 'getCombatContext')
    expect(combatCtx).not.toBeNull()
    expect(combatCtx.allies).toContain('player')
    expect(combatCtx.enemies).toContain('enemy_bandit')
    // 结束战斗（清场，避免跨测试污染）
    await apiSystem.call('combat', 'end', 'enemies', 'lose')
  })

  it('combat:end 胜利 → 推进 on_win 步骤；失败 → on_lose 步骤', async () => {
    installQuest()
    await apiSystem.call('quest', 'start', 'combat_test_quest')
    // 胜利：combat:end winner=allies → on_win='final' → final.next='not_exist' → 任务完成
    await eventBus.emit('combat:end', { winner: 'allies', outcome: 'win', participants: ['player', 'enemy_bandit'] })
    expect(await apiSystem.call('quest', 'getSceneStatus', 'combat_test_quest')).toBe('completed')

    // 失败路径
    installQuest()
    await apiSystem.call('quest', 'start', 'combat_test_quest')
    await eventBus.emit('combat:end', { winner: 'enemies', outcome: 'lose', participants: ['player', 'enemy_bandit'] })
    expect(await apiSystem.call('quest', 'getSceneStatus', 'combat_test_quest')).toBe('completed')
  })

  it('combat 步骤无 on_win/on_lose 时沿用 next（既有语义兼容）', async () => {
    installQuest({
      steps: [
        { id: 'fight', type: 'combat', enemies: ['enemy_bandit'], next: 'final' },
        { id: 'final', type: 'reward', effects: [], next: 'not_exist' },
      ],
    })
    await apiSystem.call('quest', 'start', 'combat_test_quest')
    await eventBus.emit('combat:end', { winner: 'allies', outcome: 'win', participants: ['player', 'enemy_bandit'] })
    expect(await apiSystem.call('quest', 'getSceneStatus', 'combat_test_quest')).toBe('completed')
  })

  it('B4：test_quest 的对话引用解析到 innkeeper/daily_chat（不再是 global 简写断裂）', () => {
    const mod = modLoader.getMod()!
    // 数据存在性：角色对话注册表有 innkeeper → daily_chat
    expect(mod.conversations.character.get('innkeeper')?.has('daily_chat')).toBe(true)
    // 任务数据引用解析：test_quest 的对话步骤必须是角色引用且可解析（非 global 简写）
    const quest = mod.quests.get('test_quest')!
    const step = quest.steps[0]
    expect(step.conversation).toBe('character:innkeeper/daily_chat')
    const ref = parseConversationRef(step.conversation as string)
    expect(ref.type).toBe('character')
    expect(ref.character).toBe('innkeeper')
    expect(ref.name).toBe('daily_chat')
    expect(resolveConversation(mod.conversations, ref)).toBeDefined()
  })

  // ═══════ 全面审计 I4 修复：objective 真实匹配（不再恒 true）═══════
  describe('objective 真实匹配（I4）', () => {
    function installObjectiveQuest(obj: any) {
      const mod = modLoader.getMod()!
      mod.quests.set('objective_test_quest', {
        id: 'objective_test_quest',
        title: '目标测试',
        type: 'main',
        display: 'hidden',
        steps: [
          { id: 'obj_step', type: 'objective', objective: obj, next: 'final' },
          { id: 'final', type: 'reward', effects: [], next: 'not_exist' },
        ],
      })
    }

    it('collect_items：itemId 匹配 + count 累计达标才推进（错误物品不推进）', async () => {
      installObjectiveQuest({ type: 'collect_items', item: '回血丹', count: 2 })
      await apiSystem.call('quest', 'start', 'objective_test_quest')
      // 错误物品 → 不推进
      await eventBus.emit('item:added', { character: 'player', itemId: '媚药', count: 5 })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'objective_test_quest')).not.toBe('completed')
      // 正确物品 1 个 → 仍不达标
      await eventBus.emit('item:added', { character: 'player', itemId: '回血丹', count: 1 })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'objective_test_quest')).not.toBe('completed')
      // 再 1 个 → 累计 2 达标推进
      await eventBus.emit('item:added', { character: 'player', itemId: '回血丹', count: 1 })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'objective_test_quest')).toBe('completed')
    })

    it('kill_count：玩家方胜利 + 目标敌人参战才累计（其他战斗不推进）', async () => {
      installObjectiveQuest({ type: 'kill_count', target: 'enemy_bandit', count: 1 })
      await apiSystem.call('quest', 'start', 'objective_test_quest')
      // 失败战斗 → 不推进
      await eventBus.emit('combat:end', { winner: 'enemies', outcome: 'lose', participants: ['player', 'enemy_bandit'] })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'objective_test_quest')).not.toBe('completed')
      // 胜利但目标未参战 → 不推进
      await eventBus.emit('combat:end', { winner: 'allies', outcome: 'win', participants: ['player', 'other_enemy'] })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'objective_test_quest')).not.toBe('completed')
      // 胜利 + 目标参战 → 推进
      await eventBus.emit('combat:end', { winner: 'allies', outcome: 'win', participants: ['player', 'enemy_bandit'] })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'objective_test_quest')).toBe('completed')
    })
  })

  // ═══════ C1：步骤执行上下文注入（quest-script C' 模型 Task 1）═══════
  describe('步骤执行上下文注入（C1）', () => {
    function installCtxQuest(step: any) {
      const mod = modLoader.getMod()!
      mod.quests.set('ctx_test_quest', {
        id: 'ctx_test_quest', title: '上下文测试', type: 'main', display: 'hidden',
        steps: [
          { id: 's1', type: 'reward', effects: [], next: 'final', ...step },
          { id: 'final', type: 'reward', effects: [], next: 'not_exist' },
        ],
      })
    }

    beforeEach(() => {
      // 注释：外层 afterEach 的 gameContext.reset() 清掉了 player——
      // C1 用例需重建（否则 combat 步骤 allies 为空 → 瞬间判负自动结束）
      gameContext.setPlayer('player')
    })

    afterEach(() => {
      modLoader.getMod()!.quests.delete('ctx_test_quest')
      // 注释：gameContext.reset() 不清 selectedCharacterId（2026-08-14 确认），测试内用完置 null
      gameContext.setSelectedCharacterId(null)
    })

    it('reward 步骤 execCtx 默认 sourceId=player、targetIds 含 UI 选中角色', async () => {
      const captured: any[] = []
      effectTypeRegistry.register('capture_ctx', (_params: any, execCtx: any) => {
        captured.push({ sourceId: execCtx.sourceId, targetIds: execCtx._targetIds })
        return true
      })
      installCtxQuest({ effects: [{ type: 'capture_ctx' }] })
      gameContext.setSelectedCharacterId('enemy_bandit')
      await apiSystem.call('quest', 'start', 'ctx_test_quest')
      expect(captured[0]).toEqual({ sourceId: 'player', targetIds: ['enemy_bandit'] })
    })

    it('step.target 显式指定角色 ID 时覆盖 UI 选中', async () => {
      const captured: any[] = []
      effectTypeRegistry.register('capture_ctx2', (_params: any, execCtx: any) => {
        captured.push(execCtx._targetIds)
        return true
      })
      installCtxQuest({ target: 'enemy_bandit', effects: [{ type: 'capture_ctx2' }] })
      gameContext.setSelectedCharacterId('other_npc')
      await apiSystem.call('quest', 'start', 'ctx_test_quest')
      expect(captured[0]).toEqual(['enemy_bandit'])
    })

    it('combat 步骤只推进与 participants 有交集的战斗（其他战斗不推进）', async () => {
      installCtxQuest({ type: 'combat', enemies: ['enemy_bandit'], on_win: 'final', next: 'final' })
      await apiSystem.call('quest', 'start', 'ctx_test_quest')
      // 无关战斗（目标不在 participants）→ 不推进
      await eventBus.emit('combat:end', { winner: 'allies', outcome: 'win', participants: ['player', 'other_enemy'] })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'ctx_test_quest')).toBe('active')
      // 相关战斗 → 推进
      await eventBus.emit('combat:end', { winner: 'allies', outcome: 'win', participants: ['player', 'enemy_bandit'] })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'ctx_test_quest')).toBe('completed')
    })
  })

  // ═══════ C2：场景变量（quest-script C' 模型 Task 2）═══════
  describe('场景变量（C2）', () => {
    // 注释：terminal=true → final 步骤无 next（scene 保持 active，vars 可读/可序列化）；
    // 默认完整链路 → 条件命中后走完（next='not_exist'）→ 完成（证明 set_var + quest.{id}.var.{name} 分支正确）
    function installVarQuest(opts: { terminal?: boolean } = {}) {
      const mod = modLoader.getMod()!
      mod.quests.set('var_test_quest', {
        id: 'var_test_quest', title: '变量测试', type: 'main', display: 'hidden',
        steps: [
          { id: 'a', type: 'reward', effects: [
              { type: 'set_var', params: { scene: 'var_test_quest', var: 'line', value: 'x' } },
            ], next: 'b' },
          { id: 'b', type: 'condition', condition: "quest.var_test_quest.var.line == 'x'", next: 'final', else: 'a' },
          opts.terminal
            ? { id: 'final', type: 'reward', effects: [] }
            : { id: 'final', type: 'reward', effects: [], next: 'not_exist' },
        ],
      })
    }

    afterEach(() => {
      modLoader.getMod()!.quests.delete('var_test_quest')
    })

    it('set_var → 条件路径可读 → 分支正确（完整链路走到完成）', async () => {
      installVarQuest()
      await apiSystem.call('quest', 'start', 'var_test_quest')
      // 完成 = 条件步骤求值 true（若 quest.{id}.var.{name} 读不到变量 → else 死循环/卡死）
      expect(await apiSystem.call('quest', 'getSceneStatus', 'var_test_quest')).toBe('completed')
    })

    it('getVar/setVar 读写 + 场景变量随存档序列化/恢复', async () => {
      installVarQuest({ terminal: true })
      await apiSystem.call('quest', 'start', 'var_test_quest')
      // set_var effect 写入 → getVar API 可读
      expect(await apiSystem.call('quest', 'getVar', 'var_test_quest', 'line')).toBe('x')
      // setVar API 手动改值 → 写生效
      await apiSystem.call('quest', 'setVar', 'var_test_quest', 'line', 'y')
      expect(await apiSystem.call('quest', 'getVar', 'var_test_quest', 'line')).toBe('y')
      // 序列化：vars 随 activeScenes 存档（provider 经 save-system 导出查询）
      const provider = getGameStateProviders().find(p => p.id === 'quest-system')
      expect(provider).toBeDefined()
      const data = provider!.serialize()
      const entry = data.activeScenes.find((e: any) => e.sceneId === 'var_test_quest')
      expect(entry?.vars).toEqual({ line: 'y' })
      // 恢复：读档后 vars 保留
      provider!.restore(data)
      expect(await apiSystem.call('quest', 'getVar', 'var_test_quest', 'line')).toBe('y')
    })
  })

  // ═══════ C3：script 步骤（quest-script C' 模型 Task 3）═══════
  describe('script 步骤（C3）', () => {
    // questExtra：任务级字段（如 vars 预置）——spread 到 quest 对象
    function installScriptQuest(step: any = {}, questExtra: any = {}) {
      const mod = modLoader.getMod()!
      mod.quests.set('script_test_quest', {
        id: 'script_test_quest', title: '脚本测试', type: 'main', display: 'hidden',
        ...questExtra,
        steps: [
          { id: 's1', type: 'script', script: 'quest_test.js', params: { item: '小无相功秘籍' }, next: 'final', ...step },
          { id: 'final', type: 'reward', effects: [], next: 'not_exist' },
          // 注释（C3 Fix Round）：final2 只被 step.next 指向——else 与 next 指向不同步骤，
          // 分支语义才能被独立钉住（false→else='final' vs 抛错→next='final2'）
          { id: 'final2', type: 'reward', effects: [], next: 'not_exist' },
        ],
      })
    }

    afterEach(() => {
      modLoader.getMod()!.quests.delete('script_test_quest')
    })

    it('script 步骤执行 + params 注入 + say 输出 + 走 next', async () => {
      const mod = modLoader.getMod()!
      mod.scripts.set('quest_test.js', `
        if (params.item) { say(null, '获得 ' + params.item) }
        return 'final'
      `)
      installScriptQuest()
      await apiSystem.call('quest', 'start', 'script_test_quest')
      expect(await apiSystem.call('quest', 'getSceneStatus', 'script_test_quest')).toBe('completed')
      // 注释（C3 Fix Round）：钉住 params 注入 + say 输出（narrative-log 可读）
      expect(narrativeLog.getEntries().some(e => e.text === '获得 小无相功秘籍')).toBe(true)
    })

    it('script 返回 false → 走 else；脚本抛错 → 上报 + 走 next', async () => {
      const mod = modLoader.getMod()!
      mod.scripts.set('quest_fail.js', `return false`)
      // 注释（偏离 brief 原文）：沙箱 with(ctx) 代理按设计屏蔽全局对象（sandbox 铁律）——
      // new Error() 在脚本内不可用（"Error is not a constructor"），故用字符串 throw，
      // runQuestScript 的 catch 对非 Error 抛错走 String(err)（message 仍含 'boom'）
      mod.scripts.set('quest_throw.js', `throw 'boom'`)
      // 注释（C3 Fix Round）：else='final' 与 next='final2' 指向不同步骤——监听 scene:updated
      // 记录实际进入的步骤，两条分支各自独立断言（此前 else 与 next 同指 final，无法判别）
      const visited: string[] = []
      const onSceneUpdated = (payload: any) => { visited.push(payload.step) }
      eventBus.on('scene:updated', onSceneUpdated)
      try {
        // 分支 1：return false → else='final'（next='final2' 必须不被走）
        installScriptQuest({ script: 'quest_fail.js', else: 'final', next: 'final2' })
        await apiSystem.call('quest', 'start', 'script_test_quest')
        expect(await apiSystem.call('quest', 'getSceneStatus', 'script_test_quest')).toBe('completed')
        expect(visited).toContain('final')
        expect(visited).not.toContain('final2')

        // 分支 2：抛错 → 上报 + 走 next='final2'（无 else——else 分支不许被走）
        visited.length = 0
        errorReporter.clear()
        // 注释（偏离 brief 原文）：同一测试内第二次 start 会被 isCompleted 跳过（scene 已完成
        // 不再启动——任务设计语义），需先清完成记录才能跑第二次
        gameContext.reset()
        installScriptQuest({ script: 'quest_throw.js', next: 'final2' })
        await apiSystem.call('quest', 'start', 'script_test_quest')
        expect(errorReporter.getErrors().some(e => e.message.includes('boom'))).toBe(true)
        expect(await apiSystem.call('quest', 'getSceneStatus', 'script_test_quest')).toBe('completed')
        expect(visited).toContain('final2')
        expect(visited).not.toContain('final')
      } finally {
        eventBus.off('scene:updated', onSceneUpdated)
      }
    })

    it('脚本可读场景变量、可写场景变量、可调 API', async () => {
      const mod = modLoader.getMod()!
      mod.scripts.set('quest_vars.js', `
        setVar('from_script', getVar('line') ?? 'none')
        const n = await api.call('quest', 'getSceneStatus', sceneId)
        say('李秋水', 'status=' + n)
        return undefined
      `)
      // 注释（偏离 brief 原文，Task 2 语义约束）：brief 的 setVar 调用在 start 之前——
      // scene 未激活时 setVar API 是 no-op；且 scene 完成后 activeScenes 删除、vars 不可读。
      // 故：① line 由 quest 数据 vars 预置（脚本可读）；② s1 无 next → 脚本执行后 scene
      // 保持 active（from_script 可读）。"读/写变量 + 调 API" 三条能力断言不变
      installScriptQuest({ script: 'quest_vars.js', next: undefined }, { vars: { line: 'x' } })
      await apiSystem.call('quest', 'start', 'script_test_quest')
      expect(await apiSystem.call('quest', 'getVar', 'script_test_quest', 'from_script')).toBe('x')
      expect(await apiSystem.call('quest', 'getSceneStatus', 'script_test_quest')).toBe('active')
    })
  })

  // ═══════ C4：custom objective（事件驱动的脚本化目标，quest-script C' 模型 Task 4）═══════
  describe('custom objective（C4）', () => {
    function installCustomQuest(obj: any) {
      const mod = modLoader.getMod()!
      mod.quests.set('custom_obj_quest', {
        id: 'custom_obj_quest', title: '自定义目标', type: 'main', display: 'hidden',
        steps: [
          { id: 'wait', type: 'objective', objective: obj, next: 'final' },
          { id: 'final', type: 'reward', effects: [], next: 'not_exist' },
        ],
      })
    }

    afterEach(() => {
      modLoader.getMod()!.quests.delete('custom_obj_quest')
    })

    it('orgasm 计数：目标角色高潮 5 次推进（其他角色不计）', async () => {
      const mod = modLoader.getMod()!
      mod.scripts.set('orgasm_counter.js', `
        if (payload.character !== params.target) return 'pending'
        const cur = (getVar('orgasm_count') ?? 0) + 1
        setVar('orgasm_count', cur)
        return cur >= params.count ? 'done' : 'pending'
      `)
      installCustomQuest({ type: 'custom', event: 'h:orgasm', script: 'orgasm_counter.js', params: { target: '李秋水', count: 5 } })
      await apiSystem.call('quest', 'start', 'custom_obj_quest')
      for (let i = 0; i < 4; i++) {
        await eventBus.emit('h:orgasm', { character: '李秋水', partId: 1, level: 2, count: 1 })
        expect(await apiSystem.call('quest', 'getSceneStatus', 'custom_obj_quest')).toBe('active')
      }
      await eventBus.emit('h:orgasm', { character: '李秋水', partId: 1, level: 2, count: 1 })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'custom_obj_quest')).toBe('completed')
    })

    it('fail_event 触发且未达成 → 走 on_fail；未达成的次数不跨会话累计', async () => {
      const mod = modLoader.getMod()!
      mod.scripts.set('orgasm_counter.js', `
        if (payload.character !== params.target) return 'pending'
        const cur = (getVar('orgasm_count') ?? 0) + 1
        setVar('orgasm_count', cur)
        return cur >= params.count ? 'done' : 'pending'
      `)
      installCustomQuest({
        type: 'custom', event: 'h:orgasm', script: 'orgasm_counter.js',
        params: { target: '李秋水', count: 5 }, fail_event: 'h:end', on_fail: 'final',
      })
      await apiSystem.call('quest', 'start', 'custom_obj_quest')
      await eventBus.emit('h:orgasm', { character: '李秋水', partId: 1, level: 2, count: 1 })
      await eventBus.emit('h:end', { ally: 'player' })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'custom_obj_quest')).toBe('completed')
    })

    it('objective 引用不存在的脚本 → 上报 warning 且任务保持 active（不误推进）', async () => {
      installCustomQuest({ type: 'custom', event: 'h:orgasm', script: 'no_such_script.js' })
      await apiSystem.call('quest', 'start', 'custom_obj_quest')
      await eventBus.emit('h:orgasm', { character: '李秋水', partId: 1, level: 2, count: 1 })
      const warn = errorReporter.getErrors().find(
        e => e.severity === 'warning' && e.source === 'quest-system' && e.message.includes('no_such_script.js'),
      )
      expect(warn).toBeDefined()
      expect(await apiSystem.call('quest', 'getSceneStatus', 'custom_obj_quest')).toBe('active')
    })
  })

  // ═══════ C5：任务内嵌对话树（quest-script C' 模型 Task 5）═══════
  // 测试数据：mods/test-mod/quests/main/embed_quest.toml（真实 loadMod 解析链路——
  // [[dialogues]] 在解析时注册进 mod.conversations.scene，与运行时数据流一致）
  describe('内嵌对话（C5）', () => {
    it('scene: 引用解析到任务内嵌对话树（loadMod 真实解析链路）', () => {
      const mod = modLoader.getMod()!
      // 数据存在性：embed_quest 的内嵌对话已注册进 conversations.scene
      expect(mod.conversations.scene.get('embed_quest')?.has('seduce')).toBe(true)
      // 任务数据引用解析：dialogue 步骤用 scene: 简写
      const quest = mod.quests.get('embed_quest')!
      const step = quest.steps[0]
      expect(step.conversation).toBe('scene:embed_quest/seduce')
      const ref = parseConversationRef(step.conversation as string)
      expect(ref.type).toBe('scene')
      expect(ref.scene).toBe('embed_quest')
      expect(ref.name).toBe('seduce')
      // resolveConversation 解析到内嵌对话（nodes 数据来自真实 TOML 文件）
      const conv = resolveConversation(mod.conversations, ref)
      expect(conv).toBeDefined()
      expect(conv!.nodes.length).toBe(2)
    })

    it('dialogue 步骤执行内嵌对话（startConversation 可用）', async () => {
      await apiSystem.call('quest', 'start', 'embed_quest')
      expect(await apiSystem.call('quest', 'getSceneStatus', 'embed_quest')).toBe('completed')
      // 内嵌对话真的被渲染（startConversation 解析到 scene 对话而非回退 global 报"对话不存在"）
      expect(narrativeLog.getEntries().some(e => e.text === '李秋水道：夜深了。')).toBe(true)
    })
  })

  // ═══════ C6：triggers 触发声明（quest-script C' 模型 Task 6）═══════
  describe('triggers 触发声明（C6）', () => {
    function installTriggerQuest(triggers: any[], steps?: any[]) {
      const mod = modLoader.getMod()!
      mod.quests.set('trigger_quest', {
        id: 'trigger_quest', title: '触发测试', type: 'event', display: 'hidden',
        triggers,
        // 注释（偏离 brief 原文）：brief 默认 steps 的 next='not_exist' 会在启动时立即
        // 完成 scene（advanceToStep 找不到 → completeScene）——状态断言 active 无法成立。
        // 改为无 next 的挂起 reward 步骤：启动后保持 active（executeStep 只推进有 next 的步骤）
        steps: steps ?? [
          { id: 's1', type: 'reward', effects: [{ type: 'narrative_output', params: { text: '剧情开始' } }] },
        ],
      })
    }

    beforeAll(() => {
      // 注释：条件 selected.id == '李秋水' 依赖角色实体存在（selected 根路径走 getEntity 解析）
      entitySystem.register('character', '李秋水', { id: '李秋水', name: '李秋水', base: {} })
    })

    beforeEach(() => {
      // 注释：外层 afterEach 的 gameContext.reset() 清掉了 player——重建（execute 收尾的
      // 天赋习得检查/结算路径需要玩家实体存在）
      gameContext.setPlayer('player')
      // 注释：C6 用例间清选中（gameContext.reset() 不清 selectedCharacterId）
      gameContext.setSelectedCharacterId(null)
    })

    afterEach(() => {
      const mod = modLoader.getMod()!
      mod.quests.delete('trigger_quest')
      mod.quests.delete('trigger_quest_2')
      // 注释：清空 activeScenes（provider restore 空数据 = 运行时清空）——C6 场景无 next
      // 挂起在 activeScenes，不清会跨用例残留（用例 2 断言 not_started 会误判为 active）
      getGameStateProviders().find(p => p.id === 'quest-system')?.restore({ activeScenes: [], sceneStack: [] })
      gameContext.setSelectedCharacterId(null)
      gameContext.reset()
    })

    it('command 触发：条件满足 → 拦截执行场景（指令自身 effects 不执行）', async () => {
      installTriggerQuest([{ type: 'command', command: 'test_spar', condition: "selected.id == '李秋水'" }])
      let cmdRan = false
      commandRegistry.register({
        id: 'test_spar', label: '切磋', group: 'character_commands', modes: ['exploration'],
        effects: [{ type: 'narrative_output', params: { text: '默认切磋' } }],
        handler: async () => { cmdRan = true },
      } as any)
      gameContext.setSelectedCharacterId('李秋水')
      await apiSystem.call('quest', 'reindexTriggers')
      await commandExecutor.execute('test_spar', { gameStore: { player: { id: 'player' } } } as any)
      expect(cmdRan).toBe(false)
      expect(await apiSystem.call('quest', 'getSceneStatus', 'trigger_quest')).toBe('active')
      commandRegistry.unregister('test_spar')
    })

    it('command 触发：条件不满足 → 走指令默认行为', async () => {
      installTriggerQuest([{ type: 'command', command: 'test_spar', condition: "selected.id == '李秋水'" }])
      let cmdRan = false
      commandRegistry.register({
        id: 'test_spar', label: '切磋', group: 'character_commands', modes: ['exploration'],
        handler: async () => { cmdRan = true },
      } as any)
      gameContext.setSelectedCharacterId('其他角色')
      await apiSystem.call('quest', 'reindexTriggers')
      await commandExecutor.execute('test_spar', { gameStore: { player: { id: 'player' } } } as any)
      expect(cmdRan).toBe(true)
      expect(await apiSystem.call('quest', 'getSceneStatus', 'trigger_quest')).toBe('not_started')
      commandRegistry.unregister('test_spar')
    })

    it('dialogue_end 触发：与指定角色对话结束时启动场景', async () => {
      installTriggerQuest([{ type: 'dialogue_end', character: '李秋水' }])
      // 注释（偏离 brief 原文）：brief 未在此用例调 reindexTriggers——但 buildTriggerIndex
      // 只在 onEnable/game:load/reindexTriggers 时执行，用例内新装的任务必须显式重建索引
      await apiSystem.call('quest', 'reindexTriggers')
      await eventBus.emit('dialogue:end', { character: '李秋水' })
      expect(await apiSystem.call('quest', 'getSceneStatus', 'trigger_quest')).toBe('active')
    })

    it('同一 command 多个 hook 条件同时满足 → 报错 + 不拦截', async () => {
      const mod = modLoader.getMod()!
      installTriggerQuest([{ type: 'command', command: 'test_spar', condition: "selected.id == '李秋水'" }])
      mod.quests.set('trigger_quest_2', {
        id: 'trigger_quest_2', title: '触发测试2', type: 'event', display: 'hidden',
        triggers: [{ type: 'command', command: 'test_spar', condition: "selected.id == '李秋水'" }],
        steps: [{ id: 's1', type: 'reward', effects: [] }],
      })
      let cmdRan = false
      commandRegistry.register({
        id: 'test_spar', label: '切磋', group: 'character_commands', modes: ['exploration'],
        handler: async () => { cmdRan = true },
      } as any)
      gameContext.setSelectedCharacterId('李秋水')
      errorReporter.clear()
      await apiSystem.call('quest', 'reindexTriggers')
      await commandExecutor.execute('test_spar', { gameStore: { player: { id: 'player' } } } as any)
      expect(cmdRan).toBe(true) // 冲突 → 不拦截，走默认
      expect(errorReporter.getErrors().some(e => e.message.includes('trigger_quest'))).toBe(true)
      commandRegistry.unregister('test_spar')
    })
  })
})
