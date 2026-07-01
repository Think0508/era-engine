// 注释：CombatLayout 战斗专用布局
// 仅显示参战者（从 apiSystem 调 combat.getCombatContext 获取）
// 不显示地点上所有角色

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import NarrativeLog from '../components/NarrativeLog.vue'
import CommandBar from '../components/CommandBar.vue'
import ResourceBar from '../components/ResourceBar.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：冶金量——战斗参与者 ID
const allyIds = ref<string[]>([])
const enemyIds = ref<string[]>([])

// 注释：战斗 mode 时获取参战者
watch(() => gameStore.currentMode, async () => {
  if (gameStore.currentMode !== 'combat') return
  try {
    const ctx = await apiSystem.call('combat', 'getCombatContext')
    if (ctx) {
      allyIds.value = ctx.allies ?? []
      enemyIds.value = ctx.enemies ?? []
    }
  } catch { /* combat 插件未注册 */ }
}, { immediate: true })

// 注释：获取参战者数据
const allies = computed(() => {
  return allyIds.value.map(id => entitySystem.get('character', id)).filter(Boolean) as any[]
})
const enemies = computed(() => {
  return enemyIds.value.map(id => entitySystem.get('character', id)).filter(Boolean) as any[]
})
</script>

<template>
  <div class="combat-layout">
    <!-- 注释：顶部——双方状态 -->
    <div class="combat-header">
      <div class="combat-party allies">
        <div class="party-label">我方</div>
        <div v-for="char in allies" :key="char.id" class="combatant-row"
          :class="{ selected: uiStore.selectedCharacterId === char.id }"
          @click="uiStore.selectCharacter(char.id)">
          <span class="combatant-name">{{ char.name || char.id }}</span>
          <ResourceBar label="HP" :value="char.base?.hp ?? 0" color="var(--color-success)" />
        </div>
      </div>
      <div class="vs-label">VS</div>
      <div class="combat-party enemies">
        <div class="party-label">敌方</div>
        <div v-for="char in enemies" :key="char.id" class="combatant-row"
          :class="{ selected: uiStore.selectedCharacterId === char.id }"
          @click="uiStore.selectCharacter(char.id)">
          <span class="combatant-name">{{ char.name || char.id }}</span>
          <ResourceBar label="HP" :value="char.base?.hp ?? 0" color="var(--color-danger)" />
        </div>
      </div>
    </div>

    <!-- 注释：中部——叙事日志 -->
    <div class="combat-log">
      <NarrativeLog />
    </div>

    <!-- 注释：底部——战斗指令栏 -->
    <div class="combat-commands">
      <CommandBar />
    </div>
  </div>
</template>

<style scoped>
.combat-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
}

.combat-header {
  display: flex;
  justify-content: space-around;
  align-items: flex-start;
  padding: var(--gap-medium);
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.combat-party {
  flex: 1;
  max-width: 40%;
}

.vs-label {
  padding: 0 var(--gap-medium);
  font-weight: bold;
  color: var(--color-danger);
  font-size: 1.25rem;
  align-self: center;
}

.party-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--gap-small);
}

.combatant-row {
  display: flex;
  align-items: center;
  gap: var(--gap-small);
  padding: var(--gap-small);
  margin-bottom: var(--gap-small);
  cursor: pointer;
  border-radius: var(--radius-button);
  border: 1px solid transparent;
}

.combatant-row:hover {
  border-color: var(--color-primary);
}

.combatant-row.selected {
  border-color: var(--color-primary);
  background-color: var(--color-surface);
}

.combatant-name {
  min-width: 4em;
  font-weight: bold;
  font-size: 0.875rem;
}

.combat-log {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.combat-commands {
  border-top: 2px solid var(--color-danger);
}
</style>
