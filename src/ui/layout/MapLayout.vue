<script setup lang="ts">
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import MapView from '../components/MapView.vue'

async function goBack() { await gameContext.exitMode() }

async function goUp() {
  const loc = gameContext.getContext().location
  if (!loc?.parent) return
  // 注释：audit-g 修复——原直连 gameContext.moveTo：① 不更新玩家 current_location
  // （读档地点恢复/NPC 同地点判定/follow 数据源失真）② 跳过可达性检查。改走 map API
  // （内部同步 current_location + getReachable 校验，与指令/地图点击同路径）
  try {
    await apiSystem.call('map', 'moveTo', loc.parent)
  } catch {
    // 注释：不可达/失败——保持原地（map API 已上报错误）
  }
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
