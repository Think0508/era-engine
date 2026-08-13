// 注释：TitleScreen 标题界面（对齐 erArk title_flow 语义）
// 按钮：新的冒险 / 继续冒险（读档面板）/ 设置 / 切换模组 / 退出（关页，不自动存）
// 继续冒险 → SavePanel 读模式（writeSave=false：无覆盖、空数字槽不可点；
// auto 槽存在时仍可点 → 读取/删除——对齐 erArk 神经重载）

<script setup lang="ts">
import { ref } from 'vue'
import { useUIStore } from '../stores/ui-store'
import { getUIText } from '../../core/ui-text'
import SavePanel from '../components/SavePanel.vue'
import OptionsPanel from '../components/OptionsPanel.vue'

const emit = defineEmits<{
  (e: 'newGame'): void
  (e: 'switchMod'): void
}>()

const props = defineProps<{
  title?: string
  description?: string
  titleImage?: string
}>()

const uiStore = useUIStore()
const showSaveList = ref(false)
const showSettings = ref(false)

const u = (key: string): string => getUIText(key)

// 注释：读档成功 → 切到游戏画面（restore 已把模式栈重置为 exploration）
function onLoaded(): void {
  showSaveList.value = false
  uiStore.setGameScreen('game')
}

// 注释：退出（对齐 erArk 断开连接语义）——浏览器无退出进程概念，尝试关闭标签页。
// ⚠️ 2026-08-14 第三轮审查：不在标题画面 autoSave——标题无游戏会话，写 auto 槽
// 会覆盖玩家上次的睡醒自动档（初始状态顶掉真实进度）。游戏内退出走 exit_to_title
// 指令（已在游戏会话内 autoSave）
function onExit(): void {
  window.close()
}
</script>

<template>
  <div class="title-screen">
    <div class="title-content">
      <img v-if="props.titleImage" :src="props.titleImage" class="title-image" alt="title" />
      <h1 class="title-text">{{ props.title || 'era-engine' }}</h1>
      <p v-if="props.description" class="title-description">{{ props.description }}</p>

      <!-- 注释：读档面板模式（writeSave=false——对齐 erArk 神经重载） -->
      <div v-if="showSaveList" class="title-panel-wrap">
        <SavePanel :write-save="false" @loaded="onLoaded" @back="showSaveList = false" />
      </div>

      <!-- 注释：设置面板模式 -->
      <div v-else-if="showSettings" class="title-panel-wrap">
        <OptionsPanel />
        <button class="title-button" @click="showSettings = false">{{ u('save.action.back') }}</button>
      </div>

      <!-- 注释：主菜单模式 -->
      <div v-else class="title-menu">
        <button class="title-button" @click="emit('newGame')">{{ u('title.new_game') }}</button>
        <button class="title-button" @click="showSaveList = true">{{ u('title.continue') }}</button>
        <button class="title-button" @click="showSettings = true">{{ u('title.settings') }}</button>
        <button class="title-button" @click="emit('switchMod')">{{ u('title.switch_mod') }}</button>
        <button class="title-button" @click="onExit">{{ u('title.exit') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.title-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: var(--font-body);
}

.title-content {
  text-align: center;
  max-width: 520px;
  width: 100%;
  padding: var(--gap-large);
}

.title-image {
  max-width: 100%;
  margin-bottom: var(--gap-medium);
}

.title-text {
  font-family: var(--font-title);
  font-size: 2rem;
  margin-bottom: var(--gap-small);
  color: var(--color-primary);
}

.title-description {
  color: var(--color-text-secondary);
  margin-bottom: var(--gap-large);
}

.title-menu {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}

.title-button {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  font-family: var(--font-body);
  cursor: pointer;
  transition: background-color 0.2s;
  min-height: 44px;
}

.title-button:hover {
  background-color: var(--color-primary);
  color: var(--color-surface);
}

.title-panel-wrap {
  text-align: left;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: var(--gap-medium);
}

.title-panel-wrap .title-button {
  margin-top: var(--gap-medium);
}
</style>
