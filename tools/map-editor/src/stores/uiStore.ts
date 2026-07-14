import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const selectedNodeId = ref<string | null>(null)
  const selectedEdgeId = ref<string | null>(null)
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  const breadcrumb = ref<string[]>(['主地图'])
  const showIdOnNode = ref(false)
  const syncNameToId = ref(false)
  const levelColors = ref(true)

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

  function toggleShowId() { showIdOnNode.value = !showIdOnNode.value }
  function toggleSyncName() { syncNameToId.value = !syncNameToId.value }
  function toggleLevelColors() { levelColors.value = !levelColors.value }

  return {
    selectedNodeId, selectedEdgeId, viewport, breadcrumb,
    showIdOnNode, syncNameToId, levelColors,
    selectNode, selectEdge, clearSelection,
    toggleShowId, toggleSyncName, toggleLevelColors,
  }
})
