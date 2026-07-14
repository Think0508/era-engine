<script setup lang="ts">
import FileMenu from './FileMenu.vue'
import ExportBar from './ExportBar.vue'
</script>

<template>
  <div class="toolbar">
    <FileMenu />
    <div class="spacer" />
    <ExportBar />
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; padding: 4px 12px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; height: 36px; }
.spacer { flex: 1; }
</style>
