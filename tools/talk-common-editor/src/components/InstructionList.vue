<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useIndexStore, openItem } from '../stores/indexStore'
import { useEditorStore } from '../stores/editorStore'

const ws = useWorkspaceStore()
const index = useIndexStore()
const editor = useEditorStore()

const listEl = ref<HTMLElement | null>(null)
const selectedEl = ref<HTMLElement | null>(null)

watch(
  () => index.selectedKey,
  async () => {
    await nextTick()
    selectedEl.value?.scrollIntoView({ block: 'nearest' })
  },
)

function rowClass(itemKey: string): Record<string, boolean> {
  return {
    sel: index.selectedKey === itemKey,
    dirty: !!editor.itemKey && editor.itemKey === itemKey && editor.dirty,
  }
}

const modCovered = computed(() => (ws.mode === 'default' ? null : ws.modId))
</script>

<template>
  <aside class="list-pane" ref="listEl" tabindex="0" @keydown="index.handleKeydown($event)">
    <div class="list-head">
      <span class="list-title">指令 / 口上</span>
      <span class="list-count">{{ index.filtered.length }}</span>
    </div>
    <div v-if="index.filtered.length === 0" class="list-empty">
      <template v-if="index.items.length === 0">没有发现指令或口上文件——检查工作区根目录是否选对</template>
      <template v-else>无匹配结果，试试放宽筛选</template>
    </div>
    <div v-for="g in index.grouped" :key="g.category" class="group">
      <div class="group-title">{{ g.category }}<span class="group-count">{{ g.items.length }}</span></div>
      <div
        v-for="it in g.items"
        :key="it.key"
        class="item"
        :class="rowClass(it.key)"
        @click="openItem(it)"
      >
        <span class="item-main">
          <span class="item-label">{{ it.label ?? it.key }}</span>
          <span class="item-id">{{ it.key }}{{ it.instruction?.erarkId ? ' · cid ' + it.instruction.erarkId : '' }}</span>
        </span>
        <span class="item-badges">
          <span v-if="!it.instruction" class="tag tag-orphan" title="无对应指令的场景词条（如 chat_failed）">词条</span>
          <span v-if="it.instruction" class="tag" :class="it.instruction.sourceKind === 'native' ? 'tag-native' : 'tag-mod'">
            {{ it.instruction.sourceKind === 'native' ? '原生' : 'mod' }}
          </span>
          <span v-if="it.defaultFile && it.defaultFile.parseOk" class="tag tag-ok" title="默认层有口上">默认✓</span>
          <span v-else-if="it.defaultFile && !it.defaultFile.parseOk" class="tag tag-broken" title="默认层文件解析失败">⚠解析</span>
          <span v-else-if="it.instruction" class="tag tag-miss" title="默认层无口上文件">未建</span>
          <span v-if="it.instruction && modCovered && it.modFiles[modCovered]" class="tag tag-covered" :title="`mod ${modCovered} 已有覆盖`">覆✓</span>
        </span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.list-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-dim);
  position: sticky;
  top: 0;
  background: var(--surface-2);
  z-index: 1;
}
.list-count { color: var(--accent); font-weight: 600; }
.list-empty { padding: 20px 12px; color: var(--text-dim); font-size: 13px; }
.group-title {
  padding: 6px 10px;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 33px;
  z-index: 1;
}
.group-count { margin-left: 6px; color: var(--text-faint); }
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  border-left: 2px solid transparent;
}
.item:hover { background: var(--hover); }
.item.sel { background: var(--sel); border-left-color: var(--accent); }
.item.dirty .item-label::after { content: ' ●'; color: var(--warn); font-size: 10px; }
.item-main { display: flex; flex-direction: column; min-width: 0; }
.item-label { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.item-id { font-size: 11px; font-family: var(--mono); color: var(--text-dim); }
.item-badges { display: flex; gap: 4px; flex-shrink: 0; }
.tag {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid var(--border);
  color: var(--text-dim);
  white-space: nowrap;
}
.tag-native { color: #1a7f37; border-color: #4ac26b; background: #dafbe1; }
.tag-mod { color: #0550ae; border-color: #0969da; background: #ddf4ff; }
.tag-ok { color: #1a7f37; border-color: #4ac26b; background: #dafbe1; }
.tag-miss { color: #9a6700; border-color: #d4a72c; background: #fff8c5; }
.tag-broken { color: #cf222e; border-color: #ff8182; background: #ffebe9; }
.tag-covered { color: #8250df; border-color: #bc8cff; background: #fbefff; }
.tag-orphan { color: #57606a; border-color: #afb8c1; background: #f6f8fa; }
</style>