<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { modLoader } from '../../core/mod-loader'
import CollapsibleSection from './CollapsibleSection.vue'

const props = withDefaults(defineProps<{
  target: 'player' | 'npc'
  characterId?: string
}>(), {
  characterId: undefined,
})

const gameStore = useGameStore()
const uiStore = useUIStore()

const character = computed(() => {
  if (props.target === 'player') return gameStore.player
  if (props.characterId) return gameStore.charactersAtLocation.find(c => c.id === props.characterId) ?? null
  if (uiStore.selectedCharacterId) return gameStore.charactersAtLocation.find(c => c.id === uiStore.selectedCharacterId) ?? null
  return null
})

const tabs = ['属性', '特质']
const activeTab = ref('属性')

// 装备
const equipmentList = computed(() => {
  const char = character.value
  if (!char?.equipment || !gameStore.equipmentSlots) return []
  const equip = char.equipment as Record<string, string>
  return gameStore.equipmentSlots.filter(s => s.id in equip).map(s => ({ slotName: s.name, itemName: equip[s.id] }))
})

// 核心属性（base 命名空间中除性别外的所有数值属性）
const coreAttrs = computed(() => {
  const char = character.value
  if (!char?.base) return []
  const skip = ['性别']
  return Object.entries(char.base as Record<string, number>)
    .filter(([k]) => !skip.includes(k))
    .map(([k, v]) => ({ label: k, value: v }))
})

// 从 abilities.toml 按标签读取分组
function groupedByTag(tag: string) {
  return computed(() => {
    const char = character.value
    const mod = modLoader.getMod()
    if (!char?.abilities || !mod?.abilities) return []
    const result: { label: string; level: number }[] = []
    for (const [name, val] of Object.entries(char.abilities as Record<string, any>)) {
      const def = mod.abilities[name]
      if (!def?.tags?.includes(tag)) continue
      if (def.display === false) continue // 2026-08-11：display=false 的能力不在面板显示
      const level = typeof val === 'number' ? val : (val?.level ?? 0)
      result.push({ label: name, level })
    }
    return result
  })
}

const senseAttrs = groupedByTag('sensation')     // 感觉
const abilAttrs = groupedByTag('abl')             // 能力
const markAttrs = groupedByTag('h_mark')           // 刻印

// 性技术（从 abilities.toml 中读取带 technique tag 的能力）
// 其他技能（排除 ABL 和性技术后的剩余能力）
const techniqueNames = computed(() => {
  const mod = modLoader.getMod()
  if (!mod?.abilities) return new Set<string>()
  const names = new Set<string>()
  for (const [name, def] of Object.entries(mod.abilities)) {
    if (Array.isArray(def.tags) && def.tags.includes('technique')) names.add(name)
  }
  return names
})

function filterAbilities(isTechnique: boolean) {
  return computed(() => {
    const char = character.value
    const mod = modLoader.getMod()
    if (!char?.abilities || !mod) return []
    const ablNames = new Set(Object.entries(mod.attributes)
      .filter(([, d]) => d.category === 'ability').map(([n]) => n))
    const tech = techniqueNames.value
    const result: { label: string; level: number }[] = []
    for (const [name, val] of Object.entries(char.abilities as Record<string, any>)) {
      if (ablNames.has(name)) continue
      const def = mod.abilities[name]
      if (def?.display === false) continue // 2026-08-11：display=false 不在面板显示
      const isTech = tech.has(name)
      if (isTech !== isTechnique) continue
      const level = typeof val === 'number' ? val : (val?.level ?? 0)
      if (level === 0) continue // 未拥有（0 级）不显示——按需展开后未拥有无条目，此处兜底
      result.push({ label: name, level })
    }
    return result
  })
}

const techniqueAttrs = filterAbilities(true)
const skillAttrs = filterAbilities(false)

// 注释：同行中标记（follow-system 运行时写 sp_flag.is_follow）
const isFollowing = computed(() => {
  const ch = character.value as any
  return (ch?.sp_flag?.is_follow ?? 0) !== 0
})
</script>

