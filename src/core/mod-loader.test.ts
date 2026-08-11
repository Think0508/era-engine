import { describe, it, expect, beforeEach } from 'vitest'
import { parseModData, ModLoader, modLoader, type LoadedMod } from './mod-loader'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'
import { conditionRegistry } from './condition-registry'
import { errorReporter } from './error-reporter'
import { checkUpgrade } from '../plugins/ability-progression/index'

const rawTomlMap = import.meta.glob('/mods/test-mod/**/*.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function makeMap(overrides: Record<string, string> = {}): Record<string, string> {
  return { ...rawTomlMap, ...overrides }
}

describe('parseModData', () => {
  let mod: LoadedMod

  it('parses meta.toml correctly', () => {
    mod = parseModData('test-mod', rawTomlMap)
    expect(mod.id).toBe('test-mod')
    expect(mod.name).toBe('测试模组')
    expect(mod.version).toBe('1.0.0')
    // 注释：Phase 5 移除 combat-base 依赖，插件未实现
    expect(mod.dependencies).toEqual([])
  })

  it('parses attributes.toml correctly (display/display_group/daily_reset)', () => {
    // 注释：原有5个 + 体力/气力/精力 + 情绪/理性 + 7 Parameter + 金钱 = 16
    expect(Object.keys(mod.attributes).length).toBeGreaterThanOrEqual(16)
    expect(mod.attributes.hp.type).toBe('number')
    expect(mod.attributes.hp.default).toBe(100)
    expect(mod.attributes.hp.display).toBe(true)
    expect(mod.attributes.hp.display_group).toBe('status')
    expect(mod.attributes.attack.category).toBe('combat')
    // 注释：Parameter 属性有 daily_reset
    expect(mod.attributes['皮肤'].daily_reset).toBe(true)
    expect(mod.attributes['皮肤'].display_group).toBe('身体快感')
    expect(mod.attributes['恭顺'].display_group).toBe('行为参数')
    // 注释：非 Parameter 属性无 daily_reset
    expect(mod.attributes.hp.daily_reset).toBeUndefined()
  })

  it('parses equipment.toml correctly (9 slots)', () => {
    expect(mod.equipmentSlots).toHaveLength(9)
    expect(mod.equipmentSlots[0].id).toBe('head')
    expect(mod.equipmentSlots[0].name).toBe('头')
    expect(mod.equipmentSlots[0].category).toBe('clothing')
    expect(mod.equipmentSlots[8].id).toBe('accessory')
  })

  it('parses calendar.toml correctly', () => {
    expect(mod.calendar).not.toBeNull()
    expect(mod.calendar!.month_names).toHaveLength(12)
    expect(mod.calendar!.month_names[0]).toBe('一月')
    expect(mod.calendar!.weekday_names).toHaveLength(7)
    // 注释：hour_names 可选——不设则 fallback 24 小时制
    expect(mod.calendar!.hour_names).toBeUndefined()
  })

  it('parses bindings.toml correctly', () => {
    expect(mod.bindings['combat-base']).toEqual({
      hp: 'hp',
      mp: 'mp',
      attack: 'attack',
    })
  })

  it('parses roster.toml correctly (6 characters + 1 pending, equipment, assets)', () => {
    const m = parseModData('test-mod', rawTomlMap)
    const characters = m.entities.get('character')!
    // 注释：6 roster（含契约示范角色 contract_demo）+ 1 named（test_named，覆盖之前没有同名 roster 条目，作为新增角色）
    expect(characters.size).toBe(7)
    // 注释：有 spawn_condition 的角色在 pendingSpawns 里
    expect((m as any).pendingSpawns).toHaveLength(1)
    expect((m as any).pendingSpawns[0].id).toBe('test_spawn')
    expect(characters.get('player')?.name).toBe('玩家')
    expect(characters.get('player')?.base).toMatchObject({
      hp: 200,
      mp: 80,
      attack: 15,
      defense: 5,
      speed: 5,
      TSP: 200,
      tsp_max: 200,
      "体力": 1200,
      "气力": 800,
      "体力上限": 2500,
      "气力上限": 2000,
      "精力": 100,
      "性别": 1,
    })
    expect(characters.get('player')?.equipment).toEqual({
      upper: '布衣',
      lower: '长裤',
    })
    expect(characters.get('player')?.assets).toEqual({
      portrait: 'assets/char/player.png',
    })
    expect(characters.get('innkeeper')?.name).toBe('酒馆老板')
    expect(characters.get('guard')?.behavior?.activity).toBe(0.3)
    expect(characters.get('guard')?.equipment).toBeDefined()
    expect(characters.get('test_girl')?.name).toBe('小师妹')
    expect(characters.get('test_girl')?.equipment).toEqual({
      upper: '布衣',
      lower: '裙子',
    })
  })

  it('loads named characters from characters/named/{id}/base.toml', () => {
    const m = parseModData('test-mod', rawTomlMap)
    const characters = m.entities.get('character')!
    // 注释：named 角色覆盖 roster 同名 ID
    const named = characters.get('test_named')
    expect(named).toBeDefined()
    expect(named!.name).toBe('命名测试角色（覆盖版）')
    // 注释：template 继承正确
    expect(named!.base.hp).toBe(999)
    expect(named!.base.mp).toBe(50)
    // 注释：talents 正确（named 设定值 + 插件默认初始化为 0）
    expect(named!.talents['剑骨']).toBe(1)
    // 注释：named 不增加 counts（只覆盖已存在的 ID，或新增不存在的 ID）
    expect(characters.size).toBe(7)  // 6 roster + 1 named（test_named 在 roster 中没有，而是新增）
  })

  it('parses locations correctly (2 locations, parent chain, graph)', () => {
    expect(mod.locations.size).toBe(2)
    const tavern = mod.locations.get('tavern')!
    expect(tavern.name).toBe('酒馆')
    expect(tavern.parent).toBe('town_square')
    expect(tavern.type).toBe('building')
    expect(tavern.tags).toContain('has_drink')
    // exits field is deleted by loadLocations — new format uses parent + graph
    expect((tavern as any).exits).toBeUndefined()
    const square = mod.locations.get('town_square')!
    expect(square.name).toBe('城镇广场')
    expect(square.parent).toBeNull()
    expect((square as any).exits).toBeUndefined()
    // graph has two edges（test-mod/maps/graph/test.toml——反向边避免顶级地点"不可达"warning）
    expect(mod.graph).toEqual([
      { from: 'town_square', to: 'tavern', time_cost: 5 },
      { from: 'tavern', to: 'town_square', time_cost: 5 },
    ])
  })

  it('parses theme.toml correctly', () => {
    expect(mod.theme.colors?.primary).toBe('#3B82F6')
    expect(mod.theme.colors?.danger).toBe('#EF4444')
    expect(mod.theme.typography?.font_body).toBe('sans-serif')
    expect(mod.theme.spacing?.gap_small).toBe('8px')
  })

  it('parses character templates correctly (2 templates)', () => {
    const templates = mod.entities.get('__templates_character__')!
    expect(templates.size).toBe(2)
    expect(templates.get('base-human')?.name).toBe('基础人类')
    expect(templates.get('base-human')?.base).toEqual({
      hp: 100,
      mp: 50,
      attack: 10,
      defense: 5,
      speed: 5,
      "体力": 100,
      "气力": 100,
      "精力": 100,
    })
    expect(templates.get('test-hero')?.extends).toBe('base-human')
    expect(templates.get('test-hero')?.base).toEqual({ hp: 150, attack: 15 })
  })

  it('throws when mod not found (missing meta.toml)', () => {
    expect(() => parseModData('nonexistent', {})).toThrow(
      /nonexistent.*meta\.toml/,
    )
  })

  it('throws when meta.toml missing [meta] section', () => {
    const badMap = makeMap({ '/mods/test-mod/meta.toml': 'id = "test"' })
    expect(() => parseModData('test-mod', badMap)).toThrow(/\[meta\]/)
  })

  it('throws on invalid TOML syntax with file path in error', () => {
    const badMap = makeMap({
      '/mods/test-mod/meta.toml': 'this is = = invalid',
    })
    expect(() => parseModData('test-mod', badMap)).toThrow(
      '/mods/test-mod/meta.toml',
    )
  })

  it('handles missing optional files gracefully', () => {
    const minimalMap: Record<string, string> = {
      '/mods/test-mod/meta.toml': [
        '[meta]',
        'id = "mini"',
        'name = "最小模组"',
        'version = "0.1.0"',
      ].join('\n'),
    }
    const result = parseModData('test-mod', minimalMap)
    expect(result.id).toBe('mini')
    expect(result.attributes).toEqual({})
    expect(result.bindings).toEqual({})
    expect(result.theme).toEqual({})
    expect(result.locations.size).toBe(0)
    expect(result.entities.get('character')!.size).toBe(0)
  })
})

