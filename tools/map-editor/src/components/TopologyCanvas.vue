<script setup lang="ts">
import { ref, watch, nextTick, markRaw, onBeforeUnmount } from 'vue'
import { VueFlow, type Node, type Edge, type Connection, type NodeChange, type NodeMouseEvent, type EdgeMouseEvent, MarkerType } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useMapStore } from '../stores/mapStore'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useUiStore } from '../stores/uiStore'
import type { MapNode } from '../types/node'
import LocationNode from './LocationNode.vue'
import BackgroundImage from './BackgroundImage.vue'
import ContextMenu from './ContextMenu.vue'

const mapStore = useMapStore()
const ui = useUiStore()
const nodeTypes = {
  location: markRaw(LocationNode),
}

const renderNodes = ref<Node[]>([])
const renderEdges = ref<Edge[]>([])
const vueFlowStore = ref<any>(null)
const contextMenu = ref<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null)
const bgUrl = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const renamePos = ref({ x: 0, y: 0 })
let renameOrigin = ''
const renaming = ref(false)

let paneClickTimer: ReturnType<typeof setTimeout> | null = null
let windowDrawMouseUpBound = false
const SNAP_DISTANCE = 60

const drawStartScreen = ref<{ x: number; y: number } | null>(null)
const drawCurrentScreen = ref<{ x: number; y: number } | null>(null)
const bgFileInput = ref<HTMLInputElement | null>(null)

watch(() => mapStore.backgroundPath, (path) => {
  if (path) {
    if (path.startsWith('data:') || path.startsWith('blob:')) {
      bgUrl.value = path
    } else {
      try { bgUrl.value = convertFileSrc(path) } catch { bgUrl.value = path }
    }
  } else {
    bgUrl.value = ''
  }
}, { immediate: true })

watch(bgUrl, (url) => {
  const mapId = ui.focusNodeId ?? ''
  if (!url) {
    mapStore.bgImageWidth = 0
    mapStore.bgImageHeight = 0
    const ctx = mapStore.visualMaps[mapId]
    if (ctx) {
      mapStore.visualMaps[mapId] = { ...ctx, bgImageWidth: 0, bgImageHeight: 0 }
    }
    return
  }
  const img = new Image()
  const loadedUrl = url
  img.onload = () => {
    // 只更新当前仍激活的全局尺寸；旧图异步完成时不再覆盖新图上下文
    if (bgUrl.value === loadedUrl) {
      mapStore.bgImageWidth = img.naturalWidth
      mapStore.bgImageHeight = img.naturalHeight
    }
    const ctx = mapStore.visualMaps[mapId] ?? {}
    mapStore.visualMaps[mapId] = { ...ctx, bgImageWidth: img.naturalWidth, bgImageHeight: img.naturalHeight }
    syncRender()
  }
  img.onerror = () => {
    alert('背景图加载失败')
  }
  img.src = url
})

function calcLevel(id: string, cache: Map<string, number>, visiting = new Set<string>()): number {
  const cached = cache.get(id)
  if (cached !== undefined) return cached
  if (visiting.has(id)) return 1
  const node = mapStore.nodes.find(n => n.id === id)
  if (!node || !node.parent) {
    cache.set(id, 1)
    return 1
  }
  visiting.add(id)
  const lv = calcLevel(node.parent, cache, visiting) + 1
  visiting.delete(id)
  cache.set(id, lv)
  return lv
}

function isInFocus(id: string): boolean {
  const focus = ui.focusNodeId
  if (!focus) return true
  if (!mapStore.nodes.some(n => n.id === focus)) return true
  let cur: string | null = id
  const seen = new Set<string>()
  while (cur) {
    if (cur === focus) return true
    if (seen.has(cur)) break
    seen.add(cur)
    cur = mapStore.nodes.find(n => n.id === cur)?.parent ?? null
  }
  return false
}

function isHiddenByCollapse(id: string): boolean {
  const focus = ui.focusNodeId
  let cur = mapStore.nodes.find(n => n.id === id)?.parent ?? null
  const seen = new Set<string>()
  while (cur) {
    if (focus && cur === focus) break
    if (seen.has(cur)) break
    seen.add(cur)
    const node = mapStore.nodes.find(n => n.id === cur)
    if (node?.collapsed) return true
    cur = node?.parent ?? null
  }
  return false
}

