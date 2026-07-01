// 注释：SaveSlotList 存档列表组件——显示所有存档供选择读档或删除

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface SaveSlotInfo {
  id: string
  slotId: string
  label: string
  gameTime: string
  uiDisplay?: string
}

const emit = defineEmits<{
  (e: 'load', slotId: string): void
  (e: 'back'): void
}>()

const slots = ref<SaveSlotInfo[]>([])

onMounted(async () => {
  try {
    const { getSaveSlots } = await import('../../core/save-system')
    const dbSlots = await getSaveSlots()
    slots.value = dbSlots.map(s => ({
      id: s.id,
      slotId: s.slotId,
      label: s.label ?? s.slotId,
      gameTime: s.gameTime ?? '',
    }))
  } catch {
    // 注释：save-system 不可用时显示空列表
  }
})

function formatTime(iso: string): string {
  return iso || '未知时间'
}
</script>

<template>
  <div class="save-slot-list">
    <h3 class="list-title">存档列表</h3>

    <div v-if="slots.length === 0" class="empty-hint">
      暂无存档
    </div>

    <div
      v-for="slot in slots"
      :key="slot.slotId"
      class="save-slot"
      @click="$emit('load', slot.slotId)"
    >
      <div class="slot-label">{{ slot.label }}</div>
      <div class="slot-time">{{ formatTime(slot.gameTime) }}</div>
    </div>

    <div class="list-actions">
      <button class="list-button" @click="$emit('back')">返回</button>
    </div>
  </div>
</template>

<style scoped>
.save-slot-list {
  padding: var(--gap-medium);
}

.list-title {
  color: var(--color-primary);
  margin-bottom: var(--gap-medium);
}

.save-slot {
  padding: var(--gap-medium);
  margin-bottom: var(--gap-small);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  cursor: pointer;
  min-height: 44px;
}

.save-slot:hover {
  border-color: var(--color-primary);
}

.slot-label {
  color: var(--color-text);
  font-weight: bold;
}

.slot-time {
  color: var(--color-text-secondary);
  font-size: 0.75rem;
  margin-top: var(--gap-small);
}

.empty-hint {
  color: var(--color-text-secondary);
  text-align: center;
  padding: var(--gap-large);
}

.list-actions {
  margin-top: var(--gap-medium);
  text-align: center;
}

.list-button {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  min-height: 44px;
}
</style>
