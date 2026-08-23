// 注释：FullscreenOutput —— 全屏输出模式下逐条显示日志条目
// 指令执行完后自动进入此模式
// auto 条目自动连续显示，click 条目需点击推进
// 最后一条显示完后点击回主界面

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useGameStore, type LogEntry } from '../stores/game-store'
import FormattedText from './FormattedText.vue'
import TypewriterText from './TypewriterText.vue'
import { eventBus } from '../../core/event-bus'
import { toCssColor } from '../utils/color'
import { displaySizeToCss } from '../utils/display-style'

const gameStore = useGameStore()
const emit = defineEmits<{ (e: 'done'): void }>()

// 当前已消费到第几条
const cursor = ref(0)
const waitingForClick = ref(false)
const allDone = ref(false)
const typewriterBusy = ref(false)
const scrollRef = ref<HTMLElement | null>(null)
const outputRef = ref<HTMLElement | null>(null)
// 焦点选择索引（每条 choice entry 独立追踪）
const focusMap = ref<Record<string, number>>({})

// 本轮显示的条目（从 gameStore 里取最近的未消费批次）
const entries = computed<LogEntry[]>(() => {
  return gameStore.narrativeLogEntries
})

// 当前应该显示的条目（[0, cursor)）
const visibleEntries = computed<LogEntry[]>(() => {
  return entries.value.slice(0, cursor.value)
})

// 注释：typewriter 播放完成回调
function onTypewriterDone(entry: LogEntry) {
  typewriterBusy.value = false
  if (entry._display?.trigger === 'click') {
    waitingForClick.value = true
  } else if ((entry._display?.pause ?? 0) > 0) {
    // 逐字播完 + auto → 计时暂停（原设计：显示完后自动停顿 pause 毫秒再继续）
    startPauseWait(entry._display!.pause)
  } else {
    advance()
  }
}

// 推进逻辑：显示到下一个断点（click / pause 计时停 / choice / typewriter 动画），或末尾
function advance() {
  if (allDone.value || typewriterBusy.value || waitingForPause.value) return

  let i = cursor.value
  while (i < entries.value.length) {
    const entry = entries.value[i]
    // 注释：choice 条目也作为断点，等待用户选择
    if (isChoiceEntry(entry)) {
      cursor.value = i + 1
      waitingForClick.value = true
      return
    }
    const trigger = entry._display?.trigger ?? 'auto'
    cursor.value = i + 1
    if (trigger === 'click') {
      waitingForClick.value = true
      return
    }
    if (entry._display?.display === 'typewriter') {
      typewriterBusy.value = true  // 注释：等待 typewriter 动画播完才推进下一条
      return
    }
    // pause（2026-08-23 纠正回原设计）：本条显示完后自动暂停 N 毫秒再继续
    // （trigger=auto 时生效）；等待期间点击可跳过（era autopage 惯例）
    if ((entry._display?.pause ?? 0) > 0) {
      startPauseWait(entry._display!.pause)
      return
    }
    i++
  }
  allDone.value = true
}

// 计时暂停：auto 条目显示完后的自动停顿（pause 毫秒），期间点击 = 立即继续
let pauseTimer: ReturnType<typeof setTimeout> | null = null
const waitingForPause = ref(false)

function clearPauseTimer() {
  if (pauseTimer) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
}

function startPauseWait(ms: number) {
  waitingForPause.value = true
  clearPauseTimer()
  pauseTimer = setTimeout(() => {
    waitingForPause.value = false
    advance()
  }, ms)
}

// 初始化
function init() {
  cursor.value = 0
  waitingForClick.value = false
  waitingForPause.value = false
  clearPauseTimer()
  allDone.value = false
  advance()
}

// 全局点击推进（仅在没有 choice 条目时）
function handleClick() {
  // 如果最新显示的条目是 choice，忽略全局点击（用户必须选选项）
  const lastEntry = visibleEntries.value[visibleEntries.value.length - 1]
  if (lastEntry && isChoiceEntry(lastEntry)) return
  if (allDone.value) {
    emit('done')
    return
  }
  // pause 计时等待期间点击 = 跳过剩余停顿立即继续（era autopage 惯例）
  if (waitingForPause.value) {
    waitingForPause.value = false
    clearPauseTimer()
    advance()
    return
  }
  if (waitingForClick.value) {
    waitingForClick.value = false
    advance()
  }
}

// 选择选项（2026-08-13 审计修复——原实现 TODO 未通知对话系统，对话树卡死无法推进）
async function selectChoice(entry: LogEntry) {
  const index = focusMap.value[entry.id] ?? 0
  gameStore.markLogConsumed(entry.id)
  // 注释：通知对话系统推进并等待渲染完成（handler await renderNode）——
  // 之后 advance() 才能看到新写入的对话行（否则新行在 cursor 之后不可见）
  await eventBus.emit('dialogue:select', { entryId: entry.id, index })
  advance()
}

// 键盘交互
function handleKeydown(e: KeyboardEvent) {
  const lastEntry = visibleEntries.value[visibleEntries.value.length - 1]
  if (!lastEntry || !isChoiceEntry(lastEntry)) return
  const choices = lastEntry.payload?.choices ?? []
  if (choices.length === 0) return

  const key = focusMap.value[lastEntry.id] ?? 0

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault()
    focusMap.value[lastEntry.id] = (key + 1) % choices.length
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault()
    focusMap.value[lastEntry.id] = (key - 1 + choices.length) % choices.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    selectChoice(lastEntry)
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
  // 自动获取焦点以接收键盘事件
  outputRef.value?.focus()
})

// 卸载时清理计时暂停（防泄漏/跨场景触发）
onBeforeUnmount(() => {
  clearPauseTimer()
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
  <div ref="outputRef" class="fullscreen-output" tabindex="0" @click="handleClick" @keydown="handleKeydown">
    <div ref="scrollRef" class="output-scroll">
      <div
        v-for="entry in visibleEntries"
        :key="entry.id"
        :class="entryClass(entry)"
      >
        <!-- 普通文本 -->
        <template v-if="!isChoiceEntry(entry)">
          <template v-if="entry._display?.display === 'typewriter'">
            <span :style="{ color: entry._display?.color ? toCssColor(entry._display.color) : undefined, fontFamily: entry._display?.font, fontSize: displaySizeToCss(entry._display?.size) }">
              <TypewriterText
                :text="entry.text"
                :speed="entry._display.speed ?? 60"
                @complete="onTypewriterDone(entry)"
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
        </template>

        <!-- 对话选项 -->
        <template v-else-if="isChoiceEntry(entry)">
          <!-- 已消费：显示所选选项（不做交互） -->
          <template v-if="entry.consumed">
            <div class="chosen-text">
              > {{ (entry.payload?.choices ?? [])[(focusMap[entry.id] ?? 0)]?.text ?? '' }}
            </div>
          </template>
          <!-- 未消费：可交互选项列表 -->
          <template v-else>
            <div class="choice-list">
              <div
                v-for="(choice, idx) in (entry.payload?.choices ?? [])"
                :key="idx"
                class="choice-item"
                :class="{ focused: (focusMap[entry.id] ?? 0) === idx }"
                @click.stop="selectChoice(entry)"
                @mouseover="focusMap[entry.id] = Number(idx)"
              >
                > {{ choice.text }}
              </div>
            </div>
          </template>
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

.choice-item:hover,
.choice-item.focused {
  background-color: var(--color-primary);
  color: var(--color-surface);
  border-radius: var(--radius-button);
}

.chosen-text {
  padding: var(--gap-small) var(--gap-medium);
  color: var(--color-text-secondary);
  font-style: italic;
}

</style>