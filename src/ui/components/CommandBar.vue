// 注释：CommandBar 指令栏
// Act_COM：顶部类别开关行（★收藏夹/日常/猥亵/sex/战斗/自定义）+ 过滤+显示
// Ex_COM：main_menu（系统指令，跨模式稳定）

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { commandExecutor } from '../../core/command-executor'
import { apiSystem } from '../../core/api'
import { entitySystem } from '../../core/entity-system'
import { gameContext } from '../../core/game-context'
import { createCommandEvaluators } from '../utils/command-eval'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { useKeyInput } from '../composables/useKeyInput'
import CommandItem from './CommandItem.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()
const lastCommand = ref<string | null>(null)
const actComFolded = ref(false)
const exComFolded = ref(false)
// 注释：指令求值器（前提/条件实时求值——h_scene 前提过滤与执行共用）
const evaluators = createCommandEvaluators({ uiStore, gameStore })

// 注释：所有 Act_COM 指令（按模式+分组过滤）
const rawActCommands = computed<CommandDef[]>(() => {
  const mode = gameStore.currentMode
  return [
    ...commandRegistry.getByMode(mode, 'location_commands'),
    ...commandRegistry.getByMode(mode, 'character_commands'),
  ].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
})

// 注释：按分类过滤——只显示 activeCategories 中为 true 的分类
// 【最小版·2026-08-11】H 场景（h_scene）下追加前提实时过滤——指令满足 premises 才显示
// （erArk see_instruct_panel 隐藏制：前提不满足 = 不可见，非置灰）。
// 效果：逆推中（T_NPC_ACTIVE_H）普通 H 指令因 T_NPC_NOT_ACTIVE_H 失败而隐藏，
// 只剩 keep_enjoy / try_pl_active_h 等逆推专属指令（erArk 同款自洽，08-指令集-H内.md）。
// ⚠️ 此为临时最小实现——完整版（部位/子类分组渲染、逆推面板完整呈现等）由后续扩展
const actCommands = computed<CommandDef[]>(() => {
  const filtered = rawActCommands.value.filter(cmd => {
    const cat = cmd.category ?? 'custom'
    return uiStore.commandCategories[cat] !== false
  })
  if (gameStore.currentMode !== 'h_scene') return filtered
  // 注释：h_scene 前提过滤——evaluators 在 setup 已创建（读取实时 selectedCharacterId）
  return filtered.filter(cmd => {
    if (!cmd.premises || cmd.premises.length === 0) return true
    return evaluators.evaluatePremises(cmd.premises)
  })
})

// 注释：收藏夹——从所有 raw 指令中取收藏的，额外显示一份
// h_scene 模式同样应用前提过滤（收藏的普通 H 指令在逆推中不显示——与 actCommands 一致）
const favoriteCommands = computed<CommandDef[]>(() => {
  if (!uiStore.commandCategories.favorite) return []
  const isHScene = gameStore.currentMode === 'h_scene'
  return rawActCommands.value.filter(cmd => {
    if (!uiStore.favorites.includes(cmd.id)) return false
    if (isHScene && cmd.premises?.length && !evaluators.evaluatePremises(cmd.premises)) return false
    return true
  }).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
})

// 注释：类别列表（从所有指令中收集出现的 category）
const availableCategories = computed(() => {
  const cats = new Set<string>()
  for (const cmd of rawActCommands.value) {
    if (cmd.category) cats.add(cmd.category)
  }
  const allOrder = ['favorite', 'daily', 'play', 'work', 'obscenity', 'sex', 'arts', 'system', 'combat', 'custom']
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
  const player = gameStore.player as any
  await commandExecutor.execute(commandId, {
    uiStore, gameStore, api: apiSystem,
    // 注释：audit-d C-1 修复——原假桩 {setExecutionState:()=>{},emit:()=>{}} 使
    // game:execution_start/end 永不达事件总线（sleep/random-event/talk_count 衰减失效）；
    // 改传真实 gameContext（含 setExecutionState + emit 转发）
    engine: gameContext,
    ...evaluators,
    sourceId: player?.id ?? null,
  })
  // 注释：指令执行完成后推入输出模式（全屏逐条显示日志）
  if (gameStore.narrativeLogEntries.length > 0) {
    gameStore.pushMode('output')
  }
  // 注释：重新从 entity-system 读取玩家数据，触发 Vue 响应式更新
  const playerId = (gameStore.player as any)?.id
  if (playerId) {
    const fresh = entitySystem.get('character', playerId) as any
    if (fresh) {
      // 注释：浅拷贝触发响应式（直接设同一引用不会触发）
      gameStore.setPlayer({ ...fresh })
    }
  }
  // 注释：刷新当前地点角色列表
  const loc = gameStore.location as any
  if (loc?.id) {
    const freshChars: any[] = []
    for (const char of entitySystem.getAll('character')) {
      if ((char as any).current_location === loc.id) {
        freshChars.push(char)
      }
    }
    gameStore.setCharactersAtLocation(freshChars.map(c => ({ ...c })))
  }
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