describe('mod-loader integration', () => {
  beforeEach(() => {
    entitySystem.clear()
    bindingResolver.loadBindings({})
    conditionRegistry.clear()
  })

  it('should resolve template inheritance when loading roster', () => {
    const mod = parseModData('test-mod', rawTomlMap)
    const player = mod.entities.get('character')!.get('player')!
    expect(player.base.hp).toBe(200)
    expect(player.base.mp).toBe(80)
    expect(player.base.defense).toBe(5)
    expect(player.base.attack).toBe(15)
    expect(player.base.speed).toBe(5)
  })

  it('should resolve templates for all roster entries', () => {
    const mod = parseModData('test-mod', rawTomlMap)
    const innkeeper = mod.entities.get('character')!.get('innkeeper')!
    expect(innkeeper.base.hp).toBe(80)
    expect(innkeeper.base.attack).toBe(5)
    expect(innkeeper.base.mp).toBe(50)
    expect(innkeeper.base.defense).toBe(5)
    const guard = mod.entities.get('character')!.get('guard')!
    expect(guard.base.hp).toBe(120)
    expect(guard.base.attack).toBe(12)
    expect(guard.base.defense).toBe(5)
  })

  it('should register characters to entity system via loadMod', async () => {
    const loader = new ModLoader()
    await loader.loadMod('test-mod')
    expect(entitySystem.get('character', 'player')).not.toBeNull()
    expect(entitySystem.get('character', 'innkeeper')).not.toBeNull()
    expect(entitySystem.get('character', 'guard')).not.toBeNull()
    const player = entitySystem.get('character', 'player')!
    expect(player.base.hp).toBe(200)
    expect(player.base.attack).toBe(15)
  })

  it('should load bindings into bindingResolver via loadMod', async () => {
    const loader = new ModLoader()
    await loader.loadMod('test-mod')
    expect(bindingResolver.get('player', 'hp')).toBe(200)
    expect(bindingResolver.get('player', 'mp')).toBe(80)
    expect(bindingResolver.get('player', 'attack')).toBe(15)
  })

  it('should populate condition registry after loading mod', async () => {
    const loader = new ModLoader()
    await loader.loadMod('test-mod')
    const fields = conditionRegistry.getAllFields()
    expect(fields.some(f => f.path === 'player.hp' && f.source === 'attributes.toml')).toBe(true)
    expect(fields.some(f => f.path === 'character.{id}.hp' && f.source === 'attributes.toml')).toBe(true)
    expect(fields.some(f => f.path === 'player.hp' && f.source === 'bindings:combat-base')).toBe(true)
    expect(fields.some(f => f.path === 'player.attack' && f.source === 'bindings:combat-base')).toBe(true)
    expect(fields.some(f => f.path === 'location.id' && f.source === 'engine')).toBe(true)
    expect(fields.some(f => f.path === 'game.time.hour' && f.source === 'engine')).toBe(true)
    expect(fields.some(f => f.path === 'player.defense' && f.source === 'attributes.toml')).toBe(true)
  })

  it('should throw with file path when template resolution fails', () => {
    const badMap = makeMap({
      '/mods/test-mod/characters/roster.toml': [
        '[[roster]]',
        'id = "orphan"',
        'template = "nonexistent_template"',
        'name = "孤儿"',
      ].join('\n'),
    })
    expect(() => parseModData('test-mod', badMap)).toThrow(
      /roster\.toml.*nonexistent_template/,
    )
  })

  describe('random event data loading', () => {
    beforeEach(() => {
      errorReporter.clear()
    })

    it('loads events from definitions/events/*.toml accumulatively', () => {
      const mod = parseModData('test-mod', makeMap({
        '/mods/test-mod/definitions/events/move.toml': [
          '[[events]]',
          'id = "move_see_swordsman"',
          'behavior = "move"',
          'type = 0',
          'text = "遇到剑客"',
          'effects = [{ type = "modify_attribute", params = { attr = "体力", value = -5, target = "self" } }]',
        ].join('\n'),
      }))
      const moveEvents = (mod.events ?? []).filter(e => e.behavior === 'move')
      expect(moveEvents).toHaveLength(1)
      expect(moveEvents[0].id).toBe('move_see_swordsman')
      expect(moveEvents[0].type).toBe(0)
      expect(moveEvents[0].text).toBe('遇到剑客')
      expect(moveEvents[0].effects).toHaveLength(1)
    })

    it('reports error for event missing id', () => {
      parseModData('test-mod', makeMap({
        '/mods/test-mod/definitions/events/bad.toml': [
          '[[events]]',
          'behavior = "move"',
          'type = 0',
        ].join('\n'),
      }))
      const errs = errorReporter.getErrorsBySource('mod-loader')
      expect(errs.some(e => e.severity === 'error' && e.message.includes('id'))).toBe(true)
    })

    it('reports error for event missing behavior', () => {
      parseModData('test-mod', makeMap({
        '/mods/test-mod/definitions/events/bad2.toml': [
          '[[events]]',
          'id = "no_behavior"',
          'type = 0',
        ].join('\n'),
      }))
      const errs = errorReporter.getErrorsBySource('mod-loader')
      expect(errs.some(e => e.severity === 'error' && e.message.includes('behavior'))).toBe(true)
    })
  })

  // ═══════ 能力存储架构（2026-08-11 批：目录拆分 + 按需展开）═══════
  describe('ability storage（目录拆分 + 按需展开）', () => {
    it('definitions/abilities/ 目录拆分合并 + 单文件兼容 + mod 覆盖插件默认', () => {
      const mod = parseModData('test-mod', makeMap({
        '/mods/test-mod/definitions/abilities/sword.toml': [
          '[abilities]',
          '[abilities."青峰剑法"]',
          'name = "青峰剑法"',
          'type = "passive"',
          'max_level = 5',
          'tags = ["combat_active", "sword"]',
        ].join('\n'),
        '/mods/test-mod/definitions/abilities/internal.toml': [
          '[abilities]',
          '[abilities."混元劲"]',
          'name = "混元劲"',
          'type = "passive"',
          'max_level = 10',
          'tags = ["internal"]',
        ].join('\n'),
      }))
      expect(mod.abilities['青峰剑法']).toBeDefined()  // 目录文件 1
      expect(mod.abilities['混元劲']).toBeDefined()    // 目录文件 2
      expect(mod.abilities['华山剑法']).toBeDefined()  // 单文件兼容（test-mod abilities.toml）
    })

    it('按需展开：角色只拥有数据写了的能力（卡能力由 attributes 落位）', () => {
      const mod = parseModData('test-mod', makeMap({
        '/mods/test-mod/definitions/abilities/condition.toml': [
          '[abilities]',
          '[abilities."房中术"]',
          'name = "房中术"',
          'type = "passive"',
          'max_level = 3',
          'tags = ["abl"]',
          'mode = "condition"',
          '[[abilities."房中术".upgrades]]',
          'needs = [{ type = "experience", id = 80, value = 5 }]',
        ].join('\n'),
        '/mods/test-mod/characters/roster.toml': [
          '[[roster]]',
          'id = "on_demand_demo"',
          'template = "base-human"',
          'name = "按需示范"',
          'abilities = { "华山剑法" = 3 }',
          'marks = { "快乐刻印" = 1 }',
        ].join('\n'),
      }))
      const char = mod.entities.get('character')!.get('on_demand_demo') as any
      // 数据写了 → 展开
      expect(char.abilities['华山剑法']).toEqual({ level: 3, xp: 0 })
      // 未写的 xp 模式能力 → 无条目（按需，2026-08-11）
      expect(char.abilities['采药']).toBeUndefined()
      // condition 模式能力 → 全量注入 0 级（checkUpgrade 升级遍历入口，经验→升级联动依赖）
      expect(char.abilities['房中术']).toEqual({ level: 0, xp: 0 })
      // 刻印（category=mark 角色卡）→ attributes 落位 + marks 归一化
      expect(char.abilities['快乐刻印']).toEqual({ level: 1, xp: 0 })
      expect(char.marks['快乐刻印']).toBe(1)
    })

    it('经验→能力升级联动：condition 能力有经验门槛时无条目也能被 checkUpgrade 遍历', () => {
      const mod = parseModData('test-mod', makeMap({
        '/mods/test-mod/definitions/abilities/condition.toml': [
          '[abilities]',
          '[abilities."房中术"]',
          'name = "房中术"',
          'type = "passive"',
          'max_level = 3',
          'tags = ["abl"]',
          'mode = "condition"',
          '[[abilities."房中术".upgrades]]',
          'needs = [{ type = "experience", id = 80, value = 5 }]',
        ].join('\n'),
        '/mods/test-mod/characters/roster.toml': [
          '[[roster]]',
          'id = "link_demo"',
          'template = "base-human"',
          'name = "联动示范"',
        ].join('\n'),
      }))
      const char = mod.entities.get('character')!.get('link_demo') as any
      // 角色数据没写房中术——但 condition 注入保证条目存在（升级入口）
      expect(char.abilities['房中术']).toEqual({ level: 0, xp: 0 })
    })

    it('注入链路端到端：目录 condition 能力 → 角色注入 → checkUpgrade 真实升级（经验门槛）', () => {
      const map = makeMap({
        '/mods/test-mod/definitions/abilities/condition.toml': [
          '[abilities]',
          '[abilities."房中术"]',
          'name = "房中术"',
          'type = "passive"',
          'max_level = 3',
          'tags = ["abl"]',
          'mode = "condition"',
          '[[abilities."房中术".upgrades]]',
          'needs = [{ type = "experience", id = 80, value = 5 }]',
        ].join('\n'),
        '/mods/test-mod/characters/roster.toml': [
          '[[roster]]',
          'id = "link_e2e"',
          'template = "base-human"',
          'name = "联动端到端"',
          'experience = { "80" = 5 }',
        ].join('\n'),
      })
      const mod = parseModData('test-mod', map)
      ;(modLoader as any).loadedMod = mod
      const char = mod.entities.get('character')!.get('link_e2e') as any
      entitySystem.register('character', 'link_e2e', char)
      // 注入条目存在 → checkUpgrade 遍历 → 经验门槛满足 → 升级
      checkUpgrade('link_e2e')
      expect(char.abilities['房中术'].level).toBe(1)
    })
  })
})

