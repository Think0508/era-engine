// 注释：FullscreenHistory — 全屏历史日志（从 gameStore 读取所有 entry）

<script setup lang="ts">
import { useGameStore } from '../stores/game-store'
import FormattedText from './FormattedText.vue'

const gameStore = useGameStore()
const emit = defineEmits<{ (e: 'done'): void }>()

const entries = gameStore.historyLog

function entryClass(entry: any): string {
  return `hist-entry hist-type-${entry.type}`
}
</script>

<template>
  <div class="fullscreen-history" @click="emit('done')">
    <div class="history-scroll">
      <div
        v-for="entry in entries"
        :key="entry.id"
        :class="entryClass(entry)"
      >
        <FormattedText :text="entry.text" />
      </div>
      <div v-if="entries.length === 0" class="empty-hint">（无日志记录）</div>
    </div>
  </div>
</template>

<style scoped>
.fullscreen-history {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  cursor: pointer;
  z-index: 200;
  display: flex;
  flex-direction: column;
}

.history-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--gap-large);
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
}

.hist-entry {
  margin-bottom: var(--gap-medium);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.hist-type-system { color: var(--color-text-secondary); }
.hist-type-combat { color: var(--color-danger); }
.hist-type-dialogue { color: var(--color-text); }
.hist-type-movement { color: var(--color-text-secondary); }
.hist-type-item { color: var(--color-success); }
.hist-type-quest { color: var(--color-warning); }

.empty-hint {
  color: var(--color-text-secondary);
  text-align: center;
  padding: var(--gap-large);
}
</style>