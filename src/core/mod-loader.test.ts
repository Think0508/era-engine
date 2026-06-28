import { describe, it, expect, beforeEach } from 'vitest'
import { parseModData, ModLoader, type LoadedMod } from './mod-loader'
import { entitySystem } from './entity-system'
import { bindingResolver } from './binding-resolver'

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
    expect(mod.dependencies).toEqual([
      { plugin: 'combat-base', version: '^1.0.0' },
    ])
  })

  it('parses attributes.toml correctly (5 attributes)', () => {
    expect(Object.keys(mod.attributes)).toHaveLength(5)
    expect(mod.attributes.hp.type).toBe('number')
    expect(mod.attributes.hp.default).toBe(100)
    expect(mod.attributes.hp.category).toBe('base')
    expect(mod.attributes.attack.category).toBe('combat')
  })

  it('parses bindings.toml correctly', () => {
    expect(mod.bindings['combat-base']).toEqual({
      hp: 'hp',
      mp: 'mp',
      attack: 'attack',
    })
  })

  it('parses roster.toml correctly (3 characters)', () => {
    const characters = mod.entities.get('character')!
    expect(characters.size).toBe(3)
    expect(characters.get('player')?.name).toBe('玩家')
    expect(characters.get('player')?.base).toEqual({
      hp: 200,
      mp: 80,
      attack: 15,
      defense: 5,
      speed: 5,
    })
    expect(characters.get('innkeeper')?.name).toBe('酒馆老板')
    expect(characters.get('guard')?.behavior?.activity).toBe(0.3)
  })

  it('parses locations correctly (2 locations, exits, parent)', () => {
    expect(mod.locations.size).toBe(2)
    const tavern = mod.locations.get('tavern')!
    expect(tavern.name).toBe('酒馆')
    expect(tavern.parent).toBe('town_square')
    expect(tavern.type).toBe('building')
    expect(tavern.tags).toContain('has_drink')
    expect(tavern.exits).toHaveLength(1)
    expect(tavern.exits[0]).toEqual({
      target: 'town_square',
      name: '去广场',
      time_cost: 5,
    })
    const square = mod.locations.get('town_square')!
    expect(square.name).toBe('城镇广场')
    expect(square.parent).toBeNull()
    expect(square.exits[0].target).toBe('tavern')
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
      /roster\.toml.*nonexistent_template.*不存在/,
    )
  })
})
