<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from './ui/stores/ui-store'
import MainGame from './ui/views/MainGame.vue'
import TitleScreen from './ui/views/TitleScreen.vue'
import ModSelect from './ui/views/ModSelect.vue'
import CharacterCreation from './ui/views/CharacterCreation.vue'
import { modLoader } from './core/mod-loader'

const uiStore = useUIStore()

const fontSizeMap: Record<string, string> = {
  small: '14px',
  medium: '16px',
  large: '20px',
  xlarge: '24px',
}

const appStyle = computed(() => ({
  '--font-body': uiStore.fontFamily,
  '--font-size-base': fontSizeMap[uiStore.fontSize] ?? '16px',
}))

// 注释：标题画面素材来自当前 mod 的 meta.toml（title/name/description/title_image）
const titleInfo = computed(() => {
  const mod = modLoader.getMod()
  return {
    title: mod?.title ?? mod?.name ?? 'era-engine',
    description: mod?.description ?? undefined,
    titleImage: mod?.titleImage ?? undefined,
  }
})

function onSwitchMod(): void {
  uiStore.setGameScreen('mod_select')
}
</script>

<template>
  <div class="app-root" :style="appStyle">
    <!-- 注释：顶层画面状态机（标题/模组选择/角色创建/游戏中） -->
    <ModSelect v-if="uiStore.gameScreen === 'mod_select'" @select="onSwitchMod" />
    <TitleScreen
      v-else-if="uiStore.gameScreen === 'title'"
      :title="titleInfo.title"
      :description="titleInfo.description"
      :title-image="titleInfo.titleImage"
      @new-game="uiStore.setGameScreen('creation')"
      @switch-mod="onSwitchMod"
    />
    <CharacterCreation
      v-else-if="uiStore.gameScreen === 'creation'"
      @complete="uiStore.setGameScreen('game')"
    />
    <MainGame v-else />
  </div>
</template>

<style>
.app-root {
  font-family: var(--font-body);
  font-size: var(--font-size-base);
}
</style>
