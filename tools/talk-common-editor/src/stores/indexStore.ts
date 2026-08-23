/**
 * 指令列表：筛选（搜索/分类/tag/状态）+ 选择。
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { useWorkspaceStore } from './workspaceStore'
import { useEditorStore } from './editorStore'
import type { ListItem } from '../lib/scan'

export const STATUS_NO_TALK = 'no-talk'
export const STATUS_BROKEN = 'broken'
export const STATUS_ORPHAN = 'orphan'
export const STATUS_MOD_COVERED = 'mod-covered'

export const useIndexStore = defineStore('index', {
  state: () => ({
    search: '',
    category: 'all',
    tags: [] as string[],
    status: [] as string[],
    /** 指令来源：all = 全部 | native = 通用原生指令 | mod = 所选 mod 引入的指令 */
    source: 'all' as 'all' | 'native' | 'mod',
    selectedKey: null as string | null,
  }),
  getters: {
    items(): ListItem[] {
      return useWorkspaceStore().index?.items ?? []
    },
    categories(): string[] {
      const set = new Set<string>()
      for (const it of this.items) set.add(it.category || '未分类')
      return [...set].sort((a, b) => a.localeCompare(b, 'zh'))
    },
    allTags(): string[] {
      const set = new Set<string>()
      for (const it of this.items) for (const t of it.tags) set.add(t)
      return [...set].sort()
    },
    filtered(): ListItem[] {
      const ws = useWorkspaceStore()
      const q = this.search.trim().toLowerCase()
      return this.items.filter((it) => {
        if (q.length > 0) {
          const hay = [it.key, it.label ?? '', it.instruction?.erarkId ?? '']
            .join(' ')
            .toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (this.category !== 'all' && (it.category || '未分类') !== this.category) return false
        if (this.tags.length > 0 && !this.tags.every((t) => it.tags.includes(t))) return false
        if (this.source === 'native' && it.instruction?.sourceKind !== 'native') return false
        if (this.source === 'mod' && it.instruction?.sourceKind !== 'mod') return false
        if (this.status.length > 0) {
          const st = statusOf(it, ws.mode === 'default' ? null : ws.modId)
          if (!this.status.includes(st)) return false
        }
        return true
      })
    },
    grouped(): { category: string; items: ListItem[] }[] {
      const groups = new Map<string, ListItem[]>()
      for (const it of this.filtered) {
        const c = it.category || '未分类'
        if (!groups.has(c)) groups.set(c, [])
        groups.get(c)!.push(it)
      }
      return [...groups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'zh'))
        .map(([category, items]) => ({ category, items }))
    },
  },
  actions: {
    handleKeydown(e: KeyboardEvent): void {
      const list = this.filtered
      if (list.length === 0) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const idx = list.findIndex((it) => it.key === this.selectedKey)
        let next = 0
        if (idx >= 0) {
          next =
            e.key === 'ArrowDown'
              ? (idx + 1) % list.length
              : (idx - 1 + list.length) % list.length
        }
        this.select(list[next].key)
        e.preventDefault()
      } else if (e.key === 'Enter' && this.selectedKey) {
        const it = list.find((x) => x.key === this.selectedKey)
        if (it) openItem(it)
      }
    },
    select(key: string): void {
      this.selectedKey = key
    },
  },
})

/** 按当前模式/选中的 mod 打开条目 */
export async function openItem(item: ListItem): Promise<void> {
  const ws = useWorkspaceStore()
  const editor = useEditorStore()
  const isMod = ws.mode !== 'default'
  await editor.openItem(item, {
    layer: isMod ? 'mod' : 'default',
    modId: isMod && ws.modId ? ws.modId : undefined,
  })
}

/** 条目在指定目标下的状态（用于筛选与徽标） */
export function statusOf(item: ListItem, modId: string | null): string {
  if (item.instruction && !item.defaultFile && !(modId && item.modFiles[modId]))
    return STATUS_NO_TALK
  if (item.defaultFile && !item.defaultFile.parseOk) return STATUS_BROKEN
  if (!item.instruction) return STATUS_ORPHAN
  if (modId && item.modFiles[modId]) return STATUS_MOD_COVERED
  return 'default-ok'
}

// store HMR：字段增删后热更自动重建实例（否则旧实例缺新 state 键）
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useIndexStore, import.meta.hot))
}