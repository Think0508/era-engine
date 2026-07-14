<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()
const newTag = ref('')
const allTags = ref<string[]>([])

function refreshTags() {
  const tagSet = new Set<string>()
  for (const node of mapStore.nodes) {
    for (const tag of node.tags) tagSet.add(tag)
  }
  for (const tag of allTags.value) tagSet.add(tag)
  allTags.value = Array.from(tagSet).sort()
}

function addTag() {
  const t = newTag.value.trim()
  if (t && !allTags.value.includes(t)) allTags.value.push(t)
  newTag.value = ''
}

function removeTag(tag: string) {
  allTags.value = allTags.value.filter(t => t !== tag)
  for (const node of mapStore.nodes) {
    if (node.tags.includes(tag)) {
      mapStore.updateNode(node.id, { tags: node.tags.filter((t: string) => t !== tag) })
    }
  }
}

function assignTag(tag: string) {
  if (!ui.selectedNodeId) return
  const node = mapStore.nodes.find(n => n.id === ui.selectedNodeId)
  if (node && !node.tags.includes(tag)) {
    mapStore.updateNode(node.id, { tags: [...node.tags, tag] })
  }
}

watch(() => [mapStore.nodes.length, ...mapStore.nodes.map(n => n.tags.length)], refreshTags, { immediate: true })
</script>

<template>
  <div class="tag-pool">
    <h3>Tag 池</h3>
    <div class="tag-list">
      <div v-for="tag in allTags" :key="tag" class="tag-item" @click="assignTag(tag)">
        {{ tag }} <span class="tag-remove" @click.stop="removeTag(tag)">×</span>
      </div>
    </div>
    <div class="tag-input">
      <input v-model="newTag" placeholder="新 Tag..." @keydown.enter="addTag" />
    </div>
    <p v-if="ui.selectedNodeId" class="hint">点击 Tag 赋予选中节点</p>
  </div>
</template>

<style scoped>
.tag-pool { padding: 12px; }
.tag-pool h3 { font-size: 14px; margin: 0 0 8px; }
.tag-list { display: flex; flex-direction: column; gap: 4px; }
.tag-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: #e2e8f0; border-radius: 4px; font-size: 12px; cursor: pointer; }
.tag-item:hover { background: #cbd5e1; }
.tag-remove { cursor: pointer; color: #ef4444; margin-left: 4px; }
.tag-input { margin-top: 8px; }
.tag-input input { width: 100%; box-sizing: border-box; padding: 4px 8px; }
.hint { font-size: 11px; color: #94a3b8; margin-top: 8px; }
</style>
