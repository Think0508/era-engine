// 注释：FullscreenOutput —— 全屏输出模式下逐条显示日志条目
// 指令执行完后自动进入此模式
// auto 条目自动连续显示，click 条目需点击推进
// 最后一条显示完后点击回主界面

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useGameStore, type LogEntry } from '../stores/game-store'
import FormattedText from './FormattedText.vue'

const gameStore = useGameStore()
const emit = defineEmits<{ (e: 'done'): void }>()

// 当前已消费到第几条（exclusive——currentBatch 显示 [0, cursor) 的条目）
const cursor = ref(0)
// 当前轮是否在等待点击
const waitingForClick = ref(false)
// 当前轮是否已全部显示完（等最后一次点击退出）
const allDone = ref(false)
const scrollRef = ref<HTMLElement | null>(null)

// 本轮显示的条目（从 gameStore 里取最近的未消费批次）
const entries = computed<LogEntry[]>(() => {
  return gameStore.narrativeLogEntries
})

// 当前应该显示的条目（[0, cursor)）
const visibleEntries = computed<LogEntry[]>(() => {
  return entries.value.slice(0, cursor.value)
})

// 推进逻辑：显示到下一个 click 断点（或末尾）
function advance() {
  if (allDone.value) return

  let i = cursor.value
  while (i < entries.value.length) {
    const entry = entries.value[i]
    const trigger = entry.payload?._display?.trigger ?? 'auto'
    // 显示这条
    cursor.value = i + 1
    if (trigger === 'click') {
      // click 条目已显示，停住等下次点击
      // 如果不是最后一条，等点击；如果是最后一条，转 allDone
      if (cursor.value >= entries.value.length) {
        allDone.value = true
      } else {
        waitingForClick.value = true
      }
      return
    }
    i++
  }
  // 全是 auto，走到末尾
  allDone.value = true
}

// 初始化
function init() {
  cursor.value = 0
  waitingForClick.value = false
  allDone.value = false
  advance()
}

// 全局点击推进
function handleClick() {
  if (allDone.value) {
    emit('done')
    return
  }
  if (waitingForClick.value) {
    waitingForClick.value = false
    advance()
  }
}

// 自动滚动到底部
watch(cursor, async () => {
  await nextTick()
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  }
})

onMounted(() => {
  init()
})

// 条目类型样式
function entryClass(entry: LogEntry): string {
  return `output-entry output-type-${entry.type}`
}

function isChoiceEntry(entry: LogEntry): boolean {
  return entry.type === 'choice' || entry.type === 'dialogue_choice'
}
</script>

<template>
  <div class="fullscreen-output" @click="handleClick">
    <div ref="scrollRef" class="output-scroll">
      <div
        v-for="entry in visibleEntries"
        :key="entry.id"
        :class="entryClass(entry)"
      >
        <!-- 普通文本 -->
        <template v-if="!isChoiceEntry(entry)">
          <FormattedText :text="entry.text" />
        </template>

        <!-- 对话选项 -->
        <template v-else-if="isChoiceEntry(entry)">
          <div class="choice-list">
            <div
              v-for="(choice, idx) in (entry.payload?.choices ?? [])"
              :key="idx"
              class="choice-item"
            >
              > {{ choice.text }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fullscreen-output {
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

.output-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--gap-large) var(--gap-large) var(--gap-large);
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
}

.output-entry {
  margin-bottom: var(--gap-medium);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 按类型着色 */
.output-type-system { color: var(--color-text-secondary); }
.output-type-combat { color: var(--color-danger); }
.output-type-dialogue { color: var(--color-text); }
.output-type-movement { color: var(--color-text-secondary); }
.output-type-item { color: var(--color-success); }
.output-type-quest { color: var(--color-warning); }

/* 对话选项 */
.choice-list {
  margin: var(--gap-small) 0;
}

.choice-item {
  padding: var(--gap-small) var(--gap-medium);
  color: var(--color-text);
  cursor: pointer;
}

.choice-item:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
  border-radius: var(--radius-button);
}
</style>