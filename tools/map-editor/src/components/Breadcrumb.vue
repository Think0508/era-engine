<script setup lang="ts">
import { computed } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'

const mapStore = useMapStore()
const ui = useUiStore()

const crumbs = computed(() => {
  const path: { id: string | null; label: string }[] = [{ id: null, label: '主地图' }]
  const chain: { id: string; label: string }[] = []
  const seen = new Set<string>()
  let cur = ui.focusNodeId
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const node = mapStore.nodes.find(n => n.id === cur)
    if (!node) break
    chain.unshift({ id: node.id, label: ui.showIdOnNode ? node.id : node.name })
    cur = node.parent
  }
  path.push(...chain)
  return path
})

function goTo(id: string | null) {
  ui.setFocus(id)
}
</script>

<template>
  <div class="breadcrumb">
    <span v-for="(crumb, i) in crumbs" :key="crumb.id ?? 'root'">
      <span v-if="i > 0" class="sep">›</span>
      <span
        :class="{ active: i === crumbs.length - 1, clickable: i < crumbs.length - 1 }"
        @click="i < crumbs.length - 1 && goTo(crumb.id)"
      >{{ crumb.label }}</span>
    </span>
  </div>
</template>

<style scoped>
.breadcrumb { padding: 4px 12px; font-size: 12px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
.sep { margin: 0 6px; }
.clickable { cursor: pointer; }
.clickable:hover { color: #0f172a; text-decoration: underline; }
.active { color: #0f172a; font-weight: bold; }
</style>