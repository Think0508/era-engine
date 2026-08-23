<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editorStore'
import { diffLines, type DiffOp } from '../lib/diff'

const editor = useEditorStore()

const ops = computed<DiffOp[]>(() => {
  const base = (editor.defaultText ?? '').split('\n')
  const cur = editor.text.split('\n')
  if (base.length > 600 || cur.length > 600) {
    // 超大文件退化为逐行对照（不做 diff 高亮）
    return cur.map<DiffOp>((t) => ({ type: 'same', text: t }))
  }
  return diffLines(base, cur)
})
</script>

<template>
  <div class="ref-pane">
    <header class="ref-head">
      <span>默认层（只读对照）</span>
      <span class="ref-close" title="关闭对照" @click="editor.showRef = false">✕</span>
    </header>
    <div class="ref-body">
      <div
        v-for="(op, i) in ops"
        :key="i"
        class="ref-line"
        :class="op.type"
      >{{ op.text || '␤' }}</div>
    </div>
  </div>
</template>

<style scoped>
.ref-pane {
  flex: 1 1 50%;
  min-width: 0;
  border-left: 1px solid var(--border);
  background: var(--surface-3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-size: 12.5px;
}
.ref-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--text-dim);
  font-weight: 600;
}
.ref-close { cursor: pointer; padding: 0 4px; }
.ref-close:hover { color: var(--err); }
.ref-body {
  flex: 1;
  overflow: auto;
  font-family: var(--mono);
  line-height: 1.7;
  padding: 4px 0;
}
.ref-line {
  padding: 0 10px;
  white-space: pre-wrap;
  word-break: break-all;
}
.ref-line.del { background: #ffebe9; color: #cf222e; }
.ref-line.add { background: #dafbe1; color: #1a7f37; }
.ref-line.same { color: var(--text-dim); }
</style>