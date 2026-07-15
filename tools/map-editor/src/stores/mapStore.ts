import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'
import type { MapProject } from '../types/project'

export const useMapStore = defineStore('map', () => {
  const nodes = ref<MapNode[]>([])
  const edges = ref<MapEdge[]>([])
  const projectName = ref('')
  const projectFilePath = ref('')
  const sourcePath = ref('')
  let nodeVersion = 0
  const nodeVersionRef = ref(0)
  const isModeB = ref(false)
  const backgroundPath = ref('')
  const bgImageWidth = ref(1920)
  const bgImageHeight = ref(1080)

  const getChildren = (parentId: string) =>
    nodes.value.filter(n => n.parent === parentId)

  const rootNodes = computed(() => nodes.value.filter(n => !n.parent))

  function addNode(node: MapNode) { nodes.value.push(node); bumpVersion() }
  function updateNode(id: string, data: Partial<MapNode>) {
    const idx = nodes.value.findIndex(n => n.id === id)
    if (idx >= 0) {
      nodes.value[idx] = { ...nodes.value[idx], ...data }
      bumpVersion()
    }
  }
  function bumpVersion() { nodeVersionRef.value = ++nodeVersion }
  function removeNode(id: string) {
    const children = getChildren(id).map(c => c.id)
    for (const childId of children) removeNode(childId)
    edges.value = edges.value.filter(e => e.from !== id && e.to !== id)
    nodes.value = nodes.value.filter(n => n.id !== id)
    bumpVersion()
  }

  function addEdge(edge: MapEdge) { edges.value.push(edge); bumpVersion() }
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
    bumpVersion()
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

  function toggleModeB() { isModeB.value = !isModeB.value }

  const drawingZone = ref(false)
  const drawTargetNodeId = ref<string | null>(null)
  function startDrawZone(nodeId: string) { drawingZone.value = true; drawTargetNodeId.value = nodeId }
  function stopDrawZone() { drawingZone.value = false; drawTargetNodeId.value = null }

  function clear() {
    nodes.value = []
    edges.value = []
    projectName.value = ''
    projectFilePath.value = ''
    sourcePath.value = ''
    bumpVersion()
  }

  return {
    nodes, edges, projectName, projectFilePath, sourcePath,
    nodeVersionRef,
    rootNodes, getChildren,
    addNode, updateNode, removeNode,
    addEdge, updateEdge, removeEdge,
    loadProject, toProject, clear,
    isModeB, backgroundPath, bgImageWidth, bgImageHeight, drawingZone, drawTargetNodeId,
    toggleModeB, startDrawZone, stopDrawZone,
  }
})
