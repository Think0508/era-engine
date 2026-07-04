// 注释：SystemPanel 系统面板容器
// 从 ui-store.activePanel 读取当前面板
// 在主显示区弹出大框架（覆盖主界面）
// 选项卡切换 + 折叠项
// 关闭：点击面板外/ESC/手机返回键 → setActivePanel(null)
// 面板内容通过 slot registry 注册（system-panel-{id} 插槽）

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useUIStore } from '../stores/ui-store'
import OptionsPanel from './OptionsPanel.vue'

const uiStore = useUIStore()

// 注释：面板标题映射
const panelTitles: Record<string, string> = {
  'character-player': '属性素质（主角）',
  'character-npc': '属性素质（选中角色）',
  'character-info': '个人情报',
  'log-stats': '日志统计',
  'options': '选项',
  'cheat': '作弊',
  'save': '存档',
}

// 注释：关闭面板
function closePanel() {
  uiStore.setActivePanel(null)
}

// 注释：ESC 关闭
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closePanel()
  }
}

// 注释：点击面板外关闭
function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.classList.contains('panel-overlay')) {
    closePanel()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="uiStore.activePanel"
    class="panel-overlay"
    @click="handleOutsideClick"
  >
    <div class="system-panel">
      <div class="panel-header">
        <span class="panel-title">{{ panelTitles[uiStore.activePanel] ?? uiStore.activePanel }}</span>
        <button class="panel-close" @click="closePanel">✕</button>
      </div>
      <div class="panel-content">
        <!-- 注释：选项面板 -->
        <OptionsPanel v-if="uiStore.activePanel === 'options'" />
        <!-- 注释：其他面板占位 -->
        <div v-else>
          <p>面板内容：{{ uiStore.activePanel }}</p>
          <p>TODO: 面板选项卡 + 折叠项</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}

.system-panel {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  width: 80%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--gap-medium);
  border-bottom: 1px solid var(--color-border);
}

.panel-title {
  font-family: var(--font-title);
  color: var(--color-primary);
}

.panel-close {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--color-text-secondary);
  min-height: 44px;
  min-width: 44px;
}

.panel-content {
  padding: var(--gap-medium);
  overflow-y: auto;
  color: var(--color-text-secondary);
}
</style>
