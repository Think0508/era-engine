// 注释：NarrativeLog 叙事日志组件
// 从 game-store 读取 narrativeLogEntries
// 从 ui-store 读取 displayMode（scroll/clear）
// scroll 模式：新条目追加底部 + 自动滚动
// clear 模式：每次 executionState 变 EXECUTING 时清空，新条目独占显示
// interactive entry（type='map'）渲染为 MapView 组件
// 对话选项渲染为可点击/键盘选择的选项列表

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useGameStore, type LogEntry } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'

const gameStore = useGameStore()
const uiStore = useUIStore()

const logContainer = ref<HTMLElement | null>(null)
const focusedChoiceIndex = ref(0)

// 注释：displayMode=clear 时，EXECUTING 开始清空日志
watch(() => gameStore.executionState, (state) => {
  if (uiStore.displayMode === 'clear' && state === 'EXECUTING') {
    gameStore.clearLogEntries()
  }
})

// 注释：新条目时自动滚动到底部（scroll 模式）
watch(() => gameStore.narrativeLogEntries.length, async () => {
  if (uiStore.displayMode === 'scroll') {
    await nextTick()
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight
    }
  }
})

// 注释：按 type 应用样式 class
function entryClass(entry: LogEntry): string {
  return `log-entry log-type-${entry.type}`
}

// 注释：interactive 且未 consumed 的 entry 渲染为可交互
function isInteractive(entry: LogEntry): boolean {
  return entry.interactive === true && entry.consumed !== true
}

// 注释：choice 类型渲染选项列表
function isChoiceEntry(entry: LogEntry): boolean {
  return entry.type === 'choice' || entry.type === 'dialogue_choice'
}

// 注释：获取 choice entry 的选项
function getChoices(entry: LogEntry): { text: string; next?: string }[] {
  return entry.payload?.choices ?? []
}

// 注释：选择选项
function selectChoice(entry: LogEntry, _choiceIndex: number) {
  // TODO(task-5.15): bridge 接入后，选择触发对话系统继续
  // 当前标记 consumed
  gameStore.markLogConsumed(entry.id)
}

// 注释：键盘交互——方向键移动焦点，回车确认
function handleKeydown(e: KeyboardEvent) {
  // 注释：找到最新的可交互 choice entry
  const choiceEntry = [...gameStore.narrativeLogEntries]
    .reverse()
    .find(e => isChoiceEntry(e) && isInteractive(e))
  if (!choiceEntry) return

  const choices = getChoices(choiceEntry)
  if (choices.length === 0) return

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault()
    focusedChoiceIndex.value = (focusedChoiceIndex.value + 1) % choices.length
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault()
    focusedChoiceIndex.value = (focusedChoiceIndex.value - 1 + choices.length) % choices.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    selectChoice(choiceEntry, focusedChoiceIndex.value)
  }
}
</script>

<template>
  <div
    ref="logContainer"
    class="narrative-log"
    tabindex="0"
    @keydown="handleKeydown"
  >
    <div
      v-for="entry in gameStore.narrativeLogEntries"
      :key="entry.id"
      :class="entryClass(entry)"
    >
      <!-- 注释：普通文本条目 -->
      <template v-if="!isChoiceEntry(entry) && entry.type !== 'map'">
        {{ entry.text }}
      </template>

      <!-- 注释：choice 类型——渲染选项列表 -->
      <template v-else-if="isChoiceEntry(entry) && isInteractive(entry)">
        <div class="choice-list">
          <div
            v-for="(choice, idx) in getChoices(entry)"
            :key="idx"
            class="choice-item"
            :class="{ focused: idx === focusedChoiceIndex }"
            @click="selectChoice(entry, idx)"
            @mouseover="focusedChoiceIndex = idx"
          >
            > {{ choice.text }}
          </div>
        </div>
      </template>

      <!-- 注释：map 类型——渲染 MapView 占位（Task 5.11 实现） -->
      <template v-else-if="entry.type === 'map' && isInteractive(entry)">
        <div class="map-placeholder">[MapView: {{ entry.payload?.locationId }}]</div>
      </template>

      <!-- 注释：已 consumed 的 choice 显示空（不重复显示选项） -->
      <template v-else-if="isChoiceEntry(entry) && !isInteractive(entry)">
        <!-- 注释：选项已选择，不显示 -->
      </template>
    </div>
    <p v-if="gameStore.narrativeLogEntries.length === 0" class="log-empty">（等待事件...）</p>
  </div>
</template>

<style scoped>
.narrative-log {
  height: 100%;
  overflow-y: auto;
  padding: var(--gap-small);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  color: var(--color-text);
  outline: none;
}

.log-entry {
  margin-bottom: var(--gap-small);
  line-height: 1.6;
}

/* 注释：按 type 分配颜色/样式 */
.log-type-system { color: var(--color-text-secondary); }
.log-type-combat { color: var(--color-danger); }
.log-type-dialogue { color: var(--color-text); font-style: italic; }
.log-type-movement { color: var(--color-text-secondary); }
.log-type-item { color: var(--color-success); }
.log-type-quest { color: var(--color-warning); }
.log-type-skill { color: var(--color-secondary); }

.choice-list {
  margin: var(--gap-small) 0;
}

.choice-item {
  padding: var(--gap-small);
  cursor: pointer;
  border-radius: var(--radius-button);
  color: var(--color-text);
}

.choice-item:hover,
.choice-item.focused {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.map-placeholder {
  padding: var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  color: var(--color-text-secondary);
}

.log-empty {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}
</style>
