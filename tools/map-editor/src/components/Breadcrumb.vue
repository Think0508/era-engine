<script setup lang="ts">
import { useUiStore } from '../stores/uiStore'
const ui = useUiStore()
</script>

<template>
  <div class="breadcrumb">
    <span v-for="(crumb, i) in ui.breadcrumb" :key="i">
      <span v-if="i > 0" class="sep">›</span>
      <span :class="{ active: i === ui.breadcrumb.length - 1 }">{{ crumb }}</span>
    </span>
  </div>
</template>

<style scoped>
.breadcrumb { padding: 4px 12px; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
.sep { margin: 0 6px; }
.active { color: #0f172a; font-weight: bold; }
</style>
