// 注释：CombatLayout 战斗专用布局
// 进入 combat mode 时全屏切换到此布局
// 顶部：参战者状态（我方可视，敌方可视）
// 中部：叙事日志（战斗事件）
// 底部：战斗指令栏

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { entitySystem } from '../../core/entity-system'
import NarrativeLog from '../components/NarrativeLog.vue'
import CommandBar from '../components/CommandBar.vue'
import ResourceBar from '../components/ResourceBar.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：从 entity-system 获取参战者数据
const playerId = computed(() => gameStore.player?.id)

// 注释：当前战斗中 allies 和 enemies
// combat-base 通过 game-store 或 entity-system 暴露参与者
const combatants = computed(() => {
  const all = entitySystem.getAll('character')
  const player = playerId.value
  const enemies: any[] = []
  const allies: any[] = []
  for (const char of all) {
    const c = char as any
    if (c.id === player) { allies.push(c); continue }
    // 注释：简化——有 hp>0 且在当前地点的非玩家角色视为敌人
    const hp = c.base?.hp ?? 0
    if (hp > 0 && c.current_location === gameStore.location?.id) {
      enemies.push(c)
    }
  }
  return { allies, enemies }
})
</script>

<template>
  <div class="combat-layout">
    <!-- 注释：顶部——双方状态 -->
    <div class="combat-header">
      <div class="combat-party allies">
        <div class="party-label">我方</div>
        <div v-for="char in combatants.allies" :key="char.id" class="combatant-row"
          :class="{ selected: uiStore.selectedCharacterId === char.id }"
          @click="uiStore.selectCharacter(char.id)">
          <span class="combatant-name">{{ char.name || char.id }}</span>
          <ResourceBar label="HP" :value="char.base?.hp ?? 0" color="var(--color-success)" />
        </div>
      </div>
      <div class="vs-label">VS</div>
      <div class="combat-party enemies">
        <div class="party-label">敌方</div>
        <div v-for="char in combatants.enemies" :key="char.id" class="combatant-row"
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
