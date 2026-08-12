// 注释：无意识/隐奸经验数字键测试（B9 修复——audit-b I8）
// erArk 经验按数值 ID 存储（erark-attr-ledger）：隐奸经验=35、时姦经验=124、
// 被时姦经验=125、催眠姦经验=126、被催眠姦经验=127——能力升级表（ability-upgrades.toml
// needs 引用 experience 35 等）按数字键读取，字符串键写入无消费方 → 经验永不能驱动升级
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
import { applyHypnosisSexExp } from './h-hypnosis'

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

describe('无意识/隐奸经验数字键（B9）', () => {
  beforeAll(async () => {
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()!
    bindingResolver.loadBindings(mod.bindings)
    await bootPlugins()
    gameContext.setPlayer('player')
  })

  it('时姦：冻结 H 目标得被时姦经验[125]，玩家得时姦经验[124]', async () => {
    // 开启时停（全部角色 unconscious_h=3）
    await apiSystem.call('effect-system', 'execute', [{ type: 'time_stop_on' }], {})
    const npc = entitySystem.get('character', 'test_girl') as any
    npc.h_state = { is_h: true }
    npc.sp_flag = npc.sp_flag ?? {}
    npc.sp_flag.unconscious_h = 3
    await eventBus.emit('game:execution_end', { timeCost: 10 })
    expect(npc.experience?.['125']).toBe(1)
    expect(npc.experience?.['time_stop_rape']).toBeUndefined()
    const player = entitySystem.get('character', 'player') as any
    expect(player.experience?.['124']).toBe(1)
    // 关闭时停（清理全局状态）
    await apiSystem.call('effect-system', 'execute', [{ type: 'time_stop_off' }], {})
  })

  it('隐奸：玩家与目标得隐奸经验[35]（erArk settle_behavior.py:683-699 双方）', async () => {
    await gameContext.enterMode('h_scene')
    const player = entitySystem.get('character', 'player') as any
    player.sp_flag = player.sp_flag ?? {}
    player.sp_flag.hidden_sex_mode = 2
    player.sp_flag.target_character_id = 'test_girl'
    player.behavior = { behavior_id: 'H_SEX', tags: ['性爱'] }
    const target = entitySystem.get('character', 'test_girl') as any
    target.experience = {}
    player.experience = {}
    await eventBus.emit('game:execution_end', { timeCost: 10 })
    expect(player.experience['35']).toBe(1)
    expect(player.experience['hidden_sex']).toBeUndefined()
    expect(target.experience['35']).toBe(1)
    await gameContext.exitMode()
  })

  it('催眠姦：被催眠目标得被催眠姦经验[127]，玩家得催眠姦经验[126]', () => {
    const target = entitySystem.get('character', 'test_girl') as any
    target.sp_flag = target.sp_flag ?? {}
    target.sp_flag.unconscious_h = 5
    target.experience = {}
    const player = entitySystem.get('character', 'player') as any
    player.experience = {}
    applyHypnosisSexExp('test_girl')
    expect(target.experience['127']).toBe(1)
    expect(target.h_exp).toBeUndefined()
    expect(player.experience['126']).toBe(1)
  })
})
