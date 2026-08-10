// 注释：CharacterBar 角色栏
// 从 game-store 读取 charactersAtLocation（排除 player）
// 无 NPC 时不渲染（v-if）
// 有 NPC 时横向排列角色名按钮
// 当前选中角色高亮（CSS 变量）
// 点击角色名 → ui-store.selectCharacter(id)
// 进入地点时自动选中第一个 NPC

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：排除 player 的在场角色列表
const npcs = computed(() => {
  return gameStore.charactersAtLocation.filter(c => c.id !== gameStore.player?.id)
})

// 注释：自动选中第一个 NPC——角色列表变化且无选中时
watch(() => gameStore.charactersAtLocation.length, () => {
  if (!uiStore.hasSelection && npcs.value.length > 0) {
    uiStore.selectCharacter(npcs.value[0].id)
  }
}, { immediate: true })

// 注释：角色名
function getCharacterName(char: any): string {
  return char.name ?? char.id ?? '未知'
}

// 注释：是否跟随中（同行中标记——read sp_flag.is_follow，follow-system 运行时写入）
function isFollowing(char: any): boolean {
  return (char?.sp_flag?.is_follow ?? 0) !== 0
}
</script>

<template>
  <div v-if="npcs.length > 0" class="character-bar">
    <span
      v-for="char in npcs"
      :key="char.id"
      class="character-name"
      :class="{ selected: uiStore.selectedCharacterId === char.id }"
      @click="uiStore.selectCharacter(char.id)"
    >
      {{ getCharacterName(char) }}
      <span v-if="isFollowing(char)" class="follow-tag">同行</span>
    </span>
  </div>
</template>

<style scoped>
.character-bar {
  display: flex;
  gap: 2px;
  padding: 2px 8px;
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}

.character-name {
  padding: 1px 6px;
  cursor: pointer;
  border-radius: var(--radius-button);
  color: var(--color-text);
  font-size: 0.7rem;
  min-height: unset;
  display: flex;
  align-items: center;
  transition: background-color 0.2s;
}

.character-name:hover {
  background-color: var(--color-surface);
  color: var(--color-primary);
}

.character-name.selected {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.follow-tag {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: var(--radius-button);
  background-color: var(--color-success);
  color: var(--color-surface);
  font-size: 0.6rem;
  line-height: 1.4;
}
</style>
