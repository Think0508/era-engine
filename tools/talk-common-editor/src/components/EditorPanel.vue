<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { tomlLanguage } from '../lib/tomlLang'
import { useEditorStore } from '../stores/editorStore'
import FileHeader from './FileHeader.vue'
import PreviewDrawer from './PreviewDrawer.vue'
import RefPane from './RefPane.vue'

const editor = useEditorStore()
const holder = ref<HTMLElement | null>(null)

let view: EditorView | null = null
let internal = false

const tomlHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#8a9a7b' },
  { tag: tags.string, color: '#c18428' },
  { tag: tags.keyword, color: '#8250df' },
  { tag: tags.number, color: '#0550ae' },
  { tag: tags.propertyName, color: '#0550ae' },
  { tag: tags.heading, color: '#953800', fontWeight: '700' },
  { tag: tags.name, color: 'var(--text)' },
])

function buildView(): void {
  view = new EditorView({
    state: EditorState.create({
      doc: editor.text,
      extensions: [
        basicSetup,
        lineNumbers(),
        highlightActiveLine(),
        tomlLanguage(),
        syntaxHighlighting(tomlHighlight),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              void editor.save()
              return true
            },
          },
        ]),
        EditorView.updateListener.of((u) => {
          if (u.selectionSet) {
            const head = u.state.selection.main.head
            const line = u.state.doc.lineAt(head)
            editor.setCursor(line.number, head - line.from + 1)
          }
          if (u.docChanged && !internal) {
            editor.setText(u.state.doc.toString())
          }
        }),
      ],
    }),
  })
  // 无 parent 构建（holder 可能还没渲染）；打开文件时再挂载
  if (editor.open && holder.value) holder.value.appendChild(view.dom)
}

function replaceDoc(text: string): void {
  if (!view) return
  internal = true
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    selection: { anchor: 0 },
  })
  internal = false
}

function gotoLine(line?: number): void {
  if (!view || !line) return
  const l = Math.min(line, view.state.doc.lines)
  const pos = view.state.doc.line(l).from
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
  })
  view.focus()
}

onMounted(buildView)
onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

/**
 * 挂载 + 同步：open 翻转后 holder 才渲染（post-flush 才能拿到），
 * 文本变化（打开文件/复制默认/清空骨架）时同步 doc。
 */
watch(
  [() => editor.open, () => editor.text],
  () => {
    if (!view || !editor.open) return
    if (!view.dom.isConnected && holder.value) {
      holder.value.appendChild(view.dom)
    }
    if (view.state.doc.toString() !== editor.text) {
      replaceDoc(editor.text)
      view.focus()
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <section class="editor-pane">
    <FileHeader />
    <template v-if="editor.open">
      <div class="editor-wrap" :class="{ 'with-ref': editor.showRef && editor.defaultText !== null }">
        <div class="cm-holder" ref="holder"></div>
        <RefPane v-if="editor.showRef && editor.defaultText !== null" />
      </div>

      <div class="notice" v-if="editor.saveMessage && !editor.validation.errors.length">{{ editor.saveMessage }}</div>

      <div class="validation" v-if="editor.validation.errors.length || editor.validation.warnings.length || editor.validation.hints.length">
        <div class="v-block v-err">
          <span class="v-title">错误（阻止保存）</span>
          <div v-for="(issue, i) in editor.validation.errors" :key="'e' + i" class="v-row" @click="gotoLine(issue.line)">
            <span class="v-line" v-if="issue.line">L{{ issue.line }}</span>
            {{ issue.message }}
          </div>
        </div>
        <div class="v-block v-warn">
          <span class="v-title">警告</span>
          <div v-for="(issue, i) in editor.validation.warnings" :key="'w' + i" class="v-row" @click="gotoLine(issue.line)">
            <span class="v-line" v-if="issue.line">L{{ issue.line }}</span>
            {{ issue.message }}
          </div>
        </div>
        <div class="v-block v-hint">
          <span class="v-title">提示</span>
          <div v-for="(issue, i) in editor.validation.hints" :key="'h' + i" class="v-row" @click="gotoLine(issue.line)">
            <span class="v-line" v-if="issue.line">L{{ issue.line }}</span>
            {{ issue.message }}
          </div>
        </div>
      </div>
      <div class="validation ok" v-else-if="editor.text.length > 0">
        <span class="v-ok-mark">✓</span> 校验通过（TOML 语法 · 结构 · 前提引用）
      </div>

      <PreviewDrawer v-if="editor.showPreview" />

      <div class="editor-status">
        <span v-if="editor.dirty" class="st-dirty">● 未保存</span>
        <span v-else class="st-clean">已保存</span>
        <span>行 {{ editor.cursor.line }} : 列 {{ editor.cursor.col }}</span>
        <span>UTF-8{{ editor.hadBom ? ' (BOM)' : '' }}</span>
        <span>{{ editor.eol }}</span>
        <span class="st-count" v-if="editor.validation.validating">校验中…</span>
        <span class="st-count" v-else>{{ editor.validation.errors.length }} 错 / {{ editor.validation.warnings.length }} 警 / {{ editor.validation.hints.length }} 提示</span>
      </div>
    </template>
    <div v-else class="editor-empty">
      在左侧选择一个指令（或「未建」条目新建口上）。<br />
      <span class="dim">通用默认层模式 = 编辑引擎原生通用口上；mod 版模式（先在顶部选好 mod）= 该 mod 的原生指令覆盖口上 + 其引入指令的口上。</span>
    </div>
  </section>
</template>

<style scoped>
.editor-pane {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface);
}
.editor-empty {
  padding: 40px 24px;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.8;
}
.dim { font-size: 12px; }
.editor-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.editor-wrap.with-ref { flex-direction: row; }
.cm-holder {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: var(--surface);
}
.editor-wrap.with-ref .cm-holder { flex: 1 1 50%; }
.cm-holder :deep(.cm-editor) { height: 100%; font-size: 13px; }
.cm-holder :deep(.cm-scroller) { font-family: var(--mono); line-height: 1.7; }
.notice {
  padding: 6px 12px;
  font-size: 12.5px;
  color: var(--accent);
  background: var(--surface-2);
  border-top: 1px solid var(--border);
}
.validation {
  max-height: 160px;
  overflow: auto;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 12.5px;
}
.validation.ok {
  padding: 6px 12px;
  color: var(--ok-text);
  background: var(--surface-2);
}
.v-ok-mark { font-weight: 700; }
.v-block { padding: 4px 12px 6px; }
.v-title { font-size: 11px; font-weight: 600; letter-spacing: 0.05em; }
.v-err .v-title { color: var(--err); }
.v-warn .v-title { color: var(--warn); }
.v-hint .v-title { color: var(--text-dim); }
.v-row {
  padding: 1px 0 1px 8px;
  cursor: pointer;
  line-height: 1.5;
  word-break: break-all;
}
.v-row:hover { background: var(--hover); }
.v-line {
  display: inline-block;
  min-width: 34px;
  font-family: var(--mono);
  color: var(--text-dim);
  margin-right: 6px;
}
.editor-status {
  display: flex;
  gap: 14px;
  padding: 4px 12px;
  font-size: 11.5px;
  color: var(--text-dim);
  border-top: 1px solid var(--border);
  background: var(--surface-2);
  align-items: center;
}
.st-dirty { color: var(--warn); font-weight: 600; }
.st-clean { color: var(--ok-text); }
.st-count { margin-left: auto; }
</style>