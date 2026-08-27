<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'
import type { MapNode } from '../types/node'

const mapStore = useMapStore()
const ui = useUiStore()

const query = ref('')
const expanded = ref<Set<string>>(new Set())

const filteredNodes = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return mapStore.nodes
  return mapStore.nodes.filter(n =>
    n.id.toLowerCase().includes(q) ||
    n.name.toLowerCase().includes(q) ||
    n.type.toLowerCase().includes(q) ||
    n.tags.some(t => t.toLowerCase().includes(q))
  )
})

interface Row {
  node: MapNode
  depth: number
  hasChildren: boolean
  childrenCount: number
}

const rows = computed<Row[]>(() => {
  const q = query.value.trim().toLowerCase()
  const visibleIds = new Set(filteredNodes.value.map(n => n.id))
  const result: Row[] = []
  const seen = new Set<string>()

  function walk(node: MapNode, depth: number) {
    if (seen.has(node.id)) return
    seen.add(node.id)
    const children = mapStore.getChildren(node.id).filter(c => visibleIds.has(c.id))
    result.push({
      node,
      depth,
      hasChildren: children.length > 0,
      childrenCount: children.length,
    })
    if (!q && expanded.value.has(node.id)) {
      for (const child of children) walk(child, depth + 1)
    }
    if (q) {
      for (const child of children) walk(child, depth + 1)
    }
  }

  const roots = mapStore.rootNodes.filter(n => visibleIds.has(n.id))
  for (const root of roots) walk(root, 0)
  // Also include orphan nodes (dangling parent) so they remain reachable in outline
  for (const n of mapStore.nodes) {
    if (visibleIds.has(n.id) && !seen.has(n.id)) walk(n, 0)
  }
  return result
})

function toggleExpand(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function selectRow(id: string) {
  ui.selectNode(id)
}

function focusRow(id: string) {
  ui.setFocus(id)
}

function rowStyle(row: Row) {
  return { paddingLeft: `${8 + row.depth * 16}px` }
}
</script>

<template>
  <div class="outline-panel">
    <h3>地点大纲</h3>
    <input v-model="query" placeholder="搜索 id/名称/类型/tag..." class="search" />
    <div class="tree">
      <div v-for="row in rows" :key="row.node.id" class="row" :style="rowStyle(row)" @click="selectRow(row.node.id)" @dblclick="focusRow(row.node.id)">
        <span v-if="row.hasChildren" class="caret" :class="{ open: expanded.has(row.node.id) }" @click.stop="toggleExpand(row.node.id)">▸</span>
        <span v-else class="caret placeholder" />
        <span class="label" :class="{ active: ui.selectedNodeIds.includes(row.node.id) }">
          {{ ui.showIdOnNode ? row.node.id : row.node.name }}
        </span>
        <span v-if="row.childrenCount > 0" class="count">{{ row.childrenCount }}</span>
      </div>
      <p v-if="rows.length === 0" class="empty">无匹配地点</p>
    </div>
  </div>
</template>

<style scoped>
.outline-panel { padding: 12px; }
.outline-panel h3 { font-size: 14px; margin: 0 0 8px; }
.search { width: 100%; box-sizing: border-box; padding: 4px 8px; margin-bottom: 8px; font-size: 12px; }
.tree { max-height: calc(100vh - 180px); overflow-y: auto; }
.row { display: flex; align-items: center; gap: 4px; padding: 3px 4px; font-size: 12px; cursor: pointer; border-radius: 3px; }
.row:hover { background: #f1f5f9; }
.caret { display: inline-block; width: 12px; cursor: pointer; color: #64748b; }
.caret.open { transform: rotate(90deg); }
.caret.placeholder { cursor: default; }
.label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label.active { font-weight: bold; color: #3b82f6; }
.count { background: #e2e8f0; border-radius: 8px; font-size: 10px; padding: 0 5px; color: #64748b; }
.empty { color: #94a3b8; font-size: 12px; padding: 12px 4px; }
</style>