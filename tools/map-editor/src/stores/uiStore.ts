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
