<script setup lang="ts">
import FileMenu from './FileMenu.vue'
import ExportBar from './ExportBar.vue'
import { useUiStore } from '../stores/uiStore'
import { useMapStore } from '../stores/mapStore'

const ui = useUiStore()
const mapStore = useMapStore()
</script>

<template>
  <div class="toolbar">
    <FileMenu />
    <div class="toolbar-divider" />
    <label class="toggle-item" title="节点上显示 ID 而非名称">
      <input type="checkbox" :checked="ui.showIdOnNode" @change="ui.toggleShowId()" />
      显示 ID
    </label>
    <label class="toggle-item" title="编辑名称时自动同步修改 ID">
      <input type="checkbox" :checked="ui.syncNameToId" @change="ui.toggleSyncName()" />
      名称→ID 同步
    </label>
    <label class="toggle-item" title="按层级给节点不同底色">
      <input type="checkbox" :checked="ui.levelColors" @change="ui.toggleLevelColors()" />
      层级配色
    </label>
    <div class="toolbar-divider" />
    <label class="toggle-item" title="切换至视觉地图模式（背景图+点击区域）">
      <input type="checkbox" :checked="mapStore.isModeB" @change="mapStore.toggleModeB()" />
      视觉地图
    </label>
    <div class="spacer" />
    <ExportBar />
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; padding: 4px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; height: 36px; gap: 8px; font-size: 13px; }
.toolbar-divider { width: 1px; height: 20px; background: #e2e8f0; }
.toggle-item { display: flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
.toggle-item input { margin: 0; cursor: pointer; }
.spacer { flex: 1; }
</style>
