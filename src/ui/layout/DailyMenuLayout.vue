// 注释：DailyMenuLayout 每日开场菜单布局
// 顶栏：资源条（玩家）+ 自宅位置 + 起床时间
// 主菜单列表：睁开眼睛 / 能力显示 / 收集 / ...（插件可注册）
// 系统菜单：SAVE / LOAD / OPTION
// 不可跳过：不能 ESC，不能直接进入探索
// TODO(phase-6+): 插件动态注册 daily-menu 插槽

<script setup lang="ts">
import { useGameStore } from '../stores/game-store'
import DailyMenu from '../components/DailyMenu.vue'
import NarrativeLog from '../components/NarrativeLog.vue'

const gameStore = useGameStore()

function onWakeUp(): void {
  gameStore.addLogEntry({
    id: `wake-${Date.now()}`,
    text: '你从睡梦中醒来，新的一天开始了。',
    type: 'narrative',
    source: 'system',
  })
}
</script>

<template>
  <div class="daily-menu-layout">
    <div class="daily-menu-content">
      <DailyMenu @wake-up="onWakeUp" />
    </div>
    <div v-if="gameStore.narrativeLogEntries.length > 0" class="daily-menu-log">
      <NarrativeLog />
    </div>
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

.daily-menu-log {
  max-width: 600px;
  width: 100%;
  margin-top: var(--gap-medium);
}
</style>
