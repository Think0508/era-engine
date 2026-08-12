// 注释：标准角色契约校验测试（spec §10.1 Step 6）
// 覆盖：① 裸字段 warning（mod-loader 通用校验）② 缺必需 warning（插件注册校验器）
// ③ 存档补齐（fillMissingAttributes + restoreFromSave 接线）④ 测试基座一致性
// ⑤ 扫描脚本自测（scan-attr-refs / scan-erark-defs 退出码 + 报告内容）
import { conditionEngine } from '../core/condition-engine'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { parseModData, fillMissingAttributes, finalizeCharacterData, type LoadedMod } from './mod-loader'
import { entitySystem } from './entity-system'
import { errorReporter } from './error-reporter'
import {
  registerCharacterValidator, clearCharacterValidators, getCharacterValidators,
} from './character-contract'
import { restoreFromSave } from './save-system'
import { resetCharacterEntity, DEFAULT_NPC_BASE, DEFAULT_PLAYER_BASE } from '../utils/test-helpers'
import { parse as parseTOML } from '@iarna/toml'
import {
  CONTRACT_REQUIRED_BASE, CONTRACT_REQUIRED_PARAMS,
  CONTRACT_REQUIRED_MARKS, CONTRACT_REQUIRED_ABILITIES,
} from '../plugins/h-core/index'

const ROOT = process.cwd()

const rawTestModMap = import.meta.glob('/mods/test-mod/**/*.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// ── 最小模组数据（内联构造，避免依赖 test-mod 全量文件）──
function makeMinimalMod(rosterBody: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    '/mods/test-mod/meta.toml': `
[meta]
id = "test-mod"
name = "测试模组"
version = "1.0.0"
`,
    '/mods/test-mod/definitions/attributes.toml': `
[attributes]
"体力" = { type = "number", default = 100, category = "base" }
"好感度" = { type = "number", default = 30, category = "social" }
"皮肤" = { type = "number", default = 0, category = "parameter" }
"技巧" = { type = "number", default = 0, category = "ability" }
`,
    '/mods/test-mod/definitions/talents.toml': `
[talents]
[talents."剑骨"]
name = "剑骨"
max = 1
`,
    '/mods/test-mod/definitions/abilities.toml': `
[abilities]
[abilities."华山剑法"]
name = "华山剑法"
type = "active"
max_level = 10
tags = ["combat_active"]
`,
    '/mods/test-mod/characters/roster.toml': rosterBody,
    ...extra,
  }
}

const GOOD_ROSTER = `
[[roster]]
id = "npc_a"
name = "甲"
base = { "体力" = 100, "好感度" = 50 }
talents = { "剑骨" = 1 }
`

