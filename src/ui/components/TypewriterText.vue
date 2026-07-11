// 注释：TypewriterText — 逐字显示文本（支持 BBCode）
// speed 单位 ms/字，默认 60

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { parseBBCode, type TextSegment } from '../utils/bbcode-parser'

const props = withDefaults(defineProps<{
  text: string
  speed?: number
}>(), {
  speed: 60,
})

const emit = defineEmits<{
  (e: 'complete'): void
}>()

const revealedLen = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const revealedText = computed(() => {
  return props.text.slice(0, revealedLen.value)
})

const segments = computed<TextSegment[]>(() => parseBBCode(revealedText.value))

function skip() {
  revealedLen.value = props.text.length
  if (timer) { clearInterval(timer); timer = null }
  emit('complete')
}

onMounted(() => {
  if (props.speed <= 0) {
    revealedLen.value = props.text.length
    emit('complete')
    return
  }
  timer = setInterval(() => {
    revealedLen.value++
    if (revealedLen.value >= props.text.length) {
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
      v-for="(seg, idx) in segments"
      :key="idx"
      class="seg"
      :class="{
        bold: seg.bold,
        italic: seg.italic,
        strikethrough: seg.strikethrough,
        spoiler: seg.spoiler,
      }"
      :style="{
        color: seg.color || undefined,
        fontFamily: seg.font || undefined,
        fontSize: seg.size || undefined,
      }"
    >{{ seg.text }}</span>
    <span v-if="revealedLen < text.length" class="cursor">▌</span>
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
