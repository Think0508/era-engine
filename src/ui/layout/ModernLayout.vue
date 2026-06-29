// 注释：ModernLayout 现代主题布局（侧栏 + 主体）
// 左侧 Sidebar（可调宽，overlay/sideBySide 两种模式）
// 右侧主体：StatusBar → CharacterBar → StatusSection → LookSection → NarrativeLog → CommandBar
// Parameter 默认在侧栏显示（不在主体）
// 移动端：侧栏仍保留（不变成底部抽屉），主体缩窄

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'

const uiStore = useUIStore()
</script>

<template>
  <div class="modern-layout" :class="{ 'sidebar-side-by-side': uiStore.sidebarMode === 'sideBySide' && uiStore.sidebarOpen }">
    <!-- 注释：侧栏（Task 5.13 实现） -->
    <aside
      v-if="uiStore.sidebarOpen"
      class="sidebar"
      :class="{ 'sidebar-overlay': uiStore.sidebarMode === 'overlay' }"
      :style="{ width: uiStore.sidebarWidth + 'px' }"
    >
      [Sidebar]
    </aside>

    <!-- 注释：主体区 -->
    <main class="main-content">
      <div class="layout-section status-bar-placeholder">[StatusBar]</div>
      <div class="layout-section character-bar-placeholder">[CharacterBar]</div>
      <div class="layout-section status-section-placeholder">[StatusSection]</div>
      <!-- 注释：现代主题 Parameter 在侧栏显示，主体不显示（选项可开启） -->
      <div v-if="uiStore.isFolded('parameter') === false" class="layout-section parameter-section-placeholder">[ParameterSection]</div>
      <div class="layout-section look-section-placeholder">[LookSection]</div>
      <div class="layout-section narrative-log-placeholder">[NarrativeLog]</div>
      <div class="layout-section command-bar-placeholder">[CommandBar]</div>
    </main>

    <!-- 注释：侧栏切换按钮（移动端默认收起） -->
    <button class="sidebar-toggle" @click="uiStore.sidebarOpen ? uiStore.closeSidebar() : uiStore.openSidebar()">
      {{ uiStore.sidebarOpen ? '◀' : '▶' }}
    </button>
  </div>
</template>

<style scoped>
.modern-layout {
  display: flex;
  min-height: 100vh;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sidebar {
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: var(--gap-small);
  overflow-y: auto;
}

/* 注释：overlay 模式——侧栏盖在主体上 */
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
}

/* 注释：sideBySide 模式——侧栏推主体 */
.sidebar-side-by-side .main-content {
  flex: 1;
}

.layout-section {
  padding: var(--gap-small);
  border-bottom: 1px solid var(--color-border);
}

.status-bar-placeholder,
.character-bar-placeholder,
.status-section-placeholder,
.parameter-section-placeholder,
.look-section-placeholder,
.narrative-log-placeholder,
.command-bar-placeholder {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.narrative-log-placeholder {
  flex: 1;
  min-height: 200px;
  overflow-y: auto;
}

.sidebar-toggle {
  position: fixed;
  top: var(--gap-medium, 16px);
  right: var(--gap-medium, 16px);
  z-index: 101;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  padding: var(--gap-small);
  cursor: pointer;
  color: var(--color-text);
}

.sidebar-toggle:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}
</style>
