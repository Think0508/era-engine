<script setup lang="ts">
import { ref, computed, watch, nextTick, markRaw } from 'vue'
import { VueFlow, type Node, type Edge, type Connection, type NodeChange, type NodeMouseEvent, type EdgeMouseEvent, MarkerType } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useMapStore } from '../stores/mapStore'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useUiStore } from '../stores/uiStore'
import LocationNode from './LocationNode.vue'
import ContextMenu from './ContextMenu.vue'

const mapStore = useMapStore()
const ui = useUiStore()
const nodeTypes = { location: markRaw(LocationNode) }

const flowNodes = computed<Node[]>(() => {
  // Force re-compute on data mutations AND display toggle
  mapStore.nodeVersionRef
  ui.showIdOnNode
  ui.levelColors
  // Calculate hierarchy level for each node
  const levelCache = new Map<string, number>()
  function calcLevel(id: string): number {
    const cached = levelCache.get(id)
    if (cached !== undefined) return cached
    const node = mapStore.nodes.find(n => n.id === id)
    if (!node || !node.parent) return 1
    const lv = calcLevel(node.parent) + 1
    levelCache.set(id, lv)
    return lv
  }
  for (const n of mapStore.nodes) calcLevel(n.id)

  return mapStore.nodes.map(n => {
    const plain = JSON.parse(JSON.stringify(n))
    // Apply visibility style — also bump version on every render to force re-render
    const style: Record<string, any> = {}
    if (!n.visible) { style.opacity = 0.35; style.borderStyle = 'dashed' }
    return {
      id: n.id,
      type: 'location',
      position: { x: n.position.x, y: n.position.y },
      style,
      data: {
        ...plain,
        level: levelCache.get(n.id) ?? 1,
      },
    }
  })
})

const flowEdges = computed<Edge[]>(() =>
  mapStore.edges.map(e => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: 'default',
    data: JSON.parse(JSON.stringify(e)),
    markerEnd: e.direction === 'directed' || e.direction === 'bidirectional'
      ? { type: MarkerType.ArrowClosed } : undefined,
    markerStart: e.direction === 'reverse' || e.direction === 'bidirectional'
      ? { type: MarkerType.ArrowClosed } : undefined,
    style: e.condition
      ? { strokeDasharray: '5,5', stroke: '#eab308' }
      : { stroke: '#666' },
  }))
)

const vueFlowStore = ref<any>(null)
const contextMenu = ref<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null)
const displayKey = ref(0)
watch(() => [ui.showIdOnNode, ui.levelColors], () => { displayKey.value++ })
const bgUrl = ref('')
const bgImageSize = ref({ w: 0, h: 0 })

watch(() => mapStore.backgroundPath, (path) => {
  if (path) {
    // If already a data/blob URL (from file input), use as-is
    if (path.startsWith('data:') || path.startsWith('blob:')) {
      bgUrl.value = path
    } else {
      try { bgUrl.value = convertFileSrc(path) } catch { bgUrl.value = path }
    }
  } else {
    bgUrl.value = ''
  }
})

watch(bgUrl, (url) => {
  if (!url) { bgImageSize.value = { w: 0, h: 0 }; return }
  const img = new Image()
  img.onload = () => {
    bgImageSize.value = { w: img.naturalWidth, h: img.naturalHeight }
    mapStore.bgImageWidth = img.naturalWidth
    mapStore.bgImageHeight = img.naturalHeight
  }
  img.src = url
})

let edgeCounter = 0
let paneClickTimer: ReturnType<typeof setTimeout> | null = null
const SNAP_DISTANCE = 60

function nextNodeId(prefix: string): string {
  let n = 0
  while (mapStore.nodes.some(node => node.id === `${prefix}${n}`)) n++
  return `${prefix}${n}`
}

function onNodeClick({ node }: { node: Node }) {
  if (paneClickTimer) { clearTimeout(paneClickTimer); paneClickTimer = null }
  applyRename()
  ui.selectNode(node.id)
}

function onEdgeClick({ edge }: { edge: Edge }) {
  applyRename()
  ui.selectEdge(edge.id)
}

