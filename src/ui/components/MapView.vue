// 注释：MapView 地图视图（文字节点列表）
// 显示当前地点名 + parent 链（递归向上）
// 显示 exits 列表：→ 华山练武场 (5min)
// 显示子地点列表（parent === currentLocation.id 的地点）
// 每个可点击项 → 触发移动 effect
// 移动耗时显示在地点名后
// 本地点角色提示

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import GameButton from './GameButton.vue'

const emit = defineEmits<{
  (e: 'move', targetLocationId: string): void
  (e: 'cancel'): void
}>()

const gameStore = useGameStore()

// 注释：当前地点
const currentLocation = computed(() => gameStore.location)

// 注释：exits 列表
const exits = computed(() => currentLocation.value?.exits ?? [])

// 注释：移动到目标地点
function moveTo(targetId: string) {
  emit('move', targetId)
}

// 注释：取消
function cancel() {
  emit('cancel')
}
</script>

<template>
  <div class="map-view">
    <h3 class="map-title">地图</h3>

    <!-- 注释：当前地点 -->
    <div v-if="currentLocation" class="current-location">
      <span class="location-name">{{ currentLocation.name }}</span>
      <span class="location-type">({{ currentLocation.type }})</span>
    </div>

    <!-- 注释：可前往的地点列表 -->
    <div class="exit-list">
      <div class="exit-header">可前往：</div>
      <div
        v-for="exit in exits"
        :key="exit.target"
        class="exit-item"
        @click="moveTo(exit.target)"
      >
        <span class="exit-name">→ {{ exit.name }}</span>
        <span v-if="exit.time_cost" class="exit-time">({{ exit.time_cost }}min)</span>
      </div>
      <p v-if="exits.length === 0" class="no-exits">无可达地点</p>
    </div>

    <!-- 注释：取消按钮 -->
    <div class="map-actions">
      <GameButton label="取消" @click="cancel" />
    </div>
  </div>
</template>

<style scoped>
.map-view {
  padding: var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  max-width: 500px;
  margin: 0 auto;
}

.map-title {
  font-family: var(--font-title);
  color: var(--color-primary);
  margin-bottom: var(--gap-medium);
}

.current-location {
  margin-bottom: var(--gap-medium);
  padding: var(--gap-small);
  background-color: var(--color-background);
  border-radius: var(--radius-button);
}

.location-name {
  font-weight: bold;
  color: var(--color-text);
}

.location-type {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  margin-left: var(--gap-small);
}

.exit-list {
  margin-bottom: var(--gap-medium);
}

.exit-header {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-bottom: var(--gap-small);
}

.exit-item {
  display: flex;
  align-items: center;
  gap: var(--gap-small);
  padding: var(--gap-small);
  cursor: pointer;
  border-radius: var(--radius-button);
  color: var(--color-text);
  min-height: 44px;
  transition: background-color 0.2s;
}

.exit-item:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.exit-name {
  flex: 1;
}

.exit-time {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

.exit-item:hover .exit-time {
  color: var(--color-surface);
}

.no-exits {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

.map-actions {
  display: flex;
  justify-content: center;
}
</style>
