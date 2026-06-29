// 注释：ParameterSection Parameter 折叠区
// 选中角色的 Parameter 条（快C/快V/润滑/... 由 mod 定义）
// 仅 NPC 有 Parameter（主角用不同的机制，Phase 5 先留接口）
// 现代主题下默认不在此显示（在侧栏），但选项可开启
// era经典主题默认显示
// display_group 分组（身体快感/情绪心理/特殊），组标题可开关（默认平铺）

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import CollapsibleSection from './CollapsibleSection.vue'
import ResourceBar from './ResourceBar.vue'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：选中角色
const selectedCharacter = computed(() => {
  if (!uiStore.selectedCharacterId) return null
  return gameStore.charactersAtLocation.find(c => c.id === uiStore.selectedCharacterId) ?? null
})

// 注释：Parameter 属性列表——从选中角色 base 读取
// TODO(task-5.15): bridge 接入后从真实 attribute definitions 读取 display_group="身体快感" 等
// 当前简化：硬编码已知 Parameter
const PARAMETER_GROUPS = [
  { group: '身体快感', keys: ['快C', '快V', '润滑'] },
  { group: '情绪心理', keys: ['恭顺', '情欲', '羞耻'] },
  { group: '特殊', keys: ['眠奸'] },
]

const groupedParameters = computed(() => {
  const char = selectedCharacter.value
  if (!char?.base) return []
  const base = char.base as Record<string, number>
  return PARAMETER_GROUPS.map(({ group, keys }) => ({
    group,
    items: keys.filter(k => k in base).map(k => ({ label: k, value: base[k], max: 100 })),
  })).filter(g => g.items.length > 0)
})

// 注释：组折叠状态（嵌套折叠，foldKey 用 parameter-{group名}）
function groupFoldKey(group: string): string {
  return `parameter-${group}`
}
</script>

<template>
  <CollapsibleSection title="Parameter" fold-key="parameter">
    <div v-if="selectedCharacter" class="parameter-content">
      <template v-for="paramGroup in groupedParameters" :key="paramGroup.group">
        <!-- 注释：组标题（showGroupTitles 开启时显示） -->
        <div v-if="uiStore.showGroupTitles" class="group-title">{{ paramGroup.group }}</div>
        <CollapsibleSection
          :title="paramGroup.group"
          :fold-key="groupFoldKey(paramGroup.group)"
        >
          <div class="group-items">
            <ResourceBar
              v-for="item in paramGroup.items"
              :key="item.label"
              :label="item.label"
              :value="item.value"
              :max="item.max"
              color="var(--color-secondary)"
            />
          </div>
        </CollapsibleSection>
      </template>
      <p v-if="groupedParameters.length === 0" class="no-params">无 Parameter 数据</p>
    </div>
    <p v-else class="no-selection">未选中角色</p>
  </CollapsibleSection>
</template>

<style scoped>
.parameter-content {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.group-title {
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: var(--gap-small);
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.no-params,
.no-selection {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
}
</style>
