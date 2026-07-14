<script setup lang="ts">
import Toolbar from './components/Toolbar.vue'
</script>

<template>
  <div class="app-layout">
    <Toolbar />
    <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#94a3b8;">
      Toolbar 测试
    </div>
  </div>
</template>

<style>
html, body, #app { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; font-family: sans-serif; }
.app-layout { display: flex; flex-direction: column; height: 100%; }
</style>
