// 注释：OptionsPanel 选项面板——所有设置开关集中管理

<script setup lang="ts">
import { useUIStore } from '../stores/ui-store'
import { themeManager } from '../theme/theme-manager'
import CollapsibleSection from './CollapsibleSection.vue'

const uiStore = useUIStore()

function toggleDarkMode() {
  const next = uiStore.colorScheme === 'dark' ? 'light' : 'dark'
  uiStore.setColorScheme(next)
  themeManager.setColorScheme(next)
}

const FONTS = ['sans-serif', 'serif', 'monospace', '楷体, serif', '宋体, serif', '微软雅黑, sans-serif']
const FONT_SIZES = ['small', 'medium', 'large', 'xlarge'] as const
</script>

<template>
  <div class="options-panel">
    <!-- 注释：显示设置 -->
    <CollapsibleSection title="显示">
      <div class="option-row">
        <span class="option-label">UI主题</span>
        <select :value="uiStore.theme" @change="(e: any) => uiStore.setTheme(e.target.value)" class="option-select">
          <option value="era">era经典</option>
          <option value="modern">现代</option>
        </select>
      </div>
      <div class="option-row">
        <span class="option-label">深色模式</span>
        <button class="option-toggle" :class="{ on: uiStore.colorScheme === 'dark' }"
          @click="toggleDarkMode">
          {{ uiStore.colorScheme === 'dark' ? '开启' : '关闭' }}
        </button>
      </div>
      <div class="option-row">
        <span class="option-label">组标题</span>
        <button class="option-toggle" :class="{ on: uiStore.showGroupTitles }"
          @click="uiStore.toggleGroupTitles()">
          {{ uiStore.showGroupTitles ? '显示' : '隐藏' }}
        </button>
      </div>
      <p class="option-hint">Parameter 数据按组分组的标题（需要角色有数据才显示效果）</p>
      <div class="option-row">
        <span class="option-label">字体</span>
        <select :value="uiStore.fontFamily" @change="(e: any) => uiStore.setFont(e.target.value)" class="option-select">
          <option v-for="f in FONTS" :key="f" :value="f">{{ f }}</option>
        </select>
      </div>
      <div class="option-row">
        <span class="option-label">字号</span>
        <div class="option-btn-group">
          <button v-for="s in FONT_SIZES" :key="s"
            class="option-btn" :class="{ active: uiStore.fontSize === s }"
            @click="uiStore.setFontSize(s)">{{ s }}</button>
        </div>
      </div>
      <div class="option-row">
        <span class="option-label">日志模式</span>
        <select :value="uiStore.displayMode" @change="(e: any) => uiStore.setDisplayMode(e.target.value)" class="option-select">
          <option value="scroll">滚动</option>
          <option value="clear">清屏</option>
        </select>
        <span class="option-hint">清屏：每次执行指令时清空旧日志</span>
      </div>
    </CollapsibleSection>

    <!-- 注释：侧栏设置 -->
    <CollapsibleSection title="侧栏">
      <div class="option-row">
        <span class="option-label">侧栏模式</span>
        <button class="option-toggle" :class="{ on: uiStore.sidebarMode === 'sideBySide' }"
          @click="uiStore.toggleSidebarMode()">
          {{ uiStore.sidebarMode === 'overlay' ? '覆盖' : '并排' }}
        </button>
      </div>
      <div class="option-row">
        <span class="option-label">侧栏宽度</span>
        <input type="range" min="200" max="500" step="10"
          :value="uiStore.sidebarWidth" @input="(e: any) => uiStore.sidebarWidth = parseInt(e.target.value)"
          class="option-slider" />
        <span class="option-value">{{ uiStore.sidebarWidth }}px</span>
      </div>
      <div class="option-row">
        <span class="option-label">Parameter显示</span>
        <button class="option-toggle" :class="{ on: uiStore.sidebarShowParameter }"
          @click="uiStore.toggleSidebarParameter()">
          {{ uiStore.sidebarShowParameter ? '侧栏' : '主体' }}
        </button>
      </div>
    </CollapsibleSection>

    <!-- 注释：指令栏设置 -->
    <CollapsibleSection title="指令栏">
      <div class="option-row">
        <span class="option-label">显示编号</span>
        <button class="option-toggle" :class="{ on: uiStore.showCommandNumbers }"
          @click="uiStore.showCommandNumbers = !uiStore.showCommandNumbers">
          {{ uiStore.showCommandNumbers ? '显示' : '隐藏' }}
        </button>
      </div>
      <div class="option-row">
        <span class="option-label">作弊命令</span>
        <button class="option-toggle" :class="{ on: uiStore.cheatCommands }"
          @click="uiStore.toggleCheatCommands()">
          {{ uiStore.cheatCommands ? '显示' : '隐藏' }}
        </button>
      </div>
    </CollapsibleSection>

    <!-- 注释：小键盘设置 -->
    <CollapsibleSection title="小键盘">
      <div class="option-row">
        <span class="option-label">显示小键盘</span>
        <button class="option-toggle" :class="{ on: uiStore.numpadVisible }"
          @click="uiStore.numpadVisible = !uiStore.numpadVisible">
          {{ uiStore.numpadVisible ? '显示' : '隐藏' }}
        </button>
      </div>
      <div class="option-row">
        <span class="option-label">数字输入</span>
        <button class="option-toggle" :class="{ on: uiStore.numpadNumbers }"
          @click="uiStore.numpadNumbers = !uiStore.numpadNumbers">
          {{ uiStore.numpadNumbers ? '启用' : '禁用' }}
        </button>
      </div>
      <div class="option-row">
        <span class="option-label">快捷指令</span>
        <button class="option-toggle" :class="{ on: uiStore.numpadShortcuts }"
          @click="uiStore.numpadShortcuts = !uiStore.numpadShortcuts">
          {{ uiStore.numpadShortcuts ? '启用' : '禁用' }}
        </button>
      </div>
      <p class="option-hint">指令栏中点指令旁的 ★ 收藏到快捷栏</p>
    </CollapsibleSection>

    <!-- 注释：游戏设置 -->
    <CollapsibleSection title="游戏">
      <div class="option-row">
        <span class="option-label">角色指令弹出</span>
        <button class="option-toggle" :class="{ on: uiStore.commandPopoverMode }"
          @click="uiStore.commandPopoverMode = !uiStore.commandPopoverMode">
          {{ uiStore.commandPopoverMode ? '弹出' : '指令栏' }}
        </button>
      </div>
    </CollapsibleSection>
  </div>
</template>

<style scoped>
.options-panel {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-small) 0;
  gap: var(--gap-small);
}

.option-label {
  color: var(--color-text);
  font-size: 0.875rem;
  min-width: 7em;
}

.option-select {
  padding: var(--gap-small);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  font-family: var(--font-body);
  min-height: 44px;
}

.option-toggle {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  min-height: 44px;
  min-width: 5em;
}

.option-toggle.on {
  background-color: var(--color-primary);
  color: var(--color-surface);
  border-color: var(--color-primary);
}

.option-btn-group {
  display: flex;
  gap: 2px;
}

.option-btn {
  padding: var(--gap-small);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
}

.option-btn.active {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.option-slider {
  flex: 1;
  max-width: 150px;
  accent-color: var(--color-primary);
}

.option-value {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  min-width: 3em;
  text-align: right;
}

.option-hint {
  color: var(--color-text-secondary);
  font-size: 0.7rem;
  padding-left: var(--gap-medium);
  flex-basis: 100%;
}
</style>