// ═══════ 物品存储（2026-08-12：目录拆分 + 插件默认 + 重复校验）═══════
describe('item storage（目录拆分 + 覆盖 + 重复校验）', () => {
  it('definitions/items/ 目录拆分合并 + 单文件兼容 + 插件默认覆盖', () => {
    const mod = parseModData('test-mod', makeMap({
      '/src/plugins/h-core/data/default/items/h-drugs.toml': [
        '[items]',
        '[items."媚药"]',
        'name = "媚药"',
        'type = "consumable"',
        'use = ["h_drug"]',
        'body_slot = -1',
        'price = 100',
      ].join('\n'),
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."金疮药"]',
        'name = "金疮药"',
        'type = "consumable"',
        'use = ["self"]',
        'effects = [{ type = "modify_attribute", params = { attr = "hp", value = 20, target = "self" } }]',
      ].join('\n'),
      '/mods/test-mod/definitions/items/misc.toml': [
        '[items]',
        '[items."江湖令"]',
        'name = "江湖令"',
        'type = "key"',
        'use = []',
      ].join('\n'),
    }))
    expect(mod.items['金疮药']).toBeDefined()   // 目录文件 1
    expect(mod.items['江湖令']).toBeDefined()   // 目录文件 2
    expect(mod.items['媚药']).toBeDefined()     // 插件默认
    expect(mod.items['媚药'].price).toBe(100)
    // 单文件 items.toml 兼容（test-mod items.toml 现有物品）
    expect(mod.items['布衣']).toBeDefined()
  })

  it('mod 覆盖插件默认：同 id 深合并 mod 优先', () => {
    const mod = parseModData('test-mod', makeMap({
      '/src/plugins/h-core/data/default/items/h-drugs.toml': [
        '[items]',
        '[items."媚药"]',
        'name = "媚药"',
        'type = "consumable"',
        'price = 100',
      ].join('\n'),
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."媚药"]',
        'name = "媚药"',
        'price = 200',
      ].join('\n'),
    }))
    expect(mod.items['媚药'].price).toBe(200)
  })

  it('mod 文件间同 id 重复 → error 上报', () => {
    errorReporter.clear()
    parseModData('test-mod', makeMap({
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."金疮药"]',
        'name = "金疮药"',
        'type = "consumable"',
      ].join('\n'),
      '/mods/test-mod/definitions/items/food.toml': [
        '[items]',
        '[items."金疮药"]',
        'name = "金疮药"',
        'type = "consumable"',
      ].join('\n'),
    }))
    const err = errorReporter.getErrors().find(e => e.severity === 'error' && e.message.includes('金疮药') && e.message.includes('重复'))
    expect(err).toBeDefined()
  })
})

