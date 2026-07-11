// 注释：ModernLayout 现代主题布局（侧栏 + 主体）
// 侧栏通过点击左侧边缘手柄滑出/滑入，点击侧栏外关闭

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'
import Sidebar from '../components/Sidebar.vue'
import StatusBar from '../components/StatusBar.vue'
import CharacterBar from '../components/CharacterBar.vue'
import StatusSection from '../components/StatusSection.vue'
import ParameterSection from '../components/ParameterSection.vue'
import LookSection from '../components/LookSection.vue'
import CommandBar from '../components/CommandBar.vue'
import SystemPanel from '../components/SystemPanel.vue'
import ScreenNumpad from '../components/ScreenNumpad.vue'

const uiStore = useUIStore()

function closeSidebar() {
  uiStore.closeSidebar()
}
function openSidebar() {
  uiStore.openSidebar()
}
</script>

<template>
  <div class="modern-layout" :class="{ 'sidebar-side-by-side': uiStore.sidebarMode === 'sideBySide' && uiStore.sidebarOpen }">
    <!-- 注释：侧栏 -->
    <aside
      v-if="uiStore.sidebarOpen"
      class="sidebar"
      :class="{ 'sidebar-overlay': uiStore.sidebarMode === 'overlay' }"
      :style="{ width: uiStore.sidebarWidth + 'px' }"
    >
      <button class="sidebar-close" @click="closeSidebar">✕</button>
      <Sidebar />
    </aside>

    <!-- 注释：侧栏关闭时左侧边缘手柄 -->
    <button v-if="!uiStore.sidebarOpen" class="sidebar-handle" @click="openSidebar">
      <span class="handle-bar"></span>
      <span class="handle-bar"></span>
      <span class="handle-bar"></span>
    </button>

    <!-- 注释：overlay 模式下拉出的侧栏——点击主体关闭 -->
    <div
      v-if="uiStore.sidebarOpen && uiStore.sidebarMode === 'overlay'"
      class="sidebar-backdrop"
      @click="closeSidebar"
    />

    <!-- 注释：主体区 -->
    <main class="main-content">
      <div class="scroll-area">
        <StatusBar />
        <CharacterBar />
        <div v-if="uiStore.splitSections" class="split-row">
          <div class="split-left">
            <StatusSection />
            <ParameterSection />
          </div>
          <div class="split-right">
            <LookSection />
          </div>
        </div>
        <template v-else>
          <StatusSection />
          <ParameterSection />
          <LookSection />
        </template>
      </div>
      <div class="command-bar-container">
        <CommandBar />
      </div>
    </main>

    <SystemPanel />
    <ScreenNumpad />
  </div>
</template>

<style scoped>
.modern-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
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
  min-height: 0;
}

.scroll-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.split-row {
  display: flex;
  gap: 4px;
}

.split-left {
  flex: 1;
  min-width: 0;
}

.split-right {
  flex: 1;
  min-width: 0;
}

.command-bar-container {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
}

.sidebar {
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: var(--gap-small);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 100;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.2);
}

.sidebar-close {
  align-self: flex-end;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  font-size: 1.25rem;
  cursor: pointer;
  padding: var(--gap-small);
  min-height: 44px;
  min-width: 44px;
}

.sidebar-close:hover {
  color: var(--color-text);
}

.sidebar-side-by-side .main-content {
  flex: 1;
}

.sidebar-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99;
  background: transparent;
}

.sidebar-handle {
  position: fixed;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 101;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 12px 6px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-left: none;
  border-radius: 0 var(--radius-button) var(--radius-button) 0;
  cursor: pointer;
  min-height: 44px;
}

.sidebar-handle:hover {
  background-color: var(--color-primary);
}

.handle-bar {
  display: block;
  width: 14px;
  height: 2px;
  background-color: var(--color-text-secondary);
  border-radius: 1px;
}

.sidebar-handle:hover .handle-bar {
  background-color: var(--color-surface);
}
</style>
