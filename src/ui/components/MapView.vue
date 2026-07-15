<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGameStore } from '../stores/game-store'
import { narrativeLog } from '../../core/narrative-log'
import { apiSystem } from '../../core/api'
import { gameContext } from '../../core/game-context'

const gameStore = useGameStore()
const layoutData = ref<any>(null)
const error = ref('')
const currentZoom = ref(1)

onMounted(async () => {
  try {
    const loc = gameStore.location
    if (!loc) { error.value = '当前位置未知'; return }
    const result = await apiSystem.call('map', 'getMapLayout', loc.id)
    if (!result) { error.value = '该区域暂无视觉地图'; return }
    layoutData.value = result.layout
  } catch (e) {
    error.value = `地图加载失败: ${e}`
  }
})

const visibleNodes = computed(() => {
  if (!layoutData.value) return []
  return layoutData.value.nodes.filter((n: any) => {
    const z = n.zoom ?? [1, 1]
    return currentZoom.value >= z[0] && currentZoom.value <= z[1]
  })
})

const visibleEdges = computed(() => {
  if (!layoutData.value) return []
  return layoutData.value.edges.filter((e: any) => {
    const z = e.zoom ?? [1, 1]
    return currentZoom.value >= z[0] && currentZoom.value <= z[1]
  })
})

function getNodeStyle(node: any, containerW: number, containerH: number) {
  return {
    left: `${node.x * 100}%`,
    top: `${node.y * 100}%`,
    width: `${node.w * 100}%`,
    height: `${node.h * 100}%`,
  }
}

async function handleNodeClick(nodeId: string) {
  try {
    await apiSystem.call('map', 'moveTo', nodeId)
    await gameContext.exitMode()
  } catch {
    narrativeLog.write('无法到达该地点', 'system', 'map-system')
  }
}

function handleZoomIn() { currentZoom.value = Math.min(currentZoom.value + 1, layoutData.value?.zoomLevels ?? 3) }
function handleZoomOut() { currentZoom.value = Math.max(currentZoom.value - 1, 1) }
</script>

<template>
  <div class="visual-map" v-if="layoutData">
    <img v-if="layoutData.background" :src="layoutData.background" class="map-bg" />
    <svg class="map-svg" v-if="visibleEdges.length > 0">
      <path
        v-for="edge in visibleEdges"
        :key="edge.from + '-' + edge.to"
        :d="'M ' + edge.path.map((p:any,i:number) => (i===0?'M':'C')+' '+p.x*100+'% '+p.y*100+'%').join(' ')"
        stroke="rgba(255,255,255,0.4)" stroke-width="2" fill="none"
      />
    </svg>
    <div
      v-for="node in visibleNodes"
      :key="node.id"
      class="map-node"
      :style="getNodeStyle(node, 100, 100)"
      @click="handleNodeClick(node.id)"
    >
      <div class="node-label">{{ node.id }}</div>
    </div>
    <div class="zoom-controls">
      <button @click="handleZoomIn">+</button>
      <span>{{ currentZoom }}</span>
      <button @click="handleZoomOut">−</button>
    </div>
  </div>
  <div v-else-if="error" class="map-fallback">
    <p>{{ error }}</p>
    <p>当前地点：{{ gameStore.location?.name }}</p>
    <div class="map-exit"><button @click="gameContext.exitMode()">关闭</button></div>
  </div>
</template>

<style scoped>
.visual-map { position: relative; width: 100%; height: 100%; overflow: hidden; }
.map-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.map-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.map-node {
  position: absolute; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: rgba(59,130,246,0.3); border: 2px solid rgba(59,130,246,0.7);
  border-radius: 4px; transition: background 0.2s;
}
.map-node:hover { background: rgba(59,130,246,0.5); }
.node-label { color: #fff; font-size: 12px; text-shadow: 0 1px 3px rgba(0,0,0,0.8); pointer-events: none; }
.zoom-controls {
  position: absolute; bottom: 16px; right: 16px; display: flex; gap: 4px; align-items: center;
  background: rgba(0,0,0,0.5); padding: 4px 8px; border-radius: 4px;
}
.zoom-controls button { padding: 2px 10px; cursor: pointer; background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 2px; font-size: 16px; }
.zoom-controls span { color: #fff; font-size: 12px; min-width: 20px; text-align: center; }
.map-fallback { padding: 40px; color: #94a3b8; text-align: center; }
.map-fallback button { padding: 8px 24px; cursor: pointer; margin-top: 16px; }
.map-exit { margin-top: 20px; }
</style>