// ═══════ 物品加载校验（2026-08-12：body_auto_remove 必填 / use 未注册 warning / 类型校验）═══════
describe('item 校验', () => {
  it('body_slot≥0 无 body_auto_remove → error', () => {
    errorReporter.clear()
    parseModData('test-mod', makeMap({
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."迷魂香"]',
        'name = "迷魂香"',
        'type = "consumable"',
        'use = ["h_drug"]',
        'body_slot = 15',
      ].join('\n'),
    }))
    const err = errorReporter.getErrors().find(e => e.severity === 'error' && e.message.includes('迷魂香') && e.message.includes('body_auto_remove'))
    expect(err).toBeDefined()
  })

  it('use 未注册 → warning 不阻止加载', () => {
    errorReporter.clear()
    const mod = parseModData('test-mod', makeMap({
      '/mods/test-mod/definitions/items/misc.toml': [
        '[items]',
        '[items."不明物品"]',
        'name = "不明物品"',
        'type = "tool"',
        'use = ["some_custom_use"]',
      ].join('\n'),
    }))
    expect(mod.items['不明物品']).toBeDefined()
    const warn = errorReporter.getErrors().find(e => e.severity === 'warning' && e.message.includes('不明物品'))
    expect(warn).toBeDefined()
  })

  it('use 非法类型（数字）→ warning 不抛异常，物品正常加载', () => {
    errorReporter.clear()
    let mod!: LoadedMod
    expect(() => {
      mod = parseModData('test-mod', makeMap({
        '/mods/test-mod/definitions/items/misc.toml': [
          '[items]',
          '[items."怪药"]',
          'name = "怪药"',
          'type = "consumable"',
          'use = 123',
        ].join('\n'),
      }))
    }).not.toThrow()
    expect(mod.items['怪药']).toBeDefined()
    const warn = errorReporter.getErrors().find(e => e.severity === 'warning' && e.message.includes('怪药'))
    expect(warn).toBeDefined()
  })

  it('mod 覆盖 body_slot 但插件默认有 body_auto_remove → 合并结果合法不误报 error', () => {
    errorReporter.clear()
    const mod = parseModData('test-mod', makeMap({
      '/src/plugins/h-core/data/default/items/h-drugs.toml': [
        '[items]',
        '[items."媚药"]',
        'name = "媚药"',
        'type = "consumable"',
        'body_slot = 2',
        'body_auto_remove = "manual"',
      ].join('\n'),
      '/mods/test-mod/definitions/items/drugs.toml': [
        '[items]',
        '[items."媚药"]',
        'name = "媚药"',
        'type = "consumable"',
        'body_slot = 3',
      ].join('\n'),
    }))
    expect(mod.items['媚药'].body_slot).toBe(3)
    expect(mod.items['媚药'].body_auto_remove).toBe('manual')
    const err = errorReporter.getErrors().find(e => e.severity === 'error' && e.message.includes('媚药') && e.message.includes('body_auto_remove'))
    expect(err).toBeUndefined()
  })
})
