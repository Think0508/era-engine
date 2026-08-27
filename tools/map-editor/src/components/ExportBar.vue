<script setup lang="ts">
import { ref } from 'vue'
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'
import { exportToToml } from '../utils/tomlExport'
import { exportLayout } from '../utils/layoutExport'
import { validateMap } from '../utils/validate'

const mapStore = useMapStore()
const ui = useUiStore()
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

    const { errors, warnings } = validateMap(mapStore.nodes, mapStore.edges)
    if (errors.length > 0) {
      alert(`导出被阻止：\n${errors.join('\n')}`)
      return
    }
    if (warnings.length > 0) {
      if (!confirm(`导出警告：\n${warnings.join('\n')}\n\n仍然导出？`)) return
    }

    const { mkdir, writeTextFile, exists } = await import('@tauri-apps/plugin-fs')
    const locPath = `${dir}/maps/locations/exported.toml`
    const graphPath = `${dir}/maps/graph/exported.toml`
    if (await exists(locPath) || await exists(graphPath)) {
      if (!confirm('目标目录已存在 exported.toml，将覆盖？')) return
    }

    const result = await exportToToml(mapStore.nodes, mapStore.edges)
    await mkdir(`${dir}/maps/locations`, { recursive: true })
    await mkdir(`${dir}/maps/graph`, { recursive: true })
    await writeTextFile(locPath, result.locationsToml)
    await writeTextFile(graphPath, result.edgesToml)
    exportStatus.value = `导出完成：${result.locationCount} 个地点，${result.edgeCount} 条边 → ${dir}/maps/`
  } catch (err) {
    exportStatus.value = `导出失败：${err}`
  }
}

async function handleExportLayout() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const dir = await open({ directory: true, multiple: false, title: '选择导出目录（将创建 maps/layout/）' })
    if (!dir) return

    const currentMapId = ui.focusNodeId ?? ''
    if (mapStore.isModeB) {
      mapStore.saveVisualMapPositions(currentMapId)
    }

    const mapIds = Object.keys(mapStore.visualMaps).filter(id => mapStore.visualMaps[id]?.backgroundPath)
    if (mapIds.length === 0) {
      alert('尚未配置任何视觉地图背景图。请在 Mode B 中为地图加载背景图。')
      return
    }

    let rootMapId = ''
    if (mapIds.includes('')) {
      const input = prompt('主地图（未聚焦区域）对应的地点 ID（将导出为 maps/layout/{id}.json）:', mapStore.projectName || '')
      if (input === null) return
      rootMapId = input.trim()
      if (!rootMapId) {
        alert('主地图地点 ID 不能为空')
        return
      }
    }

    for (const mapId of mapIds) {
      const ctx = mapStore.getVisualMapContext(mapId)
      if (!ctx.bgImageWidth || !ctx.bgImageHeight) {
        alert(`视觉地图 '${mapId || '主地图'}' 缺少背景图尺寸。请先在 Mode B 中加载该背景图并等待图片读取完成后再导出。`)
        return
      }
    }

    const existingFiles: string[] = []
    const { exists } = await import('@tauri-apps/plugin-fs')
    for (const mapId of mapIds) {
      const fileId = mapId === '' ? rootMapId : mapId
      if (!fileId) continue
      if (await exists(`${dir}/maps/layout/${fileId}.json`)) existingFiles.push(fileId)
    }
    if (existingFiles.length > 0) {
      if (!confirm(`以下 Layout 文件已存在，将覆盖：\n${existingFiles.join('\n')}\n\n继续？`)) return
    }

    const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs')
    await mkdir(`${dir}/maps/layout`, { recursive: true })

    const orderedMapIds = mapIds.filter(id => id !== '').concat(mapIds.includes('') ? [''] : [])
    const writtenFiles = new Set<string>()
    let count = 0
    for (const mapId of orderedMapIds) {
      const ctx = mapStore.getVisualMapContext(mapId)
      const mapNodes = mapStore.nodes.filter(n => n.parent === (mapId || null))
      const positions = ctx.nodePositions ?? {}
      const layoutNodes = mapNodes.map(n => ({
        ...n,
        position: positions[n.id] ?? n.position,
      }))
      const nodeIds = new Set(layoutNodes.map(n => n.id))
      const layoutEdges = mapStore.edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))

      const layout = exportLayout(
        layoutNodes,
        layoutEdges,
        ctx.bgImageWidth ?? 0,
        ctx.bgImageHeight ?? 0,
        ctx.backgroundPath,
      )

      const fileId = mapId === '' ? rootMapId : mapId
      if (!fileId || writtenFiles.has(fileId)) continue
      writtenFiles.add(fileId)
      await writeTextFile(`${dir}/maps/layout/${fileId}.json`, JSON.stringify(layout, null, 2))
      count++
    }

    exportStatus.value = `Layout 导出完成：${count} 个视觉地图 → ${dir}/maps/layout/`
  } catch (err) {
    exportStatus.value = `Layout 导出失败：${err}`
  }
}
</script>

<template>
  <div class="export-bar">
    <button @click="handleExport" title="选择目录后导出 maps/locations/*.toml 和 maps/graph/*.toml">导出 TOML</button>
    <button @click="handleExportLayout" title="导出全部视觉地图 layout JSON（每个已配置背景图的聚焦地图一个文件）">导出全部 Layout</button>
    <span v-if="exportStatus" class="status">{{ exportStatus }}</span>
  </div>
</template>

<style scoped>
.export-bar { display: flex; align-items: center; gap: 12px; }
.export-bar button { padding: 4px 12px; cursor: pointer; }
.status { font-size: 12px; color: #64748b; }
</style>
