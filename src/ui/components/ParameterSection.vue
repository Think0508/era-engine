// 注释：ParameterSection 参数折叠区
// 从 mod 的 attribute definitions 读取 daily_reset=true 的属性
// 按 display_group 分组，sex 过滤，紧凑行内 ResourceBar + level 显示

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { modLoader } from '../../core/mod-loader'
import { getEntityAttr } from '../../core/entity-utils'
import { getLevel } from '../../core/entity-utils'
import CollapsibleSection from './CollapsibleSection.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

const selectedCharacter = computed(() => {
  if (!uiStore.selectedCharacterId) return null
  return gameStore.charactersAtLocation.find(c => c.id === uiStore.selectedCharacterId) ?? null
})

interface ParamItem {
  label: string
  value: number
  level: number
  barValue: number
  barMax: number
}

const parameterGroups = computed(() => {
  const mod = modLoader.getMod()
  if (!mod) return []
  const char = selectedCharacter.value
  if (!char) return []

  const charSex = (char.base?.['性别'] ?? 0) as number

  const groups = new Map<string, ParamItem[]>()
  for (const [attrName, def] of Object.entries(mod.attributes)) {
    if (!def.daily_reset) continue
    const v = getEntityAttr(char, attrName)
    if (typeof v !== 'number' || v === 0 && !(attrName in (char.params ?? {})) && !(attrName in (char.base ?? {}))) continue
    if (def.sex && def.sex !== (charSex === 1 ? 'male' : 'female')) continue
    let level = 0
    let barValue = v
    let barMax = 100
    if (def.level_thresholds && def.level_thresholds.length > 0) {
      level = getLevel(v, def.level_thresholds)
      const baseVal = def.level_thresholds[level] ?? 0
      const nextVal = def.level_thresholds[Math.min(level + 1, def.level_thresholds.length - 1)]
      barValue = v - baseVal
      barMax = Math.max(1, nextVal - baseVal)
    }

    const groupName = def.display_group || '默认'
    if (!groups.has(groupName)) groups.set(groupName, [])
    groups.get(groupName)!.push({ label: attrName, value: v, level, barValue, barMax })
  }

  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }))
})
</script>

<template>
  <CollapsibleSection title="Parameter" fold-key="parameter">
    <div v-if="selectedCharacter" class="param-content">
      <template v-for="pg in parameterGroups" :key="pg.group">
        <div class="param-row">
          <div v-for="item in pg.items" :key="item.label" class="param-item">
            <span class="param-label">{{ item.label }}</span>
            <span class="param-level">LV{{ item.level }}</span>
            <div class="mini-track">
              <div class="mini-fill" :style="{ width: (item.barMax > 0 ? Math.min(100, (item.barValue / item.barMax) * 100) : 0) + '%' }" />
            </div>
          </div>
        </div>
      </template>
      <p v-if="parameterGroups.length === 0" class="no-data">无参数数据</p>
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

.param-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1px 4px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 2px;
}

.param-label {
  font-size: 0.65rem;
  color: var(--color-text);
}

.param-level {
  font-size: 0.55rem;
  color: var(--color-text-secondary);
  min-width: 1.8em;
}

.mini-track {
  width: 36px;
  height: 4px;
  background-color: var(--color-border);
  border-radius: 1px;
  overflow: hidden;
}

.mini-fill {
  height: 100%;
  background-color: var(--color-secondary);
  transition: width 0.3s ease;
}

.no-data {
  color: var(--color-text-secondary);
  font-size: 0.65rem;
}
</style>
