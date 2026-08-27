import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const selectedNodeId = ref<string | null>(null)
  const selectedNodeIds = ref<string[]>([])
  const selectedEdgeId = ref<string | null>(null)
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  const focusNodeId = ref<string | null>(null)
  const breadcrumb = ref<string[]>(['主地图'])
  const showIdOnNode = ref(false)
  const syncNameToId = ref(false)
  const levelColors = ref(true)
  const tagColors = ref<Record<string, string>>({})

  const selectionCount = computed(() => selectedNodeIds.value.length)

  function selectNode(id: string | null) {
    selectedNodeId.value = id
    selectedNodeIds.value = id ? [id] : []
    selectedEdgeId.value = null
  }

  function selectNodes(ids: string[]) {
    selectedNodeIds.value = [...ids]
    selectedNodeId.value = ids.length === 1 ? ids[0] : null
    selectedEdgeId.value = null
  }

  function toggleNodeSelected(id: string) {
    selectedEdgeId.value = null
    if (selectedNodeIds.value.includes(id)) {
      selectedNodeIds.value = selectedNodeIds.value.filter(x => x !== id)
    } else {
      selectedNodeIds.value = [...selectedNodeIds.value, id]
    }
    selectedNodeId.value = selectedNodeIds.value.length === 1 ? selectedNodeIds.value[0] : null
  }

  function selectEdge(id: string | null) {
    selectedEdgeId.value = id
    selectedNodeId.value = null
    selectedNodeIds.value = []
  }

  function clearSelection() {
    selectedNodeId.value = null
    selectedNodeIds.value = []
    selectedEdgeId.value = null
  }

  function setFocus(id: string | null) {
    focusNodeId.value = id
  }

  function toggleShowId() { showIdOnNode.value = !showIdOnNode.value }
  function toggleSyncName() { syncNameToId.value = !syncNameToId.value }
  function toggleLevelColors() { levelColors.value = !levelColors.value }

  return {
    selectedNodeId, selectedNodeIds, selectionCount, selectedEdgeId,
    viewport, focusNodeId, breadcrumb,
    showIdOnNode, syncNameToId, levelColors, tagColors,
    selectNode, selectNodes, toggleNodeSelected, selectEdge, clearSelection,
    setFocus,
    toggleShowId, toggleSyncName, toggleLevelColors,
  }
})