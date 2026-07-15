<script setup lang="ts">
import { gameContext } from '../../core/game-context'
import MapView from '../components/MapView.vue'

async function goBack() { await gameContext.exitMode() }

async function goUp() {
  const loc = gameContext.getContext().location
  if (!loc?.parent) return
  await gameContext.moveTo(loc.parent)
}
</script>

<template>
  <div class="map-layout">
    <div class="map-header">
      <button class="map-btn" @click="goBack">返回</button>
      <button class="map-btn" @click="goUp">上一层</button>
    </div>
    <div class="map-content"><MapView /></div>
  </div>
</template>

<style scoped>
.map-layout { display: flex; flex-direction: column; height: 100%; background: #000; }
.map-header { display: flex; gap: 8px; padding: 8px 12px; background: rgba(0,0,0,0.7); z-index: 10; }
.map-btn { padding: 6px 16px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; cursor: pointer; font-size: 14px; }
.map-btn:hover { background: rgba(255,255,255,0.2); }
.map-content { flex: 1; position: relative; overflow: hidden; }
</style>
