import { describe, expect, it } from 'vitest'
import { validateTalkFile, lineAt, locateEntryLine, premiseRefs } from '../validate'

const KNOWN_WORDS = new Set(['penis', 'vagina', 'breast_s'])
const KNOWN_PREMISES = new Set(['NOT_H', 'HIGH_1'])

const VALID = `variable = "chat"
description = "聊天"

# ── 无条件组 ──
[[entries]]
context = "{player.name}与{character.name}聊了一会儿天。"

[[entries]]
conditions = "premise(high_1)"
context = "{player.name}和{character.name}在{location.name}里聊得很投机。"
`

describe('validateTalkFile', () => {
  it('合法文件通过', async () => {
    const r = await validateTalkFile(VALID, 'chat', KNOWN_WORDS, KNOWN_PREMISES)
    expect(r.ok).toBe(true)
    expect(r.errors).toHaveLength(0)
  })

  it('TOML 语法错误 → error 带行号', async () => {
    const bad = `variable = "chat"\nentries = [\n`
    const r = await validateTalkFile(bad, 'chat', KNOWN_WORDS, KNOWN_PREMISES)
    expect(r.ok).toBe(false)
    expect(r.errors[0].code).toBe('toml-syntax')
    expect(r.errors[0].line).toBeGreaterThanOrEqual(1)
  })

  it('缺 variable → error；variable 不符 → error', async () => {
    const noVar = `[[entries]]\ncontext = "x"\n`
    const r1 = await validateTalkFile(noVar, 'chat', KNOWN_WORDS, KNOWN_PREMISES)
    expect(r1.errors.some((e) => e.code === 'missing-variable')).toBe(true)

    const wrongVar = `variable = "other"\n[[entries]]\ncontext = "x"\n`
    const r2 = await validateTalkFile(wrongVar, 'chat', KNOWN_WORDS, KNOWN_PREMISES)
    expect(r2.errors.some((e) => e.code === 'variable-mismatch')).toBe(true)
  })

  it('缺 entries / 缺 context → error 且定位到条目行', async () => {
    const noEntries = `variable = "chat"\n`
    const r1 = await validateTalkFile(noEntries, 'chat', KNOWN_WORDS, KNOWN_PREMISES)
    expect(r1.errors.some((e) => e.code === 'missing-entries')).toBe(true)

    const noCtx = `variable = "chat"\n[[entries]]\nconditions = "premise(NOT_H)"\n`
    const r2 = await validateTalkFile(noCtx, 'chat', KNOWN_WORDS, KNOWN_PREMISES)
    const err = r2.errors.find((e) => e.code === 'entry-context')
    expect(err).toBeDefined()
    expect(err!.line).toBe(2)
  })

  it('未知前提 → warning；high_N 与已知前提放行', async () => {
    const text = `variable = "chat"\n[[entries]]\nconditions = "premise(high_5) && premise(NOT_H) && premise(UNKNOWN_X)"\ncontext = "x"\n`
    const r = await validateTalkFile(text, 'chat', KNOWN_WORDS, KNOWN_PREMISES)
    expect(r.ok).toBe(true) // warning 不阻断
    const warns = r.warnings.filter((w) => w.code === 'unknown-premise')
    expect(warns).toHaveLength(1)
    expect(warns[0].message).toContain('UNKNOWN_X')
  })

  it('未知 {word} → hint；已知词表放行', async () => {
    const text = `variable = "chat"\n[[entries]]\ncontext = "用了{penis}和{奇怪词}。{player.name}说话。"\n`
    const r = await validateTalkFile(text, 'chat', KNOWN_WORDS, KNOWN_PREMISES)
    expect(r.hints.some((h) => h.code === 'unknown-word' && h.message.includes('奇怪词'))).toBe(true)
    expect(r.hints.some((h) => h.message.includes('penis'))).toBe(false)
  })

  it('整体修饰字段（ADR 0018）：类型/枚举错误 → warning，不影响保存', async () => {
    const text = `variable = "chat"\n[[entries]]\nstyle = "narrator"\ndisplay = "typewriter"\nspeed = 40\ncontext = "x"\n\n[[entries]]\ntrigger = "hover"\ncolor = 7\ncontext = "y"\n`
    const r = await validateTalkFile(text, 'chat', KNOWN_WORDS, KNOWN_PREMISES, new Set(['narrator']))
    expect(r.ok).toBe(true)
    const warns = r.warnings.filter((w) => w.code === 'bad-display-field')
    expect(warns.some((w) => w.message.includes('trigger'))).toBe(true)
    expect(warns.some((w) => w.message.includes('color'))).toBe(true)
    expect(r.hints.some((h) => h.code === 'unknown-style')).toBe(false) // narrator 已注册
  })

  it('style 名未注册 → hint（不阻断）', async () => {
    const text = `variable = "chat"\n[[entries]]\nstyle = "ghost_style"\ncontext = "x"\n`
    const r = await validateTalkFile(text, 'chat', KNOWN_WORDS, KNOWN_PREMISES, new Set(['narrator']))
    expect(r.ok).toBe(true)
    expect(r.hints.some((h) => h.code === 'unknown-style')).toBe(true)
  })
})

describe('行定位工具', () => {
  it('lineAt', () => {
    expect(lineAt('a\nb\nc', 3)).toBe(2)
    expect(lineAt('abc', 1)).toBe(1)
  })

  it('locateEntryLine', () => {
    const text = `x = 1\n[[entries]]\ncontext = "a"\n[[entries]]\ncontext = "b"\n`
    expect(locateEntryLine(text, 0)).toBe(2)
    expect(locateEntryLine(text, 1)).toBe(4)
    expect(locateEntryLine(text, 5)).toBeUndefined()
  })

  it('premiseRefs 提取并大写', () => {
    const refs = premiseRefs('premise(high_1) && premise( NOT_H )')
    expect(refs.map((r) => r.name)).toEqual(['HIGH_1', 'NOT_H'])
  })
})