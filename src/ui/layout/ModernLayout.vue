// 注释：ModernLayout 现代主题布局（侧栏 + 主体）
// 左侧 Sidebar（可调宽，overlay/sideBySide 两种模式）
// 右侧主体：StatusBar → CharacterBar → StatusSection → NarrativeLog → CommandBar
// Parameter 默认在侧栏显示（不在主体）
// 移动端：侧栏仍保留（不变成底部抽屉），主体缩窄

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'
import Sidebar from '../components/Sidebar.vue'
import StatusBar from '../components/StatusBar.vue'
import CharacterBar from '../components/CharacterBar.vue'
import StatusSection from '../components/StatusSection.vue'
import NarrativeLog from '../components/NarrativeLog.vue'
import CommandBar from '../components/CommandBar.vue'
import SystemPanel from '../components/SystemPanel.vue'
import ScreenNumpad from '../components/ScreenNumpad.vue'

const uiStore = useUIStore()
</script>

<template>
  <div class="modern-layout" :class="{ 'sidebar-side-by-side': uiStore.sidebarMode === 'sideBySide' && uiStore.sidebarOpen }">
    <aside
      v-if="uiStore.sidebarOpen"
      class="sidebar"
      :class="{ 'sidebar-overlay': uiStore.sidebarMode === 'overlay' }"
      :style="{ width: uiStore.sidebarWidth + 'px' }"
    >
      <Sidebar />
    </aside>

    <main class="main-content">
      <StatusBar />
      <CharacterBar />
      <StatusSection />
      <div class="narrative-log-container">
        <NarrativeLog />
      </div>
      <CommandBar />
    </main>

    <SystemPanel />
    <ScreenNumpad />

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

.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
}

.sidebar-side-by-side .main-content {
  flex: 1;
}

.narrative-log-container {
  flex: 1;
  min-height: 200px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
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
  min-height: 44px;
  min-width: 44px;
}

.sidebar-toggle:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}
</style>
