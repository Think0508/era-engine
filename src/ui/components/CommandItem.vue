// 注释：CommandItem 单条指令
// 渲染：label [number] 或 label（showCommandNumbers 关闭时）
// 编号显示在指令后
// 收藏标记（星标）
// 点击 → emit('execute', commandId)

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'
import GameButton from './GameButton.vue'

const props = withDefaults(defineProps<{
  label: string
  commandId: string
  number?: number
  active?: boolean
  disabled?: boolean
}>(), {
  number: undefined,
  active: false,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'execute', commandId: string): void
}>()

const uiStore = useUIStore()

const isFavorite = () => uiStore.favorites.includes(props.commandId)

function toggleFavorite(e: Event) {
  e.stopPropagation()
  if (isFavorite()) {
    uiStore.removeFavorite(props.commandId)
  } else {
    uiStore.addFavorite(props.commandId)
  }
}
</script>

<template>
  <div class="command-item">
    <span class="favorite-star" :class="{ active: isFavorite() }" @click="toggleFavorite">★</span>
    <GameButton
      :label="label"
      :command-id="commandId"
      :number="number"
      :active="active"
      :disabled="disabled"
      @click="emit('execute', commandId)"
    />
  </div>
</template>

<style scoped>
.command-item {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-small);
}

.favorite-star {
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  user-select: none;
}

.favorite-star.active {
  color: var(--color-warning);
}
</style>
