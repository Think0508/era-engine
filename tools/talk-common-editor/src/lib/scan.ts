/**
 * 工作区扫描：构建「指令 ∪ 口上文件」并集索引。
 * 纯函数 + FsAdapter，可测。路径全部相对工作区根，正斜杠。
 */
import type { FsAdapter, DirEntry } from './fsAdapter'
import { joinPath, listFilesRecursive } from './fsAdapter'
import { premiseRefs } from './validate'

/* ── 路径常量（相对工作区根，与引擎加载路径保持一致） ── */
export const NATIVE_INSTRUCTIONS_DIR =
  'src/plugins/native-instructions/data/default/instructions'
export const DEFAULT_TALK_DIR = 'src/plugins/talk-common-system/data/default/talk-common'
export function modInstructionsDir(mod: string): string {
  return joinPath('mods', mod, 'definitions', 'instructions')
}
export function modTalkDir(mod: string): string {
  return joinPath('mods', mod, 'definitions', 'talk-common')
}

export interface InstructionMeta {
  id: string
  label: string
  erarkId?: string
  category?: string
  subCategory?: string
  tags: string[]
  /** 从 effects 文本抽取的场景引用（success_scene/fail_scene/scene） */
  sceneRefs: string[]
  sourceKind: 'native' | 'mod'
  modId?: string
  path: string
}

export interface TalkFileMeta {
  layer: 'default' | 'mod'
  modId?: string
  /** 相对工作区根的文件路径 */
  relPath: string
  /** 相对 talk-common/ 根的子路径，如 behavior/daily/chat.toml */
  relUnderTalk: string
  variable?: string
  description?: string
  entryCount?: number
  parseOk: boolean
  parseError?: string
}

export type ItemKind = 'ok' | 'no-talk' | 'orphan' | 'broken'

export interface ListItem {
  /** 并集键：variable（口上）或指令 id */
  key: string
  kind: ItemKind
  /** 中文名（有指令元数据才有） */
  label?: string
  instruction?: InstructionMeta
  defaultFile?: TalkFileMeta
  modFiles: Record<string, TalkFileMeta>
  category?: string
  tags: string[]
}

export interface WorkspaceIndex {
  root: string
  items: ListItem[]
  /** 扫描到的全部 mod 目录名（按字典序）——仅用于选择器，不加载其数据 */
  mods: string[]
  /** 本次实际加载了数据的 mod（用户当前选中） */
  loadedMods: string[]
  /** 顶层定位失败（如未选对根目录）时的说明 */
  rootError?: string
}

/* ───────────────────────── 指令解析 ───────────────────────── */

interface RawInstruction {
  id?: unknown
  label?: unknown
  erark_id?: unknown
  category?: unknown
  sub_category?: unknown
  tags?: unknown
}

const SCENE_REF_RE = /(?:success_scene|fail_scene|scene)\s*=\s*"([^"]+)"/g

export async function parseInstructionsFile(
  raw: string,
  path: string,
  sourceKind: 'native' | 'mod',
  modId?: string,
): Promise<InstructionMeta[]> {
  const { default: parse } = await import('@iarna/toml/parse-string.js')
  const doc = parse(raw) as { instructions?: RawInstruction[] }
  const list: RawInstruction[] = doc.instructions ?? []
  const sceneRefs: string[] = []
  for (const m of raw.matchAll(SCENE_REF_RE)) sceneRefs.push(m[1])
  return list
    .filter((r) => typeof r.id === 'string' && r.id.length > 0)
    .map((r) => ({
      id: r.id as string,
      label: typeof r.label === 'string' && r.label ? (r.label as string) : (r.id as string),
      erarkId: typeof r.erark_id === 'string' ? (r.erark_id as string) : undefined,
      category: typeof r.category === 'string' ? (r.category as string) : undefined,
      subCategory: typeof r.sub_category === 'string' ? (r.sub_category as string) : undefined,
      tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
      sceneRefs,
      sourceKind,
      modId,
      path,
    }))
}

