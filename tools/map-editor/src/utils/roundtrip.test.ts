import { describe, it, expect } from 'vitest'
import { parse } from '@iarna/toml'
import { stringify } from '@iarna/toml'

describe('TOML round-trip', () => {
  const KNOWN = new Set(['id', 'name', 'type', 'parent', 'tags', 'visible', 'exits'])

  it('preserves unknown fields through import/export', () => {
    const toml = `
[[locations]]
id = "huashan"
name = "华山"
type = "sect_hq"
tags = ["sword", "martial"]
description = "五岳之一"

[[locations]]
id = "huashan_inn"
name = "华山客栈"
type = "inn"
parent = "huashan"
tags = ["rest"]
custom_field = { foo = "bar", num = 42 }
`

    // Import
    const data = parse(toml) as any
    const entries: any[] = data.locations

    // Extract known + unknown fields
    const imported = entries.map((loc: any) => {
      const attrs: Record<string, any> = {}
      for (const key of Object.keys(loc)) {
        if (!KNOWN.has(key)) attrs[key] = loc[key]
      }
      return {
        id: loc.id,
        name: loc.name ?? loc.id,
        type: loc.type ?? 'unknown',
        parent: loc.parent ?? null,
        tags: loc.tags ?? [],
        visible: loc.visible !== false,
        attrs: Object.keys(attrs).length > 0 ? attrs : undefined,
      }
    })

    expect(imported[0].attrs?.description).toBe('五岳之一')
    expect(imported[1].attrs?.custom_field).toEqual({ foo: 'bar', num: 42 })

    // Export (filter attrs against known fields)
    const KNOWN2 = new Set([...KNOWN, 'position', 'collapsed', 'attrs'])
    const exported = imported.map((n: any) => {
      const safeAttrs: Record<string, any> = {}
      if (n.attrs) {
        for (const [k, v] of Object.entries(n.attrs)) {
          if (!KNOWN2.has(k)) safeAttrs[k] = v
        }
      }
      return {
        id: n.id,
        name: n.name,
        type: n.type,
        ...(n.parent ? { parent: n.parent } : {}),
        tags: n.tags,
        ...(n.visible ? {} : { visible: false }),
        ...safeAttrs,
      }
    })

    const output = stringify({ locations: exported } as any)
    const reparsed = parse(output) as any

    expect(reparsed.locations[0].description).toBe('五岳之一')
    expect(reparsed.locations[1].custom_field.foo).toBe('bar')
    expect(reparsed.locations[1].custom_field.num).toBe(42)
  })

  it('handles empty attrs gracefully', () => {
    const toml = `
[[locations]]
id = "test"
name = "Test"
type = "test"
tags = []
`
    const data = parse(toml) as any
    const loc = data.locations[0]
    const attrs: Record<string, any> = {}
    for (const key of Object.keys(loc)) {
      if (!KNOWN.has(key)) attrs[key] = loc[key]
    }
    expect(Object.keys(attrs).length).toBe(0)
  })

  it('preserves exits suppression (exits is a known field, not attr)', () => {
    const toml = `
[[locations]]
id = "test"
name = "Test"
type = "test"
exits = [{ target = "foo", name = "去foo" }]
`
    const data = parse(toml) as any
    const loc = data.locations[0]
    const attrs: Record<string, any> = {}
    for (const key of Object.keys(loc)) {
      if (!KNOWN.has(key)) attrs[key] = loc[key]
    }
    // exits should NOT be in attrs
    expect(attrs.exits).toBeUndefined()
  })
})
