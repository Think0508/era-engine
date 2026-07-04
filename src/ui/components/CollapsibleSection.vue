// 注释：CollapsibleSection 通用折叠区块
// 标题栏可点击切换折叠，显示 [+]/[-]
// 折叠状态通过 foldKey 同步到 ui-store（支持保存到存档）
// 支持嵌套（内部可再放 CollapsibleSection）

<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from '../stores/ui-store'

const props = withDefaults(defineProps<{
  title: string
  foldKey?: string
  defaultFolded?: boolean
}>(), {
  foldKey: undefined,
  defaultFolded: false,
})

const uiStore = useUIStore()

// 注释：有 foldKey 时从 ui-store 读取，否则用 defaultFolded
const folded = computed(() => {
  if (props.foldKey) {
    return uiStore.isFolded(props.foldKey)
  }
  return props.defaultFolded
})

function toggle() {
  if (props.foldKey) {
    uiStore.toggleFold(props.foldKey)
  }
}
</script>

<template>
  <div class="collapsible-section">
    <div class="section-header" @click="toggle">
      <span class="toggle-icon">{{ folded ? '[+]' : '[-]' }}</span>
      <span class="section-title">{{ title }}</span>
    </div>
    <div v-show="!folded" class="section-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.collapsible-section {
  border-bottom: none;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  cursor: pointer;
  user-select: none;
  color: var(--color-text-secondary);
  font-weight: bold;
  font-size: 0.7rem;
}

.section-header:hover {
  background-color: var(--color-surface);
}

.toggle-icon {
  color: var(--color-text-secondary);
  font-size: 0.65rem;
  min-width: 1.2em;
}

.section-title {
  flex: 1;
}

.section-content {
  padding: 1px 8px 4px;
}
</style>