describe('character-contract（mod-loader 校验）', () => {
  beforeEach(() => {
    errorReporter.clear()
    clearCharacterValidators()
  })
  afterEach(() => clearCharacterValidators())

  it('裸字段 → warning（未定义属性键），已定义键不误报', () => {
    const map = makeMinimalMod(`
[[roster]]
id = "npc_a"
name = "甲"
base = { "体力" = 100, "好感度" = 50, "魅力" = 99 }
talents = { "剑骨" = 1 }
`)
    parseModData('test-mod', map)
    const warnings = errorReporter.getErrors().filter(e => e.severity === 'warning')
    const bare = warnings.find(w => w.message.includes('魅力'))
    expect(bare).toBeDefined()
    expect(bare!.suggestion).toContain('attributes.toml')
    // 已定义键不误报
    expect(warnings.some(w => w.message.includes("'体力'") && w.message.includes('未定义'))).toBe(false)
    expect(warnings.some(w => w.message.includes("'好感度'"))).toBe(false)
  })

  it('裸字段（abilities 命名空间）→ warning', () => {
    const map = makeMinimalMod(`
[[roster]]
id = "npc_a"
name = "甲"
base = { "体力" = 100 }
abilities = { "降龙十八掌" = 3 }
`)
    parseModData('test-mod', map)
    const bare = errorReporter.getErrors().find(w => w.message.includes('降龙十八掌'))
    expect(bare).toBeDefined()
    expect(bare!.message).toContain('abilities')
  })

  it('marks 归一化：角色数据写 marks → abilities.level 生效（abilities 优先，ADR-0007）', () => {
    // 2026-08-09：刻印 canonical 存储 = abilities；角色数据写 marks（值>0）在 finalize 时拷贝进
    // abilities.{名}.level——mod 作者按「刻印」直觉写法也生效；两者都写则 abilities 优先
    const map = makeMinimalMod(`
[[roster]]
id = "npc_m1"
name = "甲"
marks = { "快乐刻印" = 2 }
[[roster]]
id = "npc_m2"
name = "乙"
abilities = { "快乐刻印" = 3 }
marks = { "快乐刻印" = 1 }
[[roster]]
id = "npc_m3"
name = "丙"
marks = { "快乐刻印" = 0 }
`, {
      '/mods/test-mod/definitions/attributes.toml': `
[attributes]
"体力" = { type = "number", default = 100, category = "base" }
"快乐刻印" = { type = "number", default = 0, category = "mark" }
`,
      '/mods/test-mod/definitions/abilities.toml': `
[abilities]
[abilities."快乐刻印"]
name = "快乐刻印"
type = "passive"
max_level = 5
`,
    })
    const mod = parseModData('test-mod', map) as LoadedMod
    const chars = mod.entities.get('character') as Map<string, any>
    // 写 marks → abilities.level 生效
    expect(chars.get('npc_m1')!.abilities['快乐刻印']).toEqual({ level: 2, xp: 0 })
    // 两者都写 → abilities 优先（marks 只补缺）
    expect(chars.get('npc_m2')!.abilities['快乐刻印']).toEqual({ level: 3, xp: 0 })
    // 值 0 不拷贝（保持默认 level 0）
    expect(chars.get('npc_m3')!.abilities['快乐刻印']).toEqual({ level: 0, xp: 0 })
    // marks 镜像保留原值（死存储不动，读取方全走 abilities）
    expect(chars.get('npc_m1')!.marks['快乐刻印']).toBe(2)
    // 全程无裸字段误报（finalize 随机补的 愤怒 未定义属既有行为，排除）
    const bare = errorReporter.getErrors().filter(e => e.message.includes('未定义') && !e.message.includes('愤怒'))
    expect(bare).toHaveLength(0)
  })

  it('真实 test-mod：contract_demo 的 marks 归一化到 abilities（快乐刻印 = 1）', async () => {
    const { modLoader } = await import('./mod-loader')
    entitySystem.clear()
    await modLoader.loadMod('test-mod')
    const demo = entitySystem.get('character', 'contract_demo') as any
    expect(demo.abilities['快乐刻印']).toEqual({ level: 1, xp: 0 })
  })

  it('字段分层 L3：引擎独占字段 → warning（写入无效，ADR-0007）', () => {
    const map = makeMinimalMod(`
[[roster]]
id = "npc_l3"
name = "甲"
base = { "体力" = 100 }
h_state = { turn_count = 3 }
body_items = { 2 = "vib" }
`)
    parseModData('test-mod', map)
    const warnings = errorReporter.getErrors().filter(e => e.severity === 'warning')
    expect(warnings.some(w => w.message.includes('h_state') && w.message.includes('引擎独占'))).toBe(true)
    expect(warnings.some(w => w.message.includes('body_items') && w.message.includes('引擎独占'))).toBe(true)
  })

  it('字段分层 L2：非平凡字段 → warning（sp_flag / params / 未知顶层键）', () => {
    const map = makeMinimalMod(`
[[roster]]
id = "npc_l2"
name = "甲"
base = { "体力" = 100 }
sp_flag = { hidden_sex_mode = 1 }
params = { "皮肤" = 5 }
unknown_ns = { x = 1 }
`)
    parseModData('test-mod', map)
    const warnings = errorReporter.getErrors().filter(e => e.severity === 'warning')
    expect(warnings.some(w => w.message.includes('sp_flag') && w.message.includes('非平凡'))).toBe(true)
    expect(warnings.some(w => w.message.includes('params') && w.message.includes('daily_reset'))).toBe(true)
    expect(warnings.some(w => w.message.includes('unknown_ns') && w.message.includes('未知顶层字段'))).toBe(true)
  })

  it('字段分层 L1：合法字段不误报（全命名空间写一遍）', () => {
    const map = makeMinimalMod(`
[[roster]]
id = "npc_l1"
name = "甲"
base = { "体力" = 100 }
marks = { "快乐刻印" = 1 }
experience = { 80 = 5 }
status_effects = [{ id = "醉意", remaining_duration = 60 }]
relations = { player = { "好感度" = 30 } }
behavior = { activity = 0.5, home_locations = { town = 1.0 } }
equipment = { upper = "布衣" }
current_location = "town"
dead = false
first_times = { virgin_V = true }
pregnancy = { daysPregnant = 5 }
talents = { "剑骨" = 1 }
abilities = { "华山剑法" = 3 }
`)
    parseModData('test-mod', map)
    const layerWarnings = errorReporter.getErrors().filter(
      e => e.message.includes('引擎独占') || e.message.includes('非平凡') || e.message.includes('未知顶层字段'),
    )
    expect(layerWarnings).toHaveLength(0)
  })

  it('未定义状态效果/关系类型 → warning', () => {
    const map = makeMinimalMod(`
[[roster]]
id = "npc_a"
name = "甲"
base = { "体力" = 100 }
status_effects = [{ id = "中毒", remaining_duration = 60 }]
relations = { player = { "好感度" = 30 } }
`)
    parseModData('test-mod', map)
    const msgs = errorReporter.getErrors().map(e => e.message).join('\n')
    expect(msgs).toContain('未定义的状态效果')
    expect(msgs).toContain('未定义的关系类型')
  })

  it('插件注册的必需集校验器：缺必需属性 → warning（不阻止加载）', () => {
    let validated = 0
    registerCharacterValidator({
      id: 'test-required',
      validate: (charId, char, _mod) => {
        validated++
        const base = (char as any).base ?? {}
        if (base['体力'] === undefined) {
          errorReporter.report({
            source: 'character-contract:test-required',
            severity: 'warning',
            message: `角色 '${charId}' 缺必需属性 '体力'`,
          })
        }
      },
    })
    const map = makeMinimalMod(`
[[roster]]
id = "npc_a"
name = "甲"
base = { "好感度" = 50 }
`)
    const mod = parseModData('test-mod', map)
    expect(validated).toBeGreaterThan(0)
    // 注意：缺 体力 时 applyAttributeDefaults 已按默认补上 → 校验器不再报缺
    // （这验证了"加载时默认补齐"路径：char.base.体力 存在）
    expect((mod.entities.get('character')!.get('npc_a') as any).base['体力']).toBe(100)
    expect(errorReporter.getErrors().some(e => e.message.includes('缺必需属性'))).toBe(false)
  })

  it('校验器自身异常不拖垮加载（warning 化）', () => {
    registerCharacterValidator({
      id: 'test-crash',
      validate: () => { throw new Error('validator boom') },
    })
    const mod = parseModData('test-mod', makeMinimalMod(GOOD_ROSTER))
    expect(mod.entities.get('character')!.size).toBe(1)
    expect(errorReporter.getErrors().some(e => e.message.includes('validator boom'))).toBe(true)
  })

  it('校验器重复注册 → 后者覆盖', () => {
    registerCharacterValidator({ id: 'dup', validate: () => {} })
    registerCharacterValidator({ id: 'dup', validate: () => {} })
    expect(getCharacterValidators().filter(v => v.id === 'dup')).toHaveLength(1)
  })
})

