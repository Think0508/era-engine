<script setup lang="ts">
import TopologyCanvas from './components/TopologyCanvas.vue'
</script>

<template>
  <div class="app-layout">
    <TopologyCanvas />
  </div>
</template>

<style>
html, body, #app { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
.app-layout { height: 100%; width: 100%; }
</style>
