// 注释：CommandPopover 长按角色弹出的指令浮层
// 从 CommandRegistry 取 character_commands + 当前模式过滤 + 该角色 condition 求值
// 渲染为临时浮层（Popover），点外部/ESC 关闭
// TODO: 角色指令栏开关（character_commands 从指令栏移除，只通过长按弹出），Phase 5 留接口

<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue'
import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import GameButton from './GameButton.vue'

const props = withDefaults(defineProps<{
  characterId: string
  x: number
  y: number
}>(), {})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'execute', commandId: string): void
}>()

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：获取当前模式下可用的 character_commands
const availableCommands = computed<CommandDef[]>(() => {
  const mode = gameStore.currentMode
  // 注释：condition 求值需要 GameContext，Phase 5 简化——暂不在此求值
  // TODO: 接入 condition-registry 求值
  return commandRegistry.getByMode(mode, 'character_commands')
})

// 注释：编号分配（每屏从 1 开始）
const numberedCommands = computed(() => {
  return availableCommands.value.map((cmd, index) => ({
    ...cmd,
    number: index + 1,
  }))
})

function handleExecute(commandId: string) {
  emit('execute', commandId)
  emit('close')
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.command-popover')) {
    emit('close')
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleKeydown)
  // 注释：长按弹出时先切换焦点到该角色
  uiStore.selectCharacter(props.characterId)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    class="command-popover"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <div class="popover-header">指令</div>
    <div class="popover-commands">
      <GameButton
        v-for="cmd in numberedCommands"
        :key="cmd.id"
        :label="cmd.label"
        :command-id="cmd.id"
        :number="cmd.number"
        @click="handleExecute"
      />
      <p v-if="numberedCommands.length === 0" class="no-commands">无可用指令</p>
    </div>
  </div>
</template>

<style scoped>
.command-popover {
  position: fixed;
  z-index: 200;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: var(--gap-small);
  min-width: 150px;
  max-width: 250px;
}

.popover-header {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--gap-small);
  padding-bottom: var(--gap-small);
  border-bottom: 1px solid var(--color-border);
}

.popover-commands {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.no-commands {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  text-align: center;
}
</style>
