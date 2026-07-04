// 注释：ResourceBar 通用资源条
// 渲染：快C 0 [████░░░░] 0/100 风格（label + value + 短进度条）
// 进度条用 CSS 变量着色，value/max 为 0 时显示空条

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  value: number
  max?: number
  color?: string
}>(), {
  max: undefined,
  color: 'var(--color-primary)',
})

const percent = computed(() => {
  if (props.max === undefined || props.max <= 0) return undefined
  return Math.min(100, Math.max(0, (props.value / props.max) * 100))
})
</script>

<template>
  <div class="resource-bar">
    <span class="resource-label">{{ label }}</span>
    <div v-if="percent !== undefined" class="resource-track">
      <div class="resource-fill" :style="{ width: percent + '%', backgroundColor: color }" />
    </div>
    <span class="resource-value">{{ value }}{{ max !== undefined ? '/' + max : '' }}</span>
  </div>
</template>

<style scoped>
.resource-bar {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 0.65rem;
}

.resource-label {
  min-width: 2em;
  color: var(--color-text);
}

.resource-track {
  flex: 1;
  height: 4px;
  background-color: var(--color-border);
  border-radius: 1px;
  overflow: hidden;
  min-width: 40px;
}

.resource-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.resource-value {
  min-width: 3em;
  text-align: right;
  color: var(--color-text-secondary);
  font-size: 0.6rem;
}
</style>
