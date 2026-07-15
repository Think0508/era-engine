<script setup lang="ts">
import { ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { exportToToml } from '../utils/tomlExport'

const mapStore = useMapStore()
const exportStatus = ref('')

async function handleExport() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const dir = await open({
      directory: true,
      multiple: false,
      title: '选择导出目录（将创建 maps/locations/ 和 maps/graph/）',
    })
    if (!dir) return

    const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs')
    const result = await exportToToml(mapStore.nodes, mapStore.edges)
    await mkdir(`${dir}/maps/locations`, { recursive: true })
    await mkdir(`${dir}/maps/graph`, { recursive: true })
    await writeTextFile(`${dir}/maps/locations/exported.toml`, result.locationsToml)
    await writeTextFile(`${dir}/maps/graph/exported.toml`, result.edgesToml)
    exportStatus.value = `导出完成：${result.locationCount} 个地点，${result.edgeCount} 条边 → ${dir}/maps/`
  } catch (err) {
    exportStatus.value = `导出失败：${err}`
  }
}
</script>

<template>
  <div class="export-bar">
    <button @click="handleExport">导出 TOML</button>
    <span v-if="exportStatus" class="status">{{ exportStatus }}</span>
  </div>
</template>

<style scoped>
.export-bar { display: flex; align-items: center; gap: 12px; }
.export-bar button { padding: 4px 12px; cursor: pointer; }
.status { font-size: 12px; color: #64748b; }
</style>
