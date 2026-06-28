import { describe, it, expect, beforeEach } from 'vitest'
import { PluginManager } from './plugin-manager'
import { apiSystem } from './api'
import { eventBus } from './event-bus'
import { conditionRegistry } from './condition-registry'

describe('plugin-manager', () => {
  let pm: PluginManager

  beforeEach(() => {
    apiSystem.clear()
    eventBus.clear()
    conditionRegistry.clear()
    pm = new PluginManager(apiSystem, eventBus)
  })

  it('should parse plugin.toml correctly', () => {
    const toml = `
[meta]
id = "test-plugin"
name = "Test Plugin"
version = "1.0.0"

dependencies = [
  { plugin = "base-plugin", version = "^1.0.0" }
]

[required_attributes]
hp = { type = "number", description = "Health points" }
`
    const def = pm.parsePluginToml('test-plugin', toml)
    expect(def.meta.id).toBe('test-plugin')
    expect(def.meta.version).toBe('1.0.0')
    expect(def.dependencies.length).toBe(1)
    expect(def.requiredAttributes.hp).toBeDefined()
  })

  it('should throw on missing required meta fields', () => {
    const toml = `[meta]
id = "test"
`
    expect(() => pm.parsePluginToml('test', toml)).toThrow()
  })

  it('should detect circular extends', () => {
    const defs = new Map()
    defs.set('a', { meta: { id: 'a', version: '1.0.0', name: 'A', extends: 'b' }, dependencies: [] })
    defs.set('b', { meta: { id: 'b', version: '1.0.0', name: 'B', extends: 'a' }, dependencies: [] })
    expect(() => pm.sortByExtends(defs)).toThrow()
  })

  it('should sort plugins so parents come before children', () => {
    const defs = new Map()
    defs.set('child', { meta: { id: 'child', version: '1.0.0', name: 'Child', extends: 'parent' }, dependencies: [{ plugin: 'parent', version: '^1.0.0' }] })
    defs.set('parent', { meta: { id: 'parent', version: '1.0.0', name: 'Parent' }, dependencies: [] })

    const sorted = pm.sortByExtends(defs)
    const ids = sorted.map(d => d.meta.id)
    expect(ids.indexOf('parent')).toBeLessThan(ids.indexOf('child'))
  })

  it('should execute onLoad then onEnable in order', async () => {
    const order: string[] = []
    const enginePlugins = new Map([
      ['test', {
        toml: `[meta]\nid = "test"\nname = "Test"\nversion = "1.0.0"`,
        module: {
          onLoad: () => { order.push('onLoad') },
          onEnable: () => { order.push('onEnable') }
        }
      }]
    ])
    await pm.loadPlugins(enginePlugins, new Map())
    expect(order).toEqual(['onLoad', 'onEnable'])
  })

  it('should execute parent onLoad before child onLoad', async () => {
    const order: string[] = []
    const enginePlugins = new Map([
      ['parent', {
        toml: `[meta]\nid = "parent"\nname = "Parent"\nversion = "1.0.0"`,
        module: {
          onLoad: () => { order.push('parent:onLoad') },
          onEnable: () => { order.push('parent:onEnable') }
        }
      }],
      ['child', {
        toml: `[meta]\nid = "child"\nname = "Child"\nversion = "1.0.0"\nextends = "parent"`,
        module: {
          onLoad: () => { order.push('child:onLoad') },
          onEnable: () => { order.push('child:onEnable') }
        }
      }]
    ])
    await pm.loadPlugins(enginePlugins, new Map())
    expect(order).toEqual(['parent:onLoad', 'child:onLoad', 'parent:onEnable', 'child:onEnable'])
  })

  it('should isolate plugin errors and continue loading others', async () => {
    const enginePlugins = new Map([
      ['bad', {
        toml: `[meta]\nid = "bad"\nname = "Bad"\nversion = "1.0.0"`,
        module: {
          onLoad: () => { throw new Error('plugin failed') }
        }
      }],
      ['good', {
        toml: `[meta]\nid = "good"\nname = "Good"\nversion = "1.0.0"`,
        module: {
          onLoad: () => {},
          onEnable: () => {}
        }
      }]
    ])
    await pm.loadPlugins(enginePlugins, new Map())
    expect(pm.getPluginDef('bad')).toBeUndefined()
    expect(pm.getPluginDef('good')).toBeDefined()
  })

  it('should register condition fields from plugins', async () => {
    const enginePlugins = new Map([
      ['test', {
        toml: `[meta]\nid = "test"\nname = "Test"\nversion = "1.0.0"

[condition_fields]
"combat.in_progress" = { type = "boolean", description = "Is combat in progress" }`,
        module: {}
      }]
    ])
    await pm.loadPlugins(enginePlugins, new Map())
    const fields = conditionRegistry.getAllFields()
    expect(fields.some(f => f.path === 'combat.in_progress')).toBe(true)
  })

  it('should provide parent API to child plugin', async () => {
    const enginePlugins = new Map([
      ['parent', {
        toml: `[meta]\nid = "parent"\nname = "Parent"\nversion = "1.0.0"`,
        module: {
          onEnable: (ctx: any) => {
            ctx.api.register('parent', { greet: () => 'hello from parent' })
          }
        }
      }],
      ['child', {
        toml: `[meta]\nid = "child"\nname = "Child"\nversion = "1.0.0"\nextends = "parent"`,
        module: {
          onEnable: (ctx: any) => {
            expect(ctx.parent).not.toBeNull()
            expect(ctx.parent.api.greet()).toBe('hello from parent')
          }
        }
      }]
    ])
    await pm.loadPlugins(enginePlugins, new Map())
  })
})
