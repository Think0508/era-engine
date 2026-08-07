# Map Editor (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Tauri + Vue Flow map editor tool for visually editing map topology (locations, graph edges, tags) and exporting to game TOML format.

**Architecture:** Tauri v2 desktop app with Vue 3 frontend. Vue Flow renders the node/edge canvas. File operations through Tauri plugin APIs (fs + dialog). No custom Rust commands. Tree auto-layout on import. Export to `export/` subdirectory.

**Tech Stack:** Tauri v2, Vue 3 + TypeScript, Vite, Vue Flow (`@vue-flow/core`), Pinia, `@iarna/toml`

## Global Constraints

- Tool lives in `tools/map-editor/` within the era-engine repo
- No custom Rust commands — use `@tauri-apps/plugin-fs` and `@tauri-apps/plugin-dialog`
- Sub-maps (multi-canvas) are Phase 3 — MVP uses single canvas with folding
- Export writes to `export/` subdirectory (not directly to mod directory)
- Import auto-discovers `../../mods/` but also supports dialog for any directory
- Auto tree layout on import (nodes positioned by parent chain)
- `.mapedit` project file stores canvas viewport, node positions, collapsed state (JSON)
- All game-facing types (LocationData, Edge) are already defined in `src/core/types.ts` — the tool should use its own local copies since it's independent

---
### Task 1: Scaffold Tauri + Vue 3 project

**Files:**
- Create: `tools/map-editor/` (full Tauri project skeleton)

**Interfaces:**
- Produces: Runnable `npm run tauri dev` that opens a window with a Vue 3 app

- [ ] **Step 1: Scaffold with Tauri CLI**

```bash
cd tools
npm create tauri-app@latest map-editor -- --template vue-ts --manager npm
cd map-editor
```

This creates: `src-tauri/`, `src/`, `index.html`, `package.json`, `vite.config.ts`, `tsconfig.json`

- [ ] **Step 2: Install dependencies**

```bash
cd tools/map-editor
npm install @vue-flow/core @vue-flow/background @vue-flow/controls @iarna/toml pinia
npm install @tauri-apps/api @tauri-apps/plugin-fs @tauri-apps/plugin-dialog
```

- [ ] **Step 3: Add Tauri plugin permissions**

Edit `src-tauri/capabilities/default.json` (or create if not exists):

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    "fs:allow-read-dir",
    "fs:allow-exists"
  ]
}
```

Also ensure `src-tauri/Cargo.toml` has the plugin features enabled:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
```

- [ ] **Step 4: Verify dev server starts**

Run: `cd tools/map-editor && npm run tauri dev`
Expected: Tauri window opens with default Vue 3 page (will close immediately — just confirming no build errors)

- [ ] **Step 5: Create directory structure**

```bash
mkdir -p tools/map-editor/src/{components,stores,utils,types}
```

- [ ] **Step 6: Commit**

```bash
git add tools/map-editor/
git commit -m "feat(map-editor): scaffold Tauri + Vue 3 project"
```

---

### Task 2: Types + Pinia store

**Files:**
- Create: `tools/map-editor/src/types/node.ts`
- Create: `tools/map-editor/src/types/edge.ts`
- Create: `tools/map-editor/src/types/project.ts`
- Create: `tools/map-editor/src/stores/mapStore.ts`
- Create: `tools/map-editor/src/stores/uiStore.ts`

**Interfaces:**
- Produces: All TypeScript types and reactive stores used by all subsequent tasks
- `MapNode`: id, name, type, parent, tags, visible, position, collapsed
- `MapEdge`: id, from, to, timeCost, direction, condition
- `MapProject`: metadata, nodes, edges, canvas state
- `mapStore`: project data, CRUD operations for nodes/edges
- `uiStore`: selection, viewport, zoom, active tool

- [ ] **Step 1: Define node types**

`tools/map-editor/src/types/node.ts`:
```typescript
export interface MapNode {
  id: string
  name: string
  type: string
  parent: string | null
  tags: string[]
  visible: boolean
  // canvas state (not exported to TOML)
  position: { x: number; y: number }
  collapsed: boolean
}
```

- [ ] **Step 2: Define edge types**

`tools/map-editor/src/types/edge.ts`:
```typescript
export type EdgeDirection = 'directed' | 'reverse' | 'bidirectional'

export interface MapEdge {
  id: string
  from: string
  to: string
  timeCost: number
  direction: EdgeDirection
  condition?: string
}
```

- [ ] **Step 3: Define project types**

`tools/map-editor/src/types/project.ts`:
```typescript
import type { MapNode } from './node'
import type { MapEdge } from './edge'

export interface MapProject {
  version: number
  name: string
  // source mod path (for re-import)
  sourcePath?: string
  // canvas viewport
  viewport: { x: number; y: number; zoom: number }
  nodes: MapNode[]
  edges: MapEdge[]
}
```

- [ ] **Step 4: Create mapStore**

`tools/map-editor/src/stores/mapStore.ts`:
```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MapNode } from '../types/node'
import type { MapEdge, EdgeDirection } from '../types/edge'
import type { MapProject } from '../types/project'

export const useMapStore = defineStore('map', () => {
  const nodes = ref<MapNode[]>([])
  const edges = ref<MapEdge[]>([])
  const projectName = ref('')
  const projectFilePath = ref('')
  const sourcePath = ref('')

  // Get children of a node
  const getChildren = (parentId: string) =>
    nodes.value.filter(n => n.parent === parentId)

  // Get root nodes (no parent)
  const rootNodes = computed(() => nodes.value.filter(n => !n.parent))

  // CRUD: node
  function addNode(node: MapNode) { nodes.value.push(node) }
  function updateNode(id: string, data: Partial<MapNode>) {
    const idx = nodes.value.findIndex(n => n.id === id)
    if (idx >= 0) Object.assign(nodes.value[idx], data)
  }
  function removeNode(id: string) {
    // Remove children first, then edges, then node
    const children = getChildren(id).map(c => c.id)
    for (const childId of children) removeNode(childId)
    edges.value = edges.value.filter(e => e.from !== id && e.to !== id)
    nodes.value = nodes.value.filter(n => n.id !== id)
  }

  // CRUD: edge
  function addEdge(edge: MapEdge) { edges.value.push(edge) }
  function updateEdge(id: string, data: Partial<MapEdge>) {
    const idx = edges.value.findIndex(e => e.id === id)
    if (idx >= 0) Object.assign(edges.value[idx], data)
  }
  function removeEdge(id: string) {
    edges.value = edges.value.filter(e => e.id !== id)
  }

  function loadProject(project: MapProject) {
    nodes.value = project.nodes
    edges.value = project.edges
    projectName.value = project.name
    sourcePath.value = project.sourcePath ?? ''
  }

  function toProject(): MapProject {
    return {
      version: 1,
      name: projectName.value,
      sourcePath: sourcePath.value,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: nodes.value,
      edges: edges.value,
    }
  }

  function clear() {
    nodes.value = []
    edges.value = []
    projectName.value = ''
    projectFilePath.value = ''
    sourcePath.value = ''
  }

  return {
    nodes, edges, projectName, projectFilePath, sourcePath,
    rootNodes, getChildren,
    addNode, updateNode, removeNode,
    addEdge, updateEdge, removeEdge,
    loadProject, toProject, clear,
  }
})
```

