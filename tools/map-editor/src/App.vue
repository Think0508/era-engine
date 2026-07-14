<template>
  <div style="padding: 40px; font-family: sans-serif;">
    <h1>地图编辑器</h1>
    <p v-if="loaded">✅ Vue 已加载，Pinia 正常工作</p>
    <p v-else>加载中...</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
const loaded = ref(false)
onMounted(() => { loaded.value = true })
</script>
