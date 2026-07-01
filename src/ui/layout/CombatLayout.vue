// 注释：CombatLayout 战斗专用布局
// 从 game-store.combatParticipants 获取参战者列表
// HP 从 entity-system 读（每次 combatParticipants 变化触发重算）

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { entitySystem } from '../../core/entity-system'
import NarrativeLog from '../components/NarrativeLog.vue'
import CommandBar from '../components/CommandBar.vue'
import ResourceBar from '../components/ResourceBar.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

function getCharData(id: string): { id: string; name: string; hp: number } {
  const e = entitySystem.get('character', id) as any
  return { id, name: e?.name ?? id, hp: e?.base?.hp ?? 0 }
}

const allies = computed(() => gameStore.combatParticipants.allies.map(getCharData))
const enemies = computed(() => gameStore.combatParticipants.enemies.map(getCharData))

watch(() => gameStore.combatParticipants.enemies.length, (len) => {
  if (len > 0) uiStore.selectCharacter(gameStore.combatParticipants.enemies[0])
}, { immediate: true })
</script>

<template>
  <div class="combat-layout">
    <div class="combat-header">
      <div class="combat-party allies">
        <div class="party-label">我方</div>
        <div v-for="char in allies" :key="char.id" class="combatant-row"
          :class="{ selected: uiStore.selectedCharacterId === char.id }"
          @click="uiStore.selectCharacter(char.id)">
          <span class="combatant-name">{{ char.name }}</span>
          <ResourceBar label="HP" :value="char.hp" color="var(--color-success)" />
        </div>
      </div>
      <div class="vs-label">VS</div>
      <div class="combat-party enemies">
        <div class="party-label">敌方</div>
        <div v-for="char in enemies" :key="char.id" class="combatant-row"
          :class="{ selected: uiStore.selectedCharacterId === char.id }"
          @click="uiStore.selectCharacter(char.id)">
          <span class="combatant-name">{{ char.name }}</span>
          <ResourceBar label="HP" :value="char.hp" color="var(--color-danger)" />
        </div>
      </div>
    </div>

    <div class="combat-log">
      <NarrativeLog />
    </div>

    <div class="combat-commands">
      <CommandBar />
    </div>
  </div>
</template>
