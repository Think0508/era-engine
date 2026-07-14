<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const edge = computed(() => mapStore.edges.find(e => e.id === ui.selectedEdgeId) ?? null)

function update(field: string, value: any) {
  if (!edge.value) return
  mapStore.updateEdge(edge.value.id, { [field]: value })
}
</script>

<template>
  <div v-if="edge" class="panel">
    <h3>边属性</h3>
    <label>起点 <input :value="edge.from" disabled /></label>
    <label>终点 <input :value="edge.to" disabled /></label>
    <label>耗时（分钟）<input type="number" :value="edge.timeCost" @change="e => update('timeCost', parseInt((e.target as HTMLInputElement).value, 10))" /></label>
    <label>方向
      <select :value="edge.direction" @change="e => update('direction', (e.target as HTMLSelectElement).value)">
        <option value="bidirectional">双向</option>
        <option value="directed">单向 A→B</option>
        <option value="reverse">单向 B→A</option>
      </select>
    </label>
    <label>条件<textarea :value="edge.condition ?? ''" rows="2" @change="e => update('condition', (e.target as HTMLTextAreaElement).value || undefined)" /></label>
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
</style>