- [ ] **Step 5: Create uiStore**

`tools/map-editor/src/stores/uiStore.ts`:
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const selectedNodeId = ref<string | null>(null)
  const selectedEdgeId = ref<string | null>(null)
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  const breadcrumb = ref<string[]>(['主地图'])

  function selectNode(id: string | null) {
    selectedNodeId.value = id
    selectedEdgeId.value = null
  }
  function selectEdge(id: string | null) {
    selectedEdgeId.value = id
    selectedNodeId.value = null
  }
  function clearSelection() {
    selectedNodeId.value = null
    selectedEdgeId.value = null
  }

  return {
    selectedNodeId, selectedEdgeId, viewport, breadcrumb,
    selectNode, selectEdge, clearSelection,
  }
})
```

- [ ] **Step 6: Commit**

```bash
git add tools/map-editor/src/types/ tools/map-editor/src/stores/
git commit -m "feat(map-editor): add types and Pinia stores"
```

---

### Task 3: TOML import — parse mod directory

**Files:**
- Create: `tools/map-editor/src/utils/tomlImport.ts`

**Interfaces:**
- Consumes: `MapNode`, `MapEdge` types from Task 2
- Produces: `importFromModDir(path: string): { nodes: MapNode[], edges: MapEdge[] }`

- [ ] **Step 1: Write TOML import utility**

```typescript
// tools/map-editor/src/utils/tomlImport.ts
import { parse } from '@iarna/toml'
import type { MapNode } from '../types/node'
import type { MapEdge, EdgeDirection } from '../types/edge'

let nodeIdCounter = 0
function nextNodeId(): string { return `imported_${++nodeIdCounter}` }

// Edge from TOML has: from, to, time_cost, condition?
interface RawEdge {
  from: string
  to: string
  time_cost?: number
  condition?: string
}

export interface ImportResult {
  nodes: MapNode[]
  edges: MapEdge[]
}

export function parseLocationsToml(raw: string, regionId: string): MapNode[] {
  const data = parse(raw) as any
  const entries: any[] = data.locations ?? [data]
  const nodes: MapNode[] = []

  for (const loc of entries) {
    if (!loc.id) continue
    nodes.push({
      id: loc.id,
      name: loc.name ?? loc.id,
      type: loc.type ?? 'unknown',
      parent: loc.parent ?? null,
      tags: loc.tags ?? [],
      visible: loc.visible !== false,
      position: { x: 0, y: 0 },
      collapsed: false,
    })
  }
  return nodes
}

export function parseGraphToml(raw: string): RawEdge[] {
  const data = parse(raw) as any
  return (data.edges as RawEdge[]) ?? []
}

export function edgesToMapEdges(raw: RawEdge[]): MapEdge[] {
  return raw.map((e, i) => ({
    id: `edge_${i}`,
    from: e.from,
    to: e.to,
    timeCost: e.time_cost ?? 10,
    direction: 'bidirectional' as EdgeDirection,
    condition: e.condition,
  }))
}
```

- [ ] **Step 2: Write TOML import test**

`tools/map-editor/src/utils/tomlImport.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { parseLocationsToml, parseGraphToml, edgesToMapEdges } from './tomlImport'

const sampleLocations = `
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
tags = ["has_drink"]
`

const sampleGraph = `
[[edges]]
from = "town_square"
to = "tavern"
time_cost = 5
`

describe('tomlImport', () => {
  it('parses [[locations]] into MapNodes', () => {
    const nodes = parseLocationsToml(sampleLocations, 'test')
    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).toBe('town_square')
    expect(nodes[0].parent).toBeNull()
    expect(nodes[1].parent).toBe('town_square')
    expect(nodes[1].tags).toContain('has_drink')
  })

  it('parses graph [[edges]] into MapEdges', () => {
    const raw = parseGraphToml(sampleGraph)
    const edges = edgesToMapEdges(raw)
    expect(edges).toHaveLength(1)
    expect(edges[0].from).toBe('town_square')
    expect(edges[0].to).toBe('tavern')
    expect(edges[0].timeCost).toBe(5)
  })
})
```

- [ ] **Step 3: Run test**

```bash
cd tools/map-editor && npx vitest run
```

Expected: Tests pass.

- [ ] **Step 4: Commit**

```bash
git add tools/map-editor/src/utils/tomlImport.ts tools/map-editor/src/utils/tomlImport.test.ts
git commit -m "feat(map-editor): add TOML import parser"
```

---

### Task 4: Auto tree layout algorithm

**Files:**
- Create: `tools/map-editor/src/utils/autoLayout.ts`

**Interfaces:**
- Consumes: `MapNode[]` (with parent relationships set, all positions at (0,0))
- Produces: `MapNode[]` with positions set in a tree layout

- [ ] **Step 1: Implement auto layout**

```typescript
// tools/map-editor/src/utils/autoLayout.ts
import type { MapNode } from '../types/node'

const HORIZONTAL_GAP = 250
const VERTICAL_GAP = 100

interface LayoutNode {
  id: string
  width: number
  children: LayoutNode[]
}

function buildTree(nodes: MapNode[]): LayoutNode[] {
  const nodeMap = new Map<string, MapNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  function buildSubTree(parentId: string | null): LayoutNode[] {
    return nodes
      .filter(n => n.parent === parentId)
      .map(n => ({
        id: n.id,
        width: 180,
        children: buildSubTree(n.id),
      }))
  }

  return buildSubTree(null)
}

