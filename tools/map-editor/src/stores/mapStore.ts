import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { MapNode } from '../types/node'
import type { MapEdge } from '../types/edge'
import type { MapProject, VisualMapContext } from '../types/project'

interface HistorySnapshot {
  nodes: MapNode[]
  edges: MapEdge[]
  projectName: string
  sourcePath: string
  visualMaps: Record<string, VisualMapContext>
  backgroundPath: string
  bgImageWidth: number
  bgImageHeight: number
}

const MAX_HISTORY = 50

export const useMapStore = defineStore('map', () => {
  const nodes = ref<MapNode[]>([])
  const edges = ref<MapEdge[]>([])
  const projectName = ref('')
  const projectFilePath = ref('')
  const sourcePath = ref('')
  const dirty = ref(false)
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  let nodeVersion = 0
  const nodeVersionRef = ref(0)
  const isModeB = ref(false)
  const backgroundPath = ref('')
  const bgImageWidth = ref(1920)
  const bgImageHeight = ref(1080)
  const visualMaps = ref<Record<string, VisualMapContext>>({})
  const drawingZone = ref(false)
  const drawTargetNodeId = ref<string | null>(null)

  const undoStack: HistorySnapshot[] = []
  const redoStack: HistorySnapshot[] = []
  const historyVersion = ref(0)
  const canUndo = computed(() => { historyVersion.value; return undoStack.length > 0 })
  const canRedo = computed(() => { historyVersion.value; return redoStack.length > 0 })

  const getChildren = (parentId: string) =>
    nodes.value.filter(n => n.parent === parentId)

  function getSubtreeStats(id: string): { nodeCount: number; edgeCount: number } {
    const ids = new Set<string>()
    const stack = [id]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (ids.has(cur)) continue
      ids.add(cur)
      for (const n of nodes.value) if (n.parent === cur) stack.push(n.id)
    }
    return {
      nodeCount: ids.size,
      edgeCount: edges.value.filter(e => ids.has(e.from) || ids.has(e.to)).length,
    }
  }

  function collectSubtree(id: string, out: Set<string>): void {
    if (out.has(id)) return
    out.add(id)
    for (const n of nodes.value) if (n.parent === id) collectSubtree(n.id, out)
  }

  function snapshotState(): HistorySnapshot {
    return JSON.parse(JSON.stringify({
      nodes: nodes.value,
      edges: edges.value,
      projectName: projectName.value,
      sourcePath: sourcePath.value,
      visualMaps: visualMaps.value,
      backgroundPath: backgroundPath.value,
      bgImageWidth: bgImageWidth.value,
      bgImageHeight: bgImageHeight.value,
    }))
  }

  function restoreSnapshot(s: HistorySnapshot) {
    nodes.value = s.nodes
    edges.value = s.edges
    projectName.value = s.projectName
    sourcePath.value = s.sourcePath
    visualMaps.value = s.visualMaps
    backgroundPath.value = s.backgroundPath
    bgImageWidth.value = s.bgImageWidth
    bgImageHeight.value = s.bgImageHeight
    dirty.value = true
    bumpVersion()
  }

  function pushHistory() {
    undoStack.push(snapshotState())
    if (undoStack.length > MAX_HISTORY) undoStack.shift()
    redoStack.length = 0
    historyVersion.value++
  }

  function undo() {
    const prev = undoStack.pop()
    if (!prev) return
    redoStack.push(snapshotState())
    restoreSnapshot(prev)
    historyVersion.value++
  }

  function redo() {
    const next = redoStack.pop()
    if (!next) return
    undoStack.push(snapshotState())
    restoreSnapshot(next)
    historyVersion.value++
  }

  const rootNodes = computed(() => nodes.value.filter(n => !n.parent))

  function addNode(node: MapNode) {
    pushHistory()
    nodes.value.push(node)
    dirty.value = true
    bumpVersion()
  }

  function updateNode(id: string, data: Partial<MapNode>) {
    const idx = nodes.value.findIndex(n => n.id === id)
    if (idx >= 0) {
      const oldNode = nodes.value[idx]
      pushHistory()
      if (data.parent !== undefined && oldNode.parent !== data.parent) {
        const oldMapId = oldNode.parent ?? ''
        const ctx = visualMaps.value[oldMapId]
        if (ctx?.nodePositions?.[id]) delete ctx.nodePositions[id]
      }
      nodes.value[idx] = { ...oldNode, ...data }
      dirty.value = true
      bumpVersion()
    }
  }

  function bumpVersion() { nodeVersionRef.value = ++nodeVersion }

  function removeNode(id: string, seen = new Set<string>()) {
    if (seen.has(id)) return
    if (seen.size === 0) pushHistory()
    seen.add(id)
    const children = getChildren(id).map(c => c.id)
    for (const childId of children) removeNode(childId, seen)
    edges.value = edges.value.filter(e => e.from !== id && e.to !== id)
    nodes.value = nodes.value.filter(n => n.id !== id)
    for (const removedId of seen) {
      delete visualMaps.value[removedId]
    }
    for (const ctx of Object.values(visualMaps.value)) {
      for (const removedId of seen) {
        if (ctx.nodePositions && ctx.nodePositions[removedId]) {
          delete ctx.nodePositions[removedId]
        }
      }
    }
    dirty.value = true
    bumpVersion()
  }

  function renameNodeId(oldId: string, newId: string, newName?: string): boolean {
    const trimmed = newId.trim()
    if (!trimmed || trimmed === oldId) return false
    if (nodes.value.some(n => n.id === trimmed)) return false
    pushHistory()
    for (const edge of edges.value) {
      if (edge.from === oldId) edge.from = trimmed
      if (edge.to === oldId) edge.to = trimmed
    }
    for (const child of nodes.value) {
      if (child.parent === oldId) child.parent = trimmed
    }
    for (const ctx of Object.values(visualMaps.value)) {
      if (ctx.nodePositions && ctx.nodePositions[oldId]) {
        ctx.nodePositions[trimmed] = ctx.nodePositions[oldId]
        delete ctx.nodePositions[oldId]
      }
    }
    if (visualMaps.value[oldId]) {
      visualMaps.value[trimmed] = visualMaps.value[oldId]
      delete visualMaps.value[oldId]
    }
    const idx = nodes.value.findIndex(n => n.id === oldId)
    if (idx >= 0) {
      nodes.value[idx] = {
        ...nodes.value[idx],
        id: trimmed,
        ...(newName !== undefined ? { name: newName } : {}),
      }
    }
    dirty.value = true
    bumpVersion()
    return true
  }

  function addEdge(edge: MapEdge) {
    pushHistory()
    edges.value.push(edge)
    dirty.value = true
    bumpVersion()
  }

  function updateEdge(id: string, data: Partial<MapEdge>) {
    const idx = edges.value.findIndex(e => e.id === id)
    if (idx >= 0) {
      pushHistory()
      Object.assign(edges.value[idx], data)
      dirty.value = true
      bumpVersion()
    }
  }

  function removeEdge(id: string) {
    pushHistory()
    edges.value = edges.value.filter(e => e.id !== id)
    dirty.value = true
    bumpVersion()
  }

  function bulkUpdateNodes(ids: string[], data: Partial<MapNode>) {
    const idSet = new Set(ids)
    if (!nodes.value.some(n => idSet.has(n.id))) return
    pushHistory()
    nodes.value = nodes.value.map(n => idSet.has(n.id) ? { ...n, ...data } : n)
    dirty.value = true
    bumpVersion()
  }

  function bulkRemoveNodes(ids: string[]) {
    const toRemove = new Set<string>()
    for (const id of ids) collectSubtree(id, toRemove)
    if (toRemove.size === 0) return
    pushHistory()
    edges.value = edges.value.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to))
    nodes.value = nodes.value.filter(n => !toRemove.has(n.id))
    for (const removedId of toRemove) {
      delete visualMaps.value[removedId]
    }
    for (const ctx of Object.values(visualMaps.value)) {
      for (const removedId of toRemove) {
        if (ctx.nodePositions && ctx.nodePositions[removedId]) {
          delete ctx.nodePositions[removedId]
        }
      }
    }
    dirty.value = true
    bumpVersion()
  }

  function bulkAddTagToNodes(ids: string[], tag: string) {
    const idSet = new Set(ids)
    if (!tag || !nodes.value.some(n => idSet.has(n.id))) return
    pushHistory()
    nodes.value = nodes.value.map(n =>
      idSet.has(n.id) && !n.tags.includes(tag) ? { ...n, tags: [...n.tags, tag] } : n
    )
    dirty.value = true
    bumpVersion()
  }

  function bulkRemoveTagFromNodes(ids: string[], tag: string) {
    const idSet = new Set(ids)
    if (!tag || !nodes.value.some(n => idSet.has(n.id) && n.tags.includes(tag))) return
    pushHistory()
    nodes.value = nodes.value.map(n =>
      idSet.has(n.id) && n.tags.includes(tag) ? { ...n, tags: n.tags.filter(t => t !== tag) } : n
    )
    dirty.value = true
    bumpVersion()
  }

  function importData(newNodes: MapNode[], newEdges: MapEdge[]) {
    pushHistory()
    nodes.value = newNodes
    edges.value = newEdges
    dirty.value = true
    bumpVersion()
  }

  function toggleCollapse(id: string) {
    const node = nodes.value.find(n => n.id === id)
    if (node) updateNode(id, { collapsed: !node.collapsed })
  }

  function setViewport(v: { x: number; y: number; zoom: number }) {
    viewport.value = { ...v }
  }

  function getVisualMapContext(mapId: string): VisualMapContext {
    return visualMaps.value[mapId] ?? {}
  }

  function saveVisualMap(mapId: string, data: Partial<VisualMapContext>, recordHistory = false) {
    if (recordHistory) pushHistory()
    const current = visualMaps.value[mapId] ?? {}
    visualMaps.value[mapId] = { ...current, ...data }
    dirty.value = true
    redoStack.length = 0
    historyVersion.value++
  }

  function saveCurrentVisualMapMeta(mapId: string) {
    saveVisualMap(mapId, {
      backgroundPath: backgroundPath.value || undefined,
      bgImageWidth: bgImageWidth.value,
      bgImageHeight: bgImageHeight.value,
    })
  }

  function mapNodesForVisualMap(mapId: string): MapNode[] {
    const parent = mapId || null
    return nodes.value.filter(n => n.parent === parent)
  }

  function saveVisualMapPositions(mapId: string) {
    const mapNodes = mapNodesForVisualMap(mapId)
    if (mapNodes.length === 0) return
    const positions: Record<string, { x: number; y: number }> = {}
    for (const n of mapNodes) positions[n.id] = { ...n.position }

    const existing = visualMaps.value[mapId]?.nodePositions ?? {}
    let changed = false
    for (const [id, p] of Object.entries(positions)) {
      const old = existing[id]
      if (!old || old.x !== p.x || old.y !== p.y) {
        changed = true
        break
      }
    }
    if (!changed) return

    saveVisualMap(mapId, {
      nodePositions: {
        ...existing,
        ...positions,
      },
    })
  }

  function loadVisualMapPositions(mapId: string) {
    const ctx = visualMaps.value[mapId]
    if (!ctx?.nodePositions) return
    const mapNodes = mapNodesForVisualMap(mapId)
    for (const n of mapNodes) {
      const p = ctx.nodePositions[n.id]
      if (p) n.position = { ...p }
    }
  }

  function activateVisualMap(mapId: string) {
    const ctx = visualMaps.value[mapId] ?? {}
    backgroundPath.value = ctx.backgroundPath ?? ''
    const hasBg = !!ctx.backgroundPath
    bgImageWidth.value = hasBg ? (ctx.bgImageWidth ?? 1920) : 0
    bgImageHeight.value = hasBg ? (ctx.bgImageHeight ?? 1080) : 0
  }

  function loadProject(project: MapProject) {
    nodes.value = project.nodes
    edges.value = project.edges
    projectName.value = project.name
    sourcePath.value = project.sourcePath ?? ''
    viewport.value = project.viewport ?? { x: 0, y: 0, zoom: 1 }
    backgroundPath.value = project.backgroundPath ?? ''
    bgImageWidth.value = project.bgImageWidth ?? 1920
    bgImageHeight.value = project.bgImageHeight ?? 1080
    visualMaps.value = project.visualMaps ?? {}
    if ((project.version ?? 1) < 3 && project.backgroundPath && !visualMaps.value['']?.backgroundPath) {
      visualMaps.value[''] = {
        ...(visualMaps.value[''] ?? {}),
        backgroundPath: project.backgroundPath,
        bgImageWidth: project.bgImageWidth ?? 1920,
        bgImageHeight: project.bgImageHeight ?? 1080,
      }
    }
    drawingZone.value = false
    drawTargetNodeId.value = null
    dirty.value = false
    undoStack.length = 0
    redoStack.length = 0
    historyVersion.value++
    bumpVersion()
  }

  function toProject(): MapProject {
    return {
      version: 3,
      name: projectName.value,
      sourcePath: sourcePath.value,
      viewport: { ...viewport.value },
      backgroundPath: backgroundPath.value || undefined,
      bgImageWidth: bgImageWidth.value,
      bgImageHeight: bgImageHeight.value,
      visualMaps: { ...visualMaps.value },
      nodes: nodes.value,
      edges: edges.value,
    }
  }

  function markSaved() { dirty.value = false }

  function toggleModeB() { isModeB.value = !isModeB.value }

  function startDrawZone(nodeId: string) { drawingZone.value = true; drawTargetNodeId.value = nodeId }
  function stopDrawZone() { drawingZone.value = false; drawTargetNodeId.value = null }

  function clear() {
    nodes.value = []
    edges.value = []
    projectName.value = ''
    projectFilePath.value = ''
    sourcePath.value = ''
    viewport.value = { x: 0, y: 0, zoom: 1 }
    backgroundPath.value = ''
    bgImageWidth.value = 1920
    bgImageHeight.value = 1080
    visualMaps.value = {}
    drawingZone.value = false
    drawTargetNodeId.value = null
    dirty.value = false
    undoStack.length = 0
    redoStack.length = 0
    historyVersion.value++
    bumpVersion()
  }

  return {
    nodes, edges, projectName, projectFilePath, sourcePath, dirty, viewport,
    nodeVersionRef, canUndo, canRedo,
    rootNodes, getChildren, getSubtreeStats,
    addNode, updateNode, removeNode, renameNodeId,
    addEdge, updateEdge, removeEdge,
    bulkUpdateNodes, bulkRemoveNodes, bulkAddTagToNodes, bulkRemoveTagFromNodes,
    importData, toggleCollapse, setViewport, undo, redo,
    loadProject, toProject, markSaved, clear,
    visualMaps, getVisualMapContext, saveVisualMap, saveCurrentVisualMapMeta,
    saveVisualMapPositions, loadVisualMapPositions, activateVisualMap,
    isModeB, backgroundPath, bgImageWidth, bgImageHeight, drawingZone, drawTargetNodeId,
    toggleModeB, startDrawZone, stopDrawZone,
  }
})