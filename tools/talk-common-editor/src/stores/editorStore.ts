/**
 * 编辑器：当前文件、文本、脏状态、校验、保存、草稿。
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { fsAdapter, useWorkspaceStore, isTauri } from './workspaceStore'
import { joinPath } from '../lib/fsAdapter'
import { DEFAULT_TALK_DIR, modTalkDir, type ListItem } from '../lib/scan'
import { skeletonTalkFile, talkRelPath } from '../lib/seed'
import { validateTalkFile, type Issue } from '../lib/validate'
import { decodeText, encodeText } from '../lib/encoding'

export interface OpenTarget {
  layer: 'default' | 'mod'
  modId?: string
}

export interface ValidationState {
  ok: boolean
  errors: Issue[]
  warnings: Issue[]
  hints: Issue[]
  validating: boolean
}

function draftKey(filePath: string | null, itemKey: string): string {
  return `tce:draft:${filePath ?? 'new:' + itemKey}`
}

async function confirmDiscard(message: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog')
      return await confirm(message, { title: '未保存的修改', kind: 'warning' })
    } catch {
      /* fallthrough */
    }
  }
  return window.confirm(message)
}

/** 通用确认（Tauri 弹窗优先，浏览器回退 window.confirm） */
async function confirmAction(message: string, title: string): Promise<boolean> {
  if (isTauri()) {
    try {
      const { confirm } = await import('@tauri-apps/plugin-dialog')
      return await confirm(message, { title, kind: 'warning' })
    } catch {
      /* fallthrough */
    }
  }
  return window.confirm(message)
}

