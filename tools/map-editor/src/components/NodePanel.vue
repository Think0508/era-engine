<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const node = computed(() => mapStore.nodes.find(n => n.id === ui.selectedNodeId) ?? null)

function update(field: string, value: any) {
  if (!node.value) return
  if (field === 'name' && ui.syncNameToId && typeof value === 'string' && value.length > 0) {
    const oldId = node.value.id
    const newId = value
    if (oldId === newId) { mapStore.updateNode(oldId, { name: value }); return }
    if (mapStore.nodes.some(n => n.id === newId)) { mapStore.updateNode(oldId, { name: value }); return }
    for (const edge of mapStore.edges) {
      if (edge.from === oldId) mapStore.updateEdge(edge.id, { from: newId })
      if (edge.to === oldId) mapStore.updateEdge(edge.id, { to: newId })
    }
    for (const child of mapStore.nodes) {
      if (child.parent === oldId) mapStore.updateNode(child.id, { parent: newId })
    }
    mapStore.updateNode(oldId, { id: newId, name: value })
    ui.selectNode(newId)
  } else {
    mapStore.updateNode(node.value.id, { [field]: value })
  }
}
function removeTag(tag: string) {
  if (!node.value) return
  update('tags', node.value.tags.filter(t => t !== tag))
}
function addTag(e: Event) {
  if (!node.value) return
  const el = e.target as HTMLInputElement
  const v = el.value.trim()
  if (v) { update('tags', [...node.value.tags, v]); el.value = '' }
}

const nodeAttrs = computed(() => (node.value as any)?.attrs ?? {})

function addClickZone() {
  if (!node.value) return
  const zones = [...(nodeAttrs.value.clickZones ?? []), { x: 0.3, y: 0.3, w: 0.1, h: 0.1 }]
  mapStore.updateNode(node.value.id, { attrs: { ...nodeAttrs.value, clickZones: zones } })
}

function removeClickZone(index: number) {
  if (!node.value) return
  const zones = [...(nodeAttrs.value.clickZones ?? [])]
  zones.splice(index, 1)
  mapStore.updateNode(node.value.id, { attrs: { ...nodeAttrs.value, clickZones: zones } })
}

function updateClickZone(index: number, field: string, event: Event) {
  if (!node.value) return
  const val = parseFloat((event.target as HTMLInputElement).value)
  if (isNaN(val)) return
  const zones = [...(nodeAttrs.value.clickZones ?? [])]
  zones[index] = { ...zones[index], [field]: Math.max(0, Math.min(1, val)) }
  mapStore.updateNode(node.value.id, { attrs: { ...nodeAttrs.value, clickZones: zones } })
}
</script>

<template>
  <div v-if="node" class="panel">
    <h3>节点属性</h3>
    <label>ID <input :value="node.id" @change="e => update('id', (e.target as HTMLInputElement).value)" /></label>
    <label>名称 <input :value="node.name" @change="e => update('name', (e.target as HTMLInputElement).value)" /></label>
    <label>类型 <input :value="node.type" @change="e => update('type', (e.target as HTMLInputElement).value)" /></label>
    <label>父节点 <input :value="node.parent ?? ''" @change="e => update('parent', (e.target as HTMLInputElement).value || null)" /></label>
    <label>
      <input type="checkbox" :checked="node.visible" @change="e => update('visible', (e.target as HTMLInputElement).checked)" />
      可见
    </label>
    <div class="tag-section">
      <label>标签</label>
      <div class="tag-list">
        <span v-for="tag in node.tags" :key="tag" class="tag">
          {{ tag }} <span class="tag-remove" @click="removeTag(tag)">×</span>
        </span>
      </div>
      <input placeholder="添加标签..." @keydown.enter="addTag" />
    </div>
    <div v-if="mapStore.isModeB" class="panel-section">
      <label>点击区域</label>
      <div v-for="(zone, zi) in (nodeAttrs.clickZones ?? [])" :key="zi" class="click-zone-row">
        <input type="number" step="0.01" min="0" max="1" :value="zone.x" @change="updateClickZone(zi, 'x', $event)" placeholder="x" />
        <input type="number" step="0.01" min="0" max="1" :value="zone.y" @change="updateClickZone(zi, 'y', $event)" placeholder="y" />
        <input type="number" step="0.01" min="0" max="1" :value="zone.w" @change="updateClickZone(zi, 'w', $event)" placeholder="w" />
        <input type="number" step="0.01" min="0" max="1" :value="zone.h" @change="updateClickZone(zi, 'h', $event)" placeholder="h" />
        <button @click="removeClickZone(zi)">×</button>
      </div>
      <button @click="addClickZone" class="add-btn">+ 添加点击区域</button>
    </div>
  </div>
  <div v-else class="panel panel-empty"><p>未选中节点</p></div>
</template>

<style scoped>
.panel { padding: 12px; font-size: 13px; }
.panel h3 { margin: 0 0 12px; font-size: 14px; }
.panel label { display: block; margin-bottom: 8px; }
.panel input[type="text"], .panel input:not([type="checkbox"]) { width: 100%; box-sizing: border-box; padding: 4px 8px; }
.tag-section { margin-top: 8px; }
.tag-list { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; }
.tag { background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tag-remove { cursor: pointer; margin-left: 4px; color: #ef4444; }
.panel-empty { color: #94a3b8; text-align: center; padding-top: 40px; }
.panel-section { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
.click-zone-row { display: flex; gap: 4px; margin-bottom: 4px; align-items: center; }
.click-zone-row input { width: 48px; padding: 2px 4px; font-size: 11px; }
.click-zone-row button { padding: 2px 6px; cursor: pointer; }
.add-btn { margin-top: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer; }
</style>
