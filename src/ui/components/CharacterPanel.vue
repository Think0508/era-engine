// 注释：CharacterPanel 角色详情面板（多页签，区分 player/npc）
// 入口：每日菜单"能力显示"→ player / 指令栏"能力显示"→ npc / 长按角色名后也可入口
// 页签（由 mod 定义哪些页签显示，引擎提供机制）：
//   服装&能力 / 经验&宝珠 / 个人情报 / 个人好恶 / 身体情报 / 陷落状态 / 技能习得
// player 模式与 npc 模式有小区别（如 player 无"陷落状态"）

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import CollapsibleSection from './CollapsibleSection.vue'

const props = withDefaults(defineProps<{
  target: 'player' | 'npc'
  characterId?: string
}>(), {
  characterId: undefined,
})

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：当前显示的角色
const character = computed(() => {
  if (props.target === 'player') return gameStore.player
  if (props.characterId) {
    return gameStore.charactersAtLocation.find(c => c.id === props.characterId) ?? null
  }
  if (uiStore.selectedCharacterId) {
    return gameStore.charactersAtLocation.find(c => c.id === uiStore.selectedCharacterId) ?? null
  }
  return null
})

// 注释：页签列表（player 和 npc 有区别）
const tabs = computed(() => {
  const base = ['服装&能力', '经验&宝珠', '个人情报', '个人好恶', '身体情报', '技能习得']
  // 注释：player 无"陷落状态"
  if (props.target === 'npc') {
    return [...base.slice(0, 5), '陷落状态', base[5]]
  }
  return base
})

const activeTab = ref('服装&能力')

// 注释：装备列表
const equipmentList = computed(() => {
  const char = character.value
  if (!char?.equipment || !gameStore.equipmentSlots) return []
  const equip = char.equipment as Record<string, string>
  return gameStore.equipmentSlots
    .filter(slot => slot.id in equip)
    .map(slot => ({ slotName: slot.name, itemName: equip[slot.id] }))
})

// 注释：基础属性列表
const baseAttributes = computed(() => {
  const char = character.value
  if (!char?.base) return []
  const base = char.base as Record<string, number>
  return Object.entries(base)
    .filter(([key]) => !['体力', '气力', '精力'].includes(key))
    .map(([key, value]) => ({ label: key, value }))
})
</script>

<template>
  <div class="character-panel">
    <!-- 注释：角色名标题 -->
    <h3 class="panel-character-name">{{ character?.name ?? '未知角色' }}</h3>

    <!-- 注释：页签切换 -->
    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="tab-button"
        :class="{ active: activeTab === tab }"
        @click="activeTab = tab"
      >{{ tab }}</button>
    </div>

    <!-- 注释：页签内容 -->
    <div class="tab-content">
      <!-- 注释：服装&能力 -->
      <div v-if="activeTab === '服装&能力'">
        <CollapsibleSection title="装备" fold-key="panel-equipment">
          <div class="equipment-list">
            <div v-for="item in equipmentList" :key="item.slotName" class="equipment-item">
              <span class="equip-slot">{{ item.slotName }}:</span>
              <span class="equip-name">{{ item.itemName }}</span>
            </div>
          </div>
        </CollapsibleSection>
        <CollapsibleSection title="基础属性" fold-key="panel-attributes">
          <div class="attr-grid">
            <div v-for="attr in baseAttributes" :key="attr.label" class="attr-item">
              <span class="attr-label">{{ attr.label }}</span>
              <span class="attr-value">{{ attr.value }}</span>
            </div>
          </div>
        </CollapsibleSection>
      </div>

      <!-- 注释：其他页签占位 -->
      <div v-else>
        <p class="tab-placeholder">{{ activeTab }} 内容（TODO: 插件注册 character-panel-tab 插槽）</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-panel {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.panel-character-name {
  font-family: var(--font-title);
  color: var(--color-primary);
  text-align: center;
}

.tab-bar {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--color-border);
}

.tab-button {
  padding: var(--gap-small);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button) var(--radius-button) 0 0;
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.75rem;
  min-height: 44px;
}

.tab-button.active {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.tab-content {
  padding: var(--gap-small);
}

.equipment-list,
.attr-grid {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.equipment-item,
.attr-item {
  display: flex;
  gap: var(--gap-small);
  font-size: 0.875rem;
}

.equip-slot,
.attr-label {
  color: var(--color-text-secondary);
  min-width: 5em;
}

.tab-placeholder {
  color: var(--color-text-secondary);
  font-size: 0.875rem;
}
</style>
