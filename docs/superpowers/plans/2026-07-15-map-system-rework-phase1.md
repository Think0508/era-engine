# Map System Rework — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor map system from location-centric `exits` to parent-chain + graph navigation. Support `[[locations]]` arrays. Remove `exits` field.

**Architecture:** Locations use `parent` chain for default navigation (up to parent, down to children). `maps/graph/*.toml` stores cross-tree edges and shortcuts. `getReachable()` in map-system plugin combines both. `gameContext.moveTo()` becomes a pure movement executor (no reachability logic).

**Tech Stack:** TypeScript, Vitest, @iarna/toml

## Global Constraints

- `LocationData.exits` must be **removed** completely — no deprecated compatibility
- `game-context.ts` must not contain reachability/graph logic (core layer stays clean)
- All reachability logic lives in `map-system` plugin
- Test-mod map data must be migrated to new format
- Existing `exits` in TOML files are silently ignored during loading (not an error, for mod transition)

---

### Task 1: Add Edge type, remove exits from LocationData, add graph to LoadedMod

**Files:**
- Modify: `src/core/types.ts:12-19`
- Modify: `src/core/mod-loader.ts:277-324`

**Interfaces:**
- Consumes: current `LocationData`, `LoadedMod` interfaces
- Produces: updated `LocationData` (no `exits`), new `Edge` type, `LoadedMod.graph: Edge[]`

- [ ] **Step 1: Edit `types.ts` — add `Edge` interface, remove `exits` from `LocationData`**

```typescript
// Add before LocationData
export interface Edge {
  from: string
  to: string
  time_cost: number
  condition?: string
}

// LocationData — remove exits field
export interface LocationData {
  id: string
  name: string
  parent: string | null
  type: string
  tags: string[]
}
```

- [ ] **Step 2: Edit `mod-loader.ts` — add `graph: Edge[]` to `LoadedMod`**

In the `mod: LoadedMod` initializer (around line 423-457), add `graph: []` and update the interface:

```typescript
export interface LoadedMod {
  // ... existing fields ...
  locations: Map<string, LocationData>
  graph: Edge[]
  // ... rest unchanged ...
}
```

And in the object literal (`parseModData` around line 423), add `graph: [],` after `locations: new Map(),`.

- [ ] **Step 3: Run typecheck to verify no breakage from `exits` removal**

