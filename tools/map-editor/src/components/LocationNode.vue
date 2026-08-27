<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import type { MapNode } from '../types/node'
import { useUiStore } from '../stores/uiStore'
import { useMapStore } from '../stores/mapStore'

const LEVEL_COLORS = [
  '#e0f2fe', // level 1: sky blue
  '#dcfce7', // level 2: green
  '#fef9c3', // level 3: yellow
  '#f3e8ff', // level 4: purple
  '#ffe4e6', // level 5: pink
]
const LEVEL_BORDER = [
  '#0284c7',
  '#16a34a',
  '#ca8a04',
  '#9333ea',
  '#db2777',
]

interface LocationNodeData extends MapNode {
  level: number
}

const props = defineProps<NodeProps<LocationNodeData>>()
const node = computed(() => props.data as LocationNodeData)
const ui = useUiStore()
const mapStore = useMapStore()

const bgColor = computed(() => {
  if (!ui.levelColors) return '#fff'
  return LEVEL_COLORS[Math.min(node.value.level - 1, LEVEL_COLORS.length - 1)] ?? '#fff'
})

const borderColor = computed(() => {
  if (!ui.levelColors) return '#3b82f6'
  return LEVEL_BORDER[Math.min(node.value.level - 1, LEVEL_BORDER.length - 1)] ?? '#3b82f6'
})

const displayText = computed(() => ui.showIdOnNode ? node.value.id : node.value.name)
const childCount = computed(() => node.value.collapsed ? mapStore.getChildren(node.value.id).length : 0)

function tagStyle(tag: string) {
  return { background: ui.tagColors[tag] ?? '#e2e8f0' }
}
</script>

<template>
  <div
    class="location-node"
    :class="{ invisible: !node.visible, collapsed: node.collapsed }"
    :style="{ background: bgColor, borderColor: borderColor }"
  >
    <Handle type="target" :position="Position.Top" />
    <div class="node-header">
      <span class="level-badge" :style="{ background: borderColor }">{{ node.level }}</span>
      <span class="node-name">{{ displayText }}</span>
      <span v-if="childCount > 0" class="child-badge">+{{ childCount }}</span>
    </div>
    <div class="node-type">{{ node.type }}</div>
    <div v-if="node.tags.length > 0" class="node-tags">
      <span v-for="tag in node.tags" :key="tag" class="tag" :style="tagStyle(tag)">{{ tag }}</span>
    </div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<style scoped>
.location-node {
  border: 2px solid #3b82f6;
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 150px;
  font-family: sans-serif;
  transition: background 0.2s, border-color 0.2s;
}
.location-node.invisible { opacity: 0.35; border-style: dashed; background: #f1f5f9; }
.location-node.collapsed { border-color: #94a3b8; background: #f1f5f9; }
.node-header { display: flex; align-items: center; gap: 6px; }
.level-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  background: #3b82f6; color: #fff;
  font-size: 11px; font-weight: bold; flex-shrink: 0;
  transition: background 0.2s;
}
.node-name { font-weight: bold; font-size: 14px; }
.child-badge {
  background: #94a3b8; color: #fff; border-radius: 8px;
  font-size: 10px; padding: 1px 6px; line-height: 1.4;
}
.node-type { font-size: 11px; color: #64748b; margin-left: 24px; }
.node-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; margin-left: 24px; }
.tag { background: #e2e8f0; padding: 1px 6px; border-radius: 4px; font-size: 10px; }
</style>