/* ───────────────────────── 口上文件解析 ───────────────────────── */

export async function parseTalkFileMeta(
  raw: string,
  layer: 'default' | 'mod',
  relPath: string,
  relUnderTalk: string,
  modId?: string,
): Promise<TalkFileMeta> {
  try {
    const { default: parse } = await import('@iarna/toml/parse-string.js')
    const doc = parse(raw) as { variable?: unknown; description?: unknown; entries?: unknown }
    const entries = Array.isArray(doc.entries) ? doc.entries : []
    return {
      layer,
      modId,
      relPath,
      relUnderTalk,
      variable: typeof doc.variable === 'string' ? doc.variable : undefined,
      description: typeof doc.description === 'string' ? doc.description : undefined,
      entryCount: entries.length,
      parseOk: true,
    }
  } catch (err) {
    return {
      layer,
      modId,
      relPath,
      relUnderTalk,
      parseOk: false,
      parseError: err instanceof Error ? err.message.split('\n')[0] : String(err),
    }
  }
}

/* ───────────────────────── 索引构建 ───────────────────────── */

export async function scanMods(fs: FsAdapter, root: string): Promise<string[]> {
  const mods = (await fs.listDir(joinPath(root, 'mods'))).filter(
    (e) => e.isDirectory && !e.name.startsWith('.'),
  )
  return mods.map((e) => e.name).sort()
}

async function collectInstructions(
  fs: FsAdapter,
  root: string,
  dir: string,
  sourceKind: 'native' | 'mod',
  modId?: string,
): Promise<InstructionMeta[]> {
  const files = (await listFilesRecursive(fs, joinPath(root, dir))).filter((f) => f.endsWith('.toml'))
  const out: InstructionMeta[] = []
  for (const f of files) {
    try {
      const raw = await fs.readTextFile(f)
      out.push(...(await parseInstructionsFile(raw, f, sourceKind, modId)))
    } catch {
      // 单个指令文件损坏不阻塞整体索引
    }
  }
  return out
}

/**
 * 引擎所有插件的原生指令定义：
 * 各插件 data/default/instructions 目录（原生指令的全引擎形态）。
 * native-instructions / sleep-system / h-core / h-time-stop 等都在其下。
 */
/** 引擎所有插件的原生指令定义 */
export async function collectNativeInstructions(fs: FsAdapter, root: string): Promise<InstructionMeta[]> {
  const out: InstructionMeta[] = []
  const pluginsDir = joinPath(root, 'src/plugins')
  const entries = await fs.listDir(pluginsDir).catch(() => [] as DirEntry[])
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    // collectInstructions 内部会拼 root，这里传相对路径
    const relDir = joinPath('src/plugins', entry.name, 'data/default/instructions')
    const exists = await fs.exists(joinPath(root, relDir)).catch(() => false)
    if (exists) {
      out.push(...(await collectInstructions(fs, root, relDir, 'native')))
    }
  }
  return out
}

async function collectTalkFiles(
  fs: FsAdapter,
  root: string,
  talkDir: string,
  layer: 'default' | 'mod',
  modId?: string,
): Promise<TalkFileMeta[]> {
  const base = joinPath(root, talkDir)
  const files = (await listFilesRecursive(fs, joinPath(base, 'behavior'))).filter((f) =>
    f.endsWith('.toml'),
  )
  const out: TalkFileMeta[] = []
  for (const f of files) {
    try {
      const raw = await fs.readTextFile(f)
      const relPath = f.slice(root.length + 1)
      const relUnderTalk = f.slice(base.length + 1)
      out.push(await parseTalkFileMeta(raw, layer, relPath, relUnderTalk, modId))
    } catch {
      // 读失败：列为不可解析
      const relPath = f.slice(root.length + 1)
      const relUnderTalk = f.slice(base.length + 1)
      out.push({ layer, modId, relPath, relUnderTalk, parseOk: false, parseError: '读取失败' })
    }
  }
  return out
}