<template>
  <div class="character-panel">
    <h3 class="panel-character-name">
      {{ character?.name ?? '未知角色' }}
      <span v-if="isFollowing" class="follow-tag">同行中</span>
    </h3>
    <div class="tab-bar">
      <button v-for="tab in tabs" :key="tab" class="tab-button"
        :class="{ active: activeTab === tab }" @click="activeTab = tab">{{ tab }}</button>
    </div>
    <div class="tab-content">
      <!-- ═══ 属性页签 ═══ -->
      <div v-if="activeTab === '属性'">
        <CollapsibleSection title="装备" fold-key="panel-equip">
          <div v-if="equipmentList.length > 0" class="attr-list">
            <div v-for="item in equipmentList" :key="item.slotName" class="attr-row">
              <span class="attr-label">{{ item.slotName }}</span>
              <span class="attr-val">{{ item.itemName }}</span>
            </div>
          </div>
          <p v-else class="text-dim">（无装备）</p>
        </CollapsibleSection>

        <CollapsibleSection title="核心属性" fold-key="panel-core">
          <div class="attr-list">
            <div v-for="a in coreAttrs" :key="a.label" class="attr-row">
              <span class="attr-label">{{ a.label }}</span>
              <span class="attr-val">{{ a.value }}</span>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="感觉" fold-key="panel-sense">
          <div v-if="senseAttrs.length > 0" class="attr-list">
            <div v-for="a in senseAttrs" :key="a.label" class="attr-row">
              <span class="attr-label">{{ a.label }}</span>
              <span class="attr-val">
                Lv{{ a.level }}
              </span>
            </div>
          </div>
          <p v-else class="text-dim">（无数据）</p>
        </CollapsibleSection>

        <CollapsibleSection title="能力" fold-key="panel-abil">
          <div v-if="abilAttrs.length > 0" class="attr-list">
            <div v-for="a in abilAttrs" :key="a.label" class="attr-row">
              <span class="attr-label">{{ a.label }}</span>
              <span class="attr-val">
                Lv{{ a.level }}
              </span>
            </div>
          </div>
          <p v-else class="text-dim">（无数据）</p>
        </CollapsibleSection>

        <CollapsibleSection title="刻印" fold-key="panel-mark">
          <div v-if="markAttrs.length > 0" class="attr-list">
            <div v-for="a in markAttrs" :key="a.label" class="attr-row">
              <span class="attr-label">{{ a.label }}</span>
              <span class="attr-val">{{ a.level }}</span>
            </div>
          </div>
          <p v-else class="text-dim">（无刻印）</p>
        </CollapsibleSection>

        <CollapsibleSection title="性技术" fold-key="panel-tech">
          <div v-if="techniqueAttrs.length > 0" class="attr-list">
            <div v-for="a in techniqueAttrs" :key="a.label" class="attr-row">
              <span class="attr-label">{{ a.label }}</span>
              <span class="attr-val">Lv{{ a.level }}</span>
            </div>
          </div>
          <p v-else class="text-dim">（无性技术）</p>
        </CollapsibleSection>

        <CollapsibleSection title="其他技能" fold-key="panel-skill">
          <div v-if="skillAttrs.length > 0" class="attr-list">
            <div v-for="a in skillAttrs" :key="a.label" class="attr-row">
              <span class="attr-label">{{ a.label }}</span>
              <span class="attr-val">Lv{{ a.level }}</span>
            </div>
          </div>
          <p v-else class="text-dim">（无技能）</p>
        </CollapsibleSection>
      </div>

      <!-- ═══ 特质页签 ═══ -->
      <div v-else-if="activeTab === '特质'">
        <p class="text-dim">特质内容（TODO）</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-panel { display: flex; flex-direction: column; gap: var(--gap-small); }
.panel-character-name { font-family: var(--font-title); color: var(--color-primary); text-align: center; }
.follow-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: var(--radius-button);
  background-color: var(--color-success);
  color: var(--color-surface);
  font-size: 0.7rem;
  vertical-align: middle;
}
.tab-bar { display: flex; gap: 2px; flex-wrap: wrap; border-bottom: 1px solid var(--color-border); }
.tab-button { padding: var(--gap-small); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-button) var(--radius-button) 0 0; color: var(--color-text); cursor: pointer; font-size: 0.75rem; min-height: 44px; }
.tab-button.active { background: var(--color-primary); color: var(--color-surface); }
.tab-content { padding: var(--gap-small); }
.attr-list { display: flex; flex-direction: column; gap: 2px; }
.attr-row { display: flex; justify-content: space-between; font-size: 0.875rem; padding: 2px 0; }
.attr-label { color: var(--color-text-secondary); }
.attr-val { color: var(--color-text); font-weight: bold; }
.attr-level { color: var(--color-primary); font-size: 0.75rem; margin-left: 4px; }
.text-dim { color: var(--color-text-secondary); font-size: 0.875rem; }
</style>