function onPaneClick(event: MouseEvent) {
  if (mapStore.drawingZone) return
  applyRename()
  if (paneClickTimer) {
    clearTimeout(paneClickTimer)
    paneClickTimer = null
    createRootNode(event)
  } else {
    paneClickTimer = setTimeout(() => {
      paneClickTimer = null
      ui.clearSelection()
    }, 500)
  }
}

function createRootNode(event: MouseEvent) {
  if (paneClickTimer) { clearTimeout(paneClickTimer); paneClickTimer = null }
  if (!vueFlowStore.value) return
  const id = nextNodeId('location_')
  const flowPoint = vueFlowStore.value.screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  mapStore.addNode({
    id,
    name: id,
    type: 'region',
    parent: null,
    tags: [],
    visible: true,
    position: { x: flowPoint.x, y: flowPoint.y },
    collapsed: false,
  })
  if (paneClickTimer) { clearTimeout(paneClickTimer); paneClickTimer = null }
  ui.selectNode(id)
}

const renameInput = ref<HTMLInputElement | null>(null)
let renameOrigin = ''   // original name before inline edit
let renaming = false    // currently in inline rename mode

function startRename() {
  if (!ui.selectedNodeId) return
  const node = mapStore.nodes.find(n => n.id === ui.selectedNodeId)
  if (!node) return
  renameOrigin = node.name
  renaming = true
  // Focus hidden input on next tick (after Vue processes the template)
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.value = node.name
      renameInput.value.focus()
      renameInput.value.select()
    }
  })
}

function applyRename() {
  if (!ui.selectedNodeId) return
  const val = renameInput.value?.value ?? ''
  mapStore.updateNode(ui.selectedNodeId, { name: val || renameOrigin })
  renaming = false
}

function revertRename() {
  if (ui.selectedNodeId) mapStore.updateNode(ui.selectedNodeId, { name: renameOrigin })
  renaming = false
  if (renameInput.value) renameInput.value.blur()
}

function onRenameInput(event: Event) {
  if (!renaming || !ui.selectedNodeId) return
  mapStore.updateNode(ui.selectedNodeId, { name: (event.target as HTMLInputElement).value })
}

function onRenameKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') { applyRename(); return }
  if (event.key === 'Escape') { revertRename(); return }
}

function onKeyDown(event: KeyboardEvent) {
  // If renaming, redirect keyboard events to the hidden input
  if (renaming) {
    renameInput.value?.focus()
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (ui.selectedNodeId) {
      event.preventDefault()
      mapStore.removeNode(ui.selectedNodeId)
      ui.clearSelection()
      return
    }
    if (ui.selectedEdgeId) {
      event.preventDefault()
      mapStore.removeEdge(ui.selectedEdgeId)
      ui.clearSelection()
      return
    }
  }

  // Printable or function key on selected node → start rename
  if (event.key.length === 1 && ui.selectedNodeId && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault()
    startRename()
    // Dispatch the pressed key to the hidden input
    if (renameInput.value) {
      renameInput.value.value = event.key
      // Trigger input event so onRenameInput updates the node
      renameInput.value.dispatchEvent(new Event('input', { bubbles: true }))
    }
    return
  }

  if (event.key === 'Tab' && ui.selectedNodeId) {
    event.preventDefault()
    const parent = mapStore.nodes.find(n => n.id === ui.selectedNodeId)
    if (!parent) return
    const id = nextNodeId(`${parent.id}_child_`)
    mapStore.addNode({
      id,
      name: id,
      type: 'area',
      parent: parent.id,
      tags: [],
      visible: true,
      position: { x: parent.position.x + 80, y: parent.position.y + 80 },
      collapsed: false,
    })
    mapStore.addEdge({
      id: `edge_p_${id}`,
      from: parent.id,
      to: id,
      timeCost: 5,
      direction: 'bidirectional',
    })
    if (paneClickTimer) { clearTimeout(paneClickTimer); paneClickTimer = null }
    ui.selectNode(id)
  }
}

const bgFileInput = ref<HTMLInputElement | null>(null)

function onCanvasDragOver(event: DragEvent) { event.preventDefault() }

function onCanvasDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = () => { bgUrl.value = reader.result as string }
    reader.readAsDataURL(file)
  }
}

// Background image: read file as base64 data URL
function onBgFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    bgUrl.value = reader.result as string
  }
  reader.readAsDataURL(file)
  input.value = ''
}

