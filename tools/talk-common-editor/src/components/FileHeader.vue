<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../stores/editorStore'

const editor = useEditorStore()

const title = computed(() => {
  const parts: string[] = []
  if (editor.target?.layer === 'mod') {
    // mod 视角：原生指令 → 覆盖口上；mod 引入指令 → 该 mod 自己的指令口上
    const kind =
      editor.sourceKind === 'mod'
        ? 'mod 指令口上'
        : '原生指令覆盖口上'
    parts.push(`mod:${editor.target.modId} · ${kind}`)
  } else {
    parts.push('引擎通用默认层 · 通用默认口上')
  }
  if (editor.sourceNote === 'skeleton') parts.push('新文件（骨架）')
  if (editor.sourceNote === 'copied') parts.push('默认层副本起步')
  return parts.join(' · ')
})

function copyPath(): void {
  navigator.clipboard?.writeText(editor.filePath ?? '').catch(() => undefined)
}
</script>

<template>
  <div class="file-head" v-if="editor.open">
    <div class="fh-left">
      <span class="fh-var">{{ editor.expectedVariable }}</span>
      <span v-if="editor.label" class="fh-label">{{ editor.label }}</span>
      <span class="fh-layer" :class="editor.target?.layer">{{ title }}</span>
      <span class="fh-path" :title="editor.filePath ?? ''" @click="copyPath()">
        {{ editor.filePath }}
        <span class="fh-copy" title="复制路径">⧉</span>
      </span>
      <span v-if="editor.hadBom" class="fh-meta">BOM</span>
    </div>
    <div class="fh-right">
      <span v-if="editor.existsOnDisk" class="fh-btn" title="重新从磁盘加载（放弃未保存改动）" @click="editor.reloadFromDisk()">重载</span>
      <span v-if="editor.hasDraft" class="fh-btn" title="放弃本地草稿" @click="editor.clearDraft()">清草稿</span>
      <span
        v-if="editor.target?.layer === 'mod' && editor.defaultText !== null && !editor.existsOnDisk"
        class="fh-btn"
        title="重新载入默认层全文（覆盖当前编辑）"
        @click="editor.copyFromDefault()"
      >重新复制默认</span>
      <span
        v-if="editor.target?.layer === 'mod' && !editor.existsOnDisk"
        class="fh-btn"
        title="清空为骨架"
        @click="editor.clearToSkeleton()"
      >清空为骨架</span>
      <span
        v-if="editor.target?.layer === 'mod' && editor.defaultText !== null"
        class="fh-btn"
        :class="{ on: editor.showRef }"
        title="对照默认层"
        @click="editor.showRef = !editor.showRef"
      >对照</span>
      <span
        class="fh-btn"
        :class="{ on: editor.showPreview }"
        title="渲染预览"
        @click="editor.showPreview = !editor.showPreview"
      >预览</span>
      <button
        class="btn primary save"
        :disabled="!editor.dirty || editor.saving"
        @click="editor.save()"
      >
        {{ editor.saving ? '保存中…' : '保存 (Ctrl+S)' }}
      </button>
    </div>
  </div>
</template>