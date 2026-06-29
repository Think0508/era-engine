// 注释：DailyMenu 每日开场菜单
// 顶栏：资源条（玩家）+ 自宅位置 + 起床时间
// 主菜单列表：睁开眼睛 / 能力显示 / 收集 / ...（插件可注册）
// 系统菜单：SAVE / LOAD / OPTION
// 不可跳过：不能 ESC，不能直接进入探索
// 点击"睁开眼睛" → 退出每日菜单模式 → 进入探索模式 + emit game:wake_up

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { commandExecutor } from '../../core/command-executor'
import GameButton from './GameButton.vue'

const emit = defineEmits<{
  (e: 'wakeUp'): void
}>()

const gameStore = useGameStore()

// 注释：主菜单项（Ex_COM 中 modes 含 daily_menu 的指令）
const dailyMenuCommands = computed(() => {
  // TODO(task-5.15): 从 CommandRegistry 读取 modes 含 'daily_menu' 的 main_menu 指令
  // 当前简化：硬编码
  return [
    { id: 'open_player_panel', label: '能力显示(主角)' },
    { id: 'save', label: 'SAVE' },
    { id: 'load', label: 'LOAD' },
    { id: 'options', label: '选项' },
  ]
})

// 注释：睁开眼睛——退出每日菜单模式
function wakeUp() {
  // TODO(task-5.15): bridge 接入后调 core gameContext.exitMode()
  gameStore.popMode()
  // 注释：发出 wake_up 事件（Parameter 重置监听此事件）
  emit('wakeUp')
}

// 注释：执行菜单指令
async function executeCommand(commandId: string) {
  // TODO(task-5.15): bridge 接入后传入真实 ExecutionContext
  await commandExecutor.execute(commandId, {
    gameStore,
    evaluateCondition: () => true,
  })
}
</script>

<template>
  <div class="daily-menu">
    <!-- 注释：顶栏：资源条 + 自宅位置 + 起床时间 -->
    <div class="menu-header">
      <div class="header-info">
        <span>第{{ gameStore.time.day }}天</span>
        <span>起床时间: {{ gameStore.time.hour }}:{{ gameStore.time.minute.toString().padStart(2, '0') }}</span>
      </div>
    </div>

    <!-- 注释：睁开眼睛按钮（最重要） -->
    <div class="wake-up-section">
      <GameButton label="睁开眼睛" command-id="wake_up" @click="wakeUp" />
    </div>

    <!-- 注释：主菜单列表 -->
    <div class="menu-list">
      <div class="menu-group">
        <div class="group-label">主菜单</div>
        <GameButton
          v-for="cmd in dailyMenuCommands"
          :key="cmd.id"
          :label="cmd.label"
          :command-id="cmd.id"
          @click="executeCommand(cmd.id)"
        />
      </div>
    </div>

    <!-- 注释：daily-menu 插槽（插件可注册更多菜单项） -->
    <!-- TODO(phase-6+): 插件通过 SlotRegistry 注册 daily-menu 插槽 -->
  </div>
</template>

<style scoped>
.daily-menu {
  display: flex;
  flex-direction: column;
  gap: var(--gap-medium);
}

.menu-header {
  padding: var(--gap-small);
  background-color: var(--color-background);
  border-radius: var(--radius-button);
}

.header-info {
  display: flex;
  justify-content: space-between;
  color: var(--color-text);
  font-size: 0.875rem;
}

.wake-up-section {
  text-align: center;
}

.menu-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.menu-group {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.group-label {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}
</style>