describe('character-contract（存档补齐）', () => {
  beforeEach(() => {
    entitySystem.clear()
    errorReporter.clear()
  })

  it('fillMissingAttributes：缺属性/能力 → attributes default 补齐 + warning', () => {
    const attrs: LoadedMod['attributes'] = {
      '体力': { type: 'number', default: 100, category: 'base' },
      '好感度': { type: 'number', default: 30, category: 'social' },
      '皮肤': { type: 'number', default: 0, category: 'parameter' },
      '技巧': { type: 'number', default: 0, category: 'ability' },
    }
    const char: any = { id: 'old_save', base: { '体力': 50 } }
    fillMissingAttributes(char, attrs, '读档 test')
    expect(char.base['体力']).toBe(50)   // 已有值不动
    expect(char.social['好感度']).toBe(30) // 补齐默认（social 命名空间 = applyAttributeDefaults 语义）
    expect(char.params['皮肤']).toBe(0)
    expect(char.abilities['技巧']).toEqual({ level: 0, xp: 0 })
    const warnings = errorReporter.getErrors().filter(e => e.severity === 'warning')
    expect(warnings.some(w => w.message.includes("缺属性 '好感度'"))).toBe(true)
    expect(warnings.some(w => w.message.includes("缺属性 '技巧'"))).toBe(true)
  })

  it('fillMissingAttributes：契约前存档（base 写法）不重复补', () => {
    const attrs: LoadedMod['attributes'] = {
      '好感度': { type: 'number', default: 30, category: 'social' },
      '皮肤': { type: 'number', default: 0, category: 'parameter' },
    }
    const char: any = { id: 'old_save2', base: { '好感度': 55, '皮肤': 10 } }
    fillMissingAttributes(char, attrs, '读档 test')
    // 全命名空间查重：base 已有 → 不补 social/params 副本
    expect(char.social).toBeUndefined()
    expect(char.params).toBeUndefined()
    expect(char.base['好感度']).toBe(55)
    expect(char.base['皮肤']).toBe(10)
    expect(errorReporter.getErrors().filter(e => e.severity === 'warning')).toHaveLength(0)
  })

  it('fillMissingAttributes：契约后存档（canonical 命名空间 social）不覆盖不警告', () => {
    // 2026-08-09 第4轮审查抓到的真 bug：hasAnywhere 漏查 social/economy/combat →
    // 契约后存档（好感度在 entity.social）读档被默认值 30 覆盖（玩家真实值丢失）+ 虚假 warning
    const attrs: LoadedMod['attributes'] = {
      '好感度': { type: 'number', default: 30, category: 'social' },
      '体力': { type: 'number', default: 100, category: 'base' },
      '皮肤': { type: 'number', default: 0, category: 'parameter' },
    }
    const char: any = { id: 'post_contract', social: { '好感度': 88 }, base: { '体力': 50 }, params: { '皮肤': 12 } }
    fillMissingAttributes(char, attrs, '读档 test')
    expect(char.social['好感度']).toBe(88) // 玩家真实值保留
    expect(char.base['体力']).toBe(50)
    expect(char.params['皮肤']).toBe(12)
    expect(errorReporter.getErrors().filter(e => e.severity === 'warning')).toHaveLength(0)
  })

  it('restoreFromSave 接线：无 mod 时不补齐也不报错（既有行为保持）', async () => {
    const data = {
      modId: 'test', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [{ id: 'player', name: '玩家', base: { hp: 100 } }],
      gameState: {}, uiState: { foldStates: {} },
    }
    await restoreFromSave(data as any)
    expect(entitySystem.get('character', 'player')?.name).toBe('玩家')
  })
})

