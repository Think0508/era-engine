// 注释：CommandBar 指令栏
// Act_COM：顶部类别开关行（★收藏夹/日常/猥亵/sex/战斗/自定义）+ 过滤+显示
// Ex_COM：main_menu（系统指令，跨模式稳定）

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { commandExecutor } from '../../core/command-executor'
import { apiSystem } from '../../core/api'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { useKeyInput } from '../composables/useKeyInput'
import CollapsibleSection from './CollapsibleSection.vue'
import CommandItem from './CommandItem.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()
const lastCommand = ref<string | null>(null)

// 注释：所有 Act_COM 指令（按模式+分组过滤）
const rawActCommands = computed<CommandDef[]>(() => {
  const mode = gameStore.currentMode
  return [
    ...commandRegistry.getByMode(mode, 'location_commands'),
    ...commandRegistry.getByMode(mode, 'character_commands'),
  ].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
})

// 注释：按分类过滤——只显示 activeCategories 中为 true 的分类
const actCommands = computed<CommandDef[]>(() => {
  return rawActCommands.value.filter(cmd => {
    const cat = cmd.category ?? 'custom'
    return uiStore.commandCategories[cat] !== false
  })
})

// 注释：收藏夹——从所有 raw 指令中取收藏的，额外显示一份
const favoriteCommands = computed<CommandDef[]>(() => {
  if (!uiStore.commandCategories.favorite) return []
  return rawActCommands.value.filter(cmd =>
    uiStore.favorites.includes(cmd.id)
  ).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
})

// 注释：类别列表（从所有指令中收集出现的 category）
const availableCategories = computed(() => {
  const cats = new Set<string>()
  for (const cmd of rawActCommands.value) {
    if (cmd.category) cats.add(cmd.category)
  }
  const allOrder = ['favorite', 'daily', 'obscenity', 'sex', 'combat', 'custom']
  return allOrder.filter(c => cats.has(c) || c === 'favorite' || c === 'custom')
})

// 注释：Ex_COM——main_menu，跨模式稳定
const exCommands = computed<CommandDef[]>(() => {
  const cmds = commandRegistry.getByGroup('main_menu')
  return uiStore.cheatCommands ? cmds : cmds.filter(c => !c.id.startsWith('@'))
})

// 注释：编号
const numberedActCommands = computed(() => actCommands.value.map((c, i) => ({ ...c, number: i + 1 })))
const numberedFavoriteCommands = computed(() => favoriteCommands.value.map((c, i) => ({ ...c, number: i + 1 })))
const numberedExCommands = computed(() => exCommands.value.map((c, i) => ({ ...c, number: i + 200 })))

const numberToCommand = computed<Map<number, string>>(() => {
  const map = new Map<number, string>()
  numberedActCommands.value.forEach(c => map.set(c.number, c.id))
  numberedExCommands.value.forEach(c => map.set(c.number, c.id))
  return map
})

async function executeCommand(commandId: string) {
  lastCommand.value = commandId
  await commandExecutor.execute(commandId, {
    uiStore, gameStore, api: apiSystem,
    engine: { setExecutionState: () => {}, emit: () => {} },
    evaluateCondition: () => true,
  })
}

useKeyInput({
  onNumberConfirm: (num: number) => {
    const cmdId = numberToCommand.value.get(num)
    if (cmdId) executeCommand(cmdId)
  },
})

watch(() => gameStore.currentMode, () => {})
</script>

<template>
  <div class="command-bar">
    <!-- 注释：Act_COM 区 -->
    <CollapsibleSection title="Act_COM" fold-key="actCom">
      <!-- 类别开关行 -->
      <div class="category-toggles">
        <button
          v-for="cat in availableCategories"
          :key="cat"
          class="cat-toggle"
          :class="{ on: uiStore.commandCategories[cat] !== false, favorite: cat === 'favorite' }"
          @click="uiStore.toggleCategory(cat)"
        >
          {{ cat === 'favorite' ? '★' : cat }}
        </button>
      </div>

      <!-- 收藏夹组（单独一行，★高亮且有指令时显示） -->
      <div v-if="uiStore.commandCategories.favorite && numberedFavoriteCommands.length > 0" class="favorite-group">
        <div class="favorite-header">★ 收藏夹</div>
        <div class="command-group">
          <CommandItem
            v-for="cmd in numberedFavoriteCommands"
            :key="cmd.id"
            :label="cmd.label"
            :command-id="cmd.id"
            :number="cmd.number"
            @execute="executeCommand"
          />
        </div>
      </div>

      <!-- 常规指令 -->
      <div class="command-group">
        <CommandItem
          v-for="cmd in numberedActCommands"
          :key="cmd.id"
          :label="cmd.label"
          :command-id="cmd.id"
          :number="cmd.number"
          @execute="executeCommand"
        />
        <p v-if="numberedActCommands.length === 0 && !uiStore.commandCategories.favorite" class="no-commands">无可用指令</p>
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

    <div v-if="lastCommand" class="last-command">&lt;上回指令: {{ lastCommand }}&gt;</div>
  </div>
</template>

<style scoped>
.command-bar {
  background-color: var(--color-surface);
  border-top: 1px solid var(--color-border);
  padding: var(--gap-small);
}

.category-toggles {
  display: flex;
  gap: 2px;
  margin-bottom: var(--gap-small);
  flex-wrap: wrap;
}

.cat-toggle {
  padding: 2px 6px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.75rem;
  font-family: var(--font-body);
  min-height: unset;
  transition: color 0.15s;
  letter-spacing: 0.5px;
}

.cat-toggle.on {
  color: var(--color-text);
}

.cat-toggle.favorite.on {
  color: var(--color-warning);
}

.favorite-group {
  margin-bottom: var(--gap-small);
  padding-bottom: var(--gap-small);
  border-bottom: 1px dashed var(--color-border);
}

.favorite-header {
  font-size: 0.75rem;
  color: var(--color-warning);
  margin-bottom: var(--gap-small);
}

.command-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap-small);
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