export function autoLayout(nodes: MapNode[]): MapNode[] {
  const result = nodes.map(n => ({ ...n }))
  const nodeMap = new Map<string, MapNode>()
  for (const n of result) nodeMap.set(n.id, n)

  function layoutSubTree(parentId: string | null, startX: number, y: number): number {
    const children = result.filter(n => n.parent === parentId)
    if (children.length === 0) return startX

    const childWidths = children.map(c => {
      // Calculate subtree width recursively
      const subtreeNodes = result.filter(n => n.parent === c.id)
      if (subtreeNodes.length === 0) return 180
      return subtreeNodes.length * (HORIZONTAL_GAP + 180)
    })
    const totalWidth = childWidths.reduce((a, b) => a + b, 0) + (children.length - 1) * HORIZONTAL_GAP

    let x = startX - totalWidth / 2
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      child.position = { x: x + childWidths[i] / 2, y }
      const nextY = y + VERTICAL_GAP
      layoutSubTree(child.id, x + childWidths[i] / 2, nextY)
      x += childWidths[i] + HORIZONTAL_GAP
    }
    return totalWidth
  }

  layoutSubTree(null, 400, 100)
  return result
}
```

- [ ] **Step 2: Write auto layout test**

```typescript
import { describe, it, expect } from 'vitest'
import { autoLayout } from './autoLayout'
import type { MapNode } from '../types/node'

describe('autoLayout', () => {
  it('positions root node and children', () => {
    const nodes: MapNode[] = [
      { id: 'root', name: 'Root', type: 'region', parent: null, tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'child1', name: 'C1', type: 'city', parent: 'root', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'child2', name: 'C2', type: 'city', parent: 'root', tags: [], visible: true, position: { x: 0, y: 0 }, collapsed: false },
    ]
    const laid = autoLayout(nodes)
    const root = laid.find(n => n.id === 'root')!
    expect(root.position.x).toBeGreaterThan(0)
    expect(root.position.y).toBe(100)
    const children = laid.filter(n => n.parent === 'root')
    expect(children[0].position.y).toBe(200)
    expect(children[0].position.x).not.toBe(children[1].position.x)
  })
})
```

- [ ] **Step 3: Run test**

```bash
cd tools/map-editor && npx vitest run
```

Expected: Tests pass.

- [ ] **Step 4: Commit**

```bash
git add tools/map-editor/src/utils/autoLayout.ts tools/map-editor/src/utils/autoLayout.test.ts
git commit -m "feat(map-editor): add auto tree layout algorithm"
```

---

### Task 5: Vue Flow canvas with custom nodes and edges

**Files:**
- Create: `tools/map-editor/src/components/TopologyCanvas.vue`

**Interfaces:**
- Consumes: `mapStore`, `uiStore`
- Produces: Vue Flow canvas rendering nodes and edges, handling selection/zoom/pan

- [ ] **Step 1: Create TopologyCanvas component**

```vue
<!-- tools/map-editor/src/components/TopologyCanvas.vue -->
<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { VueFlow, useVueFlow, type Node, type Edge, MarkerType } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'
import LocationNode from './LocationNode.vue'
import MapEdge from './MapEdge.vue'

const mapStore = useMapStore()
const ui = useUiStore()

const flowId = 'map-flow'

// Convert MapNode → Vue Flow node
const flowNodes = computed<Node[]>(() =>
  mapStore.nodes.map(n => ({
    id: n.id,
    type: 'location',
    position: n.position,
    data: { node: n },
  }))
)

// Convert MapEdge → Vue Flow edge
const flowEdges = computed<Edge[]>(() =>
  mapStore.edges.map(e => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: 'map-edge',
    data: { edge: e },
    markerEnd: e.direction === 'directed' || e.direction === 'bidirectional'
      ? { type: MarkerType.ArrowClosed } : undefined,
    markerStart: e.direction === 'reverse' || e.direction === 'bidirectional'
      ? { type: MarkerType.ArrowClosed } : undefined,
    style: e.condition
      ? { strokeDasharray: '5,5', stroke: '#eab308' }
      : { stroke: '#666' },
  }))
)

function onNodeClick({ node }: { node: Node }) {
  ui.selectNode(node.id)
}

function onEdgeClick({ edge }: { edge: Edge }) {
  ui.selectEdge(edge.id)
}

function onPaneClick() {
  ui.clearSelection()
}
</script>

<template>
  <VueFlow
    :id="flowId"
    :nodes="flowNodes"
    :edges="flowEdges"
    :node-types="{ location: LocationNode }"
    :edge-types="{ 'map-edge': MapEdge }"
    :default-viewport="{ x: 0, y: 0, zoom: 1 }"
    :min-zoom="0.1"
    :max-zoom="3"
    fit-view-on-init
    @node-click="onNodeClick"
    @edge-click="onEdgeClick"
    @pane-click="onPaneClick"
  >
    <Background :variant="BackgroundVariant.Dots" :gap="20" />
    <Controls />
  </VueFlow>
</template>
```

- [ ] **Step 2: Create custom LocationNode component**

`tools/map-editor/src/components/LocationNode.vue`:
```vue
<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import type { MapNode } from '../types/node'

const props = defineProps<NodeProps<MapNode>>()
const node = props.data as MapNode
</script>

<template>
  <div
    class="location-node"
    :class="{
      invisible: !node.visible,
      collapsed: node.collapsed,
      'has-parent': !!node.parent,
    }"
  >
    <div class="node-name">{{ node.name }}</div>
    <div class="node-type">{{ node.type }}</div>
    <div v-if="node.tags.length > 0" class="node-tags">
      <span v-for="tag in node.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
  </div>
</template>

