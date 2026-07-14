<script setup lang="ts">
import { computed } from 'vue'
import { VueFlow, type Node, type Edge, MarkerType } from '@vue-flow/core'
import { Background, BackgroundVariant } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'
import LocationNode from './LocationNode.vue'

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
  <div class="canvas-wrapper">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="{ location: LocationNode }"
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
  </div>
</template>

<style scoped>
.canvas-wrapper { height: 100%; width: 100%; }
.canvas-wrapper :deep(.vue-flow__node) { cursor: pointer; }
</style>
