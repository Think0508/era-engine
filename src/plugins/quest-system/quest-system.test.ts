// 注释：quest-system 战斗步骤测试（B3 修复——audit-c I3）
// 原实现 allies 传空数组（玩家不在参战者）+ 不监听 combat:end → combat 步骤永不推进
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { modLoader } from '../../core/mod-loader'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { eventBus } from '../../core/event-bus'
import { bindingResolver } from '../../core/binding-resolver'
import { gameContext } from '../../core/game-context'
import { PluginManager } from '../../core/plugin-manager'
import { SlotRegistry } from '../../ui/slots/slot-registry'
import { commandRegistry } from '../../core/command-registry'
import { errorReporter } from '../../core/error-reporter'
import type { Quest } from '../../core/mod-loader'
import { parseConversationRef, resolveConversation } from '../../core/mod-loader'

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
})
