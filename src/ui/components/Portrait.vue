// 注释：Portrait 单张立绘组件
// 显示逻辑：head 有则用 head 当头图区，无 head 用 portrait；portrait 有则显示立绘，无图不占位
// 上方显示名字（可点击切换焦点）
// 多图扩展插槽：variants slot（Phase 5 不实现，预留）
// 长按触发 longpress 事件（弹出 CommandPopover）

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUIStore } from '../stores/ui-store'
import { resolveAsset } from '../utils/asset-resolver'

const props = withDefaults(defineProps<{
  characterId: string
  name?: string
  assets?: { portrait?: string; head?: string }
  clickable?: boolean
}>(), {
  name: undefined,
  assets: undefined,
  clickable: true,
})

const emit = defineEmits<{
  (e: 'click', characterId: string): void
  (e: 'longpress', characterId: string): void
}>()

const uiStore = useUIStore()

// 注释：解析立绘图片 URL，无图返回 null
const portraitUrl = computed(() => {
  if (!props.assets?.portrait) return null
  return resolveAsset(props.assets.portrait)
})

// 注释：长按检测
const longpressTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const LONGPRESS_DELAY = 500

function handleMouseDown() {
  longpressTimer.value = setTimeout(() => {
    emit('longpress', props.characterId)
  }, LONGPRESS_DELAY)
}

function handleMouseUp() {
  if (longpressTimer.value) {
    clearTimeout(longpressTimer.value)
    longpressTimer.value = null
  }
}

function handleClick() {
  if (!props.clickable) return
  if (longpressTimer.value) {
    clearTimeout(longpressTimer.value)
    longpressTimer.value = null
  }
  emit('click', props.characterId)
  // 注释：点击切换焦点
  uiStore.selectCharacter(props.characterId)
}
</script>

<template>
  <div
    v-if="portraitUrl || name"
    class="portrait"
    @click="handleClick"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
  >
    <!-- 注释：名字（可点击切换焦点） -->
    <span v-if="name" class="portrait-name" :class="{ selected: uiStore.selectedCharacterId === characterId }">
      {{ name }}
    </span>
    <!-- 注释：立绘图片 -->
    <img v-if="portraitUrl" :src="portraitUrl" class="portrait-image" :alt="name" />
    <!-- 注释：多图扩展插槽（Phase 5 不实现，预留） -->
    <slot name="variants" />
  </div>
</template>

<style scoped>
.portrait {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  padding: var(--gap-small);
}

.portrait-name {
  color: var(--color-text);
  font-size: 0.875rem;
  margin-bottom: var(--gap-small);
  padding: 2px var(--gap-small);
  border-radius: var(--radius-button);
}

.portrait-name.selected {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.portrait-image {
  max-height: 300px;
  max-width: 100%;
  border-radius: var(--radius-panel);
}
</style>
