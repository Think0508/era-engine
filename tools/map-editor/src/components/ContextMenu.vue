<script setup lang="ts">
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const props = defineProps<{
  x: number
  y: number
  nodeId?: string
  edgeId?: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

function deleteNode() {
  if (props.nodeId) mapStore.removeNode(props.nodeId)
  ui.clearSelection()
  emit('close')
}

function deleteEdge() {
  if (props.edgeId) mapStore.removeEdge(props.edgeId)
  ui.clearSelection()
  emit('close')
}

function toggleVisible() {
  if (props.nodeId) {
    const node = mapStore.nodes.find(n => n.id === props.nodeId)
    if (node) mapStore.updateNode(props.nodeId, { visible: !node.visible })
  }
  emit('close')
}

function rename() {
  if (props.nodeId) {
    const name = prompt('新名称:')
    if (name) mapStore.updateNode(props.nodeId, { name })
  }
  emit('close')
}
</script>

<template>
  <div class="context-menu" :style="{ left: `${props.x}px`, top: `${props.y}px` }" @click.stop>
    <template v-if="nodeId">
      <div class="menu-item" @click="rename">重命名</div>
      <div class="menu-item" @click="toggleVisible">切换显隐</div>
      <div class="menu-item danger" @click="deleteNode">删除节点</div>
    </template>
    <template v-if="edgeId">
      <div class="menu-item" @click="deleteEdge">删除边</div>
    </template>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 1000;
  min-width: 120px;
}
.menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}
.menu-item:hover { background: #f0f0f0; }
.menu-item.danger { color: #ef4444; }
</style>
