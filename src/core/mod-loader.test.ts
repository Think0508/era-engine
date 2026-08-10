import { describe, it, expect, beforeEach } from 'vitest'
import { parseModData, ModLoader, type LoadedMod } from './mod-loader'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'
import { conditionRegistry } from './condition-registry'
import { errorReporter } from './error-reporter'

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
})
