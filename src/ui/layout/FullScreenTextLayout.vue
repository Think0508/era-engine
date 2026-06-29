// 注释：FullScreenTextLayout EXECUTING 状态布局
// 仅显示 NarrativeLog（全屏）
// 无 NPC 栏、无指令栏、无状态栏
// 对话选项在日志最新一行渲染

<script setup lang="ts">
// 注释：NarrativeLog 在 Task 5.6 实现
</script>

<template>
  <div class="fullscreen-text-layout">
    <div class="narrative-log-fullscreen">[NarrativeLog]</div>
  </div>
</template>

<style scoped>
.fullscreen-text-layout {
  min-height: 100vh;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
}

.narrative-log-fullscreen {
  height: 100vh;
  overflow-y: auto;
  padding: var(--gap-medium);
  color: var(--color-text-secondary);
}
</style>
