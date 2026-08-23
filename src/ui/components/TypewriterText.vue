// 注释：TypewriterText — 逐字显示文本（支持 BBCode，标记不露字、样式即时生效）
// speed 单位 ms/字（可见字），默认 60
// 实现：完整文本一次解析为样式化分段 → 按可见字符预算逐字揭示分段
// （sliceSegmentsByVisible：样式段即时生效，标记字符不存在于分段文本中）

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import {
  parseBBCode,
  sliceSegmentsByVisible,
  totalVisibleLength,
  type TextSegment,
} from '../utils/bbcode-parser'
import { toCssColor } from '../utils/color'

const props = withDefaults(defineProps<{
  text: string
  speed?: number
}>(), {
  speed: 60,
})

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const revealedVisible = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const fullSegments = computed<TextSegment[]>(() => parseBBCode(props.text))
const total = computed<number>(() => totalVisibleLength(fullSegments.value))
const visibleSegments = computed<TextSegment[]>(() =>
  sliceSegmentsByVisible(fullSegments.value, revealedVisible.value),
)

function skip() {
  revealedVisible.value = total.value
  if (timer) { clearInterval(timer); timer = null }
  emit('complete')
}

onMounted(() => {
  if (props.speed <= 0) {
    revealedVisible.value = total.value
    emit('complete')
    return
  }
  timer = setInterval(() => {
    revealedVisible.value++
    if (revealedVisible.value >= total.value) {
      if (timer) { clearInterval(timer); timer = null }
      emit('complete')
    }
  }, props.speed)
})

onUnmounted(() => {
  if (timer) { clearInterval(timer); timer = null }
})
</script>

<template>
  <span class="typewriter" @click="skip">
    <span
      v-for="(seg, idx) in visibleSegments"
      :key="idx"
      class="seg"
      :class="{
        bold: seg.bold,
        italic: seg.italic,
        strikethrough: seg.strikethrough,
        spoiler: seg.spoiler,
      }"
      :style="{
        color: seg.color ? toCssColor(seg.color) : undefined,
        fontFamily: seg.font || undefined,
        fontSize: seg.size || undefined,
      }"
    >{{ seg.text }}</span>
    <span v-if="revealedVisible < total" class="cursor">▌</span>
  </span>
</template>

<style scoped>
.typewriter {
  cursor: pointer;
  white-space: pre-wrap;
  word-break: break-word;
}

.bold { font-weight: bold; }
.italic { font-style: italic; }
.strikethrough { text-decoration: line-through; }

.spoiler {
  background-color: var(--color-text);
  color: transparent;
  border-radius: 2px;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;
}

.spoiler:hover {
  color: var(--color-text);
  background-color: transparent;
}

.cursor {
  animation: blink 0.8s step-end infinite;
  color: var(--color-text-secondary);
}

@keyframes blink {
  50% { opacity: 0; }
}
</style>