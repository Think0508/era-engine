// 注释：CommandBar 指令栏
// Act_COM 区（location_commands + character_commands）——按模式过滤
// Ex_COM 区（main_menu）——跨模式稳定
// 编号分配：每屏按可见顺序从 1 开始分配（每屏唯一）
// 收藏置顶，上次指令提示
// 键盘输入 → useKeyInput → 查编号映射表 → 执行

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { commandExecutor } from '../../core/command-executor'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { useKeyInput } from '../composables/useKeyInput'
import CollapsibleSection from './CollapsibleSection.vue'
import CommandItem from './CommandItem.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：上次执行的指令
const lastCommand = ref<string | null>(null)

// 注释：Act_COM——当前模式的 location_commands + character_commands
const actCommands = computed<CommandDef[]>(() => {
  const mode = gameStore.currentMode
  const locationCmds = commandRegistry.getByMode(mode, 'location_commands')
  const charCmds = commandRegistry.getByMode(mode, 'character_commands')
  // 注释：收藏置顶
  const all = [...locationCmds, ...charCmds]
  return all.sort((a, b) => {
    const aFav = uiStore.favorites.includes(a.id) ? 0 : 1
    const bFav = uiStore.favorites.includes(b.id) ? 0 : 1
    if (aFav !== bFav) return aFav - bFav
    return (a.priority ?? 0) - (b.priority ?? 0)
  })
})

// 注释：Ex_COM——main_menu，跨模式稳定
const exCommands = computed<CommandDef[]>(() => {
  const cmds = commandRegistry.getByGroup('main_menu')
  // 注释：过滤 @ 命令（作弊指令），仅在 cheatCommands 开启时显示
  return uiStore.cheatCommands ? cmds : cmds.filter(c => !c.id.startsWith('@'))
})

// 注释：编号分配——Act_COM 和 Ex_COM 各自从 1 开始
const numberedActCommands = computed(() => {
  return actCommands.value.map((cmd, index) => ({ ...cmd, number: index + 1 }))
})

const numberedExCommands = computed(() => {
  return exCommands.value.map((cmd, index) => ({ ...cmd, number: index + 1 }))
})

// 注释：编号→commandId 映射表（供键盘输入查找）
const numberToCommand = computed<Map<number, string>>(() => {
  const map = new Map<number, string>()
  // 注释：Act_COM 用 1-99，Ex_COM 用 100+ 避免冲突
  numberedActCommands.value.forEach(cmd => map.set(cmd.number, cmd.id))
  numberedExCommands.value.forEach(cmd => map.set(cmd.number + 100, cmd.id))
  return map
})

// 注释：执行指令
async function executeCommand(commandId: string) {
  lastCommand.value = commandId
  // TODO(task-5.15): bridge 接入后传入真实 ExecutionContext
  await commandExecutor.execute(commandId, {
    uiStore,
    gameStore,
    evaluateCondition: () => true, // TODO: 接入 condition-registry 求值
  })
}

// 注释：键盘输入处理
useKeyInput({
  onNumberConfirm: (num: number) => {
    // 注释：先查 Act_COM 编号，再查 Ex_COM（100+）
    const cmdId = numberToCommand.value.get(num) ?? numberToCommand.value.get(num + 100)
    if (cmdId) {
      executeCommand(cmdId)
    }
  },
})

// 注释：模式变化时重置（编号重新分配，瞬间替换）
// TODO: modeTransitionStyle mod 自定义过渡效果，当前瞬间替换
watch(() => gameStore.currentMode, () => {
  // 注释：模式切换时编号自动重算（computed 自动响应）
})
</script>

<template>
  <div class="command-bar">
    <!-- 注释：Act_COM 区 -->
    <CollapsibleSection title="Act_COM" fold-key="actCom">
      <div class="command-group">
        <CommandItem
          v-for="cmd in numberedActCommands"
          :key="cmd.id"
          :label="cmd.label"
          :command-id="cmd.id"
          :number="cmd.number"
          @execute="executeCommand"
        />
        <p v-if="numberedActCommands.length === 0" class="no-commands">无可用指令</p>
      </div>
    </CollapsibleSection>

    <!-- 注释：Ex_COM 区 -->
    <CollapsibleSection title="Ex_COM" fold-key="exCom">
      <div class="command-group">
        <CommandItem
          v-for="cmd in numberedExCommands"
          :key="cmd.id"
          :label="cmd.label"
          :command-id="cmd.id"
          :number="cmd.number"
          @execute="executeCommand"
        />
      </div>
    </CollapsibleSection>

    <!-- 注释：上次指令提示 -->
    <div v-if="lastCommand" class="last-command">
      &lt;上回指令: {{ lastCommand }}&gt;
    </div>
  </div>
</template>

<style scoped>
.command-bar {
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding: var(--gap-small);
}

.command-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-small);
  /* 注释：移动端多列网格（非一行一个） */
  /* TODO: 响应式网格列数 */
}

.no-commands {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

.last-command {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  text-align: center;
  margin-top: var(--gap-small);
  padding-top: var(--gap-small);
  border-top: 1px solid var(--color-border);
}
</style>
