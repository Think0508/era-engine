// 注释：StatusSection Status 折叠区
// 第 1 行：玩家 ResourceBar（体力/气力/精力 + 扩展）
// 第 2 行：选中角色 ResourceBar（有选中时）
// 第 3 行：选中角色的情绪/理性（display_group="emotion" 的属性）
// 特殊情况行（status_effects 提示，Phase 5 占位）
// 无选中角色时：只显示玩家行
// status-extra 插槽供插件扩展

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import CollapsibleSection from './CollapsibleSection.vue'
import ResourceBar from './ResourceBar.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：玩家资源条（display_group="status"）
const playerStatusBars = computed(() => {
  const player = gameStore.player
  if (!player?.base) return []
  const base = player.base as Record<string, number>
  const knownStatus = ['体力', '气力', '精力', 'hp', 'mp']
  return knownStatus.filter(key => key in base).map(key => ({
    label: key,
    value: base[key],
  }))
})

// 注释：选中角色
const selectedCharacter = computed(() => {
  if (!uiStore.selectedCharacterId) return null
  return gameStore.charactersAtLocation.find(c => c.id === uiStore.selectedCharacterId) ?? null
})

// 注释：选中角色资源条
const selectedStatusBars = computed(() => {
  const char = selectedCharacter.value
  if (!char?.base) return []
  const base = char.base as Record<string, number>
  const knownStatus = ['体力', '气力', '精力', 'hp', 'mp']
  return knownStatus.filter(key => key in base).map(key => ({
    label: key,
    value: base[key],
  }))
})

// 注释：情绪/理性（display_group="emotion"）
const emotionBars = computed(() => {
  const char = selectedCharacter.value
  if (!char?.base) return []
  const base = char.base as Record<string, number>
  const knownEmotion = ['情绪', '理性']
  return knownEmotion.filter(key => key in base).map(key => ({
    label: key,
    value: base[key],
  }))
})
</script>

<template>
  <CollapsibleSection title="Status" fold-key="status">
    <div class="status-content">
      <!-- 注释：玩家行 -->
      <div class="status-row">
        <span class="row-label">你</span>
        <ResourceBar
          v-for="bar in playerStatusBars"
          :key="bar.label"
          :label="bar.label"
          :value="bar.value"
        />
      </div>

      <!-- 注释：选中角色行（有选中时） -->
      <div v-if="selectedCharacter" class="status-row">
        <span class="row-label">{{ selectedCharacter.name }}</span>
        <ResourceBar
          v-for="bar in selectedStatusBars"
          :key="bar.label"
          :label="bar.label"
          :value="bar.value"
        />
      </div>

      <!-- 注释：情绪/理性行（有选中时） -->
      <div v-if="emotionBars.length > 0" class="status-row">
        <ResourceBar
          v-for="bar in emotionBars"
          :key="bar.label"
          :label="bar.label"
          :value="bar.value"
          color="var(--color-secondary)"
        />
      </div>

      <!-- 注释：status-extra 插槽（插件扩展） -->
      <!-- TODO(phase-6+): 插件通过 SlotRegistry 注册 status-extra -->
    </div>
  </CollapsibleSection>
</template>

<style scoped>
.status-content {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.status-row {
  display: flex;
  align-items: center;
  gap: var(--gap-small);
  flex-wrap: wrap;
}

.row-label {
  min-width: 3em;
  color: var(--color-text);
  font-weight: bold;
  font-size: 0.875rem;
}
</style>
