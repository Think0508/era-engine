// 注释：Sidebar 现代主题侧栏
// 顶部：角色头图（可在选项中隐藏）+ 两择选项卡（选中角色/主角）
//   无选中角色时只显示主角
//   无图则无（不占位）
// 中部：简写时间 + 天气 + 金钱数等（economy display_group）
// Parameter 区：多栏排列，侧栏宽度决定每行列数
// 底部：6 个按钮（属性素质/个人情报/日志统计/选项/作弊/存档）
//   按钮分组不写死，mod 可扩展/重命名

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'
import { resolveAsset } from '../utils/asset-resolver'
import { modLoader } from '../../core/mod-loader'
import { getEntityAttr } from '../../core/entity-utils'

const gameStore = useGameStore()
const uiStore = useUIStore()

// 注释：侧栏显示对象——选中角色或主角
type DisplayTarget = 'selected' | 'player'
const displayTarget = ref<DisplayTarget>('selected')

// 注释：当前显示的角色
const displayCharacter = computed(() => {
  if (displayTarget.value === 'selected' && uiStore.selectedCharacterId) {
    return gameStore.charactersAtLocation.find(c => c.id === uiStore.selectedCharacterId) ?? gameStore.player
  }
  return gameStore.player
})

// 注释：是否有选中角色（决定选项卡是否显示两择）
const hasSelection = computed(() => uiStore.selectedCharacterId !== null)

// 注释：头图 URL
const headUrl = computed(() => {
  const char = displayCharacter.value
  if (!char?.assets) return null
  // 注释：head 有则用 head，无 head 用 portrait
  const headPath = char.assets.head ?? char.assets.portrait
  if (!headPath) return null
  return resolveAsset(headPath)
})

// 注释：简写时间
const shortTime = computed(() => {
  const t = gameStore.time
  return `${t.hour}:${t.minute.toString().padStart(2, '0')}`
})

// 注释：侧栏按钮列表（6 个，mod 可扩展）
// TODO: mod 可扩展/重命名
const sidebarButtons = [
  { id: 'character-player', label: '属性素质', icon: '📊' },
  { id: 'character-info', label: '个人情报', icon: '👤' },
  { id: 'log-stats', label: '日志统计', icon: '📅' },
  { id: 'options', label: '选项', icon: '⚙' },
  { id: 'cheat', label: '作弊', icon: '🔧' },
  { id: 'save', label: '存档', icon: '💾' },
]

// 注释：Parameter 属性列表（从 attribute definitions 动态读取）
const parameterBars = computed(() => {
  const char = displayCharacter.value
  if (!char) return []
  const mod = modLoader.getMod()
  if (!mod) return []
  const charSex = (char.base?.['性别'] ?? 0) as number
  const bars: { label: string; value: number; level: number }[] = []
  for (const [attrName, def] of Object.entries(mod.attributes)) {
    if (!def.daily_reset) continue
    if (def.sex && def.sex !== (charSex === 1 ? 'male' : 'female')) continue
    const v = getEntityAttr(char, attrName)
    if (typeof v !== 'number') continue
    bars.push({ label: attrName, value: v, level: 0 })
  }
  return bars
})

// 注释：点击侧栏按钮
function clickButton(buttonId: string) {
  uiStore.setActivePanel(buttonId)
}
</script>

<template>
  <div class="sidebar">
    <!-- 注释：角色头图 + 两择选项卡 -->
    <div class="sidebar-top">
      <img v-if="headUrl" :src="headUrl" class="head-image" alt="头像" />
      <div v-if="hasSelection" class="target-tabs">
        <button
          class="target-tab"
          :class="{ active: displayTarget === 'selected' }"
          @click="displayTarget = 'selected'"
        >选中角色</button>
        <button
          class="target-tab"
          :class="{ active: displayTarget === 'player' }"
          @click="displayTarget = 'player'"
        >主角</button>
      </div>
    </div>

    <!-- 注释：简写时间 + 天气 + 金钱 -->
    <div class="sidebar-info">
      <span>{{ shortTime }}</span>
      <span>{{ gameStore.weather.name }}</span>
      <span>{{ gameStore.weather.temperature }}℃</span>
    </div>

    <!-- 注释：Parameter 区（多栏） -->
    <div v-if="uiStore.sidebarShowParameter" class="sidebar-parameters">
      <div class="parameter-grid">
        <div v-for="bar in parameterBars" :key="bar.label" class="parameter-item">
          <span class="param-label">{{ bar.label }}</span>
          <div class="param-track">
            <div class="param-fill" :style="{ width: Math.min(bar.value / 1000, 100) + '%' }" />
          </div>
        </div>
      </div>
    </div>

    <!-- 注释：底部按钮 -->
    <div class="sidebar-buttons">
      <button
        v-for="btn in sidebarButtons"
        :key="btn.id"
        class="sidebar-button"
        @click="clickButton(btn.id)"
      >
        <span class="btn-icon">{{ btn.icon }}</span>
        <span class="btn-label">{{ btn.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: var(--gap-small);
}

.sidebar-top {
  text-align: center;
}

.head-image {
  max-width: 100%;
  max-height: 150px;
  border-radius: var(--radius-panel);
  margin-bottom: var(--gap-small);
}

.target-tabs {
  display: flex;
  gap: 2px;
}

.target-tab {
  flex: 1;
  padding: var(--gap-small);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.75rem;
}

.target-tab.active {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.sidebar-info {
  display: flex;
  justify-content: space-around;
  padding: var(--gap-small);
  background-color: var(--color-background);
  border-radius: var(--radius-button);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.sidebar-parameters {
  flex: 1;
  overflow-y: auto;
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: var(--gap-small);
}

.parameter-item {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.75rem;
}

.param-label {
  min-width: 2em;
  color: var(--color-text);
}

.param-track {
  flex: 1;
  height: 4px;
  background-color: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}

.param-fill {
  height: 100%;
  background-color: var(--color-secondary);
}

.sidebar-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--gap-small);
}

.sidebar-button {
  display: flex;
  align-items: center;
  gap: var(--gap-small);
  padding: var(--gap-small);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.75rem;
  min-height: 44px;
}

.sidebar-button:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.btn-icon {
  font-size: 1rem;
}
</style>