Run: `npx vue-tsc --noEmit` or check with `npm run typecheck`
Expected: Errors showing all remaining `exits` references (we'll fix them task by task)

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/core/mod-loader.ts
git commit -m "feat(map): add Edge type, remove exits from LocationData, add graph to LoadedMod"
```

---

### Task 2: Support `[[locations]]` arrays in loadLocations

**Files:**
- Modify: `src/core/mod-loader.ts:360-376`

**Interfaces:**
- Consumes: `rawTomlMap` with `[[locations]]` arrays or single-object locations
- Produces: `Map<string, LocationData>` with all locations flattened

- [ ] **Step 1: Rewrite `loadLocations()`**

```typescript
function loadLocations(
  rawTomlMap: RawTomlMap,
  modName: string,
): Map<string, LocationData> {
  const result = new Map<string, LocationData>()
  const prefix = `/mods/${modName}/maps/locations/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(prefix) || !path.endsWith('.toml')) continue
    const data = parseFile(path, raw) as any
    // Support both [[locations]] array and single-object file
    const entries: any[] = data.locations ?? [data]
    for (const loc of entries) {
      if (!loc.id) {
        throw new Error(`${path}: location 缺少 id 字段`)
      }
      if (loc.parent === undefined) {
        loc.parent = null
      }
      // Silently ignore exits — new format uses parent chain + graph
      delete loc.exits
      result.set(loc.id, loc as LocationData)
    }
  }
  return result
}
```

- [ ] **Step 2: Run existing tests to confirm they fail (due to test-mod still using old format)**

Run: `npx vitest run src/core/mod-loader.test.ts --reporter=verbose`
Expected: Test "parses locations correctly" fails — test-mod data still has single-object format with exits field

- [ ] **Step 3: Commit**

```bash
git add src/core/mod-loader.ts
git commit -m "feat(map): support [[locations]] arrays in loadLocations, silently ignore exits"
```

---

### Task 3: Add graph loading to mod-loader

**Files:**
- Modify: `src/core/mod-loader.ts`

**Interfaces:**
- Consumes: `rawTomlMap` with `/mods/${modName}/maps/graph/*.toml` files
- Produces: `mod.graph: Edge[]`

- [ ] **Step 1: Add `loadGraph()` function**

```typescript
function loadGraph(
  rawTomlMap: RawTomlMap,
  modName: string,
): Edge[] {
  const result: Edge[] = []
  const prefix = `/mods/${modName}/maps/graph/`
  for (const [path, raw] of Object.entries(rawTomlMap)) {
    if (!path.startsWith(prefix) || !path.endsWith('.toml')) continue
    const data = parseFile(path, raw) as any
    const edges = (data.edges as Edge[]) ?? []
    for (const edge of edges) {
      if (!edge.from || !edge.to) {
        throw new Error(`${path}: edge 缺少 from 或 to 字段`)
      }
      result.push(edge)
    }
  }
  return result
}
```

- [ ] **Step 2: Call `loadGraph()` from `parseModData()`**

Insert after line 548 (`mod.locations = loadLocations(...)`):
```typescript
mod.graph = loadGraph(rawTomlMap, modName)
```

- [ ] **Step 3: Add graph validation to `validateLocations()`**

Rename `validateLocations` to also validate graph edges:

```typescript
function validateLocations(mod: LoadedMod, modName: string): void {
  // Validate parent exists (existing logic, keep)
  for (const [id, loc] of mod.locations) {
    if (loc.parent !== null && !mod.locations.has(loc.parent)) {
      throw new Error(
        `mods/${modName}/maps/locations/: 地点 '${id}' 的 parent '${loc.parent}' 不存在`,
      )
    }
  }

  // Validate graph edges reference existing locations
  for (const edge of mod.graph) {
    if (!mod.locations.has(edge.from)) {
      throw new Error(
        `maps/graph/: edge from='${edge.from}' 引用的地点不存在（可用：${[...mod.locations.keys()].slice(0, 5).join(', ')}...）`,
      )
    }
    if (!mod.locations.has(edge.to)) {
      throw new Error(
        `maps/graph/: edge to='${edge.to}' 引用的地点不存在`,
      )
    }
  }

  // Unreachable warning (using parent chain, no exits anymore)
  const referencedByOthers = new Set<string>()
  for (const edge of mod.graph) {
    referencedByOthers.add(edge.to)
  }
  for (const [, loc] of mod.locations) {
    if (loc.parent !== null) {
      referencedByOthers.add(loc.id) // reachable via parent chain
    }
  }
  for (const [id, loc] of mod.locations) {
    if (!referencedByOthers.has(id) && loc.parent === null) {
      console.warn(
        `mods/${modName}/maps/locations/: 地点 '${id}' 不可达（无 graph 边指向它，也无 parent）——可能是设计遗漏`,
      )
    }
  }
}
```

- [ ] **Step 4: Remove old exits-based validation code from `validateLocations`**

Delete the old loops iterating `loc.exits` (lines 824-828 and 831-838).

- [ ] **Step 5: Commit**

```bash
git add src/core/mod-loader.ts
git commit -m "feat(map): add graph loading and validation"
```

---

### Task 4: Register locations into entitySystem from mod-loader

**Files:**
- Modify: `src/core/mod-loader.ts:926-932`

**Interfaces:**
- Consumes: `mod.locations: Map<string, LocationData>`
- Produces: locations registered in `entitySystem` as type `'location'`

- [ ] **Step 1: Extend `registerEntities()` to also register locations**

```typescript
private registerEntities(mod: LoadedMod): void {
  const characters = mod.entities.get('character')
  if (!characters) return
  for (const [id, data] of characters) {
    entitySystem.register('character', id, data)
  }
  // Also register locations so map plugin can query them
  for (const [id, data] of mod.locations) {
    entitySystem.register('location', id, data as any)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/mod-loader.ts
git commit -m "fix(map): register locations into entitySystem during mod loading"
```

---

### Task 5: Refactor game-context.moveTo() — remove reachability logic, accept timeCost

**Files:**
- Modify: `src/core/game-context.ts:83-113`

**Interfaces:**
- Produces: `gameContext.moveTo(targetLocationId, timeCost?)` — no exit check, callers provide timeCost

- [ ] **Step 1: Rewrite `moveTo()`**

```typescript
async moveTo(targetLocationId: string, timeCost?: number): Promise<void> {
  if (!this.location) {
    throw new Error('moveTo 失败：当前地点未设置')
  }
  // timeCost default: 5 minutes
  const cost = timeCost ?? 5
  // Emit leave, advance time, emit enter
  await eventBus.emit('location:leave', { from: this.location.id })
  await this.advanceTime(cost)
  const targetEntity = entitySystem.get('location', targetLocationId)
  if (targetEntity) {
    this.location = targetEntity as unknown as LocationData
  }
  await eventBus.emit('location:enter', { to: targetLocationId })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/game-context.ts
git commit -m "refactor(map): gameContext.moveTo() now takes timeCost param, no exit check"
```

---

### Task 6: Add getReachable() to map-system plugin

**Files:**
- Modify: `src/plugins/map-system/index.ts`

**Interfaces:**
- Produces: `ctx.api.call('map', 'getReachable')` returns `ReachableLocation[]`
- Produces: updated `ctx.api.call('map', 'moveTo')` uses `getReachable` instead of `exits`

- [ ] **Step 1: Add `ReachableLocation` interface and `getReachable()` function**

```typescript
export interface ReachableLocation {
  target: string
  name: string
  time_cost: number
  via: 'parent' | 'child' | 'graph'
}

function getReachable(fromId: string, gc: GameContext): ReachableLocation[] {
  const results: ReachableLocation[] = []
  const fromLoc = entitySystem.get('location', fromId) as any as LocationData
  if (!fromLoc) return results

  // 1. Parent chain: up to parent
  if (fromLoc.parent) {
    const parent = entitySystem.get('location', fromLoc.parent) as any as LocationData
    if (parent) {
      results.push({ target: parent.id, name: parent.name, time_cost: 10, via: 'parent' })
    }
  }

  // 2. Parent chain: down to direct children
  const allLocations = entitySystem.getAll('location')
  for (const loc of allLocations) {
    const l = loc as any as LocationData
    if (l.parent === fromId) {
      results.push({ target: l.id, name: l.name, time_cost: 5, via: 'child' })
    }
  }

  // 3. Graph edges
  // Need access to mod.graph — stored on LoadedMod, accessed via API
  // We'll import modLoader or pass graph via API registration
  const graph = /* get from modLoader.getMod()?.graph ?? [] */ []
  for (const edge of graph) {
    if (edge.from === fromId) {
      if (!edge.condition || evaluateCondition(edge.condition, gc)) {
        const target = entitySystem.get('location', edge.to) as any as LocationData
        if (target) {
          results.push({ target: edge.to, name: target.name, time_cost: edge.time_cost, via: 'graph' })
        }
      }
    }
  }

  return results
}
```

- [ ] **Step 2: Update plugin to import modLoader and use getReachable**

```typescript
import { modLoader } from '../../core/mod-loader'
import { evaluateCondition } from '../../core/condition'
```

- [ ] **Step 3: Register `getReachable` API and update `moveTo` API**

```typescript
// In onEnable, register the API
ctx.api.register('map', {
  // ... existing APIs ...

  getReachable: (locationId?: string): ReachableLocation[] => {
    const id = locationId ?? gameContext.getContext().location?.id
    if (!id) return []
    const gc = gameContext.getContext()
    const mod = modLoader.getMod()
    const graph = mod?.graph ?? []
    return getReachable(id, gc, graph)
  },

  moveTo: async (targetLocationId: string): Promise<void> => {
    const loc = gameContext.getContext().location
    if (!loc) return

    // Calculate time cost from reachability
    const reachable = ctx.api.call('map', 'getReachable', loc.id) as ReachableLocation[]
    const r = reachable.find(r => r.target === targetLocationId)
    const timeCost = r?.time_cost ?? 5

    const target = entitySystem.get('location', targetLocationId) as any as LocationData
    const targetName = target?.name ?? targetLocationId
    narrativeLog.write(`你前往${targetName}...`, 'movement', 'map-system')
    await gameContext.moveTo(targetLocationId, timeCost)
  },
})
```

Wait, `ctx.api.call` on the same namespace during registration won't work well. Let me restructure — precompute reachable list inside `moveTo` directly using the helper function.

- [ ] **Step 4: Write cleaner onEnable with proper internal function reuse**

The moveTo handler should call `getReachable` directly (same module, no API call needed):

```typescript
export function onEnable(ctx: PluginContext): void {
  ctx.api.register('map', {
    getCurrentLocation: (): LocationData | null => {
      return gameContext.getContext().location
    },
    getReachable: (locationId?: string): ReachableLocation[] => {
      const id = locationId ?? gameContext.getContext().location?.id
      if (!id) return []
      const gc = gameContext.getContext()
      const mod = modLoader.getMod()
      return getReachable(id, gc, mod?.graph ?? [])
    },
    getChildren: (locationId: string): LocationData[] => {
      const result: LocationData[] = []
      const all = entitySystem.getAll('location')
      for (const loc of all) {
        if ((loc as any).parent === locationId) {
          result.push(loc as any as LocationData)
        }
      }
      return result
    },
    getAncestors: (locationId: string): LocationData[] => {
      const result: LocationData[] = []
      let current = entitySystem.get('location', locationId) as any as LocationData
      while (current?.parent) {
        const parent = entitySystem.get('location', current.parent) as any as LocationData
        if (!parent) break
        result.push(parent)
        current = parent
      }
      return result
    },
    getLocation: (locationId: string): LocationData | null => {
      return (entitySystem.get('location', locationId) as any as LocationData) ?? null
    },
    hasTag: (locationId: string, tag: string): boolean => {
      const loc = entitySystem.get('location', locationId) as any as LocationData
      return loc?.tags?.includes(tag) ?? false
    },
    moveTo: async (targetLocationId: string): Promise<void> => {
      const loc = gameContext.getContext().location
      if (!loc) return

      const gc = gameContext.getContext()
      const mod = modLoader.getMod()
      const reachable = getReachable(loc.id, gc, mod?.graph ?? [])
      const r = reachable.find(r => r.target === targetLocationId)
      if (!r) {
        throw new Error(`moveTo 失败：从 '${loc.id}' 无法到达 '${targetLocationId}'`)
      }

      const target = entitySystem.get('location', targetLocationId) as any as LocationData
      const targetName = target?.name ?? targetLocationId
      narrativeLog.write(`你前往${targetName}...`, 'movement', 'map-system')
      await gameContext.moveTo(targetLocationId, r.time_cost)
    },
  })

  // Update move command handler
  commandRegistry.unregister('move')
  const moveCmd: CommandDef = {
    id: 'move',
    label: '移动',
    group: 'location_commands',
    modes: ['exploration'],
    priority: 5,
    source: 'plugin:map-system',
    handler: () => {
      const loc = gameContext.getContext().location
      if (!loc) return
      const gc = gameContext.getContext()
      const mod = modLoader.getMod()
      const reachable = getReachable(loc.id, gc, mod?.graph ?? [])
      narrativeLog.write('地图', 'map', 'map-system', true, {
        locationId: loc.id,
        reachable,
      })
    },
  }
  ctx.commands.register(moveCmd)
}
```

- [ ] **Step 5: Commit**

```bash
git add src/plugins/map-system/index.ts
git commit -m "feat(map): add getReachable API, migrate moveTo to use parent+graph"
```

---

### Task 7: Migrate test-mod map data to new format

**Files:**
- Modify: `mods/test-mod/maps/locations/town_square.toml`
- Modify: `mods/test-mod/maps/locations/tavern.toml`
- Create: `mods/test-mod/maps/graph/test.toml`

**Interfaces:**
- Consumes: Existing single-location TOML files
- Produces: `[[locations]]` array format + graph file

- [ ] **Step 1: Convert both locations to a combined file or individual `[[locations]]` files**

Option: Keep two files but use `[[locations]]` array format:

`mods/test-mod/maps/locations/town_square.toml`:
```toml
[[locations]]
id = "town_square"
name = "城镇广场"
type = "town"
tags = ["public"]

[[locations]]
id = "tavern"
name = "酒馆"
parent = "town_square"
type = "building"
tags = ["has_drink", "rest"]
```

`mods/test-mod/maps/locations/tavern.toml`:
```toml
# Removed — tavern is now in town_square.toml
# Keep file empty or delete it
```

Actually, to keep it simple and avoid confusion, let's use ONE locations file:

`mods/test-mod/maps/locations/map.toml`:
```toml
[[locations]]
id = "town_square"
name = "城镇广场"
type = "town"
tags = ["public"]

[[locations]]
id = "tavern"
name = "酒馆"
parent = "town_square"
type = "building"
tags = ["has_drink", "rest"]
```

- [ ] **Step 2: Create graph file**

`mods/test-mod/maps/graph/test.toml`:
```toml
[[edges]]
from = "town_square"
to = "tavern"
time_cost = 5
```

- [ ] **Step 3: Delete old individual files**

Remove `mods/test-mod/maps/locations/town_square.toml` and `mods/test-mod/maps/locations/tavern.toml`.

- [ ] **Step 4: Commit**

```bash
git add mods/test-mod/maps/
git commit -m "test(map): migrate test-mod map data to [[locations]] + graph format"
```

---

### Task 8: Update MapView.vue to use getReachable

**Files:**
- Modify: `src/ui/components/MapView.vue`

**Interfaces:**
- Consumes: `reachable` array (from narrative log payload or API call)
- Produces: Updated view showing reachable locations grouped by via type

- [ ] **Step 1: Update MapView.vue to work with reachable locations**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import GameButton from './GameButton.vue'

const emit = defineEmits<{
  (e: 'move', targetLocationId: string): void
  (e: 'cancel'): void
}>()

const gameStore = useGameStore()

const currentLocation = computed(() => gameStore.location)

// reachable from narrative log payload or store
const reachable = computed(() => (gameStore as any).reachableLocations ?? [])

const groupedReachable = computed(() => {
  const groups: Record<string, { target: string; name: string; time_cost: number }[]> = {
    parent: [],
    child: [],
    graph: [],
  }
  for (const r of reachable.value) {
    if (groups[r.via]) {
      groups[r.via].push(r)
    }
  }
  return groups
})

function moveTo(targetId: string) {
  emit('move', targetId)
}

function cancel() {
  emit('cancel')
}
</script>

<template>
  <div class="map-view">
    <h3 class="map-title">地图</h3>

    <div v-if="currentLocation" class="current-location">
      <span class="location-name">{{ currentLocation.name }}</span>
      <span class="location-type">({{ currentLocation.type }})</span>
    </div>

    <div class="exit-list">
      <div v-if="groupedReachable.parent.length > 0" class="exit-group">
        <div class="exit-header">上层区域：</div>
        <div
          v-for="r in groupedReachable.parent"
          :key="r.target"
          class="exit-item"
          @click="moveTo(r.target)"
        >
          <span class="exit-name">↑ {{ r.name }}</span>
          <span class="exit-time">({{ r.time_cost }}min)</span>
        </div>
      </div>

      <div v-if="groupedReachable.child.length > 0" class="exit-group">
        <div class="exit-header">子区域：</div>
        <div
          v-for="r in groupedReachable.child"
          :key="r.target"
          class="exit-item"
          @click="moveTo(r.target)"
        >
          <span class="exit-name">→ {{ r.name }}</span>
          <span class="exit-time">({{ r.time_cost }}min)</span>
        </div>
      </div>

      <div v-if="groupedReachable.graph.length > 0" class="exit-group">
        <div class="exit-header">路径：</div>
        <div
          v-for="r in groupedReachable.graph"
          :key="r.target"
          class="exit-item"
          @click="moveTo(r.target)"
        >
          <span class="exit-name">→ {{ r.name }}</span>
          <span class="exit-time">({{ r.time_cost }}min)</span>
        </div>
      </div>

      <p v-if="reachable.length === 0" class="no-exits">无可达地点</p>
    </div>

    <div class="map-actions">
      <GameButton label="取消" @click="cancel" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/components/MapView.vue
git commit -m "feat(ui): MapView uses getReachable grouped by parent/child/graph"
```

---

### Task 9: Update all tests

**Files:**
- Modify: `src/core/mod-loader.test.ts`
- Modify: `src/core/game-context.test.ts`
- Modify: `src/plugins/phase-6-integration.test.ts`
- Modify: `src/ui/stores/mock-data.ts`
- Modify: `src/core/condition.test.ts`
- Modify: `src/ui/slots/slot-registry.test.ts`
- Modify: `src/core/mod-loader.ts:821-852` (already done in Task 3)

- [ ] **Step 1: Update `mod-loader.test.ts` location test**

Replace the location parsing test:

```typescript
it('parses locations correctly (2 locations in [[locations]] array, no exits)', () => {
  expect(mod.locations.size).toBe(2)
  const tavern = mod.locations.get('tavern')!
  expect(tavern.name).toBe('酒馆')
  expect(tavern.parent).toBe('town_square')
  expect(tavern.type).toBe('building')
  expect(tavern.tags).toContain('has_drink')
  // exits removed — verify field doesn't exist
  expect((tavern as any).exits).toBeUndefined()
  const square = mod.locations.get('town_square')!
  expect(square.name).toBe('城镇广场')
  expect(square.parent).toBeNull()
  // exits removed
  expect((square as any).exits).toBeUndefined()
})

it('parses graph edges correctly', () => {
  expect(mod.graph).toHaveLength(1)
  expect(mod.graph[0]).toEqual({
    from: 'town_square',
    to: 'tavern',
    time_cost: 5,
  })
})
```

- [ ] **Step 2: Update `game-context.test.ts` moveTo tests**

```typescript
it('moveTo emit location:leave 和 location:enter', async () => {
  entitySystem.clear()
  entitySystem.register('location', 'town', {
    id: 'town', name: '城镇', parent: null, type: 'building', tags: [],
  })
  entitySystem.register('location', 'forest', {
    id: 'forest', name: '森林', parent: null, type: 'field', tags: [],
  })
  gameContext.setLocation(entitySystem.get('location', 'town') as any)

  const leaveHandler = vi.fn()
  const enterHandler = vi.fn()
  eventBus.on('location:leave', leaveHandler)
  eventBus.on('location:enter', enterHandler)

  // moveTo now takes explicit timeCost
  await gameContext.moveTo('forest', 10)

  expect(leaveHandler).toHaveBeenCalledBefore(enterHandler)
  expect(leaveHandler).toHaveBeenCalledWith({ from: 'town' })
  expect(enterHandler).toHaveBeenCalledWith({ to: 'forest' })
  expect(gameContext.getContext().location?.id).toBe('forest')
  expect(gameContext.getContext().time.minute).toBe(10)
})

it('moveTo without timeCost defaults to 5 min', async () => {
  entitySystem.clear()
  entitySystem.register('location', 'town', {
    id: 'town', name: '城镇', parent: null, type: 'building', tags: [],
  })
  entitySystem.register('location', 'forest', {
    id: 'forest', name: '森林', parent: null, type: 'field', tags: [],
  })
  gameContext.setLocation(entitySystem.get('location', 'town') as any)

  await gameContext.moveTo('forest')

  expect(gameContext.getContext().time.minute).toBe(5)
})
```

Remove the "无可达路径时报错" test — `moveTo` no longer validates reachability.

- [ ] **Step 3: Update `phase-6-integration.test.ts`**

Replace `getExits` with `getReachable`:

```typescript
const pluginModules = {
  'map-system': { onLoad: () => {}, onEnable: (ctx: any) => {
    ctx.api.register('map', {
      getCurrentLocation: () => gameContext.getContext().location,
      getReachable: () => {
        const loc = gameContext.getContext().location
        if (!loc) return []
        const children = entitySystem.getAll('location').filter((l: any) => l.parent === loc.id)
        return children.map((l: any) => ({ target: l.id, name: l.name, time_cost: 5, via: 'child' }))
      },
    })
  } },
  // ... character-system unchanged
}
```

Update the test:

```typescript
it('map API getReachable returns children for current location', async () => {
  const reachable = await apiSystem.call('map', 'getReachable')
  expect(reachable.length).toBeGreaterThan(0)
  expect(reachable[0].target).toBe('tavern')
  expect(reachable[0].via).toBe('child')
})
```

- [ ] **Step 4: Update `mock-data.ts` — remove `exits`**

```typescript
export const mockTownSquare: LocationData = {
  id: 'town_square',
  name: '城镇广场',
  parent: null,
  type: 'building',
  tags: ['has_shop'],
}

export const mockTavern: LocationData = {
  id: 'tavern',
  name: '酒馆',
  parent: 'town_square',
  type: 'building',
  tags: ['has_drink'],
}
```

- [ ] **Step 5: Update `condition.test.ts` — remove `exits` from location objects**

```typescript
location: { id: 'tavern', name: '酒馆', parent: null, type: 'building', tags: ['rest', 'has_drink'] },
```

- [ ] **Step 6: Update `slot-registry.test.ts` — remove `exits`**

```typescript
location: { id: 'town', name: '城镇', parent: null, type: 'building', tags: ['has_shop'] },
```

- [ ] **Step 7: Run all tests and fix any remaining issues**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/core/mod-loader.test.ts src/core/game-context.test.ts src/plugins/phase-6-integration.test.ts src/ui/stores/mock-data.ts src/core/condition.test.ts src/ui/slots/slot-registry.test.ts
git commit -m "test(map): update tests for exits removal and new map format"
```

---

### Task 10: Remove duplicate condition fields from map-system plugin.toml

**Files:**
- Modify: `src/plugins/map-system/plugin.toml`

**Note:** `location.id`, `location.type`, `location.parent` are already registered by engine builtins in `condition-registry.ts:11-19`. Remove duplicates from the plugin declaration.

- [ ] **Step 1: Edit plugin.toml — remove duplicate condition_fields**

Remove the `[condition_fields]` section from `plugin.toml` since the engine already provides these.

```toml
# Remove:
# [condition_fields]
# "location.id" = { type = "string", ... }
# "location.type" = { type = "string", ... }
# "location.parent" = { type = "string", ... }
```

- [ ] **Step 2: Commit**

```bash
git add src/plugins/map-system/plugin.toml
git commit -m "chore(map): remove duplicate condition fields (engine already provides)"
```

---

### Task 11: Final verification

**Files:**
- All modified files

- [ ] **Step 1: Run typecheck**

Run: `npx vue-tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run dev server and verify**

Run: `npm run dev`
Expected: Dev server starts without errors

- [ ] **Step 4: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: final verification fixes"
```
