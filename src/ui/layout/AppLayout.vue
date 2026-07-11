// 注释：AppLayout 根布局——按 (executionState × mode × theme) 选子布局

<script setup lang="ts">
import { computed, inject, provide, ref, shallowRef } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { SlotRegistry, SLOT_REGISTRY_KEY } from '../slots/slot-registry'
import ExplorationLayout from './ExplorationLayout.vue'
import ModernLayout from './ModernLayout.vue'
import FullScreenTextLayout from './FullScreenTextLayout.vue'
import DailyMenuLayout from './DailyMenuLayout.vue'
import CombatLayout from './CombatLayout.vue'
import FullscreenOutput from '../components/FullscreenOutput.vue'

// 注释：使用 main.ts 提供的 SlotRegistry（不存在时自己创建兜底）
const slotRegistry = inject<SlotRegistry>(SLOT_REGISTRY_KEY) ?? new SlotRegistry()
provide(SLOT_REGISTRY_KEY, slotRegistry)

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：是否显示全屏输出（output 模式或 EXECUTING）
const showOutput = computed(() => gameStore.currentMode === 'output' && !gameStore.isExecuting)
const showLog = computed(() => gameStore.currentMode === 'log')

// 注释：输出模式退出回调
function onOutputDone() {
  gameStore.popMode()
  gameStore.clearLogEntries()
}

// 日志模式退出
function onLogDone() {
  gameStore.popMode()
}

// 注释：布局决策（不含 output 模式——用 overlay 处理）
const layoutComponent = computed(() => {
  // EXECUTING 状态 → 全屏文本布局
  if (gameStore.isExecuting) return FullScreenTextLayout
  // 每日菜单模式
  if (gameStore.currentMode === 'daily_menu') return DailyMenuLayout
  // 战斗模式 → 战斗专用布局
  if (gameStore.currentMode === 'combat') return CombatLayout
  // 对话模式 → 全屏文本（对话在日志中处理）
  if (gameStore.currentMode === 'dialogue') return FullScreenTextLayout
  // 日志模式 → 全屏历史日志
  if (gameStore.currentMode === 'log') return FullScreenTextLayout
  // 探索/其他模式 → 按 UI 主题选择
  return uiStore.theme === 'era' ? ExplorationLayout : ModernLayout
})
</script>

<template>
  <!-- 注释：主布局 -->
  <component :is="layoutComponent" />

  <!-- 注释：全屏输出 overlay（output 模式） -->
  <FullscreenOutput v-if="showOutput" @done="onOutputDone" />
</template>
