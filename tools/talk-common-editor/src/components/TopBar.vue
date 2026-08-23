<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useIndexStore, STATUS_NO_TALK, STATUS_BROKEN, STATUS_ORPHAN, STATUS_MOD_COVERED } from '../stores/indexStore'
import type { Mode } from '../stores/workspaceStore'
import { FOCUS_SEARCH } from '../lib/events'

const ws = useWorkspaceStore()
const index = useIndexStore()

const searchRef = ref<HTMLInputElement | null>(null)

const STATUS_LABELS: Record<string, string> = {
  [STATUS_NO_TALK]: '无默认口上',
  [STATUS_BROKEN]: '解析错误',
  [STATUS_ORPHAN]: '场景词条',
  [STATUS_MOD_COVERED]: 'mod 已覆盖',
}

const tagChips = computed(() => index.allTags.slice(0, 40))

function toggleTag(tag: string): void {
  const i = index.tags.indexOf(tag)
  if (i >= 0) index.tags.splice(i, 1)
  else index.tags.push(tag)
}
function toggleStatus(s: string): void {
  const i = index.status.indexOf(s)
  if (i >= 0) index.status.splice(i, 1)
  else index.status.push(s)
}

function onFocusSearch(): void {
  searchRef.value?.focus()
  searchRef.value?.select()
}
onMounted(() => window.addEventListener(FOCUS_SEARCH, onFocusSearch))
onBeforeUnmount(() => window.removeEventListener(FOCUS_SEARCH, onFocusSearch))

function setMode(m: Mode): void {
  if (m === ws.mode) return
  ws.setMode(m)
}
</script>

<template>
  <header class="topbar">
    <div class="row1">
      <button class="btn" title="重新选择工作区" @click="ws.pickRoot()">工作区…</button>
      <span class="root-path" :title="ws.root ?? ''">{{ ws.root }}</span>
      <button class="btn ghost" title="完整重扫：重建索引 + 词表/前提白名单（普通切换只走缓存）" @click="ws.reload(true)">⟳</button>

      <div class="mode-seg" role="tablist">
        <button
          class="seg"
          :class="{ active: ws.mode === 'default' }"
          title="编辑通用原生指令的通用默认口上（不涉及任何 mod）"
          @click="setMode('default')"
        >通用默认层</button>
        <button
          class="seg"
          :class="{ active: ws.mode === 'mod' }"
          title="在所选 mod 的视角下编辑：原生指令的覆盖口上 + 该 mod 引入的指令的口上"
          @click="setMode('mod')"
        >mod 版</button>
      </div>

      <template v-if="ws.mode === 'mod'">
        <label class="mod-lab" for="mod-select">mod</label>
        <select
          id="mod-select"
          class="mod-select"
          :value="ws.modId ?? ''"
          title="当前目标 mod：其覆盖层口上与引入的指令口上"
          @change="ws.setModId(($event.target as HTMLSelectElement).value || null)"
        >
          <option v-for="m in ws.mods" :key="m" :value="m">{{ m }}</option>
        </select>
        <span class="target-hint" data-testid="target-hint">
          ▸ 编辑目标：<b>mod{{ ws.modId ? `：${ws.modId}` : '（未选）' }}</b>
        </span>
      </template>
      <span v-else class="target-hint">
        ▸ 编辑目标：<b>引擎通用默认层</b>
      </span>

      <div class="spacer"></div>
      <input
        ref="searchRef"
        v-model="index.search"
        class="search"
        type="text"
        placeholder="搜索指令：中文名 / id / erark_id（Ctrl+K）"
      />
    </div>
    <div class="row2" v-if="index.items.length > 0">
      <select v-model="index.category" class="cat-select">
        <option value="all">全部分类</option>
        <option v-for="c in index.categories" :key="c" :value="c">{{ c }}</option>
      </select>

      <select
        v-model="index.source"
        class="cat-select"
        title="指令来源：通用原生指令 / 所选 mod 引入的指令"
      >
        <option value="all">全部指令</option>
        <option value="native">通用原生指令</option>
        <option value="mod">mod 引入指令</option>
      </select>

      <span
        v-for="t in tagChips"
        :key="t"
        class="chip"
        :class="{ on: index.tags.includes(t) }"
        @click="toggleTag(t)"
      >{{ t }}</span>

      <span class="chip-gap"></span>
      <span
        v-for="(label, s) in STATUS_LABELS"
        :key="s"
        class="chip status"
        :class="{ on: index.status.includes(s) }"
        @click="toggleStatus(s)"
      >{{ label }}</span>
    </div>
  </header>
</template>