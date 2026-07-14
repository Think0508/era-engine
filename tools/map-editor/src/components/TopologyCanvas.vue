<script setup lang="ts">
import { ref, computed } from 'vue'
import { VueFlow, type Node, type Edge, type Connection, type NodeChange, type NodeMouseEvent, type EdgeMouseEvent, MarkerType } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'
import LocationNode from './LocationNode.vue'
import ContextMenu from './ContextMenu.vue'

const mapStore = useMapStore()
const ui = useUiStore()

const flowNodes = computed<Node[]>(() =>
  mapStore.nodes.map(n => ({
    id: n.id,
    type: 'location',
    position: n.position,
    data: n,
  }))
)

const flowEdges = computed<Edge[]>(() =>
  mapStore.edges.map(e => {
    const hasEnd = e.direction === 'directed' || e.direction === 'bidirectional'
    const hasStart = e.direction === 'reverse' || e.direction === 'bidirectional'
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'default',
      data: e,
      markerEnd: hasEnd ? { type: MarkerType.ArrowClosed } : undefined,
      markerStart: hasStart ? { type: MarkerType.ArrowClosed } : undefined,
      style: e.condition
        ? { strokeDasharray: '5,5', stroke: '#eab308' }
        : { stroke: '#666' },
    }
  })
)

const vueFlowStore = ref<any>(null)
const contextMenu = ref<{ x: number; y: number; nodeId?: string; edgeId?: string } | null>(null)
let edgeCounter = 0
let paneClickTimer: ReturnType<typeof setTimeout> | null = null

function nextNodeId(prefix: string): string {
  let n = 0
  while (mapStore.nodes.some(node => node.id === `${prefix}${n}`)) n++
  return `${prefix}${n}`
}

function onNodeClick({ node }: { node: Node }) {
  ui.selectNode(node.id)
}

function onEdgeClick({ edge }: { edge: Edge }) {
  ui.selectEdge(edge.id)
}

function onPaneClick(event: MouseEvent) {
  if (paneClickTimer) {
    clearTimeout(paneClickTimer)
    paneClickTimer = null
    createRootNode(event)
  } else {
    paneClickTimer = setTimeout(() => {
      paneClickTimer = null
      ui.clearSelection()
    }, 250)
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
}

function onKeyDown(event: KeyboardEvent) {
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
  }
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
  for (const change of changes) {
    if (change.type === 'position' && change.dragging === false) {
      const node = mapStore.nodes.find(n => n.id === change.id)
      if (node && change.position) {
        mapStore.updateNode(change.id, { position: { x: change.position.x, y: change.position.y } })
      }
    }
  }
}
</script>

<template>
  <div class="canvas-wrapper" tabindex="0" @keydown="onKeyDown" @click="closeContextMenu">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="{ location: LocationNode }"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      :min-zoom="0.1"
      :max-zoom="3"
      :zoom-on-double-click="false"
      fit-view-on-init
      @nodes-change="onNodesChange"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @connect="onConnect"
      @edge-double-click="onEdgeDoubleClick"
      @pane-click="onPaneClick"
      @pane-ready="onPaneReady"
      @node-context-menu="onNodeContextMenu"
      @edge-context-menu="onEdgeContextMenu"
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
  </div>
</template>

<style scoped>
.canvas-wrapper { height: 100%; width: 100%; outline: none; }
.canvas-wrapper :deep(.vue-flow__node) { cursor: pointer; }
</style>
