<script setup lang="ts">
import { computed } from 'vue'
import { useUIStore } from './ui/stores/ui-store'
import MainGame from './ui/views/MainGame.vue'

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
</script>

<template>
  <div class="app-root" :style="appStyle">
    <MainGame />
  </div>
</template>

<style>
.app-root {
  font-family: var(--font-body);
  font-size: var(--font-size-base);
}
</style>