function isRenderable(n: MapNode): boolean {
  if (mapStore.isModeB) {
    return n.parent === (ui.focusNodeId ?? null)
  }
  return isInFocus(n.id) && !isHiddenByCollapse(n.id)
}

function plainNode(n: any): any {
  return {
    ...n,
    attrs: n.attrs ? JSON.parse(JSON.stringify(n.attrs)) : undefined,
  }
}

function plainEdge(e: any): any {
  return {
    ...e,
    attrs: e.attrs ? JSON.parse(JSON.stringify(e.attrs)) : undefined,
  }
}

function syncRender() {
  if (ui.focusNodeId && !mapStore.nodes.some(n => n.id === ui.focusNodeId)) {
    ui.setFocus(null)
  }
  const levelCache = new Map<string, number>()
  for (const n of mapStore.nodes) calcLevel(n.id, levelCache)
  const maxLevel = mapStore.isModeB || mapStore.viewport.zoom >= 1 ? Number.POSITIVE_INFINITY : mapStore.viewport.zoom >= 0.5 ? 3 : 2
  const visible = mapStore.nodes.filter(n =>
    (levelCache.get(n.id) ?? 1) <= maxLevel &&
    isRenderable(n)
  )

  const visualMapId = ui.focusNodeId ?? ''
  const visualPositions = mapStore.isModeB
    ? (mapStore.getVisualMapContext(visualMapId).nodePositions ?? {})
    : {}

  const nodes: Node[] = visible.map(n => {
    const plain = plainNode(n)
    const style: Record<string, any> = {}
    if (!n.visible) { style.opacity = 0.35; style.borderStyle = 'dashed' }
    return {
      id: n.id,
      type: 'location',
      position: (mapStore.isModeB && visualPositions[n.id] ? { ...visualPositions[n.id] } : { x: n.position.x, y: n.position.y }),
      style,
      data: {
        ...plain,
        level: levelCache.get(n.id) ?? 1,
      },
    }
  })

  renderNodes.value = nodes

  const visibleIds = new Set(visible.map(n => n.id))
  const edgeList: Edge[] = []
  for (const e of mapStore.edges) {
    if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) continue
    edgeList.push({
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'default',
      data: plainEdge(e),
      markerEnd: e.direction === 'directed' || e.direction === 'bidirectional'
        ? { type: MarkerType.ArrowClosed } : undefined,
      markerStart: e.direction === 'reverse' || e.direction === 'bidirectional'
        ? { type: MarkerType.ArrowClosed } : undefined,
      style: e.condition
        ? { strokeDasharray: '5,5', stroke: '#eab308' }
        : { stroke: '#666' },
    } as Edge)
  }
  renderEdges.value = edgeList
}

watch(
  () => [
    mapStore.nodeVersionRef,
    ui.showIdOnNode,
    ui.levelColors,
    ui.focusNodeId,
    mapStore.isModeB,
    mapStore.viewport.zoom,
    bgUrl.value,
  ],
  syncRender,
  { immediate: true },
)

watch(() => mapStore.projectFilePath, () => {
  const vp = mapStore.viewport
  if (vueFlowStore.value && (vp.x !== 0 || vp.y !== 0 || vp.zoom !== 1)) {
    nextTick(() => vueFlowStore.value?.setViewport(vp))
  }
  if (mapStore.isModeB) {
    const mapId = ui.focusNodeId ?? ''
    mapStore.activateVisualMap(mapId)
        syncRender()
  }
})

watch(() => ui.focusNodeId, (newFocus, oldFocus) => {
  if (mapStore.isModeB) {
    mapStore.stopDrawZone()
    const oldMapId = oldFocus ?? ''
    const newMapId = newFocus ?? ''
    mapStore.saveVisualMapPositions(oldMapId)
    mapStore.activateVisualMap(newMapId)
        syncRender()
  }
})

watch(() => mapStore.isModeB, (on) => {
  const mapId = ui.focusNodeId ?? ''
  if (on) {
    mapStore.activateVisualMap(mapId)
      } else {
    mapStore.stopDrawZone()
    mapStore.saveVisualMapPositions(mapId)
  }
  syncRender()
})

onBeforeUnmount(() => {
  if (paneClickTimer) clearTimeout(paneClickTimer)
  if (windowDrawMouseUpBound) {
    window.removeEventListener('mouseup', onPaneMouseUp)
    windowDrawMouseUpBound = false
  }
})

