<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useEditorStore } from '../stores/editorStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { parseEntriesPreview, interpolatePreview, type PreviewEntry, type PreviewDisplay } from '../lib/preview'
import { renderBBCode, sizeToPx, cssColor, type Seg } from '../lib/bbcode'

const editor = useEditorStore()
const ws = useWorkspaceStore()
const entries = ref<PreviewEntry[]>([])
const parseError = ref<string | null>(null)
const picked = ref<number | null>(null)
const entriesSkipped = ref(0)
let parseTimer = 0

/** 逐字播放模拟：静态预览渲染不了时序，这里把 typewriter 的节奏演出来 */
const playing = ref<PreviewEntry | null>(null)
const playChars = ref(1)
let playTimer = 0

function stopPlay(): void {
  window.clearInterval(playTimer)
  playTimer = 0
  playing.value = null
  playChars.value = 1
}

watch(
  () => editor.text,
  () => {
    picked.value = null
    clearTimeout(parseTimer)
    parseTimer = window.setTimeout(async () => {
      stopPlay()
      const r = await parseEntriesPreview(editor.text)
      entriesSkipped.value = r.entries.length > 500 ? r.entries.length - 500 : 0
      entries.value = entriesSkipped.value > 0 ? r.entries.slice(0, 500) : r.entries
      parseError.value = r.error ?? null
    }, 400)
  },
  { immediate: true },
)

onBeforeUnmount(stopPlay)

