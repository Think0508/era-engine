// 注释：boot 冒烟测试——镜像 main.ts 的启动步骤（loadMod → bindings → condition → 插件全量加载）
// 目的：抓"单元测试各自通过但整体跑不通"的运行时断裂（插件 onEnable 抛错/指令注册冲突/校验误报）

import { describe, it, expect, beforeAll } from 'vitest'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { entitySystem } from '../core/entity-system'
import { eventBus } from '../core/event-bus'
import { apiSystem } from '../core/api'
import { commandRegistry } from '../core/command-registry'
import { bindingResolver } from '../core/binding-resolver'
import { conditionRegistry } from '../core/condition-registry'
import { errorReporter } from '../core/error-reporter'
import { PluginManager, warnMissingPluginTomls } from '../core/plugin-manager'
import { SlotRegistry } from '../ui/slots/slot-registry'
import { conditionEngine } from '../core/condition-engine'

describe('引擎 boot 冒烟测试（全插件加载）', () => {
  beforeAll(async () => {
    // 注释：1. 清空全局状态（测试隔离）
    entitySystem.clear()
    commandRegistry.clear()
    errorReporter.clear()
    conditionEngine.clear()

    // 注释：2. 加载 mod（与 main.ts 一致——loadMod 内部已注册 characters + locations）
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (!mod) throw new Error('模组加载失败')
    bindingResolver.loadBindings(mod.bindings)
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    conditionRegistry.registerFromBindings(mod.bindings)

    // 注释：3. 设置玩家与起始地点
    gameContext.setPlayer('player')
    const startLoc = entitySystem.get('location', 'town_square') as any
    if (startLoc) gameContext.setLocation(startLoc)

    // 注释：4. 全量加载插件（与 main.ts 一致）
    warnMissingPluginTomls()
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

  it('无插件被禁用（onLoad/onEnable 无抛错）', () => {
    // 注释：contract_demo 的 params 是分层教学展示（ADR-0007 L2 警告，预期内）——排除后应为 0
    const unexpected = errorReporter.getErrors().filter(e => !e.message.includes('daily_reset'))
    expect(unexpected.length).toBe(0)
  })

  it('依赖插件的指令全部注册（插件 onEnable 实际执行成功）', () => {
    // 注释：插件 onEnable 失败只会 console.warn（不进 errorReporter），
    // 用各插件注册的指令存在性做强断言
    expect(commandRegistry.getById('move')).toBeDefined()      // map-system
    expect(commandRegistry.getById('talk')).toBeDefined()       // dialogue-system
    expect(commandRegistry.getById('do_h')).toBeDefined()       // h-core
    expect(commandRegistry.getById('end_h')).toBeDefined()      // h-core
  })

  it('指令加载器注册 test-mod 指令（rest/wait/test_judge_cmd）', () => {
    expect(commandRegistry.getById('rest')).toBeDefined()
    expect(commandRegistry.getById('wait')).toBeDefined()
    expect(commandRegistry.getById('test_judge_cmd')).toBeDefined()
    // 无 h_ 前缀残留
    expect(commandRegistry.getById('h_rest')).toBeUndefined()
  })

  it('物品迁移（Task 4）：h-core 默认层 H 物品加载，武侠失误物品已删', () => {
    // 注释：loadMod 生产路径（pluginDefaultModules 并入 rawTomlMap）——验证真实磁盘文件
    // Object.keys + toContain 断言（避免 ['中文'] 索引被扫描器当属性引用，见 example-mod-integration）
    const mod = modLoader.getMod()!
    const itemIds = Object.keys(mod.items)
    // h-core 默认层（src/plugins/h-core/data/default/items/）——药物/玩具/避孕套
    expect(itemIds).toContain('媚药')
    expect(itemIds).toContain('润滑液')
    expect(itemIds).toContain('安眠药')
    expect(itemIds).toContain('避孕套')
    expect(itemIds).toContain('口球')
    // mod 层保留：服装 + 绳子 + 测试消耗品（回血丹补 healing_potion 缺口）
    expect(itemIds).toContain('布衣')
    expect(itemIds).toContain('绳子')
    expect(itemIds).toContain('回血丹')
    // 删除的 4 个武侠失误物品
    expect(itemIds).not.toContain('healing_potion')
    expect(itemIds).not.toContain('iron_sword')
    expect(itemIds).not.toContain('leather_armor')
    expect(itemIds).not.toContain('herb')
  })

  it('h-core 原生指令注册（do_h/end_h）', () => {
    expect(commandRegistry.getById('do_h')).toBeDefined()
    expect(commandRegistry.getById('end_h')).toBeDefined()
  })

  it('validateInstructionData（game:plugins_loaded 触发）无误报', () => {
    // 注释：h-core 监听 game:plugins_loaded → 校验指令 condition/premises/调整表
    // 无 error 即 test-mod 数据全部通过校验（premises 已注册、condition 字段合法）
    const errors = errorReporter.getErrors()
    const instructionErrors = errors.filter(e => e.message.includes('未注册字段') || e.message.includes('未注册前提'))
    expect(instructionErrors.length).toBe(0)
  })

  it('h-config [judge.adjustments] 修正条件通过校验', () => {
    const errors = errorReporter.getErrors()
    expect(errors.some(e => e.message.includes('修正条件引用了未注册字段'))).toBe(false)
  })

  it('条件引擎在 boot 状态可求值（selected/别名/根路径）', () => {
    // 无选中 → selected != null 为 false
    expect(conditionEngine.evaluate('selected != null', gameContext.getContext())).toBe(false)
    // location 根路径
    expect(conditionEngine.evaluate('location.id == "town_square"', gameContext.getContext())).toBe(true)
    // status 别名（fieldAliases 由 status-system 注册）——角色无状态 → false 不抛
    expect(conditionEngine.evaluate('character.player.status.醉意 == true', gameContext.getContext())).toBe(false)
    // target 根路径（judge adjustments）不抛
    expect(conditionEngine.evaluate('target.first_times.virgin_V != true', gameContext.getContext())).toBe(true)
  })

  it('B1：战斗指令条件 game.mode == "combat" 在战斗模式下可满足（攻击/逃跑不锁死）', async () => {
    // 探索模式：条件不满足
    expect(conditionEngine.evaluate("game.mode == 'combat'", gameContext.getContext())).toBe(false)
    // 进入战斗模式 → 条件满足（combat-base 攻击/逃跑指令依赖此门控）
    await gameContext.enterMode('combat')
    expect(conditionEngine.evaluate("game.mode == 'combat'", gameContext.getContext())).toBe(true)
    expect(conditionEngine.evaluate("game.mode != 'combat'", gameContext.getContext())).toBe(false)
    // 攻击/逃跑指令注册且条件改为 game.mode（不再引用已删除的 combat.in_progress）
    const attack = commandRegistry.getById('combat_attack')
    expect(attack).toBeDefined()
    expect(attack!.condition).toBe("game.mode == 'combat'")
    const flee = commandRegistry.getById('combat_flee')
    expect(flee).toBeDefined()
    await gameContext.exitMode()
  })
})
