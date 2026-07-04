// 注释：StatusBar 顶栏——仅显示时间/天气/地点
// 资源条在 StatusSection 中显示（玩家+选中角色），不在顶栏

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { formatTime } from '../utils/format-time'

const gameStore = useGameStore()

const timeDisplay = computed(() => formatTime(gameStore.time, gameStore.calendar))
const locationName = computed(() => gameStore.location?.name ?? '未知地点')
const weatherDisplay = computed(() => gameStore.weather.name)
</script>

<template>
  <div class="status-bar">
    <span class="time">{{ timeDisplay }}</span>
    <span class="separator">—</span>
    <span class="weather">{{ weatherDisplay }}</span>
    <span class="separator">—</span>
    <span class="location">{{ locationName }}</span>
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  font-size: 0.7rem;
  color: var(--color-text);
  flex-wrap: wrap;
}
.separator {
  color: var(--color-text-secondary);
}
</style>
