<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const node = computed(() => mapStore.nodes.find(n => n.id === ui.selectedNodeId) ?? null)

function update(field: string, value: any) {
  if (!node.value) return
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
</style>
