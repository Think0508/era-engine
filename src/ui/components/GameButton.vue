// 注释：GameButton 主题按钮
// 渲染：交谈 [12] 或 交谈（showCommandNumbers 关闭时）
// 编号显示在指令后
// active 状态用 CSS 变量高亮，disabled 灰色

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'

const props = withDefaults(defineProps<{
  label: string
  commandId?: string
  number?: number
  active?: boolean
  disabled?: boolean
}>(), {
  commandId: undefined,
  number: undefined,
  active: false,
  disabled: false,
})

const emit = defineEmits<{
  (e: 'click', commandId: string): void
}>()

const uiStore = useUIStore()

function handleClick() {
  if (props.disabled) return
  if (props.commandId) {
    emit('click', props.commandId)
  }
}
</script>

<template>
  <button
    class="game-button"
    :class="{ active, disabled }"
    :disabled="disabled"
    @click="handleClick"
  >
    <span class="button-label">{{ label }}</span>
    <span v-if="number !== undefined && uiStore.showCommandNumbers" class="button-number">[{{ number }}]</span>
  </button>
</template>

<style scoped>
.game-button {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-small);
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  cursor: pointer;
  transition: all 0.2s;
  /* 注释：移动端按钮最小 44px（AGENTS.md 样式铁律） */
  min-height: 44px;
}

.game-button:hover:not(.disabled) {
  background-color: var(--color-primary);
  color: var(--color-surface);
  border-color: var(--color-primary);
}

.game-button.active {
  background-color: var(--color-secondary);
  color: var(--color-surface);
  border-color: var(--color-secondary);
}

.game-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.button-number {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

.game-button:hover:not(.disabled) .button-number {
  color: var(--color-surface);
}
</style>
