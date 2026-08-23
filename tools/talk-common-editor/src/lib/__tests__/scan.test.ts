import { describe, expect, it } from 'vitest'
import {
  scanIndex,
  scanMods,
  collectKnownVars,
  collectPremiseAllowlist,
  collectStyles,
} from '../scan'
import { listFilesRecursive } from '../fsAdapter'
import { makeWorkspaceFs, ROOT } from './fixtures'

const fs = makeWorkspaceFs()

describe('scanIndex 并集与徽标（includeMods = 武侠）', () => {
  it('mods 列表含全部 mod（仅用于选择器）', async () => {
    const idx = await scanIndex(fs, ROOT, ['武侠'])
    expect(idx.mods).toEqual(expect.arrayContaining(['example-mod', '武侠']))
    expect(idx.loadedMods).toEqual(['武侠'])
  })

  it('原生指令（多插件）+ 默认口上关联为 ok', async () => {
    const idx = await scanIndex(fs, ROOT, ['武侠'])
    const chat = idx.items.find((i) => i.key === 'chat')
    expect(chat).toBeDefined()
    expect(chat!.kind).toBe('ok')
    expect(chat!.instruction?.label).toBe('聊天')
    expect(chat!.defaultFile?.parseOk).toBe(true)
    expect(chat!.defaultFile?.entryCount).toBe(2)
  })

  it('sleep-system 的原生指令也进索引（sleep → no-talk）', async () => {
    const idx = await scanIndex(fs, ROOT, [])
    const sleep = idx.items.find((i) => i.key === 'sleep')
    expect(sleep?.kind).toBe('no-talk')
    expect(sleep?.instruction?.sourceKind).toBe('native')
    expect(sleep?.defaultFile).toBeUndefined()
  })

  it('未选中的 mod（example-mod）不加载其指令', async () => {
    const idx = await scanIndex(fs, ROOT, ['武侠'])
    expect(idx.items.some((i) => i.key === 'demo')).toBe(false)
  })

  it('有口上无指令 → orphan（chat_failed）', async () => {
    const idx = await scanIndex(fs, ROOT, [])
    const cf = idx.items.find((i) => i.key === 'chat_failed')
    expect(cf?.kind).toBe('orphan')
    expect(cf?.instruction).toBeUndefined()
    expect(cf?.defaultFile?.parseOk).toBe(true)
  })

  it('损坏文件不崩溃，标注解析错误', async () => {
    const idx = await scanIndex(fs, ROOT, ['武侠'])
    const broken = idx.items.find((i) => i.key === 'broken')
    expect(broken).toBeDefined()
    expect(broken!.modFiles['武侠']?.parseOk).toBe(false)
    expect(broken!.modFiles['武侠']?.parseError).toBeTruthy()
  })

  it('选中的 mod 覆盖层文件挂到其名下', async () => {
    const idx = await scanIndex(fs, ROOT, ['武侠'])
    const chat = idx.items.find((i) => i.key === 'chat')!
    expect(chat.modFiles['武侠']?.parseOk).toBe(true)
    expect(chat.modFiles['武侠']?.relUnderTalk).toBe('behavior/daily/chat.toml')
  })

  it('选中的 mod 指令进入并集；未选中则无', async () => {
    const withMod = await scanIndex(fs, ROOT, ['武侠'])
    const spar = withMod.items.find((i) => i.key === 'spar')
    expect(spar?.instruction?.sourceKind).toBe('mod')
    expect(spar?.instruction?.modId).toBe('武侠')

    const withoutMod = await scanIndex(fs, ROOT, [])
    expect(withoutMod.items.some((i) => i.key === 'spar')).toBe(false)
  })

  it('sceneRefs 从 effects 抽取', async () => {
    const idx = await scanIndex(fs, ROOT, [])
    const chat = idx.items.find((i) => i.key === 'chat')!
    expect(chat.instruction!.sceneRefs).toEqual(expect.arrayContaining(['chat', 'chat_failed']))
    const stroke = idx.items.find((i) => i.key === 'stroke')!
    expect(stroke.instruction!.sceneRefs).toContain('stroke')
  })
})

describe('collectKnownVars / collectPremiseAllowlist / scanMods', () => {
  it('收集 body/body_part 词表', async () => {
    const words = await collectKnownVars(fs, ROOT)
    expect(words.has('penis')).toBe(true)
    expect(words.has('breast_s')).toBe(true)
  })

  it('从 src 收集 registerPremise 字面量', async () => {
    const set = await collectPremiseAllowlist(fs, ROOT, ['武侠'])
    expect(set.has('HIGH_1')).toBe(true)
    expect(set.has('NOT_H')).toBe(true)
  })

  it('现有口上数据用到的前提进白名单（jj_0 / FAVORABILITY_GE_3）', async () => {
    const set = await collectPremiseAllowlist(fs, ROOT, ['武侠'])
    expect(set.has('JJ_0')).toBe(true)
    expect(set.has('FAVORABILITY_GE_3')).toBe(true)
  })

  it('未选中 mod 的数据不进前提白名单', async () => {
    const set = await collectPremiseAllowlist(fs, ROOT, [])
    // FAVORABILITY_GE_3 在默认层 stroke.toml 里，仍应收集
    expect(set.has('FAVORABILITY_GE_3')).toBe(true)
  })

  it('scanMods 直接列出 mod 目录', async () => {
    const mods = await scanMods(fs, ROOT)
    expect(mods).toEqual(expect.arrayContaining(['example-mod', '武侠']))
  })

  it('不存在的目录 → 空数组（不抛出）', async () => {
    expect(await listFilesRecursive(fs, 'no/such/dir')).toEqual([])
  })

  it('collectStyles：插件默认层基座 + mod 层覆盖（与引擎合并语义一致）', async () => {
    const c = await collectStyles(fs, ROOT)
    // 插件默认层基座（theme-base 插件）
    const defNarrator = c.defaultStyles['narrator'] as Record<string, unknown>
    expect(defNarrator.color).toBe('#111111')
    // mod 层覆盖默认层
    const modNarrator = c.stylesByMod['武侠']!['narrator'] as Record<string, unknown>
    expect(modNarrator.color).toBe('#666666')
    const whisper = c.stylesByMod['武侠']!['whisper'] as Record<string, unknown>
    expect(whisper.display).toBe('typewriter')
    expect(whisper.speed).toBe(70)
  })
})