// Click zone drawing — stores screen coords for preview, flow coords for saving
const drawStartScreen = ref<{ x: number; y: number } | null>(null)
const drawCurrentScreen = ref<{ x: number; y: number } | null>(null)

function onPaneMouseDown(event: MouseEvent) {
  if (!mapStore.drawingZone || !mapStore.drawTargetNodeId || !vueFlowStore.value) return
  drawStartScreen.value = { x: event.clientX, y: event.clientY }
  drawCurrentScreen.value = { x: event.clientX, y: event.clientY }
}

function onPaneMouseMove(event: MouseEvent) {
  if (!drawStartScreen.value || !vueFlowStore.value) return
  drawCurrentScreen.value = { x: event.clientX, y: event.clientY }
}

function onPaneMouseUp() {
  if (!drawStartScreen.value || !drawCurrentScreen.value || !mapStore.drawTargetNodeId || !vueFlowStore.value) {
    drawStartScreen.value = null; drawCurrentScreen.value = null; return
  }
  // Save using flow coordinates (for proportional conversion on export)
  const startFlow = vueFlowStore.value.screenToFlowCoordinate(drawStartScreen.value)
  const endFlow = vueFlowStore.value.screenToFlowCoordinate(drawCurrentScreen.value)
  const x = Math.min(startFlow.x, endFlow.x)
  const y = Math.min(startFlow.y, endFlow.y)
  const w = Math.abs(endFlow.x - startFlow.x)
  const h = Math.abs(endFlow.y - startFlow.y)
  if (w > 5 && h > 5) {
    const node = mapStore.nodes.find(n => n.id === mapStore.drawTargetNodeId)
    if (node) {
      const attrs = (node as any).attrs ?? {}
      const zones = [...(attrs.clickZones ?? [])]
      const bg = bgImageSize.value
      if (bg.w > 0 && bg.h > 0) {
        zones.push({ x: x / bg.w, y: y / bg.h, w: w / bg.w, h: h / bg.h })
      } else {
        zones.push({ x, y, w, h })
      }
      mapStore.updateNode(mapStore.drawTargetNodeId, { attrs: { ...attrs, clickZones: zones } })
    }
  }
  drawStartScreen.value = null
  drawCurrentScreen.value = null
  mapStore.stopDrawZone()
  // Re-select the node after drawing
  if (mapStore.drawTargetNodeId) ui.selectNode(mapStore.drawTargetNodeId)
}