describe('character-contract（测试基座一致性）', () => {
  it('DEFAULT_NPC_BASE / DEFAULT_PLAYER_BASE 全部键 ⊆ attributes.toml 定义', () => {
    // 从 h-core 默认 + test-mod 定义合并（与 mod-loader 加载语义一致）
    const mergeAttrs = (paths: string[]): Set<string> => {
      const keys = new Set<string>()
      for (const p of paths) {
        const abs = path.resolve(ROOT, p)
        const data = parseTOML(require('node:fs').readFileSync(abs, 'utf8'))
        for (const k of Object.keys((data as any).attributes ?? {})) keys.add(k)
      }
      return keys
    }
    const defined = mergeAttrs([
      'src/plugins/h-core/data/default/attributes.toml',
      'src/plugins/combat-wuxia/data/default/attributes.toml',
      'src/plugins/h-time-stop/data/default/attributes.toml',
      'mods/test-mod/definitions/attributes.toml',
    ])
    for (const k of Object.keys(DEFAULT_NPC_BASE)) {
      expect(defined.has(k), `DEFAULT_NPC_BASE 裸字段 '${k}'（attributes.toml 未定义）`).toBe(true)
    }
    for (const k of Object.keys(DEFAULT_PLAYER_BASE)) {
      expect(defined.has(k), `DEFAULT_PLAYER_BASE 裸字段 '${k}'（attributes.toml 未定义）`).toBe(true)
    }
  })

  it('h-core 最小必需集校验器常量 ⊆ attributes.toml 定义（防"校验器引用未定义属性"）', () => {
    const readAttrs = (rel: string): Set<string> => {
      const data = parseTOML(require('node:fs').readFileSync(path.resolve(ROOT, rel), 'utf8'))
      return new Set(Object.keys((data as any).attributes ?? {}))
    }
    // h-core 默认层独立覆盖必需集（不依赖 test-mod 的旧定义）
    const hcore = readAttrs('src/plugins/h-core/data/default/attributes.toml')
    for (const k of CONTRACT_REQUIRED_BASE) {
      expect(hcore.has(k), `必需集 base '${k}' 未在 h-core attributes.toml 定义`).toBe(true)
    }
    for (const k of CONTRACT_REQUIRED_PARAMS) {
      expect(hcore.has(k), `必需集 params '${k}' 未在 h-core attributes.toml 定义`).toBe(true)
    }
    for (const k of CONTRACT_REQUIRED_MARKS) {
      expect(hcore.has(k), `必需集 marks '${k}' 未在 h-core attributes.toml 定义`).toBe(true)
    }
    for (const k of CONTRACT_REQUIRED_ABILITIES) {
      expect(hcore.has(k), `必需集 abilities '${k}' 未在 h-core attributes.toml 定义`).toBe(true)
    }
  })

  it('必需集落位链：加载后每个必需键在 getEntityAttr 可读（canonical 命名空间正确）', async () => {
    // 2026-08-09 boot-smoke 抓到的真 bug：好感度/信赖度 category=social → entity.social，
    // 校验器硬编码查 base 误报"缺必需"——此测试验证"定义 → 默认落位 → 读取方可见"整链
    const { modLoader } = await import('./mod-loader')
    const { getEntityAttr } = await import('./entity-utils')
    entitySystem.clear() // 测试隔离：前面 loadMod 已注册 player
    await modLoader.loadMod('test-mod')
    const player = entitySystem.get('character', 'player') as any
    expect(player).toBeDefined()
    for (const k of [...CONTRACT_REQUIRED_BASE, ...CONTRACT_REQUIRED_PARAMS, ...CONTRACT_REQUIRED_MARKS, ...CONTRACT_REQUIRED_ABILITIES]) {
      expect(getEntityAttr(player, k), `必需键 '${k}' 加载后不可读（命名空间落位错误）`).toBeDefined()
    }
    // 具体验证 social 命名空间（此前误报的场景）
    expect(player.social['好感度']).toBe(30)
    expect(player.social['信赖度']).toBe(0)
  })

  it('resetCharacterEntity 全字段重置（含 marks）——跨测试污染防线', () => {
    const char: any = { id: 'npc_1' }
    resetCharacterEntity(char, DEFAULT_NPC_BASE)
    expect(char.marks).toEqual({})
    expect(char.base['好感度']).toBe(0)
    expect(char.base['射精欲上限']).toBe(1000)
    expect(char.sp_flag).toEqual({})
    expect(char.h_state).toBeUndefined()
    expect(char.action_info).toEqual({})
    // 重置后可立即写入契约键（setEntityAttr 只写已有键）
    expect(Object.keys(char.base).length).toBeGreaterThanOrEqual(30)
  })
})