function nextNodeId(prefix: string): string {
  let n = 0
  while (mapStore.nodes.some(node => node.id === `${prefix}${n}`)) n++
  return `${prefix}${n}`
}

function nextEdgeId(): string {
  let n = 0
  while (mapStore.edges.some(edge => edge.id === `edge_${n}`)) n++
  return `edge_${n}`
}

function onNodeClick({ node, event }: NodeMouseEvent) {
  if (paneClickTimer) { clearTimeout(paneClickTimer); paneClickTimer = null }
  commitRename()
  const me = event as MouseEvent
  if (me.shiftKey || me.ctrlKey || me.metaKey) {
    ui.toggleNodeSelected(node.id)
  } else {
    ui.selectNode(node.id)
  }
}

function onNodeDoubleClick({ node }: { node: Node }) {
  ui.selectNode(node.id)
  startRename()
}

function onEdgeClick({ edge }: { edge: Edge }) {
  commitRename()
  ui.selectEdge(edge.id)
}

function onPaneClick(event: MouseEvent) {
  if (mapStore.drawingZone) return
  commitRename()
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
  const parent = mapStore.isModeB ? ui.focusNodeId : null
  mapStore.addNode({
    id,
    name: id,
    type: 'region',
    parent,
    tags: [],
    visible: true,
    position: { x: flowPoint.x, y: flowPoint.y },
    collapsed: false,
  })
  if (mapStore.isModeB) {
    mapStore.saveVisualMapPositions(ui.focusNodeId ?? '')
  }
  if (paneClickTimer) { clearTimeout(paneClickTimer); paneClickTimer = null }
  ui.selectNode(id)
}

function startRename() {
  if (!ui.selectedNodeId) return
  const node = mapStore.nodes.find(n => n.id === ui.selectedNodeId)
  if (!node) return
  renameOrigin = node.name
  renaming.value = true
  const el = document.querySelector(`[data-id="${ui.selectedNodeId}"]`) as HTMLElement | null
  if (el) {
    const rect = el.getBoundingClientRect()
    renamePos.value = { x: rect.left, y: rect.top }
  }
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.value = renameOrigin
      renameInput.value.focus()
      renameInput.value.select()
    }
  })
}

function commitRename() {
  if (!renaming.value || !ui.selectedNodeId) return
  const val = renameInput.value?.value ?? ''
  if (val && val !== renameOrigin) {
    const node = mapStore.nodes.find(n => n.id === ui.selectedNodeId)
    if (node && ui.syncNameToId && val.trim() && val.trim() !== node.id) {
      if (mapStore.renameNodeId(node.id, val.trim(), val)) {
        if (ui.focusNodeId === node.id) ui.setFocus(val.trim())
        ui.selectNode(val.trim())
      } else {
        mapStore.updateNode(node.id, { name: val })
      }
    } else {
      mapStore.updateNode(ui.selectedNodeId, { name: val })
    }
  }
  renaming.value = false
}

function cancelRename() {
  if (!renaming.value) return
  renaming.value = false
}

function onRenameBlur() {
  commitRename()
}

function onRenameKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') { event.preventDefault(); commitRename(); return }
  if (event.key === 'Escape') { event.preventDefault(); cancelRename(); return }
}

function onRenameInput(_event: Event) {}