<style scoped>
.location-node {
  background: #fff;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 150px;
  font-family: sans-serif;
  cursor: pointer;
}
.location-node.invisible { opacity: 0.4; border-style: dashed; }
.location-node.collapsed { border-color: #94a3b8; background: #f1f5f9; }
.location-node:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
.node-name { font-weight: bold; font-size: 14px; }
.node-type { font-size: 11px; color: #64748b; }
.node-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.tag { background: #e2e8f0; padding: 1px 6px; border-radius: 4px; font-size: 10px; }
</style>
```

- [ ] **Step 3: Create custom MapEdge component**

`tools/map-editor/src/components/MapEdge.vue`:
```vue
<script setup lang="ts">
// Placeholder for custom edge rendering
// MVP stays with default Vue Flow edge + marker styling from TopologyCanvas
</script>

<template>
  <!-- Vue Flow renders default styled edge based on markers set in TopologyCanvas -->
</template>
```

- [ ] **Step 4: Wire canvas into App.vue**

`tools/map-editor/src/App.vue` (replace default content):
```vue
<script setup lang="ts">
import TopologyCanvas from './components/TopologyCanvas.vue'
</script>

<template>
  <div class="app-layout">
    <TopologyCanvas />
  </div>
</template>

<style>
html, body, #app { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
.app-layout { height: 100%; width: 100%; }
</style>
```

- [ ] **Step 5: Verify dev server compiles**

```bash
cd tools/map-editor && npm run tauri dev
```

Expected: Window opens with Vue Flow canvas showing background dots and controls. (No nodes yet — we'll populate in Task 6.)

- [ ] **Step 6: Commit**

```bash
git add tools/map-editor/src/components/ tools/map-editor/src/App.vue
git commit -m "feat(map-editor): add Vue Flow canvas with custom node/edge components"
```

---

### Task 6: Node operations — create, delete, rename, toggle visibility

**Files:**
- Modify: `tools/map-editor/src/components/TopologyCanvas.vue`
- Modify: `tools/map-editor/src/stores/mapStore.ts`

**Interfaces:**
- Consumes: `mapStore.addNode`, `mapStore.removeNode`, `mapStore.updateNode`
- Produces: Canvas interactions for node CRUD

- [ ] **Step 1: Handle double-click to create root node**

In `TopologyCanvas.vue`, add:
```typescript
import { useMapStore } from '../stores/mapStore'
const mapStore = useMapStore()

let nodeCounter = 0

function onPaneDoubleClick(event: { clientX: number; clientY: number }) {
  nodeCounter++
  const id = `new_location_${nodeCounter}`
  // Convert screen position to flow position
  const flowPos = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  mapStore.addNode({
    id,
    name: id,
    type: 'region',
    parent: null,
    tags: [],
    visible: true,
    position: { x: flowPos.x, y: flowPos.y },
    collapsed: false,
  })
}
```

Add to template:
```vue
<VueFlow @pane-double-click="onPaneDoubleClick" ...>
```

- [ ] **Step 2: Handle Tab key for child node**

In `TopologyCanvas.vue`:
```typescript
function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Tab' && ui.selectedNodeId) {
    event.preventDefault()
    nodeCounter++
    const parent = mapStore.nodes.find(n => n.id === ui.selectedNodeId)
    if (!parent) return
    const id = `${parent.id}_child_${nodeCounter}`
    mapStore.addNode({
      id,
      name: id,
      type: 'area',
      parent: parent.id,
      tags: [],
      visible: true,
      position: { x: parent.position.x + 100, y: parent.position.y + 100 },
      collapsed: false,
    })
    // Also add a parent→child edge automatically
    mapStore.addEdge({
      id: `edge_parent_${id}`,
      from: parent.id,
      to: id,
      timeCost: 5,
      direction: 'bidirectional',
    })
  }
}
```

Add `tabindex` to canvas wrapper and listen for keydown.

- [ ] **Step 3: Right-click context menu**

Create `tools/map-editor/src/components/ContextMenu.vue`:
```vue
<script setup lang="ts">
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const props = defineProps<{
  x: number
  y: number
  nodeId?: string
  edgeId?: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

function deleteNode() {
  if (props.nodeId) mapStore.removeNode(props.nodeId)
  ui.clearSelection()
  emit('close')
}

function deleteEdge() {
  if (props.edgeId) mapStore.removeEdge(props.edgeId)
  ui.clearSelection()
  emit('close')
}

function toggleVisible() {
  if (props.nodeId) {
    const node = mapStore.nodes.find(n => n.id === props.nodeId)
    if (node) mapStore.updateNode(props.nodeId, { visible: !node.visible })
  }
  emit('close')
}

function rename() {
  if (props.nodeId) {
    const name = prompt('新名称:')
    if (name) mapStore.updateNode(props.nodeId, { name })
  }
  emit('close')
}
</script>

<template>
  <div class="context-menu" :style="{ left: `${props.x}px`, top: `${props.y}px` }" @click.stop>
    <template v-if="nodeId">
      <div class="menu-item" @click="rename">重命名</div>
      <div class="menu-item" @click="toggleVisible">切换显隐</div>
      <div class="menu-item danger" @click="deleteNode">删除节点</div>
    </template>
    <template v-if="edgeId">
      <div class="menu-item" @click="deleteEdge">删除边</div>
    </template>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1000;
  min-width: 120px;
}
.menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}
.menu-item:hover { background: #f0f0f0; }
.menu-item.danger { color: #ef4444; }
</style>
```

- [ ] **Step 4: Wire context menu into TopologyCanvas**

```typescript
const contextMenu = ref<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null)

function onNodeContextMenu(event: MouseEvent, node: Node) {
  event.preventDefault()
  contextMenu.value = { x: event.clientX, y: event.clientY, nodeId: node.id }
}

function onEdgeContextMenu(event: MouseEvent, edge: Edge) {
  event.preventDefault()
  contextMenu.value = { x: event.clientX, y: event.clientY, edgeId: edge.id }
}

function closeContextMenu() {
  contextMenu.value = null
}
```

- [ ] **Step 5: Commit**

```bash
git add tools/map-editor/src/components/TopologyCanvas.vue tools/map-editor/src/components/ContextMenu.vue tools/map-editor/src/components/LocationNode.vue
git commit -m "feat(map-editor): node operations — create, delete, rename, toggle visibility"
```

---

### Task 7: Edge operations — drag-connect, time cost, direction toggle

**Files:**
- Modify: `tools/map-editor/src/components/TopologyCanvas.vue`
- Modify: `tools/map-editor/src/stores/mapStore.ts`

**Interfaces:**
- Consumes: `mapStore.addEdge`, `mapStore.updateEdge`
- Produces: Drag-to-connect, double-click for time cost, right-click direction toggle

- [ ] **Step 1: Add connect handler**

In `TopologyCanvas.vue`:
```typescript
import { type Connection } from '@vue-flow/core'

let edgeCounter = 0

function onConnect(connection: Connection) {
  if (!connection.source || !connection.target) return
  edgeCounter++
  mapStore.addEdge({
    id: `edge_${edgeCounter}`,
    from: connection.source,
    to: connection.target,
    timeCost: 10,
    direction: 'bidirectional',
  })
}
```

Add to template:
```vue
<VueFlow @connect="onConnect" ...>
```

- [ ] **Step 2: Double-click edge for time cost**

```typescript
function onEdgeDoubleClick({ edge }: { edge: Edge }) {
  const val = prompt('耗时（分钟）:', String(edge.data?.edge?.timeCost ?? 10))
  if (val !== null) {
    const cost = parseInt(val, 10)
    if (!isNaN(cost) && cost >= 0) {
      mapStore.updateEdge(edge.id, { timeCost: cost })
    }
  }
}
```

Add to template:
```vue
<VueFlow @edge-double-click="onEdgeDoubleClick" ...>
```

- [ ] **Step 3: Right-click direction toggle in context menu**

Add to `ContextMenu.vue`:
```typescript
function toggleDirection() {
  if (props.edgeId) {
    const edge = mapStore.edges.find(e => e.id === props.edgeId)
    if (!edge) return
    const next: Record<string, string> = {
      bidirectional: 'directed',
      directed: 'reverse',
      reverse: 'bidirectional',
    }
    mapStore.updateEdge(props.edgeId, { direction: next[edge.direction] as any })
  }
  emit('close')
}
```

- [ ] **Step 4: Update context menu template**

```vue
<template v-if="edgeId">
  <div class="menu-item" @click="toggleDirection">切换方向</div>
  <div class="menu-item danger" @click="deleteEdge">删除边</div>
</template>
```

- [ ] **Step 5: Commit**

```bash
git add tools/map-editor/src/components/ tools/map-editor/src/stores/
git commit -m "feat(map-editor): edge operations — drag-connect, time cost, direction toggle"
```

---

### Task 8: Property panels (NodePanel + EdgePanel)

**Files:**
- Create: `tools/map-editor/src/components/NodePanel.vue`
- Create: `tools/map-editor/src/components/EdgePanel.vue`

**Interfaces:**
- Consumes: `uiStore.selectedNodeId`, `uiStore.selectedEdgeId`, `mapStore` CRUD
- Produces: Right sidebar property editing

- [ ] **Step 1: Create NodePanel**

```vue
<!-- tools/map-editor/src/components/NodePanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const node = computed(() =>
  mapStore.nodes.find(n => n.id === ui.selectedNodeId) ?? null
)

function update(field: string, value: any) {
  if (!node.value) return
  mapStore.updateNode(node.value.id, { [field]: value })
}
</script>

<template>
  <div v-if="node" class="panel">
    <h3>节点属性</h3>
    <label>ID <input :value="node.id" @change="e => update('id', (e.target as HTMLInputElement).value)" /></label>
    <label>名称 <input :value="node.name" @change="e => update('name', (e.target as HTMLInputElement).value)" /></label>
    <label>类型 <input :value="node.type" @change="e => update('type', (e.target as HTMLInputElement).value)" /></label>
    <label>父节点 <input :value="node.parent ?? ''" @change="e => update('parent', (e.target as HTMLInputElement).value || null)" /></label>
    <label>
      <input type="checkbox" :checked="node.visible" @change="e => update('visible', (e.target as HTMLInputElement).checked)" />
      可见
    </label>
    <div class="tag-section">
      <label>标签</label>
      <div class="tag-list">
        <span v-for="tag in node.tags" :key="tag" class="tag">
          {{ tag }} <span class="tag-remove" @click="update('tags', node.tags.filter((t: string) => t !== tag))">×</span>
        </span>
      </div>
      <input
        placeholder="添加标签..."
        @keydown.enter="e => { const v = (e.target as HTMLInputElement).value.trim(); if (v) update('tags', [...node.tags, v]); (e.target as HTMLInputElement).value = '' }"
      />
    </div>
  </div>
  <div v-else class="panel panel-empty">
    <p>未选中节点</p>
  </div>
</template>

<style scoped>
.panel { padding: 12px; font-size: 13px; }
.panel h3 { margin: 0 0 12px; font-size: 14px; }
.panel label { display: block; margin-bottom: 8px; }
.panel input[type="text"], .panel input:not([type="checkbox"]) { width: 100%; box-sizing: border-box; padding: 4px 8px; }
.tag-section { margin-top: 8px; }
.tag-list { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.tag { background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-remove { cursor: pointer; margin-left: 4px; color: #ef4444; }
.panel-empty { color: #94a3b8; text-align: center; padding-top: 40px; }
</style>
```

- [ ] **Step 2: Create EdgePanel**

```vue
<!-- tools/map-editor/src/components/EdgePanel.vue -->
<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const edge = computed(() =>
  mapStore.edges.find(e => e.id === ui.selectedEdgeId) ?? null
)

function update(field: string, value: any) {
  if (!edge.value) return
  mapStore.updateEdge(edge.value.id, { [field]: value })
}

const dirLabel: Record<string, string> = {
  bidirectional: '双向',
  directed: '单向 A→B',
  reverse: '单向 B→A',
}
</script>

<template>
  <div v-if="edge" class="panel">
    <h3>边属性</h3>
    <label>起点 <input :value="edge.from" disabled /></label>
    <label>终点 <input :value="edge.to" disabled /></label>
    <label>耗时（分钟） <input type="number" :value="edge.timeCost" @change="e => update('timeCost', parseInt((e.target as HTMLInputElement).value, 10))" /></label>
    <label>方向
      <select :value="edge.direction" @change="e => update('direction', (e.target as HTMLSelectElement).value)">
        <option value="bidirectional">双向</option>
        <option value="directed">单向 A→B</option>
        <option value="reverse">单向 B→A</option>
      </select>
    </label>
    <label>条件
      <textarea :value="edge.condition ?? ''" rows="2" @change="e => update('condition', (e.target as HTMLTextAreaElement).value || undefined)" />
    </label>
  </div>
  <div v-else class="panel panel-empty">
    <p>未选中边</p>
  </div>
</template>

<style scoped>
.panel { padding: 12px; font-size: 13px; }
.panel h3 { margin: 0 0 12px; font-size: 14px; }
.panel label { display: block; margin-bottom: 8px; }
.panel input, .panel select, .panel textarea { width: 100%; box-sizing: border-box; padding: 4px 8px; }
.panel textarea { resize: vertical; font-family: monospace; font-size: 12px; }
.panel-empty { color: #94a3b8; text-align: center; padding-top: 40px; }
</style>
```

- [ ] **Step 3: Wire panels into App.vue (3-column layout)**

```vue
<script setup lang="ts">
import TopologyCanvas from './components/TopologyCanvas.vue'
import NodePanel from './components/NodePanel.vue'
import EdgePanel from './components/EdgePanel.vue'
import TagPool from './components/TagPool.vue'
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar-left">
      <TagPool />
    </aside>
    <main class="canvas-area">
      <TopologyCanvas />
    </main>
    <aside class="sidebar-right">
      <NodePanel />
      <EdgePanel />
    </aside>
  </div>
</template>

<style>
html, body, #app { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
.app-layout { display: flex; height: 100%; }
.sidebar-left { width: 200px; border-right: 1px solid #e2e8f0; overflow-y: auto; }
.canvas-area { flex: 1; position: relative; }
.sidebar-right { width: 280px; border-left: 1px solid #e2e8f0; overflow-y: auto; }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add tools/map-editor/src/components/NodePanel.vue tools/map-editor/src/components/EdgePanel.vue tools/map-editor/src/App.vue
git commit -m "feat(map-editor): add property panels for nodes and edges"
```

---

### Task 9: Tag pool management

**Files:**
- Create: `tools/map-editor/src/components/TagPool.vue`
- Modify: `tools/map-editor/src/stores/uiStore.ts`

**Interfaces:**
- Produces: Tag list, create/delete tags, drag tag onto node to assign

- [ ] **Step 1: Create TagPool component**

```vue
<!-- tools/map-editor/src/components/TagPool.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()
const newTag = ref('')

// Collect all unique tags from nodes
const allTags = ref<string[]>([])

function refreshTags() {
  const tagSet = new Set<string>()
  for (const node of mapStore.nodes) {
    for (const tag of node.tags) tagSet.add(tag)
  }
  for (const tag of allTags.value) tagSet.add(tag)
  allTags.value = Array.from(tagSet).sort()
}

function addTag() {
  const t = newTag.value.trim()
  if (t && !allTags.value.includes(t)) {
    allTags.value.push(t)
  }
  newTag.value = ''
}

function removeTag(tag: string) {
  allTags.value = allTags.value.filter(t => t !== tag)
  // Remove tag from all nodes
  for (const node of mapStore.nodes) {
    if (node.tags.includes(tag)) {
      mapStore.updateNode(node.id, { tags: node.tags.filter((t: string) => t !== tag) })
    }
  }
}

function assignTagToSelectedNode(tag: string) {
  if (!ui.selectedNodeId) return
  const node = mapStore.nodes.find(n => n.id === ui.selectedNodeId)
  if (node && !node.tags.includes(tag)) {
    mapStore.updateNode(node.id, { tags: [...node.tags, tag] })
  }
}

// Refresh when selection changes
import { watch } from 'vue'
watch(() => mapStore.nodes.length, refreshTags, { immediate: true })
</script>

<template>
  <div class="tag-pool">
    <h3>Tag 池</h3>
    <div class="tag-list">
      <div
        v-for="tag in allTags"
        :key="tag"
        class="tag-item"
        draggable="true"
        @dragstart="e => e.dataTransfer?.setData('text/plain', tag)"
        @click="assignTagToSelectedNode(tag)"
      >
        {{ tag }}
        <span class="tag-remove" @click.stop="removeTag(tag)">×</span>
      </div>
    </div>
    <div class="tag-input">
      <input
        v-model="newTag"
        placeholder="新 Tag..."
        @keydown.enter="addTag"
      />
    </div>
    <p v-if="ui.selectedNodeId" class="hint">点击 Tag 赋予选中节点</p>
  </div>
</template>

<style scoped>
.tag-pool { padding: 12px; }
.tag-pool h3 { font-size: 14px; margin: 0 0 8px; }
.tag-list { display: flex; flex-direction: column; gap: 4px; }
.tag-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 4px 8px; background: #e2e8f0; border-radius: 4px;
  font-size: 12px; cursor: pointer;
}
.tag-item:hover { background: #cbd5e1; }
.tag-remove { cursor: pointer; color: #ef4444; margin-left: 4px; }
.tag-input { margin-top: 8px; }
.tag-input input { width: 100%; box-sizing: border-box; padding: 4px 8px; }
.hint { font-size: 11px; color: #94a3b8; margin-top: 8px; }
</style>
```

- [ ] **Step 2: Create a tool palette store for tag colors**

`tools/map-editor/src/stores/tagStore.ts` (optional — for tag color tracking):
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useTagStore = defineStore('tags', () => {
  const tagColors = ref<Record<string, string>>({})

  function setColor(tag: string, color: string) {
    tagColors.value[tag] = color
  }

  return { tagColors, setColor }
})
```

- [ ] **Step 3: Commit**

```bash
git add tools/map-editor/src/components/TagPool.vue tools/map-editor/src/stores/tagStore.ts
git commit -m "feat(map-editor): add tag pool management"
```

---

### Task 10: TOML export

**Files:**
- Create: `tools/map-editor/src/utils/tomlExport.ts`

**Interfaces:**
- Consumes: `mapStore.nodes`, `mapStore.edges`
- Produces: TOML strings for locations and graph files, written to `export/` via Tauri fs

- [ ] **Step 1: Write TOML export functions**

```typescript
// tools/map-editor/src/utils/tomlExport.ts
import { stringify } from '@iarna/toml'
import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'

export interface ExportResult {
  locationsToml: string  // All locations in one [[locations]] array
  edgesToml: string      // All edges in one [[edges]] array
  locationCount: number
  edgeCount: number
}

export function exportToToml(nodes: MapNode[], edges: MapEdge[]): ExportResult {
  // Build locations TOML
  const locEntries = nodes.map(n => ({
    id: n.id,
    name: n.name,
    type: n.type,
    ...(n.parent ? { parent: n.parent } : {}),
    tags: n.tags,
    ...(n.visible ? {} : { visible: false }),
  }))

  const locationsToml = stringify({ locations: locEntries } as any)

  // Build edges TOML — only export directed edges (not parent-child auto edges)
  // We can decide on criteria: for now, export all edges
  const edgeEntries = edges.map(e => ({
    from: e.from,
    to: e.to,
    time_cost: e.timeCost,
    ...(e.condition ? { condition: e.condition } : {}),
  }))

  const edgesToml = stringify({ edges: edgeEntries } as any)

  return {
    locationsToml,
    edgesToml,
    locationCount: nodes.length,
    edgeCount: edges.length,
  }
}
```

- [ ] **Step 2: Write export test**

```typescript
import { describe, it, expect } from 'vitest'
import { exportToToml } from './tomlExport'
import { parse as parseTOML } from '@iarna/toml'
import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'

describe('tomlExport', () => {
  it('exports nodes to [[locations]] TOML', () => {
    const nodes: MapNode[] = [
      { id: 'huashan', name: '华山', type: 'sect_hq', parent: null, tags: ['sword'], visible: true, position: { x: 0, y: 0 }, collapsed: false },
      { id: 'huashan_inn', name: '华山客栈', type: 'inn', parent: 'huashan', tags: ['rest'], visible: true, position: { x: 0, y: 0 }, collapsed: false },
    ]
    const result = exportToToml(nodes, [])
    const parsed = parseTOML(result.locationsToml) as any
    expect(parsed.locations).toHaveLength(2)
    expect(parsed.locations[0].id).toBe('huashan')
    expect(parsed.locations[1].parent).toBe('huashan')
  })

  it('exports edges to [[edges]] TOML', () => {
    const edges: MapEdge[] = [
      { id: 'e1', from: 'huashan', to: 'huashan_inn', timeCost: 10, direction: 'bidirectional' },
    ]
    const result = exportToToml([], edges)
    const parsed = parseTOML(result.edgesToml) as any
    expect(parsed.edges).toHaveLength(1)
    expect(parsed.edges[0].time_cost).toBe(10)
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd tools/map-editor && npx vitest run
```

Expected: Tests pass.

- [ ] **Step 4: Create ExportBar component**

`tools/map-editor/src/components/ExportBar.vue`:
```vue
<script setup lang="ts">
import { ref } from 'vue'
import { writeTextFile, createDir } from '@tauri-apps/plugin-fs'
import { useMapStore } from '../stores/mapStore'
import { exportToToml } from '../utils/tomlExport'

const mapStore = useMapStore()
const exportStatus = ref('')

async function handleExport() {
  try {
    const result = exportToToml(mapStore.nodes, mapStore.edges)
    const exportDir = 'export'

    // Create export directory
    await createDir(exportDir, { recursive: true })
    await createDir(`${exportDir}/maps/locations`, { recursive: true })
    await createDir(`${exportDir}/maps/graph`, { recursive: true })

    // Write locations
    await writeTextFile(`${exportDir}/maps/locations/exported.toml`, result.locationsToml)
    // Write edges
    await writeTextFile(`${exportDir}/maps/graph/exported.toml`, result.edgesToml)

    exportStatus.value = `导出完成：${result.locationCount} 个地点，${result.edgeCount} 条边 → ${exportDir}/`
  } catch (err) {
    exportStatus.value = `导出失败：${err}`
  }
}
</script>

<template>
  <div class="export-bar">
    <button @click="handleExport">导出 TOML</button>
    <span v-if="exportStatus" class="status">{{ exportStatus }}</span>
  </div>
</template>

<style scoped>
.export-bar { display: flex; align-items: center; gap: 12px; }
.export-bar button { padding: 4px 12px; cursor: pointer; }
.status { font-size: 12px; color: #64748b; }
</style>
```

- [ ] **Step 5: Wire ExportBar into App.vue**

- [ ] **Step 6: Commit**

```bash
git add tools/map-editor/src/utils/tomlExport.ts tools/map-editor/src/components/ExportBar.vue
git commit -m "feat(map-editor): add TOML export to export/ directory"
```

---

### Task 11: Project save/load (.mapedit)

**Files:**
- Create: `tools/map-editor/src/utils/projectFile.ts`

**Interfaces:**
- Consumes: `mapStore.toProject()`, `mapStore.loadProject()`
- Produces: Save/load `.mapedit` JSON files via Tauri fs

- [ ] **Step 1: Write project file utils**

```typescript
// tools/map-editor/src/utils/projectFile.ts
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import type { MapProject } from '../types/project'

export async function loadProjectFile(path: string): Promise<MapProject> {
  const raw = await readTextFile(path)
  return JSON.parse(raw) as MapProject
}

export async function saveProjectFile(path: string, project: MapProject): Promise<void> {
  const json = JSON.stringify(project, null, 2)
  await writeTextFile(path, json)
}
```

- [ ] **Step 2: Create FileMenu component**

`tools/map-editor/src/components/FileMenu.vue`:
```vue
<script setup lang="ts">
import { open, save } from '@tauri-apps/plugin-dialog'
import { readDir } from '@tauri-apps/plugin-fs'
import { useMapStore } from '../stores/mapStore'
import { importFromDir } from '../utils/tomlImport'
import { loadProjectFile, saveProjectFile } from '../utils/projectFile'
import { autoLayout } from '../utils/autoLayout'

const mapStore = useMapStore()

async function newProject() {
  mapStore.clear()
  mapStore.projectName = '新地图'
}

async function openProject() {
  const path = await open({
    multiple: false,
    filters: [{ name: 'MapEdit Project', extensions: ['mapedit'] }],
  })
  if (!path) return
  const project = await loadProjectFile(path)
  mapStore.loadProject(project)
  mapStore.projectFilePath = path
}

async function saveProject() {
  let path = mapStore.projectFilePath
  if (!path) {
    path = await save({
      filters: [{ name: 'MapEdit Project', extensions: ['mapedit'] }],
      defaultPath: `${mapStore.projectName || 'untitled'}.mapedit`,
    })
  }
  if (!path) return
  await saveProjectFile(path, mapStore.toProject())
  mapStore.projectFilePath = path
}

async function importFromMod() {
  const dir = await open({ directory: true, multiple: false })
  if (!dir) return
  // Try to find maps/ subdirectory
  const entries = await readDir(dir)
  const mapsDir = entries.find(e => e.name === 'maps')
  if (!mapsDir) {
    alert('所选目录没有 maps/ 子目录')
    return
  }
  // Import logic — parse TOML files
  const { nodes, edges } = await importFromDir(`${dir}/maps`)
  const laid = autoLayout(nodes)
  mapStore.clear()
  for (const n of laid) mapStore.addNode(n)
  for (const e of edges) mapStore.addEdge(e)
  mapStore.sourcePath = dir
}
</script>

<template>
  <div class="file-menu">
    <button @click="newProject">新建</button>
    <button @click="openProject">打开项目</button>
    <button @click="saveProject">保存</button>
    <button @click="importFromMod">导入 Mod</button>
  </div>
</template>

<style scoped>
.file-menu { display: flex; gap: 4px; }
.file-menu button { padding: 4px 12px; cursor: pointer; font-size: 13px; }
</style>
```

- [ ] **Step 3: Add `importFromDir` function to tomlImport.ts**

```typescript
// Add to tomlImport.ts
import { readDir, readTextFile } from '@tauri-apps/plugin-fs'

async function readTomlFiles(dir: string): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = []
  async function scan(path: string) {
    const entries = await readDir(path)
    for (const entry of entries) {
      const fullPath = `${path}/${entry.name}`
      if (entry.children) {
        await scan(fullPath)
      } else if (entry.name.endsWith('.toml')) {
        const content = await readTextFile(fullPath)
        results.push({ path: fullPath, content })
      }
    }
  }
  await scan(dir)
  return results
}

export async function importFromDir(mapsDir: string): Promise<ImportResult> {
  const locationsDir = `${mapsDir}/locations`
  const graphDir = `${mapsDir}/graph`

  const allNodes: MapNode[] = []
  const allEdges: MapEdge[] = []

  // Import locations
  try {
    const locFiles = await readTomlFiles(locationsDir)
    for (const { path, content } of locFiles) {
      const regionId = path.split('/').pop()?.replace('.toml', '') ?? 'unknown'
      const nodes = parseLocationsToml(content, regionId)
      allNodes.push(...nodes)
    }
  } catch {
    // locations directory may not exist
  }

  // Import graph edges
  try {
    const graphFiles = await readTomlFiles(graphDir)
    for (const { content } of graphFiles) {
      const raw = parseGraphToml(content)
      const edges = edgesToMapEdges(raw)
      allEdges.push(...edges)
    }
  } catch {
    // graph directory may not exist
  }

  return { nodes: allNodes, edges: allEdges }
}
```

- [ ] **Step 4: Wire FileMenu into App.vue with Toolbar**

- [ ] **Step 5: Commit**

```bash
git add tools/map-editor/src/utils/projectFile.ts tools/map-editor/src/components/FileMenu.vue
git commit -m "feat(map-editor): add project save/load (.mapedit) and mod import"
```

---

### Task 12: UI chrome — toolbar, breadcrumb, status bar

**Files:**
- Create: `tools/map-editor/src/components/Toolbar.vue`
- Create: `tools/map-editor/src/components/Breadcrumb.vue`
- Create: `tools/map-editor/src/components/StatusBar.vue`
- Modify: `tools/map-editor/src/App.vue`

- [ ] **Step 1: Create Toolbar**

```vue
<!-- tools/map-editor/src/components/Toolbar.vue -->
<script setup lang="ts">
import FileMenu from './FileMenu.vue'
import ExportBar from './ExportBar.vue'
</script>

<template>
  <div class="toolbar">
    <FileMenu />
    <div class="spacer" />
    <ExportBar />
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; padding: 4px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; height: 36px; }
.spacer { flex: 1; }
</style>
```

- [ ] **Step 2: Create Breadcrumb**

```vue
<!-- tools/map-editor/src/components/Breadcrumb.vue -->
<script setup lang="ts">
import { useUiStore } from '../stores/uiStore'
const ui = useUiStore()
</script>

<template>
  <div class="breadcrumb">
    <span v-for="(crumb, i) in ui.breadcrumb" :key="i">
      <span v-if="i > 0" class="sep">›</span>
      <span :class="{ active: i === ui.breadcrumb.length - 1 }">{{ crumb }}</span>
    </span>
  </div>
</template>

<style scoped>
.breadcrumb { padding: 4px 12px; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
.sep { margin: 0 6px; }
.active { color: #0f172a; font-weight: bold; }
</style>
```

- [ ] **Step 3: Create StatusBar**

```vue
<!-- tools/map-editor/src/components/StatusBar.vue -->
<script setup lang="ts">
import { useMapStore } from '../stores/mapStore'
const mapStore = useMapStore()
</script>

<template>
  <div class="status-bar">
    <span>{{ mapStore.nodes.length }} 个节点</span>
    <span>{{ mapStore.edges.length }} 条边</span>
    <span v-if="mapStore.projectName">项目：{{ mapStore.projectName }}</span>
  </div>
</template>

<style scoped>
.status-bar { display: flex; gap: 16px; padding: 2px 12px; font-size: 12px; color: #64748b; background: #f8fafc; border-top: 1px solid #e2e8f0; }
</style>
```

- [ ] **Step 4: Final App.vue with full layout**

```vue
<!-- tools/map-editor/src/App.vue -->
<script setup lang="ts">
import Toolbar from './components/Toolbar.vue'
import Breadcrumb from './components/Breadcrumb.vue'
import TopologyCanvas from './components/TopologyCanvas.vue'
import TagPool from './components/TagPool.vue'
import NodePanel from './components/NodePanel.vue'
import EdgePanel from './components/EdgePanel.vue'
import StatusBar from './components/StatusBar.vue'
import ContextMenu from './components/ContextMenu.vue'
</script>

<template>
  <div class="app-layout">
    <Toolbar />
    <Breadcrumb />
    <div class="main-area">
      <aside class="sidebar-left">
        <TagPool />
      </aside>
      <main class="canvas-area">
        <TopologyCanvas />
      </main>
      <aside class="sidebar-right">
        <NodePanel />
        <EdgePanel />
      </aside>
    </div>
    <StatusBar />
  </div>
</template>

<style>
html, body, #app { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; font-family: sans-serif; }
.app-layout { display: flex; flex-direction: column; height: 100%; }
.main-area { display: flex; flex: 1; overflow: hidden; }
.sidebar-left { width: 200px; border-right: 1px solid #e2e8f0; overflow-y: auto; }
.canvas-area { flex: 1; position: relative; }
.sidebar-right { width: 280px; border-left: 1px solid #e2e8f0; overflow-y: auto; }
</style>
```

- [ ] **Step 5: Commit**

```bash
git add tools/map-editor/src/components/Toolbar.vue tools/map-editor/src/components/Breadcrumb.vue tools/map-editor/src/components/StatusBar.vue tools/map-editor/src/App.vue
git commit -m "feat(map-editor): add toolbar, breadcrumb, status bar, full layout"
```

---

### Task 13: Verify end-to-end

**Files:** All project files

- [ ] **Step 1: TypeScript check**

```bash
cd tools/map-editor && npx vue-tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 2: Run all tests**

```bash
cd tools/map-editor && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Manual smoke test**

```bash
cd tools/map-editor && npm run tauri dev
```

Verify:
- Window opens with 3-column layout
- Double-click creates node
- Tab on selected node creates child with edge
- Drag-connect creates edge
- Edit properties in right panel
- Tag pool creates/assigns tags
- Right-click context menu works
- Export writes TOML to export/
- Save/Load .mapedit preserves state
- Import from mod directory loads correctly

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix(map-editor): final verification fixes"
```