function getDrawStyle() {
  if (!drawStartScreen.value || !drawCurrentScreen.value) return {}
  const x = Math.min(drawStartScreen.value.x, drawCurrentScreen.value.x)
  const y = Math.min(drawStartScreen.value.y, drawCurrentScreen.value.y)
  const w = Math.abs(drawCurrentScreen.value.x - drawStartScreen.value.x)
  const h = Math.abs(drawCurrentScreen.value.y - drawStartScreen.value.y)
  return { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` }
}

function onConnect(connection: Connection) {
  if (!connection.source || !connection.target) return
  // Prevent duplicate edges between same nodes
  if (mapStore.edges.some(e => e.from === connection.source && e.to === connection.target)) return
  edgeCounter++
  mapStore.addEdge({
    id: `edge_${edgeCounter}`,
    from: connection.source,
    to: connection.target,
    timeCost: 10,
    direction: 'bidirectional',
  })
}

function onEdgeDoubleClick(payload: EdgeMouseEvent) {
  payload.event.preventDefault()
  const current = mapStore.edges.find(e => e.id === payload.edge.id)
  const val = prompt('耗时（分钟）:', String(current?.timeCost ?? 10))
  if (val !== null) {
    const cost = parseInt(val, 10)
    if (!isNaN(cost) && cost >= 0) {
      mapStore.updateEdge(payload.edge.id, { timeCost: cost })
    }
  }
}

function onNodeContextMenu(payload: NodeMouseEvent) {
  payload.event.preventDefault()
  const me = payload.event as MouseEvent
  contextMenu.value = { x: me.clientX, y: me.clientY, nodeId: payload.node.id }
}

function onEdgeContextMenu(payload: EdgeMouseEvent) {
  payload.event.preventDefault()
  const me = payload.event as MouseEvent
  contextMenu.value = { x: me.clientX, y: me.clientY, edgeId: payload.edge.id }
}

function closeContextMenu() {
  contextMenu.value = null
}

function onPaneReady(instance: any) {
  vueFlowStore.value = instance
}

function onNodesChange(changes: NodeChange[]) {
  // Only handle 'remove' type — positions are synced via @node-drag-stop
  for (const change of changes) {
    if (change.type === 'remove') {
      // Node was removed via Vue Flow built-in (e.g., keyboard delete)
    }
  }
}

function onNodeDragStop({ node }: { node: Node }) {
  const draggedId = node.id
  // Save final position from Vue Flow
  const vfNode = vueFlowStore.value?.getNode(draggedId)
  if (vfNode?.position) {
    mapStore.updateNode(draggedId, { position: { x: vfNode.position.x, y: vfNode.position.y } })
  }
  const pos = mapStore.nodes.find(n => n.id === draggedId)?.position
  if (!pos) return
  // Check proximity to other nodes
  for (const other of mapStore.nodes) {
    if (other.id === draggedId) continue
    const dx = other.position.x - pos.x
    const dy = other.position.y - pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < SNAP_DISTANCE) {
      mapStore.updateNode(draggedId, { position: { ...other.position } })
      if (!mapStore.edges.some(e => e.from === draggedId && e.to === other.id)) {
        edgeCounter++
        mapStore.addEdge({
          id: `edge_${edgeCounter}`,
          from: draggedId,
          to: other.id,
          timeCost: 10,
          direction: 'bidirectional',
        })
      }
      break
    }
  }
}
</script>

<template>
  <div
    class="canvas-wrapper"
    tabindex="0"
    @keydown="onKeyDown"
    @click="closeContextMenu"
    :style="{}"
    @dragover.prevent="onCanvasDragOver"
    @drop.prevent="onCanvasDrop"
  >
    <img v-if="mapStore.isModeB && bgUrl" :src="bgUrl" class="map-bg-img" />
    <!-- 注释：绘制点击区域时的矩形预览 -->
    <div
      v-if="drawStartScreen && drawCurrentScreen && mapStore.drawingZone"
      class="draw-zone-preview"
      :style="getDrawStyle()"
    />
    <VueFlow
      :key="displayKey"
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :min-zoom="0.1"
      :max-zoom="3"
      :zoom-on-double-click="false"
      :pan-on-drag="!mapStore.drawingZone"
      @nodes-change="onNodesChange"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @node-drag-stop="onNodeDragStop"
      @connect="onConnect"
      @edge-double-click="onEdgeDoubleClick"
      @pane-click="onPaneClick"
      @pane-ready="onPaneReady"
      @node-context-menu="onNodeContextMenu"
      @edge-context-menu="onEdgeContextMenu"
      @mousedown="onPaneMouseDown"
      @mousemove="onPaneMouseMove"
      @mouseup="onPaneMouseUp"
      @dragover.prevent="onCanvasDragOver"
      @drop.prevent="onCanvasDrop"
    >
      <Background :variant="BackgroundVariant.Dots" :gap="20" />
      <Controls />
    </VueFlow>
    <ContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :node-id="contextMenu.nodeId"
      :edge-id="contextMenu.edgeId"
      @close="closeContextMenu"
    />
    <input
      ref="bgFileInput"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      style="display:none"
      @change="onBgFileSelected"
    />
    <input
      ref="renameInput"
      class="rename-input"
      @input="onRenameInput"
      @keydown="onRenameKeyDown"
      @blur="applyRename"
    />
  </div>
</template>

<style scoped>
.canvas-wrapper { height: 100%; width: 100%; outline: none; position: relative; }
.map-bg-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; z-index: 0; }
.canvas-wrapper :deep(.vue-flow__node) { cursor: pointer; }
.canvas-wrapper :deep(.vue-flow__pane) { z-index: 1; position: relative; }
.rename-input {
  position: fixed; left: -9999px; top: -9999px;
  width: 1px; height: 1px; opacity: 0;
}
.draw-zone-preview {
  position: fixed; border: 2px dashed #3b82f6;
  background: rgba(59,130,246,0.15); pointer-events: none; z-index: 9999;
}
</style>