function onKeyDown(event: KeyboardEvent) {
  if (renaming.value) {
    renameInput.value?.focus()
    return
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) mapStore.redo()
    else mapStore.undo()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    mapStore.redo()
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (ui.selectedNodeIds.length > 1) {
      event.preventDefault()
      if (confirm(`确定删除选中的 ${ui.selectedNodeIds.length} 个节点及其子树？此操作不可撤销。`)) {
        mapStore.bulkRemoveNodes(ui.selectedNodeIds)
        ui.clearSelection()
      }
      return
    }
    if (ui.selectedNodeId) {
      event.preventDefault()
      if (confirmDeleteNode(ui.selectedNodeId)) {
        mapStore.removeNode(ui.selectedNodeId)
        ui.clearSelection()
      }
      return
    }
    if (ui.selectedEdgeId) {
      event.preventDefault()
      mapStore.removeEdge(ui.selectedEdgeId)
      ui.clearSelection()
      return
    }
  }

  if (event.key === 'F2' && ui.selectedNodeId) {
    event.preventDefault()
    startRename()
    return
  }

  if (event.key === ' ' && ui.selectedNodeId) {
    event.preventDefault()
    startRename()
    return
  }

  if (event.key === 'Tab' && ui.selectedNodeId) {
    event.preventDefault()
    const selected = mapStore.nodes.find(n => n.id === ui.selectedNodeId)
    if (!selected) return
    // Mode B: 新建当前视觉地图的直接子节点（否则会建到不可见的更深层）
    const parent = mapStore.isModeB ? ui.focusNodeId : selected.id
    const parentNode = parent ? mapStore.nodes.find(n => n.id === parent) : null
    const base = parentNode ?? selected
    const id = nextNodeId(`${parent ?? 'location'}_child_`)
    mapStore.addNode({
      id,
      name: id,
      type: 'area',
      parent,
      tags: [],
      visible: true,
      position: { x: base.position.x + 80, y: base.position.y + 80 },
      collapsed: false,
    })
    if (parent) {
      mapStore.addEdge({
        id: `edge_p_${id}`,
        from: parent,
        to: id,
        timeCost: 5,
        direction: 'bidirectional',
      })
    }
    if (mapStore.isModeB) {
      mapStore.saveVisualMapPositions(ui.focusNodeId ?? '')
    }
    if (paneClickTimer) { clearTimeout(paneClickTimer); paneClickTimer = null }
    ui.selectNode(id)
  }
}

function confirmDeleteNode(id: string): boolean {
  const { nodeCount, edgeCount } = mapStore.getSubtreeStats(id)
  const detail = nodeCount > 1 ? `（含 ${nodeCount} 个节点、${edgeCount} 条边）` : `（${edgeCount} 条边）`
  return confirm(`确定删除节点 '${id}' ${detail}？此操作不可撤销。`)
}

function onCanvasDragOver(event: DragEvent) { event.preventDefault() }

function onCanvasDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result as string
      mapStore.bgImageWidth = 0
      mapStore.bgImageHeight = 0
      mapStore.saveVisualMap(ui.focusNodeId ?? '', { backgroundPath: url, bgImageWidth: 0, bgImageHeight: 0 }, true)
      bgUrl.value = url
      mapStore.backgroundPath = url
    }
    reader.onerror = () => alert('图片读取失败，请重试')
    reader.readAsDataURL(file)
  }
}

function onBgFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const url = reader.result as string
    mapStore.bgImageWidth = 0
    mapStore.bgImageHeight = 0
    mapStore.saveVisualMap(ui.focusNodeId ?? '', { backgroundPath: url, bgImageWidth: 0, bgImageHeight: 0 }, true)
    bgUrl.value = url
    mapStore.backgroundPath = url
  }
  reader.onerror = () => alert('图片读取失败，请重试')
  reader.readAsDataURL(file)
  input.value = ''
}

function onPaneMouseDown(event: MouseEvent) {
  if (!mapStore.drawingZone || !mapStore.drawTargetNodeId || !vueFlowStore.value) return
  drawStartScreen.value = { x: event.clientX, y: event.clientY }
  drawCurrentScreen.value = { x: event.clientX, y: event.clientY }
  if (!windowDrawMouseUpBound) {
    window.addEventListener('mouseup', onPaneMouseUp)
    windowDrawMouseUpBound = true
  }
}

function onPaneMouseMove(event: MouseEvent) {
  if (!drawStartScreen.value || !vueFlowStore.value) return
  drawCurrentScreen.value = { x: event.clientX, y: event.clientY }
}

