// 注释：CombatLayout 战斗专用布局
// 参战者数据从 game-store 的 combatAllies/combatEnemies 读取
// combat-base 通过事件或 API 写入

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import NarrativeLog from '../components/NarrativeLog.vue'
import CommandBar from '../components/CommandBar.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：combat-base 通过 API 写入 game-store（bridge 同步或直接在 index.ts 中写）
// 当前简化：combat-start 时 bridge 监听事件写入
const combatAllies = computed(() => gameStore.combatAllies ?? [])
const combatEnemies = computed(() => gameStore.combatEnemies ?? [])
</script>

<template>
  <div class="combat-layout">
    <!-- 注释：顶部——双方状态 -->
    <div class="combat-header">
      <div class="combat-party allies">
        <div class="party-label">我方</div>
        <div v-for="allyId in combatAllies" :key="allyId" class="combatant-row"
          :class="{ selected: uiStore.selectedCharacterId === allyId }"
          @click="uiStore.selectCharacter(allyId)">
          <span class="combatant-name">{{ allyId }}</span>
        </div>
      </div>
      <div class="vs-label">VS</div>
      <div class="combat-party enemies">
        <div class="party-label">敌方</div>
        <div v-for="enemyId in combatEnemies" :key="enemyId" class="combatant-row"
          :class="{ selected: uiStore.selectedCharacterId === enemyId }"
          @click="uiStore.selectCharacter(enemyId)">
          <span class="combatant-name">{{ enemyId }}</span>
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
