// 注释：StatusBar 顶栏
// 显示：formatTime(time, calendar) — weather.name — 气温{weather.temperature}℃
// 显示地点名（从 location.name）
// 资源条：从 player entity 读取 display=true 且 display_group="status" 的属性
// 默认 3 条（体力/气力/精力 — 由 mod 的 attributes.toml 定义）
// 特殊状态标记占位（Phase 5）

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { formatTime } from '../utils/format-time'
import ResourceBar from './ResourceBar.vue'

const gameStore = useGameStore()

// 注释：格式化时间显示
const timeDisplay = computed(() => {
  return formatTime(gameStore.time, gameStore.calendar)
})

// 注释：地点名
const locationName = computed(() => gameStore.location?.name ?? '未知地点')

// 注释：天气显示
const weatherDisplay = computed(() => {
  const w = gameStore.weather
  return `${w.name} ${w.temperature}℃`
})

// 注释：玩家资源条——从 player.base 读取
// TODO(task-5.15): bridge 接入后从真实 attribute definitions 读取 display/display_group
// 当前简化：从 player.base 读取已知属性
const statusBars = computed(() => {
  const player = gameStore.player
  if (!player?.base) return []
  const base = player.base as Record<string, number>
  // 注释：era 默认 3 条：体力/气力/精力
  const knownStatus = ['体力', '气力', '精力', 'hp', 'mp']
  return knownStatus
    .filter(key => key in base)
    .map(key => ({
      label: key,
      value: base[key],
      max: 100, // TODO: 从 attribute definitions 读取 max
    }))
})
</script>

<template>
  <div class="status-bar">
    <div class="status-info">
      <span class="time">{{ timeDisplay }}</span>
      <span class="separator">—</span>
      <span class="weather">{{ weatherDisplay }}</span>
      <span class="separator">—</span>
      <span class="location">{{ locationName }}</span>
    </div>
    <div class="status-bars">
      <ResourceBar
        v-for="bar in statusBars"
        :key="bar.label"
        :label="bar.label"
        :value="bar.value"
        :max="bar.max"
      />
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.status-info {
  display: flex;
  align-items: center;
  gap: var(--gap-small);
  font-size: 0.875rem;
  color: var(--color-text);
  flex-wrap: wrap;
}

.separator {
  color: var(--color-text-secondary);
}

.status-bars {
  display: flex;
  gap: var(--gap-medium);
  flex-wrap: wrap;
}
</style>
