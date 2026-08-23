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
import FormattedText from './FormattedText.vue'
import TypewriterText from './TypewriterText.vue'
import MapView from './MapView.vue'
import { toCssColor } from '../utils/color'
import { displaySizeToCss } from '../utils/display-style'

const gameStore = useGameStore()
const uiStore = useUIStore()

const emit = defineEmits<{
  (e: 'move', targetLocationId: string): void
  (e: 'cancel'): void
}>()

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

// 注释：typewriter 完成
function onTypewriterComplete(entry: LogEntry) {
  if (entry._display?.trigger !== 'click') {
    gameStore.markLogConsumed(entry.id)
  }
}

// 注释：点击继续——标记当前 line 已消费
function consumeClickEntry(entry: LogEntry) {
  gameStore.markLogConsumed(entry.id)
}

// 注释：map 交互——移动
function handleMapMove(targetId: string, entry: LogEntry) {
  gameStore.markLogConsumed(entry.id)
  emit('move', targetId)
}

// 注释：map 交互——取消
function handleMapCancel(entry: LogEntry) {
  gameStore.markLogConsumed(entry.id)
  emit('cancel')
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
      :data-display="entry._display ? JSON.stringify(entry._display) : ''"
    >
      <!-- 注释：普通文本条目 — BBCode 解析渲染（支持 typewriter/click） -->
      <template v-if="!isChoiceEntry(entry) && entry.type !== 'map'">
        <template v-if="entry._display?.display === 'typewriter'">
          <span :style="{ color: entry._display?.color ? toCssColor(entry._display.color) : undefined, fontFamily: entry._display?.font, fontSize: displaySizeToCss(entry._display?.size) }">
            <TypewriterText
              :text="entry.text"
              :speed="entry._display.speed ?? 60"
              @complete="onTypewriterComplete(entry)"
            />
          </span>
        </template>
        <template v-else>
          <FormattedText
            :text="entry.text"
            :color="entry._display?.color"
            :font="entry._display?.font"
            :size="displaySizeToCss(entry._display?.size)"
          />
        </template>
        <span
          v-if="entry._display?.trigger === 'click' && !entry.consumed"
          class="click-hint"
          @click="consumeClickEntry(entry)"
        >▼ 点击继续</span>
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

      <!-- 注释：map 类型——渲染 MapView -->
      <template v-else-if="entry.type === 'map' && isInteractive(entry)">
        <MapView
          :current-location-name="entry.payload?.locationName ?? ''"
          :current-location-type="entry.payload?.locationType ?? ''"
          :reachable="entry.payload?.reachable ?? []"
          @move="(targetId: string) => handleMapMove(targetId, entry)"
          @cancel="handleMapCancel(entry)"
        />
      </template>

      <!-- 注释：已 consumed 的 choice 显示空（不重复显示选项） -->
      <template v-else-if="isChoiceEntry(entry) && !isInteractive(entry)">
        <!-- 注释：选项已选择，不显示 -->
      </template>
    </div>
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

.click-hint {
  display: inline-block;
  margin-left: var(--gap-small);
  font-size: 0.65rem;
  color: var(--color-text-secondary);
  cursor: pointer;
  animation: pulse 1.5s ease-in-out infinite;
  user-select: none;
}

@keyframes pulse {
  50% { opacity: 0.4; }
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
