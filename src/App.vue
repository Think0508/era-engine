// 注释：App.vue 根组件

<script setup lang="ts">
import { useGameStore } from './ui/stores/game-store'
import { mockPlayer, mockTownSquare, mockTime, mockCharactersAtTownSquare, mockCalendar, mockEquipmentSlots } from './ui/stores/mock-data'
import { registerNativeCommands } from './ui/native-commands'
import MainGame from './ui/views/MainGame.vue'

const gameStore = useGameStore()

// 注释：在组件渲染前注册指令——保证 CommandBar 能读到
registerNativeCommands()

// 注释：填充 mock 数据
gameStore.setPlayer(mockPlayer)
gameStore.setLocation(mockTownSquare)
gameStore.setTime(mockTime)
gameStore.setCharactersAtLocation(mockCharactersAtTownSquare)
gameStore.setCalendar(mockCalendar)
gameStore.setEquipmentSlots(mockEquipmentSlots)

// 注释：自动选中第一个 NPC
if (mockCharactersAtTownSquare.length > 0) {
  const firstNpc = mockCharactersAtTownSquare.find(c => c.id !== mockPlayer.id)
  if (firstNpc) {
    import('./ui/stores/ui-store').then(({ useUIStore }) => {
      useUIStore().selectCharacter(firstNpc.id)
    })
  }
}
</script>

<template>
  <MainGame />
</template>
