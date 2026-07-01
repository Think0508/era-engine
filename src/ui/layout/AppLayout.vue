// 注释：AppLayout 根布局——按 (executionState × mode × theme) 选子布局

<script setup lang="ts">
import { computed, inject, provide } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { SlotRegistry, SLOT_REGISTRY_KEY } from '../slots/slot-registry'
import ExplorationLayout from './ExplorationLayout.vue'
import ModernLayout from './ModernLayout.vue'
import FullScreenTextLayout from './FullScreenTextLayout.vue'
import DailyMenuLayout from './DailyMenuLayout.vue'

// 注释：使用 main.ts 提供的 SlotRegistry（不存在时自己创建兜底）
const slotRegistry = inject<SlotRegistry>(SLOT_REGISTRY_KEY) ?? new SlotRegistry()
provide(SLOT_REGISTRY_KEY, slotRegistry)

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：布局决策
const layoutComponent = computed(() => {
  // EXECUTING 状态 → 全屏文本布局
  if (gameStore.isExecuting) return FullScreenTextLayout
  // 每日菜单模式
  if (gameStore.currentMode === 'daily_menu') return DailyMenuLayout
  // 对话模式 → 全屏文本（对话在日志中处理）
  if (gameStore.currentMode === 'dialogue') return FullScreenTextLayout
  // 探索/战斗模式 → 按 UI 主题选择
  // TODO: modeTransitionStyle mod 自定义过渡效果，当前瞬间替换
  return uiStore.theme === 'era' ? ExplorationLayout : ModernLayout
})
</script>

<template>
  <component :is="layoutComponent" />
</template>
