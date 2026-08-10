<!-- 注释：事件选项条——随机事件父事件的子事件选项（IDLE 时渲染在指令栏上方） -->
<!-- 选择后调 random-event API；选项只做动作，事件文本已由插件输出到叙事日志 -->

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'
import { apiSystem } from '../../core/api'

const uiStore = useUIStore()

async function choose(index: number) {
  await apiSystem.call('random-event', 'chooseOption', index)
  uiStore.setEventOptions(null)
}
</script>

<template>
  <div v-if="uiStore.eventOptions && uiStore.eventOptions.length" class="event-option-bar">
    <button
      v-for="(opt, index) in uiStore.eventOptions"
      :key="opt.id"
      class="event-option-button"
      @click="choose(index)"
    >
      {{ opt.text }}
    </button>
  </div>
</template>

<style scoped>
.event-option-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-small, 8px);
  padding: var(--gap-small, 8px);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.event-option-button {
  min-height: 44px;
  padding: 4px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button, 2px);
  background-color: var(--color-primary);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  cursor: pointer;
}

.event-option-button:hover {
  filter: brightness(1.1);
}
</style>
