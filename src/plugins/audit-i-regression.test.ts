// 注释：audit-i 修复回归测试（2026-08-12）——combat 重复 start 守卫 + spawn 跨 loadMod 残留
import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { entitySystem } from '../core/entity-system'
import { apiSystem } from '../core/api'
import { eventBus } from '../core/event-bus'
import { bindingResolver } from '../core/binding-resolver'
import { gameContext } from '../core/game-context'
import { PluginManager } from '../core/plugin-manager'
import { SlotRegistry } from '../ui/slots/slot-registry'
import { commandRegistry } from '../core/command-registry'
import { errorReporter } from '../core/error-reporter'

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

describe('audit-i 回归：combat 守卫 + spawn 残留', () => {
  beforeAll(async () => {
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
    gameContext.setPlayer('player')
    const player = entitySystem.get('character', 'player') as any
    if (player) player.base = { ...(player.base ?? {}), hp: 100, attack: 10, defense: 0, speed: 10 }
    entitySystem.register('character', 'enemy_a', { id: 'enemy_a', name: '敌A', base: { hp: 30, attack: 5, defense: 0, speed: 5 } })
    entitySystem.register('character', 'enemy_b', { id: 'enemy_b', name: '敌B', base: { hp: 30, attack: 5, defense: 0, speed: 5 } })
  })

  it('combat 重复 start：先正常结束旧战斗（combat:end 发出 + 模式栈不双 push）', async () => {
    await apiSystem.call('combat', 'start', ['enemy_a'], ['player'])
    expect(gameContext.getCurrentMode()).toBe('combat')

    // 监听 combat:end——重复 start 必须先结束旧战斗
    let endCount = 0
    const h = () => { endCount++ }
    eventBus.on('combat:end', h)

    await apiSystem.call('combat', 'start', ['enemy_b'], ['player'])
    expect(endCount).toBe(1) // 旧战斗被结束

    eventBus.off('combat:end', h)
    // 模式栈不残留（重复 push 会 2 层 combat）
    expect(gameContext.getCurrentMode()).toBe('combat')
    await apiSystem.call('combat', 'end', 'allies', 'win')
    expect(gameContext.getCurrentMode()).toBe('exploration')
  })

  it('spawn processedIds 跨 loadMod 清理：新 mod 的 pending 不因残留而跳过', async () => {
    // 第一次：激活一个 pending（条件满足）——mod 已由 beforeAll 加载
    const { processPendingSpawns, resetPendingSpawns } = await import('../core/spawn-system')
    resetPendingSpawns()
    const mod1 = modLoader.getMod() as any
    mod1.pendingSpawns = [{ id: 'spawn_x', condition: 'true', data: { id: 'spawn_x', name: 'X' } }]
    processPendingSpawns()
    expect(entitySystem.get('character', 'spawn_x')).not.toBeNull()
    entitySystem.clear()

    // 模拟新 mod 加载（loadMod 清 processedIds——audit-i 修复）
    await modLoader.loadMod('test-mod')
    const mod2 = modLoader.getMod() as any
    mod2.pendingSpawns = [{ id: 'spawn_x', condition: 'true', data: { id: 'spawn_x', name: 'X' } }]
    processPendingSpawns()
    // 修复前：processedIds 残留 → spawn_x 永不激活（静默）
    expect(entitySystem.get('character', 'spawn_x')).not.toBeNull()
  })
})
