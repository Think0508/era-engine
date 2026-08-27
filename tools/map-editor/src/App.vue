<script setup lang="ts">
import { ref } from 'vue'
import Toolbar from './components/Toolbar.vue'
import Breadcrumb from './components/Breadcrumb.vue'
import TopologyCanvas from './components/TopologyCanvas.vue'
import TagPool from './components/TagPool.vue'
import OutlinePanel from './components/OutlinePanel.vue'
import NodePanel from './components/NodePanel.vue'
import EdgePanel from './components/EdgePanel.vue'
import StatusBar from './components/StatusBar.vue'

const leftTab = ref<'tags' | 'outline'>('tags')
</script>

<template>
  <div class="app-layout">
    <Toolbar />
    <Breadcrumb />
    <div class="main-area">
      <aside class="sidebar-left">
        <div class="sidebar-tabs">
          <button :class="{ active: leftTab === 'tags' }" @click="leftTab = 'tags'">Tag 池</button>
          <button :class="{ active: leftTab === 'outline' }" @click="leftTab = 'outline'">大纲</button>
        </div>
        <TagPool v-if="leftTab === 'tags'" />
        <OutlinePanel v-else />
      </aside>
      <main class="canvas-area"><TopologyCanvas /></main>
      <aside class="sidebar-right">
        <NodePanel />
        <EdgePanel />
      </aside>
    </div>
    <StatusBar />
  </div>
</template>

<style>
html, body, #app { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; font-family: sans-serif; }
.app-layout { display: flex; flex-direction: column; height: 100%; }
.main-area { display: flex; flex: 1; overflow: hidden; }
.sidebar-left { width: 220px; border-right: 1px solid #e2e8f0; overflow-y: auto; }
.sidebar-tabs { display: flex; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; background: #fff; z-index: 1; }
.sidebar-tabs button { flex: 1; padding: 6px 4px; border: none; background: none; cursor: pointer; font-size: 12px; border-bottom: 2px solid transparent; }
.sidebar-tabs button.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: bold; }
.canvas-area { flex: 1; position: relative; }
.sidebar-right { width: 280px; border-left: 1px solid #e2e8f0; overflow-y: auto; }
</style>
