<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue'
import TopBar from './components/TopBar.vue'
import InstructionList from './components/InstructionList.vue'
import EditorPanel from './components/EditorPanel.vue'
import { useWorkspaceStore, setDirtyGuard, isTauri } from './stores/workspaceStore'
import { useEditorStore } from './stores/editorStore'
import { useIndexStore } from './stores/indexStore'
import { focusSearch } from './lib/events'

const ws = useWorkspaceStore()
const editor = useEditorStore()
const index = useIndexStore()

/** 样式注册表统计（诊断/信息）：插件默认基座数 · mod 层样式数 */
const styleCounts = computed(() => ({
  defaults: Object.keys(ws.defaultStyles).length,
  mods: Object.values(ws.stylesByMod).reduce((n, s) => n + Object.keys(s).length, 0),
  debugText: ws.stylesDebug
    ? `插件 ${ws.stylesDebug.plugins} · 默认层文件 ${ws.stylesDebug.defaultFilesScanned} · mod 键 ${ws.stylesDebug.modKeys.join(',')}`
    : '',
}))

function onKey(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    focusSearch()
  }
}

// 关窗策略（2026-08-23 定稿）：不做 onCloseRequested 拦截——Tauri v2 + WebView2
// 的拦截后重关（close/destroy）经多次实测不可靠（卡死）。未保存内容由草稿机制兜底
// （编辑器每 800ms 自动存 localStorage，重开自动恢复），原生关闭畅通无阻。
onMounted(() => {
  setDirtyGuard(() => editor.dirty)
  if (ws.root && !ws.index) void ws.reload()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  setDirtyGuard(null)
})
</script>

<template>
  <div class="app">
    <template v-if="ws.root">
      <TopBar />
      <div class="body">
        <InstructionList class="pane-list" />
        <EditorPanel class="pane-editor" />
      </div>
      <footer class="statusbar">
        <span class="sb-item" title="工作区根目录">{{ ws.root }}</span>
        <span class="sb-item">指令 {{ index.items.length }} 条</span>
        <span class="sb-item">筛出 {{ index.filtered.length }} 条</span>
        <span class="sb-item" :title="styleCounts.debugText">样式 {{ styleCounts.defaults }} / {{ styleCounts.mods }}</span>
        <span class="sb-item" v-if="editor.open">
          {{ editor.filePath }}
          <span v-if="editor.dirty" class="sb-dirty">● 未保存</span>
        </span>
        <span class="sb-item sb-err" v-if="ws.lastError">{{ ws.lastError }}</span>
        <span class="sb-item sb-notice" v-if="ws.notice">{{ ws.notice }}</span>
        <span class="sb-spacer"></span>
        <span class="sb-item">Ctrl+K 搜索 · Ctrl+S 保存 · ↑↓ 选择</span>
      </footer>
    </template>

    <div v-else class="welcome">
      <h1>通用口上编辑器</h1>
      <p>维护 era-engine 通用原生指令的默认口上（以及 mod 覆盖版 / mod 指令口上）。</p>
      <button class="btn primary" @click="ws.pickRoot()">
        {{ ws.loading ? '加载中…' : '选择工作区根目录（era-engine）' }}
      </button>
      <p class="welcome-hint" v-if="!isTauri()">
        当前运行在浏览器中：请用 <code>npm run tauri dev</code> 启动以获得文件读写能力。
      </p>
    </div>

    <div class="loading-overlay" v-if="ws.loading">
      <div class="loading-box">扫描工作区…</div>
    </div>
  </div>
</template>