export const useEditorStore = defineStore('editor', {
  state: () => ({
    open: false,
    itemKey: null as string | null,
    label: null as string | null,
    /** 当前条目指令来源：native = 原生指令；mod = 所选 mod 引入的指令 */
    sourceKind: null as 'native' | 'mod' | null,
    target: null as OpenTarget | null,
    filePath: null as string | null,
    existsOnDisk: false,
    sourceNote: null as 'existing' | 'skeleton' | 'copied' | null,
    text: '',
    baseline: '',
    hadBom: false,
    dirty: false,
    validation: { ok: true, errors: [], warnings: [], hints: [], validating: false } as ValidationState,
    saving: false,
    saveMessage: null as string | null,
    cursor: { line: 1, col: 1 },
    defaultText: null as string | null,
    showRef: false,
    showPreview: false,
    hasDraft: false,
    eol: 'LF' as 'LF' | 'CRLF' | 'mixed',
    _openSeq: 0,
    _validateTimer: 0 as number | ReturnType<typeof setTimeout>,
  }),
  getters: {
    expectedVariable(state): string {
      return state.itemKey ?? ''
    },
    displayPath(state): string | null {
      return state.filePath
    },
  },
  actions: {
    async openItem(item: ListItem, target: OpenTarget): Promise<void> {
      if (this.dirty) {
        const yes = await confirmDiscard(`「${this.label ?? this.itemKey}」有未保存的修改，放弃并切换吗？`)
        if (!yes) return
      }
      const seq = ++this._openSeq
      this.clearDraft()
      this.defaultText = null
      this.showRef = false
      this.showPreview = false
      this.saveMessage = null
      this.sourceNote = null
      this.open = true
      this.itemKey = item.key
      this.label = item.label ?? null
      this.sourceKind = item.instruction?.sourceKind ?? null
      this.target = { ...target }

      const ws = useWorkspaceStore()
      const root = ws.root!
      let fileMetaExists = false
      let relPath: string

      if (target.layer === 'default') {
        if (item.defaultFile) {
          fileMetaExists = true
          relPath = item.defaultFile.relPath
        } else {
          relPath = joinPath(DEFAULT_TALK_DIR, talkRelPath(item.category, item.key))
        }
      } else {
        const modId = target.modId
        const meta = modId ? item.modFiles[modId] : undefined
        if (meta) {
          fileMetaExists = true
          relPath = meta.relPath
        } else {
          const relUnderTalk =
            item.defaultFile?.relUnderTalk ?? talkRelPath(item.category, item.key)
          relPath = joinPath(modTalkDir(modId!), relUnderTalk)
        }
      }
      this.filePath = relPath
      this.existsOnDisk = fileMetaExists

      try {
        let rawText: string
        if (fileMetaExists) {
          rawText = await fsAdapter.readTextFile(joinPath(root, relPath))
          this.sourceNote = 'existing'
        } else if (target.layer === 'mod' && item.defaultFile) {
          rawText = await fsAdapter.readTextFile(joinPath(root, item.defaultFile.relPath))
          this.sourceNote = 'copied'
          this.saveMessage = '尚未在 mod 层建立文件：已载入默认层全文副本，保存时自动创建'
        } else {
          rawText = skeletonTalkFile(item.key, item.label)
          this.sourceNote = 'skeleton'
          this.saveMessage = target.layer === 'default' ? '新口上文件：保存时自动创建' : '新 mod 覆盖文件：保存时自动创建（空白骨架）'
        }
        const meta = decodeText(rawText)
        this.text = meta.text
        this.baseline = meta.text
        this.hadBom = meta.hadBom
        this.eol = meta.eol
        this.dirty = false

        // 草稿恢复
        const draft = localStorage.getItem(draftKey(relPath, item.key))
        if (draft && draft !== meta.text) {
          this.text = draft
          this.dirty = true
          this.hasDraft = true
          this.saveMessage = '检测到未保存的草稿，已恢复（可点「清草稿」放弃）'
        }

        // mod 覆盖参照
        if (target.layer === 'mod' && item.defaultFile) {
          try {
            this.defaultText = decodeText(
              await fsAdapter.readTextFile(joinPath(root, item.defaultFile.relPath)),
            ).text
          } catch {
            this.defaultText = null
          }
        }

        if (seq === this._openSeq) await this.validate()
      } catch (err) {
        this.saveMessage = `读取失败：${err instanceof Error ? err.message : String(err)}`
      }
    },

    setText(text: string): void {
      this.text = text
      this.dirty = text !== this.baseline
      if (this.dirty && !this.hasDraft) {
        // 延迟存草稿
        window.setTimeout(() => {
          if (this.dirty) {
            localStorage.setItem(draftKey(this.filePath, this.itemKey ?? ''), this.text)
          }
        }, 800)
      }
      this.scheduleValidate()
    },

    scheduleValidate(): void {
      clearTimeout(this._validateTimer)
      this._validateTimer = window.setTimeout(() => {
        void this.validate()
      }, 300)
    },
    _validateTimer: 0 as number | ReturnType<typeof setTimeout>,

    async validate(): Promise<void> {
      const seq = this._openSeq
      if (!this.open && !this.itemKey) return
      this.validation.validating = true
      this.validation = { ...this.validation, validating: true }
      const ws = useWorkspaceStore()
      // style 名解析源（与引擎一致）：插件默认层 [styles] 基座 + 全部 mod 层
      const knownStyles = new Set<string>(Object.keys(ws.defaultStyles))
      for (const styles of Object.values(ws.stylesByMod)) {
        for (const name of Object.keys(styles)) knownStyles.add(name)
      }
      const result = await validateTalkFile(
        this.text,
        this.expectedVariable,
        ws.knownWords,
        ws.knownPremises,
        knownStyles,
      )
      if (seq !== this._openSeq) return
      this.validation = {
        ok: result.ok,
        errors: result.errors,
        warnings: result.warnings,
        hints: result.hints,
        validating: false,
      }
    },

    async save(): Promise<boolean> {
      if (this.saving) return false
      if (!this.dirty) {
        this.saveMessage = '没有需要保存的修改'
        return false
      }
      this.saving = true
      this.saveMessage = null
      try {
        await this.validate()
        if (!this.validation.ok) {
          const n = this.validation.errors.length
          this.saveMessage = `存在 ${n} 个校验错误，已阻止保存（见错误条）`
          return false
        }
        const root = useWorkspaceStore().root
        if (!root) return false
        const abs = joinPath(root, this.filePath!)
        // 外部修改冲突检测：磁盘内容 ≠ 打开时的基线 → 确认覆盖
        if (this.existsOnDisk) {
          let diskText: string | null = null
          try {
            diskText = decodeText(await fsAdapter.readTextFile(abs)).text
          } catch {
            // 读不到视为已删除，直接写回（创建）
          }
          if (diskText !== null && diskText !== this.baseline) {
            const ok = await confirmAction(
              '磁盘上的文件已被外部修改（如其他编辑器/游戏）。覆盖会丢失外部改动，仍要保存吗？',
              '外部修改冲突',
            )
            if (!ok) {
              this.saveMessage = '已取消保存；可用「重载」读取磁盘最新内容'
              return false
            }
          }
        }
        const dir = abs.includes('/') ? abs.slice(0, abs.lastIndexOf('/')) : ''
        if (dir.length > 0) await fsAdapter.mkdirAll(dir)
        await fsAdapter.writeTextFile(abs, encodeText(this.hadBom, this.text))
        this.baseline = this.text
        this.dirty = false
        this.existsOnDisk = true
        this.sourceNote = 'existing'
        this.clearDraft()
        this.saveMessage = `已保存 ${this.filePath} ✓`
        // 自己文件里用到的前提并入白名单（自洽：既有数据即已知）
        useWorkspaceStore().noteSavedTalk(this.text)
        await useWorkspaceStore().refreshIndex()
        return true
      } catch (err) {
        this.saveMessage = `保存失败：${err instanceof Error ? err.message : String(err)}`
        return false
      } finally {
        this.saving = false
      }
    },

    /** 从磁盘重新加载当前文件（放弃未保存改动） */
    async reloadFromDisk(): Promise<void> {
      if (this.dirty) {
        const ok = await confirmDiscard('放弃当前未保存的修改，重新从磁盘加载？')
        if (!ok) return
      }
      if (!this.existsOnDisk || !this.filePath) return
      const root = useWorkspaceStore().root
      if (!root) return
      try {
        const meta = decodeText(await fsAdapter.readTextFile(joinPath(root, this.filePath)))
        this.text = meta.text
        this.baseline = meta.text
        this.hadBom = meta.hadBom
        this.dirty = false
        this.clearDraft()
        this.saveMessage = '已重新加载磁盘内容'
        await this.validate()
      } catch (err) {
        this.saveMessage = `重载失败：${err instanceof Error ? err.message : String(err)}`
      }
    },

    async copyFromDefault(): Promise<void> {
      if (this.defaultText !== null) {
        this.text = this.defaultText
        this.dirty = true
        this.sourceNote = 'copied'
        this.saveMessage = '已重新载入默认层全文（未保存）'
        this.scheduleValidate()
      }
    },

    clearToSkeleton(): void {
      this.text = skeletonTalkFile(this.itemKey ?? '', this.label ?? undefined)
      this.dirty = true
      this.sourceNote = 'skeleton'
      this.saveMessage = '已清空为骨架（未保存）'
      this.scheduleValidate()
    },

    clearDraft(): void {
      const p = this.filePath
      const k = this.itemKey
      if (p && k) {
        localStorage.removeItem(draftKey(p, k))
      }
      this.hasDraft = false
    },

    setCursor(line: number, col: number): void {
      this.cursor = { line, col }
    },
  },
})

// store HMR：字段增删后热更自动重建实例
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useEditorStore, import.meta.hot))
}