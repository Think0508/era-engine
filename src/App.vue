// 注释：App.vue 根组件
// Phase 5 开发期间：直接显示 MainGame（用 mock 数据）
// Task 5.15 bridge 实现后：main.ts 控制启动流程（ModSelect → TitleScreen → MainGame）

<script setup lang="ts">
import { onMounted } from 'vue'
import { useGameStore } from './ui/stores/game-store'
import { mockPlayer, mockTownSquare, mockTime, mockCharactersAtTownSquare, mockCalendar, mockEquipmentSlots } from './ui/stores/mock-data'
import { registerNativeCommands } from './ui/native-commands'
import MainGame from './ui/views/MainGame.vue'

const gameStore = useGameStore()

onMounted(() => {
  // 注释：填充 mock 数据供组件开发期间使用
  // TODO(task-5.15): bridge 替换为真实 core 数据
  gameStore.setPlayer(mockPlayer)
  gameStore.setLocation(mockTownSquare)
  gameStore.setTime(mockTime)
  gameStore.setCharactersAtLocation(mockCharactersAtTownSquare)
  gameStore.setCalendar(mockCalendar)
  gameStore.setEquipmentSlots(mockEquipmentSlots)
  // 注释：注册原生指令
  registerNativeCommands()
})
</script>

<template>
  <MainGame />
</template>
