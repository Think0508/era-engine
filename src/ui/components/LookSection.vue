// 注释：LookSection Look 折叠区
// 上半部分：选中角色的装备/穿着（嵌套 CollapsibleSection: lookEquipment）
//   按部位分组（上身/下身/饰品/... 由 mod 的 equipment.toml 定义）
// 下半部分：立绘（嵌套 CollapsibleSection: lookPortrait）
//   本地点所有角色立绘，按 CharacterBar 顺序排列
//   居中，自动换行
// look-extra 插槽供插件扩展

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import CollapsibleSection from './CollapsibleSection.vue'
import Portrait from './Portrait.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：选中角色
const selectedCharacter = computed(() => {
  if (!uiStore.selectedCharacterId) return null
  return gameStore.charactersAtLocation.find(c => c.id === uiStore.selectedCharacterId) ?? null
})

// 注释：选中角色的装备列表——按 equipmentSlots 顺序渲染
const equipmentList = computed(() => {
  const char = selectedCharacter.value
  if (!char?.equipment || !gameStore.equipmentSlots) return []
  const equip = char.equipment as Record<string, string>
  return gameStore.equipmentSlots
    .filter(slot => slot.id in equip)
    .map(slot => ({
      slotName: slot.name,
      itemName: equip[slot.id],
    }))
})

// 注释：本地点所有角色（含 player，按 CharacterBar 顺序）
const allCharactersAtLocation = computed(() => gameStore.charactersAtLocation)
</script>

<template>
  <CollapsibleSection title="Look" fold-key="look">
    <!-- 注释：装备/穿着（嵌套折叠） -->
    <CollapsibleSection title="穿着" fold-key="lookEquipment">
      <div v-if="selectedCharacter" class="equipment-list">
        <div v-for="item in equipmentList" :key="item.slotName" class="equipment-item">
          <span class="equip-slot">{{ item.slotName }}:</span>
          <span class="equip-name">{{ item.itemName }}</span>
        </div>
        <p v-if="equipmentList.length === 0" class="no-equip">无装备</p>
      </div>
      <p v-else class="no-selection">未选中角色</p>
    </CollapsibleSection>

    <!-- 注释：立绘（嵌套折叠） -->
    <CollapsibleSection title="立绘" fold-key="lookPortrait">
      <div class="portrait-grid">
        <Portrait
          v-for="char in allCharactersAtLocation"
          :key="char.id"
          :character-id="char.id"
          :name="char.name"
          :assets="char.assets"
        />
      </div>
    </CollapsibleSection>

    <!-- 注释：look-extra 插槽（插件扩展） -->
    <!-- TODO(phase-6+): 插件通过 SlotRegistry 注册 look-extra -->
  </CollapsibleSection>
</template>

<style scoped>
.equipment-list {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.equipment-item {
  display: flex;
  gap: var(--gap-small);
  font-size: 0.875rem;
}

.equip-slot {
  color: var(--color-text-secondary);
  min-width: 3em;
}

.equip-name {
  color: var(--color-text);
}

.no-equip,
.no-selection {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}

.portrait-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--gap-medium);
}
</style>
