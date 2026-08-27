<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'
import { wouldCreateParentCycle } from '../utils/autoLayout'

const mapStore = useMapStore()
const ui = useUiStore()

const node = computed(() => mapStore.nodes.find(n => n.id === ui.selectedNodeId) ?? null)
const selectedNodes = computed(() =>
  ui.selectedNodeIds
    .map(id => mapStore.nodes.find(n => n.id === id))
    .filter((n): n is NonNullable<typeof n> => !!n)
)

const bulkTagInput = ref('')
const bulkTypeInput = ref('')
const bulkVisible = ref(true)

function update(field: string, value: any) {
  if (!node.value) return
  if (field === 'id' && typeof value === 'string') {
    const trimmed = value.trim()
    const ok = mapStore.renameNodeId(node.value.id, trimmed)
    if (!ok && trimmed && trimmed !== node.value.id && mapStore.nodes.some(n => n.id === trimmed)) {
      alert(`ID '${trimmed}' 已存在`)
    } else if (ok) {
      if (ui.focusNodeId === node.value.id) ui.setFocus(trimmed)
      ui.selectNode(trimmed)
    }
    return
  }
  if (field === 'parent' && typeof value === 'string') {
    const newParent = value.trim() || null
    if (newParent && wouldCreateParentCycle(mapStore.nodes, node.value.id, newParent)) {
      alert('不能把父节点设为自身或自己的后代，否则会形成环')
      return
    }
    mapStore.updateNode(node.value.id, { parent: newParent })
    return
  }

  if (field === 'name' && ui.syncNameToId && typeof value === 'string' && value.length > 0) {
    const oldId = node.value.id
    const newId = value.trim()
    if (oldId === newId) { mapStore.updateNode(oldId, { name: value }); return }
    if (mapStore.renameNodeId(oldId, newId, value)) {
      if (ui.focusNodeId === oldId) ui.setFocus(newId)
      ui.selectNode(newId)
    } else {
      mapStore.updateNode(oldId, { name: value })
    }
    return
  }
  mapStore.updateNode(node.value.id, { [field]: value })
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

function updateZoom(index: number, event: Event) {
  if (!node.value) return
  const val = parseInt((event.target as HTMLInputElement).value, 10)
  if (isNaN(val) || val < 1) return
  const zoom = [...((nodeAttrs.value.zoom as [number, number]) ?? [1, 1])]
  zoom[index] = val
  mapStore.updateNode(node.value.id, { attrs: { ...nodeAttrs.value, zoom } })
}

function applyBulkType() {
  const value = bulkTypeInput.value.trim()
  if (!value || selectedNodes.value.length === 0) return
  mapStore.bulkUpdateNodes(selectedNodes.value.map(n => n.id), { type: value })
  bulkTypeInput.value = ''
}

function applyBulkVisible() {
  if (selectedNodes.value.length === 0) return
  mapStore.bulkUpdateNodes(selectedNodes.value.map(n => n.id), { visible: bulkVisible.value })
}

function applyBulkTag() {
  const tag = bulkTagInput.value.trim()
  if (!tag || selectedNodes.value.length === 0) return
  mapStore.bulkAddTagToNodes(selectedNodes.value.map(n => n.id), tag)
  bulkTagInput.value = ''
}

function deleteSelected() {
  if (selectedNodes.value.length === 0) return
  if (confirm(`确定删除选中的 ${selectedNodes.value.length} 个节点及其子树？此操作不可撤销。`)) {
    mapStore.bulkRemoveNodes(selectedNodes.value.map(n => n.id))
    ui.clearSelection()
  }
}
</script>

<template>
  <div v-if="selectedNodes.length > 1" class="panel">
    <h3>批量编辑（{{ selectedNodes.length }} 个节点）</h3>
    <label>类型
      <input v-model="bulkTypeInput" placeholder="统一设置类型..." @keydown.enter="applyBulkType" />
    </label>
    <button class="bulk-btn" @click="applyBulkType">应用类型</button>
    <label>
      <input v-model="bulkVisible" type="checkbox" @change="applyBulkVisible" />
      可见
    </label>
    <label>添加 Tag
      <input v-model="bulkTagInput" placeholder="给所有选中节点加 tag..." @keydown.enter="applyBulkTag" />
    </label>
    <button class="bulk-btn" @click="applyBulkTag">应用 Tag</button>
    <button class="bulk-btn danger" @click="deleteSelected">删除选中</button>
  </div>

  <div v-else-if="node" class="panel">
    <h3>节点属性</h3>
    <label>ID <input :value="node.id" @change="e => update('id', (e.target as HTMLInputElement).value)" /></label>
    <label>名称 <input :value="node.name" @change="e => update('name', (e.target as HTMLInputElement).value)" /></label>
    <label>类型 <input :value="node.type" @change="e => update('type', (e.target as HTMLInputElement).value)" /></label>
    <label>父节点 <input :value="node.parent ?? ''" @change="e => update('parent', (e.target as HTMLInputElement).value || null)" /></label>
    <label>
      <input type="checkbox" :checked="node.visible" @change="e => update('visible', (e.target as HTMLInputElement).checked)" />
      可见
    </label>
    <template v-if="mapStore.isModeB">
      <label>Zoom 范围</label>
      <div class="zoom-row">
        <input type="number" min="1" :value="(nodeAttrs.zoom ?? [1,1])[0]" @change="updateZoom(0, $event)" placeholder="min" />
        <span>—</span>
        <input type="number" min="1" :value="(nodeAttrs.zoom ?? [1,1])[1]" @change="updateZoom(1, $event)" placeholder="max" />
      </div>
    </template>
    <div class="tag-section">
      <label>标签</label>
      <div class="tag-list">
        <span v-for="tag in node.tags" :key="tag" class="tag" :style="{ background: ui.tagColors[tag] ?? '#e2e8f0' }">
          {{ tag }} <span class="tag-remove" @click="removeTag(tag)">×</span>
        </span>
      </div>
      <input placeholder="添加标签..." @keydown.enter="addTag" />
    </div>
    <div v-if="mapStore.isModeB" class="panel-section">
      <label>点击区域</label>
      <button
        v-if="!mapStore.drawingZone"
        class="draw-btn"
        @click="mapStore.startDrawZone(node.id)"
        :disabled="mapStore.drawingZone"
      >绘制点击区域</button>
      <span v-else class="draw-hint">在画布上拖动绘制矩形</span>
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
.draw-btn { padding: 4px 12px; cursor: pointer; font-size: 12px; margin-bottom: 8px; }
.draw-hint { font-size: 11px; color: #3b82f6; display: block; margin-bottom: 8px; }
.panel-section { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
.click-zone-row { display: flex; gap: 4px; margin-bottom: 4px; align-items: center; }
.click-zone-row input { width: 48px; padding: 2px 4px; font-size: 11px; }
.click-zone-row button { padding: 2px 6px; cursor: pointer; }
.add-btn { margin-top: 4px; padding: 2px 8px; font-size: 12px; cursor: pointer; }
.zoom-row { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
.zoom-row input { width: 60px; padding: 4px 8px; }
.bulk-btn { display: block; width: 100%; margin-bottom: 6px; padding: 4px 8px; cursor: pointer; }
.bulk-btn.danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
</style>