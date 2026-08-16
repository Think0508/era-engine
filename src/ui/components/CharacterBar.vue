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

// 注释：监禁状态标记（erArk 状态栏 <监> 红色标记——confinement-system 运行时写入）
// 优先级：囚犯 <监> > 逃跑中 <逃> > 袋中 <袋>
function getConfinementTag(char: any): { text: string; cls: string } | null {
  const sp = char?.sp_flag ?? {}
  if (sp.imprisonment) return { text: '监', cls: 'confinement-tag' }
  if (sp.escaping) return { text: '逃', cls: 'escaping-tag' }
  if (sp.be_bagged) return { text: '袋', cls: 'bagged-tag' }
  return null
}

// 注释：时停状态标记（复刻攻略-09 §6——时停中全场角色标签变「时停」；erArk <停>
// 浅天蓝标记，character_info_head.py:270-279。unconscious_h==3 = 时停冻结
// （h-time-stop 全图覆写），读实体字段直判，不依赖插件 API）
function getTimeStopTag(char: any): boolean {
  return (char?.sp_flag?.unconscious_h ?? 0) === 3
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
      <span v-if="getTimeStopTag(char)" class="timestop-tag">时停</span>
      <span v-if="isFollowing(char)" class="follow-tag">同行</span>
      <span v-if="getConfinementTag(char)" :class="getConfinementTag(char)!.cls">{{ getConfinementTag(char)!.text }}</span>
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

.timestop-tag {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: var(--radius-button);
  background-color: var(--color-secondary);
  color: var(--color-surface);
  font-size: 0.6rem;
  line-height: 1.4;
}

.confinement-tag,
.escaping-tag,
.bagged-tag {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: var(--radius-button);
  background-color: var(--color-danger);
  color: var(--color-surface);
  font-size: 0.6rem;
  line-height: 1.4;
}

.bagged-tag {
  background-color: var(--color-warning);
}
</style>