/**
 * 构建索引。
 * @param includeMods 只加载这些 mod 的指令/口上数据（未选中的 mod 不读盘，也不提供徽标）
 */
export async function scanIndex(
  fs: FsAdapter,
  root: string,
  includeMods: string[] = [],
): Promise<WorkspaceIndex> {
  const mods = await scanMods(fs, root)
  const items = new Map<string, ListItem>()

  const ensure = (key: string): ListItem => {
    let it = items.get(key)
    if (!it) {
      it = { key, kind: 'orphan', modFiles: {}, tags: [] }
      items.set(key, it)
    }
    return it
  }

  // 1. 所有插件的原生指令（native-instructions / sleep-system / h-core 等）
  try {
    const native = await collectNativeInstructions(fs, root)
    for (const ins of native) {
      const it = ensure(ins.id)
      it.instruction = ins
      it.label = ins.label
      it.category = ins.category
      it.tags = ins.tags
    }
  } catch {
    /* src/plugins 缺失不影响 */
  }

  // 2. 仅加载用户选中的 mod：其指令 + 覆盖层口上
  for (const mod of includeMods) {
    if (!mods.includes(mod)) continue
    try {
      const ins = await collectInstructions(fs, root, modInstructionsDir(mod), 'mod', mod)
      for (const i of ins) {
        const it = ensure(i.id)
        it.instruction = i
        it.label = i.label
        it.category = i.category
        it.tags = i.tags
      }
    } catch {
      /* mod 无 definitions/instructions */
    }
    try {
      const files = await collectTalkFiles(fs, root, modTalkDir(mod), 'mod', mod)
      for (const f of files) {
        const it = ensure(f.variable ?? f.relUnderTalk.split('/').pop()!.replace(/\.toml$/, ''))
        it.modFiles[mod] = f
      }
    } catch {
      /* mod 无 definitions/talk-common */
    }
  }

  // 3. 默认层口上
  try {
    const files = await collectTalkFiles(fs, root, DEFAULT_TALK_DIR, 'default')
    for (const f of files) {
      const it = ensure(f.variable ?? f.relUnderTalk.split('/').pop()!.replace(/\.toml$/, ''))
      it.defaultFile = f
    }
  } catch {
    /* 默认层缺失 */
  }

  // 4. 定 kind
  for (const it of items.values()) {
    if (it.instruction) {
      if (it.defaultFile) {
        it.kind = it.defaultFile.parseOk ? 'ok' : 'broken'
      } else {
        it.kind = 'no-talk'
      }
    } else {
      it.kind = 'orphan'
    }
  }

  return {
    root,
    items: [...items.values()].sort((a, b) => a.key.localeCompare(b.key, 'zh')),
    mods,
    loadedMods: includeMods.filter((m) => mods.includes(m)),
  }
}

/* ─────────────────── 辅助收集：变量词表 / 前提白名单 ─────────────────── */

/** 并发上限工具：保持 IPC/IO 吞吐而不打满 */
export async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

/** {word} 词表：body/ + body_part/ 目录的 variable 并集；{obj.prop} 前缀白名单 */
export async function collectKnownVars(fs: FsAdapter, root: string): Promise<Set<string>> {
  const words = new Set<string>(KNOWN_WORD_BASE)
  const files: string[] = []
  for (const sub of ['body', 'body_part']) {
    const dir = joinPath(root, DEFAULT_TALK_DIR, sub)
    files.push(...(await listFilesRecursive(fs, dir)).filter((f) => f.endsWith('.toml')))
  }
  const { default: parse } = await import('@iarna/toml/parse-string.js')
  await mapLimit(files, 8, async (f) => {
    try {
      const raw = await fs.readTextFile(f)
      // 正则取 variable（文件头部），免掉大文件（11k+ 行）的完整 TOML 解析
      const m = raw.match(/^variable\s*=\s*"([^"]+)"/m)
      if (m) {
        words.add(m[1])
      } else {
        // 兜底：完整解析
        const doc = parse(raw) as { variable?: unknown }
        if (typeof doc.variable === 'string') words.add(doc.variable)
      }
    } catch {
      /* 忽略坏文件 */
    }
  })
  return words
}

