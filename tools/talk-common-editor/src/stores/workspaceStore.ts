/**
 * 工作区：根目录、索引、词表/前提白名单、编辑目标模式。
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { tauriFsAdapter, joinPath, type FsAdapter } from '../lib/fsAdapter'
import {
  scanIndex,
  scanMods,
  collectKnownVars,
  collectPremiseBase,
  collectPremiseForMod,
  collectStyles,
  type WorkspaceIndex,
  type StylesCollection,
} from '../lib/scan'
import { validateTalkFile, premiseRefs } from '../lib/validate'

export type Mode = 'default' | 'mod'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** 测试注入 */
export let fsAdapter: FsAdapter = tauriFsAdapter
export function setFsAdapterForTests(a: FsAdapter): void {
  fsAdapter = a
}

/** 读 era-engine.config.toml 的 active_mod（工具默认选中的 mod 与游戏一致） */
export async function readActiveMod(fs: FsAdapter, root: string): Promise<string | null> {
  try {
    const raw = await fs.readTextFile(joinPath(root, 'era-engine.config.toml'))
    const m = raw.match(/active_mod\s*=\s*"([^"]+)"/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

/** 未保存守卫（由 EditorPanel 注册；返回 true = 有未保存修改，切换被拦） */
export let dirtyGuard: (() => boolean) | null = null
export function setDirtyGuard(fn: (() => boolean) | null): void {
  dirtyGuard = fn
}

/**
 * 提示级缓存：词表只依赖 root；前提白名单 = 基集(root) ∪ 各 mod 集(mod)。
 * 切换模式/mod 时不再重扫 src 与默认层口上数据（这是切换耗时的主要来源）。
 */
interface HintsCache {
  root: string
  words: Set<string>
  premisesBase: Set<string>
  premisesPerMod: Map<string, Set<string>>
  styles: StylesCollection
}
let hintsCache: HintsCache | null = null

async function ensureHints(root: string): Promise<HintsCache> {
  if (hintsCache?.root === root) return hintsCache
  const [words, premisesBase, styles] = await Promise.all([
    collectKnownVars(fsAdapter, root),
    collectPremiseBase(fsAdapter, root),
    collectStyles(fsAdapter, root),
  ])
  hintsCache = { root, words, premisesBase, premisesPerMod: new Map(), styles }
  return hintsCache
}

/** 清空提示缓存（⟳ 完整重扫用；也暴露给测试） */
export function clearHintsCache(): void {
  hintsCache = null
}

const ROOT_KEY = 'tce:root'

export const useWorkspaceStore = defineStore('workspace', {
  state: () => ({
    root: localStorage.getItem(ROOT_KEY) ?? (null as string | null),
    loading: false,
    index: null as WorkspaceIndex | null,
    knownWords: new Set<string>(),
    knownPremises: new Set<string>(),
    defaultStyles: {} as Record<string, Record<string, unknown>>,
    stylesByMod: {} as Record<string, Record<string, unknown>>,
    stylesDebug: null as { plugins: number; defaultFilesScanned: number; modKeys: string[] } | null,
    mode: 'default' as Mode,
    modId: null as string | null,
    lastError: null as string | null,
    /** 非致命提示（琥珀色，与 lastError 分开显示） */
    notice: null as string | null,
  }),
  getters: {
    mods(state): string[] {
      return state.index?.mods ?? []
    },
  },
  actions: {
    async pickRoot(): Promise<void> {
      if (!isTauri()) {
        this.lastError = '当前不是 Tauri 环境：请用 `npm run tauri dev` 启动本工具'
        return
      }
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const picked = await open({ directory: true, title: '选择 era-engine 工作区根目录' })
        if (typeof picked === 'string' && picked.length > 0) {
          await this.setRoot(picked)
        }
      } catch (err) {
        this.lastError = `选择目录失败：${err instanceof Error ? err.message : String(err)}`
      }
    },
    async setRoot(root: string): Promise<void> {
      // Windows 对话框返回反斜杠；统一正斜杠
      this.root = root.replace(/\\/g, '/')
      localStorage.setItem(ROOT_KEY, this.root)
      await this.reload()
    },
    async reload(full = false): Promise<void> {
      if (!this.root) return
      if (full) clearHintsCache() // ⟳ = 完整重扫：连词表/前提白名单一起重建
      this.loading = true
      this.lastError = null
      this.notice = null
      try {
        // 解析器自检：@iarna/toml 依赖 Node 风格 global，环境缺失时提前报错
        const probe = await validateTalkFile(
          'variable = "probe"\n[[entries]]\ncontext = "p"\n',
          'probe',
          new Set(),
          new Set(),
        )
        if (!probe.ok) {
          this.lastError = `TOML 解析器不可用：${probe.errors[0]?.message ?? '未知错误'}`
          return
        }
        // 未选中的 mod 不加载：只读入当前模式选定的 mod（默认层模式 = 不读任何 mod）
        const mods = await scanMods(fsAdapter, this.root)
        const activeMod = await readActiveMod(fsAdapter, this.root)
        if (mods.length > 0) {
          if (this.modId && mods.includes(this.modId)) {
            // 保持用户选择
          } else if (activeMod && mods.includes(activeMod)) {
            this.modId = activeMod
          } else {
            this.modId = mods[0]
          }
        } else {
          this.modId = null
        }
        const include = this.mode === 'default' || !this.modId ? [] : [this.modId]
        // ① 索引重建：失败 = 列表不可用，视为致命
        this.index = await scanIndex(fsAdapter, this.root, include)
      } catch (err) {
        this.lastError = `扫描工作区失败：${err instanceof Error ? err.message : String(err)}`
        return
      } finally {
        this.loading = false
      }
      // ② 提示级数据（词表/前提白名单）：仅影响警告/提示的准确性，失败绝不致命——
      //    保留旧值继续用，避免「一次失败 → 全部前提误报」
      try {
        const cache = await ensureHints(this.root)
        const include2 = this.mode === 'default' || !this.modId ? [] : [this.modId]
        const premises = new Set(cache.premisesBase)
        for (const m of include2) {
          if (!cache.premisesPerMod.has(m)) {
            cache.premisesPerMod.set(m, await collectPremiseForMod(fsAdapter, this.root, m))
          }
          for (const p of cache.premisesPerMod.get(m)!) premises.add(p)
        }
        this.knownWords = cache.words
        this.knownPremises = premises
        this.defaultStyles = cache.styles.defaultStyles
        this.stylesByMod = cache.styles.stylesByMod
        this.stylesDebug = cache.styles.debug ?? null
      } catch (err) {
        this.lastError = `提示数据（词表/前提白名单）刷新失败：${err instanceof Error ? err.message : String(err)}（本次沿用缓存/旧值，不影响编辑与保存；点 ⟳ 重试）`
        this.notice =
          '提示数据刷新失败，前提/变量警告可能不准；点 ⟳ 完整重扫重试（这不影响编辑与保存）'
      }
    },
    /** 保存后轻量刷新：只重建索引（词表/白名单不变） */
    async refreshIndex(): Promise<void> {
      if (!this.root) return
      try {
        const include = this.mode === 'default' || !this.modId ? [] : [this.modId]
        this.index = await scanIndex(fsAdapter, this.root, include)
      } catch (err) {
        this.lastError = `刷新索引失败：${err instanceof Error ? err.message : String(err)}`
      }
    },
    /**
     * 保存口上文件后：把该文件用到的前提并入白名单（自洽：既有数据即已知）。
     * 白名单本身失败过（空集）时跳过合并——保持警告可见，避免掩盖问题。
     */
    noteSavedTalk(text: string): void {
      if (this.knownPremises.size === 0) return
      for (const ref of premiseRefs(text)) this.knownPremises.add(ref.name)
    },

    setMode(mode: Mode): void {
      if (dirtyGuard?.()) return
      if (this.mode === mode) return
      this.mode = mode
      void this.reload()
    },
    async setModId(id: string | null): Promise<void> {
      if (dirtyGuard?.()) return
      if (this.modId === id) return
      this.modId = id
      await this.reload()
    },
  },
})

// store HMR：字段增删后热更自动重建实例
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useWorkspaceStore, import.meta.hot))
}