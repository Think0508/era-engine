<script setup lang="ts">
import { type NodeProps } from '@vue-flow/core'
import type { MapNode } from '../types/node'

const props = defineProps<NodeProps<MapNode>>()
const node = props.data as MapNode
</script>

<template>
  <div
    class="location-node"
    :class="{ invisible: !node.visible, collapsed: node.collapsed }"
  >
    <div class="node-name">{{ node.name }}</div>
    <div class="node-type">{{ node.type }}</div>
    <div v-if="node.tags.length > 0" class="node-tags">
      <span v-for="tag in node.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
  </div>
</template>

<style scoped>
.location-node {
  background: #fff;
  border: 2px solid #3b82f6;
  border-radius: 8px;
  padding: 8px 12px;
  min-width: 150px;
  font-family: sans-serif;
}
.location-node.invisible { opacity: 0.4; border-style: dashed; }
.location-node.collapsed { border-color: #94a3b8; background: #f1f5f9; }
.node-name { font-weight: bold; font-size: 14px; }
.node-type { font-size: 11px; color: #64748b; }
.node-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.tag { background: #e2e8f0; padding: 1px 6px; border-radius: 4px; font-size: 10px; }
</style>
