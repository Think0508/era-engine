<script setup lang="ts">
import { useMapStore } from '../stores/mapStore'
import { useUiStore } from '../stores/uiStore'
import { loadProjectFile, saveProjectFile } from '../utils/projectFile'
import { importFromDir } from '../utils/tomlImport'
import { autoLayout, findParentCycle } from '../utils/autoLayout'

const mapStore = useMapStore()
const ui = useUiStore()

function resetUiState() {
  ui.setFocus(null)
  ui.clearSelection()
}

async function newProject() {
  if (mapStore.dirty && !confirm('当前项目有未保存修改，确定新建？')) return
  mapStore.clear()
  mapStore.projectName = '新地图'
  ui.tagColors = {}
  resetUiState()
}

async function openProject() {
  if (mapStore.dirty && !confirm('当前项目有未保存修改，确定打开其他项目？')) return
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const path = await open({ multiple: false, filters: [{ name: 'MapEdit Project', extensions: ['mapedit'] }] })
    if (!path) return
    const project = await loadProjectFile(path)
    const cycle = findParentCycle(project.nodes)
    if (cycle) alert(`警告：项目包含 parent 环：${cycle.join(' -> ')}`)
    mapStore.loadProject(project)
    mapStore.projectFilePath = path
    ui.tagColors = { ...(project.tagColors ?? {}) }
    resetUiState()
  } catch (err) {
    alert(`打开项目失败：${err}`)
  }
}

async function saveProject() {
  try {
    let path = mapStore.projectFilePath
    if (!path) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const result = await save({ filters: [{ name: 'MapEdit Project', extensions: ['mapedit'] }], defaultPath: `${mapStore.projectName || 'untitled'}.mapedit` })
      if (!result) return
      path = result
    }
    const project = mapStore.toProject()
    project.tagColors = { ...ui.tagColors }
    await saveProjectFile(path, project)
    mapStore.projectFilePath = path
    mapStore.markSaved()
  } catch (err) {
    alert(`保存项目失败：${err}`)
  }
}

async function importFromMod() {
  if (mapStore.nodes.length > 0) {
    const ok = confirm('导入将覆盖当前项目，确定继续？')
    if (!ok) return
  }
  const { open } = await import('@tauri-apps/plugin-dialog')
  const dir = await open({
    directory: true,
    multiple: false,
    title: '选择 Mod 目录',
  })
  if (!dir) return
  try {
    const { nodes, edges } = await importFromDir(`${dir}/maps`)
    if (nodes.length === 0) {
      alert(`所选目录中未找到地点数据。

工具会读取：
  {mod目录}/maps/locations/*.toml
  {mod目录}/maps/graph/*.toml

建议选择 era-engine/mods/下的 mod 目录（如 test-mod 或 武侠）。`)
      return
    }
    const laid = autoLayout(nodes)
    mapStore.clear()
    ui.tagColors = {}
    resetUiState()
    mapStore.importData(laid, edges)
    mapStore.sourcePath = dir
  } catch (err) {
    alert(`导入失败: ${err}

工具期望的目录结构：
  {mod目录}/maps/locations/*.toml
  {mod目录}/maps/graph/*.toml`)
  }
}
</script>

<template>
  <div class="file-menu">
    <button @click="newProject">新建</button>
    <button @click="openProject">打开项目</button>
    <button @click="saveProject">保存</button>
    <button @click="importFromMod" title="导入 mod 的 maps/ 目录（需包含 locations/*.toml 和 graph/*.toml）">导入 Mod</button>
  </div>
</template>

<style scoped>
.file-menu { display: flex; gap: 4px; }
.file-menu button { padding: 4px 12px; cursor: pointer; font-size: 13px; }
</style>
