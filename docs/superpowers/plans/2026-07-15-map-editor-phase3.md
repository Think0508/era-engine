# Map Editor Phase 3 — Visual Map Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Mode B (visual map) to the editor tool + full-screen visual map to the game engine with background images, click zones, path lines, zoom levels, and sub-map fallback.

**Architecture:** Tool: same canvas, toggleable mode (background image overlay). Engine: `map` mode in mode stack, `MapView.vue` renders layout JSON, `getMapLayout()` API walks parent chain to find nearest layout JSON.

**Tech Stack:** Tool: Vue Flow, Tauri. Engine: Vue 3, core event bus, mode stack.

## Global Constraints

- Mode B is a toggle on the same canvas (not a separate canvas)
- Game-side map mode replaces the current text-based "移动" log entry interaction
- Layout JSON loading walks parent chain up to find the nearest layout file
- No layout JSON found → fallback to text list (current behavior)
- Sub-map loading is mod-controlled (click on node → choose to open sub-map or move)
- Background images are copied alongside layout JSON during export
- Proportional coordinates 0-1 in layout JSON, game converts to pixel coords at render time

---
### Task 1 (Tool): Layout types + store extensions

**Files:**
- Create: `tools/map-editor/src/types/layout.ts`
- Modify: `tools/map-editor/src/stores/mapStore.ts`

**Interfaces:**
- `LayoutNode`: id, x, y, w, h, click_zones[], zoom[]
- `LayoutEdge`: from, to, path[], zoom[]
- `LayoutProject`: version, background?, nodes[], edges[], sub_maps{}, zoom_levels

Add to mapStore: `layoutNodes`, `layoutEdges`, `backgroundPath`, `isModeB`, `toggleModeB()`

### Task 2 (Tool): Mode B toggle + background image

**Files:**
- Modify: `tools/map-editor/src/components/Toolbar.vue`
- Modify: `tools/map-editor/src/components/TopologyCanvas.vue`

Add Mode B toggle button. When toggled, the canvas background switches from dots to the selected image. Support PNG/JPG drag-and-drop to set the background.

### Task 3 (Tool): Proportional coordinate positioning in Mode B

**Files:**
- Modify: `tools/map-editor/src/components/TopologyCanvas.vue`

In Mode B, node positions are stored as proportional (0-1) coordinates relative to the background image dimensions. Dragging a node updates `layoutNodes` instead of `nodes`. UI shows proportional cursor position.

### Task 4 (Tool): Click zone definition

**Files:**
- Create: `tools/map-editor/src/components/ClickZoneOverlay.vue`
- Modify: `tools/map-editor/src/components/NodePanel.vue`

In Mode B, selected node shows rectangle handles on its click zone. Users can drag the rectangle corners to resize. Multiple click zones per node supported. Visual: semi-transparent blue overlay.

### Task 5 (Tool): Path drawing on edges

**Files:**
- Modify: `tools/map-editor/src/components/TopologyCanvas.vue`

In Mode B, double-clicking an edge enters path-drawing mode. Clicking on the canvas adds bezier control points. Esc exits. The path is stored in `layoutEdges[].path` as an array of {x, y} proportional points.

### Task 6 (Tool): Zoom level assignment

**Files:**
- Modify: `tools/map-editor/src/components/NodePanel.vue`
- Modify: `tools/map-editor/src/components/EdgePanel.vue`
- Modify: `tools/map-editor/src/components/Toolbar.vue`

Add zoom level input (min/max) to node and edge property panels. Add a zoom slider to the toolbar. In Mode B, nodes/edges outside the current zoom range are dimmed/hidden.

### Task 7 (Tool): Layout JSON export

**Files:**
- Create: `tools/map-editor/src/utils/layoutExport.ts`
- Modify: `tools/map-editor/src/components/ExportBar.vue`

Export layout/*.json for each area. Copy background image to export directory. Sub-map references recorded.

### Task 8 (Engine): Layout JSON type + mod-loader loading

**Files:**
- Create: `src/core/types.ts` — add `MapLayout` interface
- Modify: `src/core/mod-loader.ts` — load `maps/layout/*.json` into `LoadedMod.layouts`

### Task 9 (Engine): getMapLayout API

**Files:**
- Modify: `src/plugins/map-system/index.ts`

Register `getMapLayout(locationId)` API. Walk parent chain to find the nearest layout JSON. Return the layout data + resolved background path.

### Task 10 (Engine): Map mode

**Files:**
- Create: `src/ui/layout/MapLayout.vue`
- Modify: `src/core/game-context.ts` — handle map mode (already supports mode stack)
- Modify: `src/ui/engine-ui-bridge.ts` — handle map mode transitions

Add `map` mode. When entered, the layout switches to MapLayout (full-screen map view). Has "上一层" / "返回" buttons.

### Task 11 (Engine): MapView.vue rewrite

**Files:**
- Rewrite: `src/ui/components/MapView.vue`

Full rewrite to support: background image, proportional-to-pixel coordinate conversion, click zones (with proper click detection), path lines (bezier curves), zoom controls, fallback to text list when no layout JSON.

### Task 12 (Engine): Move command → map mode

**Files:**
- Modify: `src/plugins/map-system/index.ts`

The "移动" command handler now enters map mode instead of writing a narrative log entry. The old move-code path is removed.
