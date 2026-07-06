// 注释：CommandBar 指令栏
// Act_COM：顶部类别开关行（★收藏夹/日常/猥亵/sex/战斗/自定义）+ 过滤+显示
// Ex_COM：main_menu（系统指令，跨模式稳定）

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { commandExecutor } from '../../core/command-executor'
import { apiSystem } from '../../core/api'
import { evaluateCondition } from '../../core/condition'
import { gameContext } from '../../core/game-context'
import { premiseRegistry } from '../../plugins/h-core'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { useKeyInput } from '../composables/useKeyInput'
import CommandItem from './CommandItem.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()
const lastCommand = ref<string | null>(null)
const actComFolded = ref(false)
const exComFolded = ref(false)

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

function evalCondition(expr: string): boolean {
  if (expr.startsWith('premises:')) {
    const premises = expr.slice(9).split(/[&,]/).map(s => s.trim()).filter(Boolean)
    if (premises.length === 0) return true
    // 注释：非严格——未知 erark 前提跳过（已注册的 HAVE_TARGET/NOT_H/HP_G_1 等仍正常求值）
    return premiseRegistry.evaluate(premises, {
      selectedCharacterId: uiStore.selectedCharacterId ?? gameStore.player?.id ?? null,
    }, false)
  }
  const gc = gameContext.getContext()
  try { return evaluateCondition(expr, gc) }
  catch { return false }
}

async function executeCommand(commandId: string) {
  lastCommand.value = commandId
  await commandExecutor.execute(commandId, {
    uiStore, gameStore, api: apiSystem,
    engine: { setExecutionState: () => {}, emit: () => {} },
    evaluateCondition: evalCondition,
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
    <!-- 注释：Act_COM 区——自带折叠+类别开关同一行 -->
    <div class="act-com-header" @click="actComFolded = !actComFolded">
      <span class="toggle-icon">{{ actComFolded ? '[+]' : '[-]' }}</span>
      <span class="section-title">Act_COM</span>
      <div class="category-toggles" @click.stop>
        <button
          v-for="cat in availableCategories"
          :key="cat"
          class="cat-toggle"
          :class="{ on: uiStore.commandCategories[cat] !== false, fav: cat === 'favorite' }"
          @click="uiStore.toggleCategory(cat)"
        >{{ cat === 'favorite' ? '★' : cat }}</button>
      </div>
    </div>
    <div v-show="!actComFolded" class="act-com-body">
      <div v-if="uiStore.commandCategories.favorite && numberedFavoriteCommands.length > 0" class="fav-group">
        <div class="fav-header">★ 收藏夹</div>
        <div class="cmd-row">
          <CommandItem v-for="cmd in numberedFavoriteCommands" :key="cmd.id"
            :label="cmd.label" :command-id="cmd.id" :number="cmd.number" @execute="executeCommand" />
        </div>
      </div>
      <div class="cmd-row">
        <CommandItem v-for="cmd in numberedActCommands" :key="cmd.id"
          :label="cmd.label" :command-id="cmd.id" :number="cmd.number" @execute="executeCommand" />
        <p v-if="numberedActCommands.length === 0 && numberedFavoriteCommands.length === 0" class="no-cmds">无可用指令</p>
      </div>
    </div>

    <!-- 注释：Ex_COM 区 -->
    <div class="ex-com-header" @click="exComFolded = !exComFolded">
      <span class="toggle-icon">{{ exComFolded ? '[+]' : '[-]' }}</span>
      <span class="section-title">Ex_COM</span>
    </div>
    <div v-show="!exComFolded" class="ex-com-body">
      <div class="cmd-row">
        <CommandItem v-for="cmd in numberedExCommands" :key="cmd.id"
          :label="cmd.label" :command-id="cmd.id" :number="cmd.number" @execute="executeCommand" />
      </div>
    </div>

    <div v-if="lastCommand" class="last-cmd">&lt;上回指令: {{ lastCommand }}&gt;</div>
  </div>
</template>

<style scoped>
.command-bar {
  background-color: var(--color-surface);
  font-size: 0.75rem;
  padding: 2px var(--gap-small);
}

/* 注释：Act_COM / Ex_COM 标题行（可折叠点击区域） */
.act-com-header,
.ex-com-header {
  display: flex;
  align-items: center;
  gap: var(--gap-small);
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  font-weight: bold;
}

.toggle-icon {
  font-size: 0.65rem;
  min-width: 1.2em;
}

.section-title {
  flex-shrink: 0;
}

/* 注释：类别开关——与 Act_COM 同一行 */
.category-toggles {
  display: flex;
  gap: 1px;
  margin-left: 4px;
}

.cat-toggle {
  padding: 0 4px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: 0.7rem;
  font-family: var(--font-body);
  line-height: 1.4;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.cat-toggle.on {
  opacity: 1;
  color: var(--color-text);
}

.cat-toggle.fav.on {
  color: var(--color-warning);
  opacity: 1;
}

/* 注释：指令内容区 */
.act-com-body,
.ex-com-body {
  padding: 2px 0;
}

.cmd-row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
}

.fav-group {
  margin-bottom: 2px;
  padding-bottom: 2px;
  border-bottom: 1px dashed var(--color-border);
}

.fav-header {
  font-size: 0.65rem;
  color: var(--color-warning);
  margin-bottom: 1px;
}

.no-cmds {
  color: var(--color-text-secondary);
  font-size: 0.65rem;
}

.last-cmd {
  color: var(--color-text-secondary);
  font-size: 0.65rem;
  text-align: center;
  padding-top: 2px;
  border-top: 1px solid var(--color-border);
  margin-top: 2px;
}
</style>
