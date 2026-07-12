// 注释：FormattedText — 解析 BBCode 并渲染为带样式的文本片段

<script setup lang="ts">
import { computed } from 'vue'
import { parseBBCode, type TextSegment } from '../utils/bbcode-parser'

const props = defineProps<{
  text: string
  color?: string
  font?: string
  size?: string
}>()

const segments = computed<TextSegment[]>(() => parseBBCode(props.text))
</script>

<template>
  <span class="formatted-text">
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
        color: seg.color || props.color || undefined,
        fontFamily: seg.font || props.font || undefined,
        fontSize: seg.size || props.size || undefined,
      }"
    >{{ seg.text }}</span>
  </span>
</template>

<style scoped>
.formatted-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.bold { font-weight: bold; }
.italic { font-style: italic; }
.strikethrough { text-decoration: line-through; }

/* 注释：spoiler 模式——默认黑框遮盖，hover/点击后显示 */
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
</style>
