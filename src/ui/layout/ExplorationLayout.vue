// 注释：ExplorationLayout era经典探索布局（纵向堆叠）
// 结构：StatusBar → CharacterBar → StatusSection → ParameterSection → LookSection → NarrativeLog → CommandBar
// 全部用 CSS 变量，无硬编码颜色
// 移动端：自然纵向（与 PC 相同结构，仅调整间距/字号）

<script setup lang="ts">
import StatusBar from '../components/StatusBar.vue'
import CharacterBar from '../components/CharacterBar.vue'
import NarrativeLog from '../components/NarrativeLog.vue'
// 注释：StatusSection/ParameterSection/LookSection 在 Task 5.8 实现
// 注释：CommandBar 在 Task 5.9 实现
</script>

<template>
  <div class="exploration-layout">
    <StatusBar />
    <CharacterBar />
    <!-- 注释：Task 5.8 实现 -->
    <div class="layout-section section-placeholder">[StatusSection]</div>
    <div class="layout-section section-placeholder">[ParameterSection]</div>
    <div class="layout-section section-placeholder">[LookSection]</div>
    <!-- 注释：叙事日志 -->
    <div class="narrative-log-container">
      <NarrativeLog />
    </div>
    <!-- 注释：Task 5.9 实现 -->
    <div class="layout-section section-placeholder">[CommandBar]</div>
  </div>
</template>

<style scoped>
.exploration-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
}

.layout-section {
  padding: var(--gap-small);
  border-bottom: 1px solid var(--color-border);
}

.section-placeholder {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}

.narrative-log-container {
  flex: 1;
  min-height: 200px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
