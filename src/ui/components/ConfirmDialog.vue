// 注释：ConfirmDialog 二次确认对话框（存档面板读取/覆盖/删除共用，erArk askfor 确认语义）

<script setup lang="ts">
defineProps<{
  message: string
  confirmText: string
  cancelText: string
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div class="confirm-overlay" @click.self="emit('cancel')">
    <div class="confirm-dialog">
      <p class="confirm-message">{{ message }}</p>
      <div class="confirm-actions">
        <button class="confirm-button confirm-primary" @click="emit('confirm')">{{ confirmText }}</button>
        <button class="confirm-button" @click="emit('cancel')">{{ cancelText }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  z-index: 320;
  display: flex;
  align-items: center;
  justify-content: center;
}

.confirm-dialog {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: var(--gap-medium);
  max-width: 340px;
  width: 90%;
}

.confirm-message {
  color: var(--color-text);
  margin-bottom: var(--gap-medium);
}

.confirm-actions {
  display: flex;
  gap: var(--gap-small);
  justify-content: flex-end;
}

.confirm-button {
  padding: var(--gap-small) var(--gap-medium);
  background-color: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-text);
  cursor: pointer;
  min-height: 44px;
  min-width: 88px;
}

.confirm-primary {
  background-color: var(--color-primary);
  color: var(--color-surface);
}
</style>