function onPaneMouseUp() {
  if (windowDrawMouseUpBound) {
    window.removeEventListener('mouseup', onPaneMouseUp)
    windowDrawMouseUpBound = false
  }
  if (!drawStartScreen.value || !drawCurrentScreen.value || !mapStore.drawTargetNodeId || !vueFlowStore.value) {
    drawStartScreen.value = null; drawCurrentScreen.value = null; return
  }
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
      const bgW = mapStore.bgImageWidth
      const bgH = mapStore.bgImageHeight
      if (bgW > 0 && bgH > 0) {
        zones.push({ x: x / bgW, y: y / bgH, w: w / bgW, h: h / bgH })
      } else {
        zones.push({ x, y, w, h })
      }
      mapStore.updateNode(mapStore.drawTargetNodeId, { attrs: { ...attrs, clickZones: zones } })
    }
  }
  drawStartScreen.value = null
  drawCurrentScreen.value = null
  mapStore.stopDrawZone()
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
  if (mapStore.edges.some(e => e.from === connection.source && e.to === connection.target)) return
  mapStore.addEdge({
    id: nextEdgeId(),
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
  ui.selectNode(payload.node.id)
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
  const vp = mapStore.viewport
  if (vp.x !== 0 || vp.y !== 0 || vp.zoom !== 1) {
    nextTick(() => instance.setViewport(vp))
  }
}

function onMove({ flowTransform }: { flowTransform: { x: number; y: number; zoom: number } }) {
  mapStore.setViewport({ x: flowTransform.x, y: flowTransform.y, zoom: flowTransform.zoom })
}

function onNodesChange(changes: NodeChange[]) {
  // v-model:nodes handles position changes; only store-level mutations need sync.
  void changes
}

function onNodeDragStop({ node }: { node: Node }) {
  const draggedId = node.id
  const vfNode = vueFlowStore.value?.getNode(draggedId)
  if (vfNode?.position) {
    mapStore.updateNode(draggedId, { position: { x: vfNode.position.x, y: vfNode.position.y } })
  }
  const pos = mapStore.nodes.find(n => n.id === draggedId)?.position
  if (!pos) return
  for (const other of mapStore.nodes) {
    if (other.id === draggedId) continue
    const dx = other.position.x - pos.x
    const dy = other.position.y - pos.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < SNAP_DISTANCE) {
      mapStore.updateNode(draggedId, { position: { ...other.position } })
      if (!mapStore.edges.some(e => e.from === draggedId && e.to === other.id)) {
        mapStore.addEdge({
          id: nextEdgeId(),
          from: draggedId,
          to: other.id,
          timeCost: 10,
          direction: 'bidirectional',
        })
      }
      break
    }
  }
  if (mapStore.isModeB) {
    mapStore.saveVisualMapPositions(ui.focusNodeId ?? '')
  }
}
</script>

<template>
  <div
    class="canvas-wrapper"
    tabindex="0"
    @keydown="onKeyDown"
    @click="closeContextMenu"
    @dragover.prevent="onCanvasDragOver"
    @drop.prevent="onCanvasDrop"
  >
    <div
      v-if="drawStartScreen && drawCurrentScreen && mapStore.drawingZone"
      class="draw-zone-preview"
      :style="getDrawStyle()"
    />
    <VueFlow
      v-model:nodes="renderNodes"
      v-model:edges="renderEdges"
      :node-types="nodeTypes"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :min-zoom="0.1"
      :max-zoom="3"
      :zoom-on-double-click="false"
      :pan-on-drag="!mapStore.drawingZone"
      @nodes-change="onNodesChange"
      @node-click="onNodeClick"
      @node-double-click="onNodeDoubleClick"
      @edge-click="onEdgeClick"
      @node-drag-stop="onNodeDragStop"
      @connect="onConnect"
      @edge-double-click="onEdgeDoubleClick"
      @pane-click="onPaneClick"
      @pane-ready="onPaneReady"
      @move="onMove"
      @node-context-menu="onNodeContextMenu"
      @edge-context-menu="onEdgeContextMenu"
      @mousedown="onPaneMouseDown"
      @mousemove="onPaneMouseMove"
      
      @dragover.prevent="onCanvasDragOver"
      @drop.prevent="onCanvasDrop"
    >
      <BackgroundImage
        v-if="mapStore.isModeB && bgUrl"
        :url="bgUrl"
        :width="mapStore.bgImageWidth"
        :height="mapStore.bgImageHeight"
      />
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
      v-if="renaming"
      class="rename-float"
      :style="{ left: renamePos.x + 'px', top: renamePos.y + 'px' }"
      @input="onRenameInput"
      @keydown="onRenameKeyDown"
      @blur="onRenameBlur"
    />
  </div>
</template>

<style scoped>
.canvas-wrapper { height: 100%; width: 100%; outline: none; position: relative; }
.canvas-wrapper :deep(.vue-flow__node) { cursor: pointer; }
.canvas-wrapper :deep(.vue-flow__pane) { z-index: 1; position: relative; }
.rename-float {
  position: fixed; z-index: 10000;
  width: 160px; padding: 4px 8px;
  font-size: 13px; font-family: sans-serif;
  border: 2px solid #3b82f6; border-radius: 4px;
  background: #fff; outline: none;
}
.draw-zone-preview {
  position: fixed; border: 2px dashed #3b82f6;
  background: rgba(59,130,246,0.15); pointer-events: none; z-index: 999;
}
</style>