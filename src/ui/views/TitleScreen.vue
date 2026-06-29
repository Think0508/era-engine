// 注释：TitleScreen 标题界面
// 引擎提供 UI 框架，mod 供 title/description（meta.toml）
// 按钮：新游戏 / 继续冒险 / 设置 / 切换模组
// 新游戏 → 实例化 player entity → pushMode('daily_menu')
// 继续 → Phase 11 存档系统，当前显示"功能开发中"
// TODO(phase-11): 角色创建流程 + 继续游戏读档

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'newGame'): void
  (e: 'continue'): void
  (e: 'settings'): void
  (e: 'switchMod'): void
}>()

// 注释：mod 标题信息由 main.ts 注入（通过 props 或全局状态）
const props = defineProps<{
  title?: string
  description?: string
  titleImage?: string
}>()

const showContinuePlaceholder = ref(false)
</script>

<template>
  <div class="title-screen">
    <div class="title-content">
      <!-- 注释：标题图（可选） -->
      <img v-if="props.titleImage" :src="props.titleImage" class="title-image" alt="title" />

      <!-- 注释：标题文字 -->
      <h1 class="title-text">{{ props.title || 'era-engine' }}</h1>

      <!-- 注释：描述 -->
      <p v-if="props.description" class="title-description">{{ props.description }}</p>

      <!-- 注释：菜单按钮 -->
      <div class="title-menu">
        <button class="title-button" @click="emit('newGame')">新的冒险</button>
        <button class="title-button" @click="showContinuePlaceholder = true">继续冒险</button>
        <button class="title-button" @click="emit('settings')">设置</button>
        <button class="title-button" @click="emit('switchMod')">切换模组</button>
      </div>

      <!-- 注释：继续冒险占位提示 -->
      <p v-if="showContinuePlaceholder" class="placeholder-text">功能开发中（Phase 11 实现存档系统）</p>
    </div>
  </div>
</template>

<style scoped>
.title-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
}

.title-content {
  text-align: center;
  max-width: 500px;
  padding: var(--gap-large);
}

.title-image {
  max-width: 100%;
  margin-bottom: var(--gap-medium);
}

.title-text {
  font-family: var(--font-title);
  font-size: 2rem;
  margin-bottom: var(--gap-small);
  color: var(--color-primary);
}

.title-description {
  color: var(--color-text-secondary);
  margin-bottom: var(--gap-large);
}

.title-menu {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.title-button {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  font-family: var(--font-body);
  cursor: pointer;
  transition: background-color 0.2s;
}

.title-button:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.placeholder-text {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  margin-top: var(--gap-small);
}
</style>
