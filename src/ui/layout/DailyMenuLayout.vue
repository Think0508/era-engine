// 注释：DailyMenuLayout 每日开场菜单布局
// 顶栏：资源条（玩家）+ 自宅位置 + 起床时间
// 主菜单列表：睁开眼睛 / 能力显示 / 收集 / ...（插件可注册）
// 系统菜单：SAVE / LOAD / OPTION
// 不可跳过：不能 ESC，不能直接进入探索
// TODO(phase-6+): 插件动态注册 daily-menu 插槽

<script setup lang="ts">
// 注释：DailyMenu 组件在 Task 5.12 实现
</script>

<template>
  <div class="daily-menu-layout">
    <div class="daily-menu-content">[DailyMenu]</div>
  </div>
</template>

<style scoped>
.daily-menu-layout {
  min-height: 100vh;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  display: flex;
  align-items: center;
  justify-content: center;
}

.daily-menu-content {
  max-width: 600px;
  width: 100%;
  padding: var(--gap-large);
  background-color: var(--color-surface);
  border-radius: var(--radius-panel);
  border: 1px solid var(--color-border);
}
</style>
