// 注释：ExplorationLayout era经典探索布局（纵向堆叠）
// 结构：StatusBar → CharacterBar → StatusSection → ParameterSection → LookSection → NarrativeLog → CommandBar
// 全部用 CSS 变量，无硬编码颜色
// 移动端：自然纵向（与 PC 相同结构，仅调整间距/字号）

<script setup lang="ts">
// 注释：组件在后续 Task 中实现，当前用占位
// Task 5.7: StatusBar, CharacterBar
// Task 5.8: StatusSection, ParameterSection, LookSection
// Task 5.6: NarrativeLog
// Task 5.9: CommandBar
</script>

<template>
  <div class="exploration-layout">
    <!-- 注释：顶栏：时间/天气/地点/资源条（Task 5.7 实现） -->
    <div class="layout-section status-bar-placeholder">[StatusBar]</div>

    <!-- 注释：角色栏：NPC 列表 + 焦点选择（Task 5.7 实现，无 NPC 时不渲染） -->
    <div class="layout-section character-bar-placeholder">[CharacterBar]</div>

    <!-- 注释：Status 折叠区：玩家+选中角色资源条+情绪理性（Task 5.8 实现） -->
    <div class="layout-section status-section-placeholder">[StatusSection]</div>

    <!-- 注释：Parameter 折叠区：NPC 临时参数（Task 5.8 实现） -->
    <div class="layout-section parameter-section-placeholder">[ParameterSection]</div>

    <!-- 注释：Look 折叠区：装备+立绘（Task 5.8 实现） -->
    <div class="layout-section look-section-placeholder">[LookSection]</div>

    <!-- 注释：叙事日志（Task 5.6 实现） -->
    <div class="layout-section narrative-log-placeholder">[NarrativeLog]</div>

    <!-- 注释：指令栏：Act_COM + Ex_COM（Task 5.9 实现） -->
    <div class="layout-section command-bar-placeholder">[CommandBar]</div>
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

/* 注释：占位符样式，组件实现后移除 */
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

/* 注释：叙事日志占最大空间 */
.narrative-log-placeholder {
  flex: 1;
  min-height: 200px;
  overflow-y: auto;
}
</style>