export const KNOWN_WORD_BASE = [
  'penis', 'vagina', 'anal', 'breast', 'mouth', 'throat', 'hands', 'feet',
  'hair', 'face', 'legs', 'armpit', 'womb', 'urethra', 'clitoris',
  'action_talk_polite', 'action_talk_normal', 'action_talk_dirty',
  'penis_in_vagina', 'penis_in_mouth',
] as const

export const KNOWN_DOTTED_PREFIXES = new Set([
  'player', 'character', 'target', 'location', 'time',
])

const REGISTER_PREMISE_RE = /registerPremise\s*\(\s*["']([A-Za-z0-9_]+)["']/g

/**
 * 前提白名单——拆两层（默认层/引擎 src 与所选 mod 数据分离，支持缓存）：
 * - collectPremiseBase：静态基集 + src 下 registerPremise 字面量 + premises.toml + 默认层口上数据用到的前提
 * - collectPremiseForMod：某 mod 覆盖层口上数据用到的前提
 */
export async function collectPremiseBase(fs: FsAdapter, root: string): Promise<Set<string>> {
  const set = new Set<string>(KNOWN_PREMISE_BASE)
  const tryCollect = async (dir: string, matcher: (name: string) => boolean): Promise<void> => {
    let files = await listFilesRecursive(fs, joinPath(root, dir))
    files = files.filter(matcher).slice(0, 800) // 上限保护
    const { default: parse } = await import('@iarna/toml/parse-string.js')
    await mapLimit(files, 8, async (f) => {
      try {
        const raw = await fs.readTextFile(f)
        if (f.endsWith('.toml')) {
          const doc = parse(raw) as { premises?: unknown }
          if (doc.premises && typeof doc.premises === 'object') {
            for (const k of Object.keys(doc.premises as object)) set.add(k)
          }
        } else {
          for (const m of raw.matchAll(REGISTER_PREMISE_RE)) set.add(m[1])
        }
      } catch {
        /* 忽略 */
      }
    })
  }
  await tryCollect('src', (name) => name.endsWith('.ts'))
  await tryCollect('mods', (name) => name.endsWith('premises.toml'))

  // 默认层口上数据中已使用的前提也视为已知（如 jj_0 / FAVORABILITY_GE_3 等仅出现在数据里的 erArk 前提）
  const files = (await listFilesRecursive(fs, joinPath(root, DEFAULT_TALK_DIR))).filter((f) =>
    f.endsWith('.toml'),
  )
  await mapLimit(files, 8, async (f) => {
    try {
      const raw = await fs.readTextFile(f)
      for (const ref of premiseRefs(raw)) set.add(ref.name)
    } catch {
      /* 忽略 */
    }
  })
  return set
}

/** 某 mod 覆盖层口上数据用到的前提 */
export async function collectPremiseForMod(
  fs: FsAdapter,
  root: string,
  mod: string,
): Promise<Set<string>> {
  const set = new Set<string>()
  const files = (await listFilesRecursive(fs, joinPath(root, modTalkDir(mod)))).filter((f) =>
    f.endsWith('.toml'),
  )
  await mapLimit(files, 8, async (f) => {
    try {
      const raw = await fs.readTextFile(f)
      for (const ref of premiseRefs(raw)) set.add(ref.name)
    } catch {
      /* 忽略 */
    }
  })
  return set
}

/**
 * [styles] 命名样式注册表收集（ADR 0018 配套：行为轨 style 名引用的解析源）。
 * 与引擎加载语义一致（mod-parse.collectPluginDefaultStyles）：
 * - 插件默认层：各插件 data/default/talk/styles.toml（rawTomlMap Layer 1，字典序后者覆盖前者；
 *   归属约定：默认基座只由 dialogue-system 提供，不鼓励散放）
 * - mod 层：mods/{mod}/definitions/talk/styles.toml（同名键整体覆盖默认层）
 * speaker 子表等特殊键按普通样式收集（无害，口上不会引用）。
 */
export interface StylesCollection {
  defaultStyles: Record<string, Record<string, unknown>>
  stylesByMod: Record<string, Record<string, unknown>>
  /** 诊断（仅供界面显示） */
  debug: { plugins: number; defaultFilesScanned: number; modKeys: string[] }
}

export async function collectStyles(fs: FsAdapter, root: string): Promise<StylesCollection> {
  const defaultStyles: Record<string, Record<string, unknown>> = {}
  const stylesByMod: Record<string, Record<string, unknown>> = {}
  const { default: parse } = await import('@iarna/toml/parse-string.js')

  const readStylesFile = async (
    relDir: string,
    target: Record<string, Record<string, unknown>>,
  ): Promise<number> => {
    // 与引擎一致：只认精确路径 talk/styles.toml；分隔符归一化（防 root/平台混用 \ 与 /）
    const files = (await listFilesRecursive(fs, joinPath(root, relDir))).filter((f) =>
      f.replace(/\\/g, '/').endsWith('/talk/styles.toml'),
    )
    await mapLimit(files, 4, async (f) => {
      try {
        const raw = await fs.readTextFile(f)
        const doc = parse(raw) as { styles?: unknown }
        if (doc.styles && typeof doc.styles === 'object') {
          for (const [name, fields] of Object.entries(doc.styles as Record<string, unknown>)) {
            if (fields && typeof fields === 'object') {
              target[name] = { ...(target[name] ?? {}), ...(fields as Record<string, unknown>) }
            }
          }
        }
      } catch {
        /* 单个文件损坏不影响 */
      }
    })
    return files.length
  }

  // 1. 插件默认层（各插件 data/default/talk 目录，字典序后者覆盖前者）
  const pluginsDir = joinPath(root, 'src/plugins')
  const plugins = await fs.listDir(pluginsDir).catch(() => [] as DirEntry[])
  const pluginNames = plugins.filter((p) => p.isDirectory).map((p) => p.name).sort()
  let defaultFilesScanned = 0
  for (const name of pluginNames) {
    defaultFilesScanned += await readStylesFile(
      joinPath('src/plugins', name, 'data/default/talk'),
      defaultStyles,
    )
  }
  // 2. mod 层（同名键覆盖默认层）
  const mods = await scanMods(fs, root)
  for (const m of mods) {
    const target: Record<string, Record<string, unknown>> = {}
    await readStylesFile(joinPath('mods', m, 'definitions/talk'), target)
    if (Object.keys(target).length > 0) stylesByMod[m] = target
  }
  return { defaultStyles, stylesByMod, debug: { plugins: pluginNames.length, defaultFilesScanned, modKeys: Object.keys(stylesByMod) } }
}

/** 组合白名单（保留原签名给测试/旧调用） */
export async function collectPremiseAllowlist(
  fs: FsAdapter,
  root: string,
  includeMods: string[] = [],
): Promise<Set<string>> {
  const set = await collectPremiseBase(fs, root)
  for (const m of includeMods) {
    const modSet = await collectPremiseForMod(fs, root, m)
    for (const p of modSet) set.add(p)
  }
  return set
}

export const KNOWN_PREMISE_BASE = [
  'NOT_H', 'HAVE_TARGET', 'NPC_INITIATED', 'TARGET_IS_PLAYER', 'TARGET_NOT_FALLEN',
  'NOT_SHOW_NON_H_IN_HIDDEN_SEX', 'TIRED_LE_84', 'HP_G_1', 'DRUNK_LEVEL_NOT_3',
  'NO_TARGET_OR_TARGET_CAN_COOPERATE_OR_IMPRISONMENT_1',
  'T_NORMAL_56_OR_UNCONSCIOUS_FLAG',
] as const