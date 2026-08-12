// 注释：ScreenNumpad 屏幕小键盘
// 浮动在右边缘（position: fixed）
// 两个独立功能区：数字输入区 + 快捷指令区
// 各自独立开关（numpadNumbers/numpadShortcuts）
// 整体可见性：numpadVisible
// 在 EXECUTING 状态仍显示

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'
import { useGameStore } from '../stores/game-store'
import { commandExecutor } from '../../core/command-executor'
import { gameContext } from '../../core/game-context'
import { apiSystem } from '../../core/api'
import { createCommandEvaluators } from '../utils/command-eval'

const uiStore = useUIStore()
const gameStore = useGameStore()

// 注释：数字键盘 1-9
const numberPad = [1, 2, 3, 4, 5, 6, 7, 8, 9]

let numberBuffer = ''

// 注释：数字输入——连续输入数字，确认后执行对应编号指令
function pressNumber(_num: number) {
  numberBuffer += _num.toString()
}

function confirmNumber() {
  if (numberBuffer) {
    const _num = parseInt(numberBuffer)
    numberBuffer = ''
    // TODO(task-5.15): 查 CommandBar 编号映射表执行
    // 当前简化：直接调 commandExecutor，需 bridge 传入 ctx
    void _num
  }
}

function clearBuffer() {
  numberBuffer = ''
}

// 注释：快捷指令按钮（从 favorites 读取）
// TODO: 支持别名，当前用 commandId
function executeFavorite(commandId: string) {
  // 注释：ctx 与 CommandBar 同构（求值器/effect-system/EXECUTING 包裹一致）
  const player = gameStore.player as any
  commandExecutor.execute(commandId, {
    uiStore,
    gameStore,
    api: apiSystem,
    engine: gameContext, // audit-d C-1：原假桩切断 execution_start/end 事件链（sleep/random-event/talk_count 衰减失效）
    ...createCommandEvaluators({ uiStore, gameStore }),
    sourceId: player?.id ?? null,
  })
}
</script>

<template>
  <div v-if="uiStore.numpadVisible" class="screen-numpad">
    <!-- 注释：数字输入区 -->
    <div v-if="uiStore.numpadNumbers" class="numpad-section">
      <div class="numpad-grid">
        <button
          v-for="num in numberPad"
          :key="num"
          class="numpad-key"
          @click="pressNumber(num)"
        >{{ num }}</button>
      </div>
      <div class="numpad-actions">
        <button class="numpad-key" @click="clearBuffer">C</button>
        <button class="numpad-key confirm" @click="confirmNumber">✓</button>
      </div>
    </div>

    <!-- 注释：快捷指令区 -->
    <div v-if="uiStore.numpadShortcuts" class="shortcuts-section">
      <button
        v-for="favId in uiStore.favorites"
        :key="favId"
        class="shortcut-key"
        @click="executeFavorite(favId)"
      >{{ favId }}</button>
    </div>

    <!-- 注释：隐藏按钮 -->
    <button class="numpad-toggle" @click="uiStore.numpadVisible = false">◀</button>
  </div>
</template>

<style scoped>
.screen-numpad {
  position: fixed;
  top: 50%;
  right: var(--gap-small);
  transform: translateY(-50%);
  z-index: 150;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: var(--gap-small);
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.numpad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
}

.numpad-key {
  width: 40px;
  height: 40px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  font-family: var(--font-body);
}

.numpad-key:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.numpad-key.confirm {
  background-color: var(--color-success);
  color: var(--color-surface);
}

.numpad-actions {
  display: flex;
  gap: 2px;
}

.shortcuts-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shortcut-key {
  padding: var(--gap-small);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.75rem;
  min-height: 44px;
}

.shortcut-key:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.numpad-toggle {
  margin-top: var(--gap-small);
  padding: var(--gap-small);
  background-color: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text-secondary);
  cursor: pointer;
}
</style>
