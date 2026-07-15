<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const edge = computed(() => mapStore.edges.find(e => e.id === ui.selectedEdgeId) ?? null)

const edgeAttrs = computed(() => (edge.value as any)?.attrs ?? {})

function update(field: string, value: any) {
  if (!edge.value) return
  mapStore.updateEdge(edge.value.id, { [field]: value })
}

function addPathPoint() {
  if (!edge.value) return
  const path = [...(edgeAttrs.value.path ?? []), { x: 0.5, y: 0.5 }]
  mapStore.updateEdge(edge.value.id, { attrs: { ...edgeAttrs.value, path } })
}

function removePathPoint(index: number) {
  if (!edge.value) return
  const path = [...(edgeAttrs.value.path ?? [])]
  path.splice(index, 1)
  mapStore.updateEdge(edge.value.id, { attrs: { ...edgeAttrs.value, path } })
}

function updatePathPoint(index: number, field: string, event: Event) {
  if (!edge.value) return
  const val = parseFloat((event.target as HTMLInputElement).value)
  if (isNaN(val)) return
  const path = [...(edgeAttrs.value.path ?? [])]
  path[index] = { ...path[index], [field]: Math.max(0, Math.min(1, val)) }
  mapStore.updateEdge(edge.value.id, { attrs: { ...edgeAttrs.value, path } })
}

function updateZoom(index: number, event: Event) {
  if (!edge.value) return
  const val = parseInt((event.target as HTMLInputElement).value, 10)
  if (isNaN(val) || val < 1) return
  const zoom = [...((edgeAttrs.value.zoom as [number, number]) ?? [1, 1])]
  zoom[index] = val
  mapStore.updateEdge(edge.value.id, { attrs: { ...edgeAttrs.value, zoom } })
}
</script>

<template>
  <div v-if="edge" class="panel">
    <h3>边属性</h3>
    <label>起点 <input :value="edge.from" disabled /></label>
    <label>终点 <input :value="edge.to" disabled /></label>
    <label>耗时（分钟）<input type="number" :value="edge.timeCost" @change="e => update('timeCost', parseInt((e.target as HTMLInputElement).value, 10) || 0)" /></label>
    <label>方向
      <select :value="edge.direction" @change="e => update('direction', (e.target as HTMLSelectElement).value)">
        <option value="bidirectional">双向</option>
        <option value="directed">单向 A→B</option>
        <option value="reverse">单向 B→A</option>
      </select>
    </label>
    <label>条件<textarea :value="edge.condition ?? ''" rows="2" @change="e => update('condition', (e.target as HTMLTextAreaElement).value || undefined)" /></label>
    <div v-if="mapStore.isModeB" class="panel-section">
      <label>路径控制点</label>
      <div v-for="(pt, pi) in (edgeAttrs.path ?? [])" :key="pi" class="path-point-row">
        <input type="number" step="0.01" min="0" max="1" :value="pt.x" @change="updatePathPoint(pi, 'x', $event)" placeholder="x" />
        <input type="number" step="0.01" min="0" max="1" :value="pt.y" @change="updatePathPoint(pi, 'y', $event)" placeholder="y" />
        <button @click="removePathPoint(pi)">×</button>
      </div>
      <button @click="addPathPoint" class="add-btn">+ 添加控制点</button>
    </div>
    <template v-if="mapStore.isModeB">
      <label>Zoom 范围</label>
      <div class="zoom-row">
        <input type="number" min="1" :value="(edgeAttrs.zoom ?? [1,1])[0]" @change="updateZoom(0, $event)" placeholder="min" />
        <span>—</span>
        <input type="number" min="1" :value="(edgeAttrs.zoom ?? [1,1])[1]" @change="updateZoom(1, $event)" placeholder="max" />
      </div>
    </template>
  </div>
  <div v-else class="panel panel-empty"><p>未选中边</p></div>
</template>

<style scoped>
.panel { padding: 12px; font-size: 13px; }
.panel h3 { margin: 0 0 12px; font-size: 14px; }
.panel label { display: block; margin-bottom: 8px; }
.panel input, .panel select, .panel textarea { width: 100%; box-sizing: border-box; padding: 4px 8px; }
.panel textarea { resize: vertical; font-family: monospace; font-size: 12px; }
.panel-empty { color: #94a3b8; text-align: center; padding-top: 40px; }
.panel-section { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
.path-point-row { display: flex; gap: 4px; margin-bottom: 4px; align-items: center; }
.path-point-row input { width: 48px; padding: 2px 4px; font-size: 11px; }
.path-point-row button { padding: 2px 6px; cursor: pointer; }
.add-btn { margin-top: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer; }
.zoom-row { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
.zoom-row input { width: 60px; padding: 4px 8px; }
</style>
