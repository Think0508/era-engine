// 注释：ExplorationLayout era经典探索布局（纵向堆叠）
// 结构：上部分可滚动区 + 底部固定指令栏

<script setup lang="ts">
import StatusBar from '../components/StatusBar.vue'
import CharacterBar from '../components/CharacterBar.vue'
import StatusSection from '../components/StatusSection.vue'
import ParameterSection from '../components/ParameterSection.vue'
import LookSection from '../components/LookSection.vue'
import NarrativeLog from '../components/NarrativeLog.vue'
import CommandBar from '../components/CommandBar.vue'
import SystemPanel from '../components/SystemPanel.vue'
import ScreenNumpad from '../components/ScreenNumpad.vue'
</script>

<template>
  <div class="exploration-layout">
    <!-- 注释：上部分（可滚动） -->
    <div class="scroll-area">
      <StatusBar />
      <CharacterBar />
      <StatusSection />
      <ParameterSection />
      <LookSection />
      <div class="narrative-log-container">
        <NarrativeLog />
      </div>
    </div>
    <!-- 注释：底部固定指令栏 -->
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

