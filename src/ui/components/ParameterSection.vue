// 注释：ParameterSection 参数折叠区
// 动态从 mod 的 attribute definitions 读取 daily_reset=true 的属性
// 按 display_group 分组显示，不再硬编码 key 列表

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { modLoader } from '../../core/mod-loader'
import CollapsibleSection from './CollapsibleSection.vue'
import ResourceBar from './ResourceBar.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：选中角色
const selectedCharacter = computed(() => {
  if (!uiStore.selectedCharacterId) return null
  return gameStore.charactersAtLocation.find(c => c.id === uiStore.selectedCharacterId) ?? null
})

// 注释：从 attribute definitions 读取所有 daily_reset=true 的属性，按 display_group 分组
const parameterGroups = computed(() => {
  const mod = modLoader.getMod()
  if (!mod) return []
  const char = selectedCharacter.value
  if (!char?.base) return []

  const base = char.base as Record<string, number>

  // 注释：按 display_group 分组
  const groups = new Map<string, { label: string; value: number; max?: number }[]>()
  for (const [attrName, def] of Object.entries(mod.attributes)) {
    if (!def.daily_reset) continue
    if (!(attrName in base)) continue
    const groupName = def.display_group || '默认'
    if (!groups.has(groupName)) groups.set(groupName, [])
    groups.get(groupName)!.push({
      label: attrName,
      value: base[attrName],
      max: 100, // 注释：进度条上限 100，实际依赖 level_thresholds 的最后一级
    })
  }

  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }))
})
</script>

<template>
  <CollapsibleSection title="Parameter" fold-key="parameter">
    <div v-if="selectedCharacter" class="param-content">
      <template v-for="pg in parameterGroups" :key="pg.group">
        <div v-if="uiStore.showGroupTitles" class="group-title">{{ pg.group }}</div>
        <CollapsibleSection :title="pg.group" :fold-key="`parameter-${pg.group}`">
          <div class="group-items">
            <ResourceBar
              v-for="item in pg.items"
              :key="item.label"
              :label="item.label"
              :value="item.value"
              :max="item.max"
              color="var(--color-secondary)"
            />
          </div>
        </CollapsibleSection>
      </template>
      <p v-if="parameterGroups.length === 0" class="no-data">无参数数据（未选中角色或无角色有 Parameter）</p>
    </div>
    <p v-else class="no-data">未选中角色</p>
  </CollapsibleSection>
</template>

<style scoped>
.param-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.group-title {
  font-size: 0.65rem;
  color: var(--color-text-secondary);
  margin-top: 2px;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.no-data {
  color: var(--color-text-secondary);
  font-size: 0.65rem;
}
</style>
