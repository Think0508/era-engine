/**
 * 真实工作区回归测试（门控）：TCE_REAL_ROOT=<era-engine 根> 时运行。
 * 用 node fs 实现 FsAdapter，直接扫真实盘——守护「示例 mod 缺失目录不炸」、
 * 「sleep 等插件指令可见」「前提白名单覆盖真数据」这三类回归。
 */
import { describe, expect, it } from 'vitest'
import * as nodefs from 'node:fs/promises'
import { scanIndex, collectKnownVars, collectPremiseAllowlist, collectStyles } from '../scan'
import type { FsAdapter, DirEntry } from '../fsAdapter'

const root = process.env.TCE_REAL_ROOT
const maybe = root ? describe : describe.skip

const nodeFs: FsAdapter = {
  async readTextFile(p) {
    return nodefs.readFile(p, 'utf8')
  },
  async writeTextFile() {
    /* 只读 */
  },
  async mkdirAll() {
    /* 只读 */
  },
  async exists(p) {
    return nodefs
      .access(p)
      .then(() => true)
      .catch(() => false)
  },
  async listDir(p): Promise<DirEntry[]> {
    const entries = await nodefs.readdir(p, { withFileTypes: true })
    return entries.map((d) => ({ name: d.name, isDirectory: d.isDirectory() }))
  },
}

const REL = (r: string) => r.replace(/\\/g, '/')

maybe('真实工作区（TCE_REAL_ROOT 门控）', () => {
  it('默认层模式扫描不因未选中 mod 的缺失目录崩溃', async () => {
    const idx = await scanIndex(nodeFs, REL(root!), [])
    expect(idx.items.length).toBeGreaterThan(0)
    expect(idx.mods).toContain('武侠')
  })

  it('全插件原生指令可见（chat/stroke/rest/sleep）', async () => {
    const idx = await scanIndex(nodeFs, REL(root!), [])
    for (const key of ['chat', 'stroke', 'rest', 'sleep']) {
      const it = idx.items.find((i) => i.key === key)
      expect(it?.instruction, `${key} 应有指令定义`).toBeDefined()
    }
    const sleep = idx.items.find((i) => i.key === 'sleep')
    expect(sleep?.kind).toBe('no-talk')
    const chatFailed = idx.items.find((i) => i.key === 'chat_failed')
    expect(chatFailed?.kind).toBe('orphan')
  })

  it('前提白名单覆盖真实口上数据用到的前提', async () => {
    const set = await collectPremiseAllowlist(nodeFs, REL(root!), [])
    for (const p of ['FAVORABILITY_GE_3', 'FALL_LEVEL_E_4', 'NPC_INITIATED', 'TARGET_IS_PLAYER', 'TARGET_NOT_FALLEN']) {
      expect(set.has(p), `白名单应含 ${p}`).toBe(true)
    }
    const words = await collectKnownVars(nodeFs, REL(root!))
    expect(words.has('penis')).toBe(true)
  })

  it('styles 注册表收集不崩（无 styles.toml 时返回空表）', async () => {
    const c = await collectStyles(nodeFs, REL(root!))
    expect(typeof c.defaultStyles).toBe('object')
    expect(typeof c.stylesByMod).toBe('object')
  })

  it('dialogue-system 默认样式基座被收集（narrator/announce）', async () => {
    const c = await collectStyles(nodeFs, REL(root!))
    expect(c.defaultStyles['narrator']).toBeDefined()
    const announce = c.defaultStyles['announce'] as Record<string, unknown>
    expect(announce?.color).toBe('#bdb76b')
    expect(announce?.font).toBe('楷体')
  })
})