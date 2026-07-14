<script setup lang="ts">
import { useMapStore } from '../stores/mapStore'
const mapStore = useMapStore()
</script>

<template>
  <div class="status-bar">
    <span>{{ mapStore.nodes.length }} 个节点</span>
    <span>{{ mapStore.edges.length }} 条边</span>
    <span v-if="mapStore.projectName">项目：{{ mapStore.projectName }}</span>
  </div>
</template>

<style scoped>
.status-bar { display: flex; gap: 16px; padding: 2px 12px; font-size: 12px; color: #64748b; background: #f8fafc; border-top: 1px solid #e2e8f0; }
</style>
