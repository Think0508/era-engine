/**
 * 文件系统适配：Tauri 实现 + 测试用内存实现。
 * 所有磁盘访问必须经由此接口，lib 其余模块保持纯函数可测。
 */
export interface DirEntry {
  name: string
  isDirectory: boolean
}

export interface FsAdapter {
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, content: string): Promise<void>
  /** 递归创建目录 */
  mkdirAll(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  /** 列出目录下条目（不递归），目录不存在返回空数组 */
  listDir(path: string): Promise<DirEntry[]>
}

export function joinPath(...parts: string[]): string {
  return parts.filter((p) => p.length > 0).join('/')
}

/* ────────────────────────── Tauri 实现 ────────────────────────── */

let tauriFs: typeof import('@tauri-apps/plugin-fs') | null = null
async function fs(): Promise<typeof import('@tauri-apps/plugin-fs')> {
  if (!tauriFs) tauriFs = await import('@tauri-apps/plugin-fs')
  return tauriFs
}

export const tauriFsAdapter: FsAdapter = {
  async readTextFile(path) {
    const m = await fs()
    return m.readTextFile(path)
  },
  async writeTextFile(path, content) {
    const m = await fs()
    await m.writeTextFile(path, content)
  },
  async mkdirAll(path) {
    const m = await fs()
    // recursive: true 已存在时静默忽略
    await m.mkdir(path, { recursive: true })
  },
  async exists(path) {
    const m = await fs()
    return m.exists(path)
  },
  async listDir(path) {
    const m = await fs()
    const entries = await m.readDir(path)
    return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory ?? false }))
  },
}

/* ───────────────────────── 内存实现（测试） ───────────────────────── */

/** 测试用内存文件系统：只接受 mem:// 路径 */
export class MemoryFs implements FsAdapter {
  files = new Map<string, string>()

  constructor(seed?: Record<string, string>) {
    if (seed) for (const [p, c] of Object.entries(seed)) this.files.set(norm(p), c)
  }

  has(path: string): boolean {
    return this.files.has(norm(path))
  }

  async readTextFile(path: string): Promise<string> {
    const c = this.files.get(norm(path))
    if (c === undefined) throw new Error(`no such file: ${path}`)
    return c
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    this.files.set(norm(path), content)
  }

  async mkdirAll(_path: string): Promise<void> {
    // 内存实现无需建目录
  }

  async exists(path: string): Promise<boolean> {
    const n = norm(path)
    if (this.files.has(n)) return true
    // 目录存在性：有文件挂在它下面即视为存在
    const prefix = n === '' ? '' : n + '/'
    for (const p of this.files.keys()) {
      if (p.startsWith(prefix)) return true
    }
    return false
  }

  async listDir(path: string): Promise<DirEntry[]> {
    const prefix = norm(path) === '' ? '' : norm(path) + '/'
    const names = new Map<string, boolean>() // name → isDirectory
    for (const p of this.files.keys()) {
      if (!p.startsWith(prefix)) continue
      const rest = p.slice(prefix.length)
      if (rest.length === 0) continue
      const top = rest.split('/')[0]
      const isDir = rest.includes('/')
      // 文件 vs 目录：同名冲突时目录优先展示为目录
      if (!names.has(top) || isDir) names.set(top, isDir)
    }
    return [...names.entries()].map(([name, isDirectory]) => ({ name, isDirectory }))
  }
}

function norm(p: string): string {
  const n = p.replace(/\\/g, '/').replace(/\/+/g, '/')
  return n.startsWith('/') ? n.replace(/^\//, '') : n
}

/** 递归列出某目录下全部文件名（文件相对该目录的路径）；目录不存在 → 空数组 */
export async function listFilesRecursive(fs: FsAdapter, dir: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (d: string): Promise<void> => {
    let entries: DirEntry[]
    try {
      entries = await fs.listDir(d)
    } catch {
      return // 目录不存在/不可读 → 视为空
    }
    for (const e of entries) {
      if (e.isDirectory) {
        await walk(joinPath(d, e.name))
      } else {
        out.push(joinPath(d, e.name))
      }
    }
  }
  await walk(dir)
  return out
}