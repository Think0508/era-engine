<template>
  <div class="app-layout">
    <div class="toolbar" style="padding:8px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;gap:12px;">
      <span style="font-weight:bold">地图编辑器</span>
      <span>{{ mapStore.nodes.length }} 个节点</span>
      <span>{{ mapStore.edges.length }} 条边</span>
    </div>
    <div class="main-area" style="display:flex;flex:1;">
      <aside style="width:200px;border-right:1px solid #e2e8f0;padding:12px;">
        <h3>Tag 池</h3>
        <input placeholder="新 Tag..." style="width:100%;box-sizing:border-box;padding:4px 8px;" />
      </aside>
      <main style="flex:1;display:flex;align-items:center;justify-content:center;color:#94a3b8;">
        Vue Flow 画布（下一步添加）
      </main>
      <aside style="width:280px;border-left:1px solid #e2e8f0;padding:12px;">
        <h3>节点属性</h3>
        <p style="color:#94a3b8">未选中节点</p>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMapStore } from './stores/mapStore'
import { useUiStore } from './stores/uiStore'
const mapStore = useMapStore()
const uiStore = useUiStore()
</script>

<style>
html, body, #app { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; font-family: sans-serif; }
.app-layout { display: flex; flex-direction: column; height: 100%; }
</style>
