<script setup lang="ts">
import Toolbar from './components/Toolbar.vue'
import Breadcrumb from './components/Breadcrumb.vue'
import TagPool from './components/TagPool.vue'
import NodePanel from './components/NodePanel.vue'
import EdgePanel from './components/EdgePanel.vue'
import StatusBar from './components/StatusBar.vue'
</script>

<template>
  <div class="app-layout">
    <Toolbar />
    <Breadcrumb />
    <div class="main-area">
      <aside class="sidebar-left"><TagPool /></aside>
      <main class="canvas-area">
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;">
          Vue Flow 画布（下一步添加）
        </div>
      </main>
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
.sidebar-left { width: 200px; border-right: 1px solid #e2e8f0; overflow-y: auto; }
.canvas-area { flex: 1; position: relative; }
.sidebar-right { width: 280px; border-left: 1px solid #e2e8f0; overflow-y: auto; }
</style>
