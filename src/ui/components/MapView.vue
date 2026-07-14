<script setup lang="ts">
import GameButton from './GameButton.vue'

interface ReachableLocation {
  target: string
  name: string
  time_cost: number
  via: 'parent' | 'child' | 'graph'
}

const props = defineProps<{
  currentLocationName: string
  currentLocationType: string
  reachable: ReachableLocation[]
}>()

const emit = defineEmits<{
  (e: 'move', targetLocationId: string): void
  (e: 'cancel'): void
}>()

function moveTo(targetId: string) {
  emit('move', targetId)
}

function cancel() {
  emit('cancel')
}
</script>

<template>
  <div class="map-view">
    <h3 class="map-title">地图</h3>

    <div class="current-location">
      <span class="location-name">{{ currentLocationName }}</span>
      <span class="location-type">({{ currentLocationType }})</span>
    </div>

    <div class="exit-list">
      <div v-if="reachable.filter(r => r.via === 'parent').length > 0" class="exit-group">
        <div class="exit-header">上层区域：</div>
        <div
          v-for="r in reachable.filter(r => r.via === 'parent')"
          :key="r.target"
          class="exit-item"
          @click="moveTo(r.target)"
        >
          <span class="exit-name">↑ {{ r.name }}</span>
          <span class="exit-time">({{ r.time_cost }}min)</span>
        </div>
      </div>

      <div v-if="reachable.filter(r => r.via === 'child').length > 0" class="exit-group">
        <div class="exit-header">子区域：</div>
        <div
          v-for="r in reachable.filter(r => r.via === 'child')"
          :key="r.target"
          class="exit-item"
          @click="moveTo(r.target)"
        >
          <span class="exit-name">→ {{ r.name }}</span>
          <span class="exit-time">({{ r.time_cost }}min)</span>
        </div>
      </div>

      <div v-if="reachable.filter(r => r.via === 'graph').length > 0" class="exit-group">
        <div class="exit-header">路径：</div>
        <div
          v-for="r in reachable.filter(r => r.via === 'graph')"
          :key="r.target"
          class="exit-item"
          @click="moveTo(r.target)"
        >
          <span class="exit-name">→ {{ r.name }}</span>
          <span class="exit-time">({{ r.time_cost }}min)</span>
        </div>
      </div>

      <p v-if="reachable.length === 0" class="no-exits">无可达地点</p>
    </div>

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

.exit-group {
  margin-bottom: var(--gap-small);
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
