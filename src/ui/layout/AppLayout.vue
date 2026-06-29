// 注释：AppLayout 根布局——按 (executionState × mode × theme) 选子布局
// 决策树：
//   EXECUTING → FullScreenTextLayout
//   daily_menu → DailyMenuLayout
//   combat → era经典: ExplorationLayout / 现代: ModernLayout（指令栏换战斗指令，Phase 5 骨架）
//   dialogue → FullScreenTextLayout（对话在日志中处理）
//   exploration → theme === 'era' ? ExplorationLayout : ModernLayout
// provide SlotRegistry

<script setup lang="ts">
import { computed, provide } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { SlotRegistry, SLOT_REGISTRY_KEY } from '../slots/slot-registry'
import ExplorationLayout from './ExplorationLayout.vue'
import ModernLayout from './ModernLayout.vue'
import FullScreenTextLayout from './FullScreenTextLayout.vue'
import DailyMenuLayout from './DailyMenuLayout.vue'

// 注释：创建 SlotRegistry 实例并 provide
// TODO(phase-6+): 插件通过 ctx.ui.registerSlot 注册到此实例
const slotRegistry = new SlotRegistry()
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