describe('character-contract（运行时生成路径——npc.toml 路人 / pendingSpawns 激活）', () => {
  beforeEach(() => {
    entitySystem.clear()
    errorReporter.clear()
  })

  it('finalizeCharacterData：attributes 默认 + abilities 简写展开 + talents 初始化', () => {
    const mod = parseModData('test-mod', makeMinimalMod(`
[[roster]]
id = "npc_a"
name = "甲"
base = { "体力" = 100 }
abilities = { "技巧" = 3 }
talents = { "剑骨" = 1 }
`))
    const char: any = { id: 'runtime_npc', template: 'x', abilities: { '技巧': 2 } }
    finalizeCharacterData(char, mod)
    expect(char.abilities['技巧']).toEqual({ level: 2, xp: 0 }) // 简写展开
    // 按需展开（2026-08-11）：未拥有的能力不注入（几百技能 × NPC 存档体积）；卡能力由
    // attributes.toml category=ability/mark 落位保证（本 mod 无卡能力定义 → 无条目）
    expect(char.abilities['华山剑法']).toBeUndefined()
    expect(char.base['体力']).toBe(100) // attributes 默认
    expect(char.talents['剑骨']).toBe(0) // talents 初始化 0
    expect(char.marks).toBeUndefined() // 该 mod 无 marks 定义 → 不创建（契约不强制空壳）
  })

  it('npc.toml 路人生成路径契约化（character-system handleNpcSpawns）', async () => {
    // 镜像 boot-smoke：加载 mod + 全量插件（character-system onEnable 注册 location:enter 监听）
    const { modLoader } = await import('./mod-loader')
    const { gameContext } = await import('./game-context')
    const { bindingResolver } = await import('./binding-resolver')
    const { conditionRegistry } = await import('./condition-registry')
        const { commandRegistry } = await import('./command-registry')
    const { apiSystem } = await import('./api')
    const { eventBus } = await import('./event-bus')
    const { PluginManager } = await import('./plugin-manager')
    const { SlotRegistry } = await import('../ui/slots/slot-registry')

    entitySystem.clear()
    commandRegistry.clear()
    conditionEngine.clear()
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

    // 触发 location:enter → character-system 生成路人
    await eventBus.emit('location:enter', { to: 'town_square' })
    const npcs = entitySystem.getAll('character').filter((c: any) => c.id.startsWith('npc_town_square_'))
    expect(npcs.length).toBeGreaterThan(0)
    const npc = npcs[0] as any
    // 契约完整：abilities 是 {level,xp} 对象（非裸数字）、marks 有默认、talents 已初始化
    expect(npc.abilities['技巧']).toEqual({ level: 0, xp: 0 })
    expect(npc.marks['快乐刻印']).toBe(0)
    expect(npc.talents['剑骨']).toBe(0)
    expect(npc.base['体力']).toBeGreaterThan(0)
  })

  it('pendingSpawns 数据加载时已契约化（激活时无需再补）', () => {
    const m = parseModData('test-mod', rawTestModMap)
    const pending = (m as any).pendingSpawns as any[]
    const testSpawn = pending.find((p: any) => p.id === 'test_spawn')
    expect(testSpawn).toBeDefined()
    // abilities 简写已展开（加载时 finalize）
    expect(testSpawn.data.abilities['基础攻击']).toEqual({ level: 1, xp: 0 })
    // 按需展开（2026-08-11）：未拥有的能力不注入（卡能力由 attributes 落位）
    expect(testSpawn.data.abilities['华山剑法']).toBeUndefined()
  })

  it('刻印读取链：getEntityAttr 命中 abilities 真实等级（marks 死存储不遮蔽）', async () => {
    // 2026-08-09 第4轮审查：SEARCH_ORDER 中 marks 原在 abilities 前 → getEntityAttr('快乐刻印')
    // 命中 entity.marks 恒 0（attributes category=mark 默认落位），h-mark 升级写 abilities 的
    // 真实等级被遮蔽（静默失效地雷）→ 顺序调整后 abilities 优先命中
    const { modLoader } = await import('./mod-loader')
    const { getEntityAttr, setEntityAttr } = await import('./entity-utils')
    entitySystem.clear()
    await modLoader.loadMod('test-mod')
    const player = entitySystem.get('character', 'player') as any
    // h-mark 语义：升级写 abilities['快乐刻印'].level
    player.abilities['快乐刻印'].level = 3
    expect(player.marks['快乐刻印']).toBe(0) // 镜像存在但恒 0
    // getEntityAttr 返回原始值（abilities 条目是 {level,xp} 对象）——命中 abilities 而非 marks(0)
    expect(getEntityAttr(player, '快乐刻印')).toEqual({ level: 3, xp: 0 })
    // setEntityAttr 也命中 abilities（不写 marks 死存储；注意：setEntityAttr 是整键替换语义，
    // 对 abilities 条目赋数字会替换 {level,xp} 结构——能力写入应直接改 .level 或走 bindings，
    // 此处仅验证命中位置）
    setEntityAttr(player, '屈服刻印', 2)
    expect(player.abilities['屈服刻印']).toBe(2)
    expect(player.marks['屈服刻印']).toBe(0)
  })

  it('modify_attribute/set_attribute 对 ability 类属性保持 {level,xp} 结构（契约语义）', async () => {
    // 2026-08-09 第5轮修复：原 applyChange/setEntityAttr 整键替换 abilities[name] → 数字，
    // calcJudge/settle_state 等直接读 .level 的读取方恒 0（静默失效）
    const { modLoader } = await import('./mod-loader')
    const { effectTypeRegistry } = await import('../core/effect-type-registry')
    const { onLoad: effectOnLoad } = await import('../plugins/effect-system/index')
    const { SettlementContext } = await import('../plugins/effect-system/settlement-context')
    entitySystem.clear()
    errorReporter.clear()
    effectTypeRegistry.clear() // 测试隔离：前面的全插件加载已注册过 handler（重复注册会被拒）
    await modLoader.loadMod('test-mod')
    errorReporter.clear() // 注释：loadMod 的契约校验 warning（contract_demo params 教学展示，ADR-0007）与本测试无关
    effectOnLoad({} as any) // 注册 modify_attribute/set_attribute handler
    entitySystem.register('character', 'ab_tester', {
      id: 'ab_tester', base: { '体力': 100 }, abilities: { '技巧': { level: 1, xp: 0 } },
    })
    const ch = entitySystem.get('character', 'ab_tester') as any
    const modAttr = effectTypeRegistry.getHandler('modify_attribute')!
    const setAttr = effectTypeRegistry.getHandler('set_attribute')!
    const noSettlementCtx = { _targetIds: ['ab_tester'] } as any
    // settlement 路径（applyChange）
    await modAttr({ attr: '技巧', value: 2 }, { _targetIds: ['ab_tester'], settlement: new SettlementContext() } as any)
    expect(ch.abilities['技巧']).toEqual({ level: 3, xp: 0 })
    // fallback 路径（无 settlement）
    await modAttr({ attr: '技巧', value: 2 }, noSettlementCtx)
    expect(ch.abilities['技巧']).toEqual({ level: 5, xp: 0 })
    // set_attribute
    await setAttr({ attr: '技巧', value: 4 }, noSettlementCtx)
    expect(ch.abilities['技巧']).toEqual({ level: 4, xp: 0 })
    // 非 ability 类行为不变（base）
    await modAttr({ attr: '体力', value: -10 }, noSettlementCtx)
    expect(ch.base['体力']).toBe(90)
    // 结构完整性：全程无 warning（无静默异常）
    expect(errorReporter.getErrors()).toHaveLength(0)
  })

  it('restoreFromSave 全路径：真实 mod 加载 → 读档缺字段补齐 + warning', async () => {
    const { modLoader } = await import('./mod-loader')
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const data = {
      modId: 'test-mod', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      // 契约前存档：只有旧字段（无 好感度/技巧/快乐刻印 等）
      characters: [{ id: 'old_npc', name: '旧角色', base: { hp: 80, '体力': 80 } }],
      gameState: {}, uiState: { foldStates: {} },
    }
    await restoreFromSave(data as any)
    const ch = entitySystem.get('character', 'old_npc') as any
    expect(ch.base['体力']).toBe(80) // 已有值不动
    expect(ch.social['好感度']).toBe(30) // 契约补齐（canonical 命名空间 = applyAttributeDefaults 语义）
    expect(ch.abilities['技巧']).toEqual({ level: 0, xp: 0 })
    expect(ch.marks['快乐刻印']).toBe(0)
    const warnings = errorReporter.getErrors().filter(e => e.severity === 'warning' && e.message.includes('缺属性'))
    expect(warnings.length).toBeGreaterThan(10) // 补了多个字段，警告不静默
  })

  it('restoreFromSave：旧存档 marks 值归一化到 abilities（ADR-0007 恢复路径）', async () => {
    // 本改动前保存的旧存档形态：marks 有值、abilities 刻印恒 0 → 恢复时不静默丢失
    const { modLoader } = await import('./mod-loader')
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    const data = {
      modId: 'test-mod', modVersion: '1.0.0',
      gameTime: { minute: 0, hour: 8, day: 1, month: 1, year: 1 },
      characters: [
        {
          id: 'old_marks_plain', name: '旧角色甲',
          base: { '体力': 80 },
          marks: { '快乐刻印': 2, '屈服刻印': 0 },
          abilities: { '快乐刻印': { level: 0, xp: 0 } },
        },
        {
          id: 'old_marks_real', name: '旧角色乙',
          base: { '体力': 80 },
          marks: { '快乐刻印': 2 },
          abilities: { '快乐刻印': { level: 3, xp: 0 } }, // 运行时真实值 → abilities 优先
        },
      ],
      gameState: {}, uiState: { foldStates: {} },
    }
    await restoreFromSave(data as any)
    const plain = entitySystem.get('character', 'old_marks_plain') as any
    expect(plain.abilities['快乐刻印']).toEqual({ level: 2, xp: 0 })
    const real = entitySystem.get('character', 'old_marks_real') as any
    expect(real.abilities['快乐刻印']).toEqual({ level: 3, xp: 0 }) // 不覆盖已有真实等级
  })

  it('revalidateCharacterContract：插件注册校验器后补跑（main.ts 启动顺序兼容链）', async () => {
    // 镜像 main.ts 顺序：loadMod 先（此时无插件校验器）→ 插件 onLoad 注册 → 补跑
    const { modLoader, revalidateCharacterContract } = await import('./mod-loader')
    entitySystem.clear()
    errorReporter.clear()
    await modLoader.loadMod('test-mod')
    expect(errorReporter.getErrors().filter(e => e.message.includes('缺必需属性'))).toHaveLength(0)
    // 插件注册校验器（模拟 h-core onLoad）
    registerCharacterValidator({
      id: 'fake-required',
      validate: (charId, char) => {
        if (!(char as any).base?.['体力']) {
          errorReporter.report({
            source: 'character-contract:fake-required',
            severity: 'warning',
            message: `角色 '${charId}' 缺必需属性 '体力'`,
          })
        }
      },
    })
    // 补跑 → 校验器生效（test-mod 角色体力均为正 → 无 warning；换一个"缺字段"断言方式）
    revalidateCharacterContract()
    expect(errorReporter.getErrors().filter(e => e.message.includes('缺必需属性'))).toHaveLength(0)
    // 有问题的 mod（体力 定义被删 → 默认不落位）→ 补跑能抓到
    clearCharacterValidators()
    registerCharacterValidator({
      id: 'fake-required2',
      validate: (charId, char) => {
        if (!(char as any).base?.['体力']) {
          errorReporter.report({
            source: 'character-contract:fake-required2',
            severity: 'warning',
            message: `角色 '${charId}' 缺必需属性 '体力'`,
          })
        }
      },
    })
    const badMod = parseModData('test-mod', makeMinimalMod(`
[[roster]]
id = "npc_a"
name = "甲"
base = { "好感度" = 50 }
`, {
      // 覆盖：attributes.toml 不含 体力（默认不落位 → 校验器抓到缺必需）
      '/mods/test-mod/definitions/attributes.toml': `
[attributes]
"好感度" = { type = "number", default = 30, category = "social" }
`,
    }))
    ;(modLoader as any).loadedMod = badMod
    revalidateCharacterContract()
    expect(errorReporter.getErrors().some(e => e.message.includes("角色 'npc_a' 缺必需属性 '体力'"))).toBe(true)
    ;(modLoader as any).loadedMod = null
  })

  it('条件注册链：h-core 默认属性 → conditionRegistry 可校验 player.技巧 / player.快乐刻印', async () => {
    // 镜像 main.ts 第 4 步：registerFromAttributes(mod.attributes)
    const { modLoader } = await import('./mod-loader')
    const { conditionRegistry } = await import('./condition-registry')
    await modLoader.loadMod('test-mod')
    const mod = modLoader.getMod()
    if (!mod) throw new Error('模组加载失败')
    conditionRegistry.clear()
    conditionRegistry.registerFromAttributes(mod.attributes)
    // 此前（h-core 默认层补全前）技巧/快乐刻印 只存在于 test-mod → 任意 mod 条件校验失败
    expect(conditionRegistry.validateExpression('player.技巧 >= 1').ok).toBe(true)
    expect(conditionRegistry.validateExpression('player.快乐刻印 == 0').ok).toBe(true)
    expect(conditionRegistry.validateExpression('player.皮肤 >= 100').ok).toBe(true)
  })
})

describe('character-contract（扫描脚本自测）', () => {
  it('scan-attr-refs.cjs 退出码 0（第1层 0 违规）', () => {
    const out = execFileSync('node', ['scripts/scan-attr-refs.cjs'], {
      cwd: ROOT, encoding: 'utf8',
    })
    expect(out).toContain('VIOLATION=0')
    expect(out).toContain('ATTR_EXPANSION_VIOLATION=0')
  })

  it('scan-erark-defs.cjs 对账四类齐备 + 遗漏 0（人工已确认）', () => {
    const out = execFileSync('node', ['scripts/scan-erark-defs.cjs'], {
      cwd: ROOT, encoding: 'utf8',
    })
    expect(out).toContain('已对齐')
    expect(out).toContain('有意删减')
    expect(out).toContain('替代处理')
    // 遗漏候选段必须为空（[遗漏] 行数为 0）
    const missingLines = out.split('\n').filter((l: string) => l.includes('[遗漏]'))
    expect(missingLines).toEqual([])
  })
})