const groups = computed(() => {
  const map = new Map<string, PreviewEntry[]>()
  for (const e of entries.value) {
    const key = e.conditions || '（无条件）'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return [...map.entries()]
})

function pick(): void {
  picked.value = null
  picked.value =
    entries.value.length > 0 ? Math.floor(Math.random() * entries.value.length) : null
}

function isTypewriter(e: PreviewEntry): boolean {
  return resolvedDisplay(e).display === 'typewriter'
}

function isPlaying(e: PreviewEntry): boolean {
  return playing.value === e
}

function togglePlay(e: PreviewEntry): void {
  if (isPlaying(e)) {
    stopPlay()
    return
  }
  stopPlay()
  const speed = resolvedDisplay(e).speed ?? 60
  const text = interpolatePreview(e.context)
  playing.value = e
  playChars.value = 1
  // 注意：每次 tick 都整体替换 ref 值（响应式路径）——直接改对象属性不会触发更新
  playTimer = window.setInterval(() => {
    playChars.value += 1
    if (playChars.value >= text.length) stopPlay()
  }, speed)
}

function playingText(e: PreviewEntry): string {
  return interpolatePreview(e.context).slice(0, isPlaying(e) ? playChars.value : 99999)
}

/**
 * 整体修饰解析（ADR 0018）：
 * [styles] 注册表（插件默认 → 当前目标 mod 覆盖）→ 词条自身字段覆盖。
 * 返回最终 display 字段（style 键已消费）。
 */
function resolvedDisplay(entry: PreviewEntry): Partial<PreviewDisplay> {
  const base: Partial<PreviewDisplay> = {}
  if (entry.style) {
    // 解析源与引擎一致：插件默认层基座 + 目标 mod 覆盖（默认层模式 = 活跃 mod）
    const modId = editor.target?.modId ?? ws.modId ?? ''
    const fields =
      ws.defaultStyles[entry.style] ?? ws.stylesByMod[modId]?.[entry.style]
    if (fields) Object.assign(base, fields)
  }
  const own: Partial<PreviewDisplay> = {}
  for (const k of ['trigger', 'display', 'speed', 'pause', 'color', 'size', 'font'] as const) {
    const v = entry[k]
    if (v !== undefined) (own as Record<string, unknown>)[k] = v
  }
  return { ...base, ...own, style: undefined }
}

/** 节奏/触发徽标（静态预览模拟不了的参数，用标签显式标注） */
function displayTags(entry: PreviewEntry): string[] {
  const d = resolvedDisplay(entry)
  const tags: string[] = []
  if (entry.style) {
    const modId = editor.target?.modId ?? ws.modId ?? ''
    const known =
      ws.defaultStyles[entry.style] || ws.stylesByMod[modId]?.[entry.style]
    tags.push(known ? `style:${entry.style}` : `style:${entry.style}?（未注册）`)
  }
  if (d.display === 'typewriter') tags.push(`逐字${d.speed ?? 60}ms`)
  if (d.trigger === 'click') tags.push('点击继续')
  if (d.pause && d.pause > 0) tags.push(`尾停${d.pause}ms（点击跳过）`)
  return tags
}

/** 整体视觉样式（颜色/字体/字号，供给条目容器） */
function entryStyleOf(entry: PreviewEntry): Record<string, string> {
  const d = resolvedDisplay(entry)
  const out: Record<string, string> = {}
  if (d.color) out.color = cssColor(d.color)
  if (d.font) out.fontFamily = d.font
  if (d.size) out.fontSize = sizeToPx(d.size)
  return out
}

/** 渲染：mock 插值 → BBCode（对齐引擎口上渲染格式）→ HTML */
function renderEntry(text: string): string {
  return segsToHtml(renderBBCode(interpolatePreview(text)))
}

function segsToHtml(segs: Seg[]): string {
  return segs
    .map((s) => {
      switch (s.type) {
        case 'text':
          return escapeHtml(s.text)
        case 'bold':
          return `<b>${segsToHtml(s.children)}</b>`
        case 'italic':
          return `<i>${segsToHtml(s.children)}</i>`
        case 'strike':
          return `<s>${segsToHtml(s.children)}</s>`
        case 'spoiler':
          return `<span class="pv-spoiler">${segsToHtml(s.children)}</span>`
        case 'styled': {
          const style =
            s.tag === 'color'
              ? `color:${cssColor(s.value)}`
              : s.tag === 'font'
                ? `font-family:${s.value.replace(/"/g, '&quot;')}`
                : `font-size:${sizeToPx(s.value)}`
          return `<span style="${style}">${segsToHtml(s.children)}</span>`
        }
      }
    })
    .join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 涂黑点击展开（对齐引擎 ||spoiler|| 语义） */
function onSpoilerClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest('.pv-spoiler')
  if (el) el.classList.toggle('shown')
}
</script>

<template>
  <aside class="preview" @click="onSpoilerClick">
    <header class="pv-head">
      <span>渲染预览（忽略条件随机池 · BBCode 渲染）</span>
      <span class="pv-actions">
        <button class="btn ghost small" @click="pick()">随机抽一条</button>
        <span class="pv-close" title="关闭预览" @click="editor.showPreview = false">✕</span>
      </span>
    </header>
    <div v-if="parseError" class="pv-err">{{ parseError }}</div>
    <div v-else-if="entries.length === 0" class="pv-empty">无 [[entries]] 可预览</div>
    <template v-else>
      <div v-if="entriesSkipped > 0" class="pv-skip">条目过多，仅预览前 500 条（共 {{ entriesSkipped + 500 }} 条）</div>
      <div v-for="[cond, list] in groups" :key="cond" class="pv-group">
        <div class="pv-cond">{{ cond }}</div>
        <div
          v-for="(e, i) in list"
          :key="cond + i"
          class="pv-entry"
          :class="{ picked: picked !== null && entries[picked] === e, playing: isPlaying(e) }"
        >
          <span class="pv-tags" v-if="displayTags(e).length">
            <span v-for="t in displayTags(e)" :key="t" class="pv-tag">{{ t }}</span>
          </span>
          <button v-if="isTypewriter(e)" class="pv-play" @click="togglePlay(e)">
            {{ isPlaying(e) ? '⏸ 重置' : '▶ 逐字播放' }}
          </button>
          <span v-if="isPlaying(e)" class="pv-playing-text">{{ playingText(e) }}<span class="pv-caret">▍</span></span>
          <span v-else :style="entryStyleOf(e)" v-html="renderEntry(e.context)" />
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.preview {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 26px;
  width: 340px;
  z-index: 5;
  border-left: 1px solid var(--border);
  box-shadow: -4px 0 12px #00000014;
  background: var(--surface-2);
  overflow: auto;
  font-size: 12.5px;
}
.pv-head {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  font-weight: 600;
}
.pv-actions { display: flex; align-items: center; gap: 6px; }
.pv-close { cursor: pointer; padding: 0 4px; color: var(--text-dim); }
.pv-close:hover { color: var(--err); }
.pv-skip { padding: 6px 10px; color: var(--warn); font-size: 11.5px; }
.pv-err { color: var(--err); padding: 10px; }
.pv-empty { color: var(--text-dim); padding: 12px; }
.pv-group { padding: 6px 0; border-bottom: 1px dashed var(--border); }
.pv-cond {
  padding: 2px 10px;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
}
.pv-entry {
  padding: 4px 10px 4px 22px;
  color: var(--text);
  line-height: 1.7;
  overflow-wrap: break-word;
}
.pv-tags { display: inline-flex; gap: 4px; margin-right: 6px; vertical-align: baseline; }
.pv-tag {
  font-size: 10px;
  color: var(--accent);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 4px;
  white-space: nowrap;
  background: var(--surface);
}
.pv-play {
  font-size: 11px;
  color: var(--accent);
  background: var(--sel);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 1px 8px;
  cursor: pointer;
  margin-right: 8px;
}
.pv-play:hover { background: #b6e3ff; }
.pv-entry.playing { background: #fffdf0; }
.pv-playing-text { color: var(--text); }
.pv-caret {
  display: inline-block;
  width: 1px;
  height: 1em;
  vertical-align: text-bottom;
  background: var(--accent);
  animation: pv-blink 0.8s step-start infinite;
}
@keyframes pv-blink {
  50% { opacity: 0; }
}
.pv-entry.picked {
  background: var(--sel);
  outline: 1px solid var(--accent);
  border-radius: 3px;
}
.pv-entry :deep(.pv-spoiler) {
  background: #000;
  color: transparent;
  border-radius: 2px;
  cursor: pointer;
  user-select: none;
}
.pv-entry :deep(.pv-spoiler.shown) {
  background: none;
  color: inherit;
}
</style>