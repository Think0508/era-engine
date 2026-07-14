<script setup lang="ts">
import { type NodeProps } from '@vue-flow/core'
import type { MapNode } from '../types/node'

interface LocationNodeData extends MapNode {
  level: number
  displayName: string
}

const props = defineProps<NodeProps<LocationNodeData>>()
const node = props.data
</script>

<template>
  <div
    class="location-node"
    :class="{ invisible: !node.visible, collapsed: node.collapsed }"
  >
    <div class="node-header">
      <span class="level-badge">{{ node.level }}</span>
      <span class="node-name">{{ node.displayName }}</span>
    </div>
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
.node-header { display: flex; align-items: center; gap: 6px; }
.level-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; border-radius: 50%;
  background: #3b82f6; color: #fff;
  font-size: 11px; font-weight: bold; flex-shrink: 0;
}
.node-name { font-weight: bold; font-size: 14px; }
.node-type { font-size: 11px; color: #64748b; margin-left: 24px; }
.node-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; margin-left: 24px; }
.tag { background: #e2e8f0; padding: 1px 6px; border-radius: 4px; font-size: 10px; }
</style>
