<script setup lang="ts">
// 注释：背包面板（SYSTEM item 入口，2026-08-26）
// 功能：列出玩家背包物品，可直接“使用”到选中角色（无选中则对自己使用）。
// 物品使用统一走 inventory-system.useItem（消耗、装备、apply_* 效果都由物品定义驱动）。
import { ref, onMounted } from 'vue'
import { entitySystem } from '../../core/entity-system'
import { apiSystem } from '../../core/api'
import { useGameStore } from '../stores/game-store'
import { useUIStore } from '../stores/ui-store'

interface InvItem {
  itemId: string
  count: number
}

const gameStore = useGameStore()
const uiStore = useUIStore()

const items = ref<InvItem[]>([])
const message = ref('')

function loadInventory(): void {
  const playerId = gameStore.player?.id
  const ch = playerId ? entitySystem.get('character', playerId) as any : null
  items.value = (ch?.inventory ?? []).map((i: any) => ({ itemId: i.itemId, count: i.count }))
}

onMounted(loadInventory)

async function useItem(itemId: string): Promise<void> {
  const playerId = gameStore.player?.id
  if (!playerId) return
  const targetId = uiStore.selectedCharacterId ?? playerId
  const ok = await apiSystem.call('inventory', 'useItem', playerId, itemId, targetId) as unknown as boolean
  message.value = ok ? `使用了 ${itemId}` : `无法使用 ${itemId}`
  loadInventory()
}
</script>

<template>
  <div class="backpack-panel">
    <div v-if="message" class="backpack-message">{{ message }}</div>
    <div v-if="items.length === 0" class="backpack-empty">背包是空的</div>
    <div v-for="item in items" :key="item.itemId" class="backpack-row">
      <span class="backpack-name">{{ item.itemId }}</span>
      <span class="backpack-count">×{{ item.count }}</span>
      <button class="backpack-use" @click="useItem(item.itemId)">使用</button>
    </div>
  </div>
</template>

<style scoped>
.backpack-panel {
  display: flex;
  flex-direction: column;
  gap: var(--gap-small);
}
.backpack-message {
  color: var(--color-success);
}
.backpack-empty {
  color: var(--color-text-secondary);
}
.backpack-row {
  display: flex;
  align-items: center;
  gap: var(--gap-medium);
  padding: var(--gap-small) var(--gap-medium);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
}
.backpack-name {
  flex: 1;
  font-weight: 600;
}
.backpack-count {
  color: var(--color-text-secondary);
}
.backpack-use {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  padding: 2px 10px;
  cursor: pointer;
}
</style>