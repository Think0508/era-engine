// 注释：ExplorationLayout era经典探索布局（纵向堆叠）
// 可选分栏模式：Status/Parameter 左栏，Look 右栏

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'
import StatusBar from '../components/StatusBar.vue'
import CharacterBar from '../components/CharacterBar.vue'
import StatusSection from '../components/StatusSection.vue'
import ParameterSection from '../components/ParameterSection.vue'
import LookSection from '../components/LookSection.vue'
import CommandBar from '../components/CommandBar.vue'
import SystemPanel from '../components/SystemPanel.vue'
import ScreenNumpad from '../components/ScreenNumpad.vue'

const uiStore = useUIStore()
</script>

<template>
  <div class="exploration-layout">
    <div class="scroll-area">
      <StatusBar />
      <CharacterBar />
      <!-- 注释：分栏模式——Status+Parameter 左，Look 右 -->
      <div v-if="uiStore.splitSections" class="split-row">
        <div class="split-left">
          <StatusSection />
          <ParameterSection v-if="uiStore.mainShowParameter" />
        </div>
        <div class="split-right">
          <LookSection />
        </div>
      </div>
      <template v-else>
        <StatusSection />
        <ParameterSection v-if="uiStore.mainShowParameter" />
        <LookSection />
      </template>
      <div class="narrative-log-container">
        <NarrativeLog />
      </div>
    </div>
    <div class="command-bar-container">
      <CommandBar />
    </div>
    <SystemPanel />
    <ScreenNumpad />
  </div>
</template>

<style scoped>
.exploration-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
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

.narrative-log-container {
  flex: 1;
  min-height: 100px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.command-bar-container {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border);
}
</style>

