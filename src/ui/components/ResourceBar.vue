// 注释：ResourceBar 通用资源条
// 渲染：快C 0 [████░░░░] 0/100 风格（label + value + 短进度条）
// 进度条用 CSS 变量着色，value/max 为 0 时显示空条

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  value: number
  max: number
  color?: string
}>(), {
  color: 'var(--color-primary)',
})

// 注释：进度百分比（0-100），max 为 0 时显示 0%
const percent = computed(() => {
  if (props.max <= 0) return 0
  return Math.min(100, Math.max(0, (props.value / props.max) * 100))
})
</script>

<template>
  <div class="resource-bar">
    <span class="resource-label">{{ label }}</span>
    <div class="resource-track">
      <div class="resource-fill" :style="{ width: percent + '%', backgroundColor: color }" />
    </div>
    <span class="resource-value">{{ value }}/{{ max }}</span>
  </div>
</template>

<style scoped>
.resource-bar {
  display: flex;
  align-items: center;
  gap: var(--gap-small);
  font-size: 0.875rem;
}

.resource-label {
  min-width: 3em;
  color: var(--color-text);
}

.resource-track {
  flex: 1;
  height: 8px;
  background-color: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
  min-width: 60px;
}

.resource-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.resource-value {
  min-width: 4em;
  text-align: right;
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}
</style>
