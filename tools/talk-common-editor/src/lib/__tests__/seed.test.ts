import { describe, expect, it } from 'vitest'
import { skeletonTalkFile, talkRelPath } from '../seed'

describe('seed', () => {
  it('骨架含 variable/description/entries 且结构可解析', async () => {
    const s = skeletonTalkFile('sleep', '睡觉')
    expect(s).toContain('variable = "sleep"')
    expect(s).toContain('description = "睡觉')
    expect(s).toContain('[[entries]]')
    expect(s).toContain('context = "睡觉指令通用口上 1"')
    const { default: parse } = await import('@iarna/toml/parse-string.js')
    const doc = parse(s) as Record<string, unknown>
    expect(doc.variable).toBe('sleep')
    expect(Array.isArray(doc.entries)).toBe(true)
  })

  it('talkRelPath 使用分类与变量名', () => {
    expect(talkRelPath('daily', 'chat')).toBe('behavior/daily/chat.toml')
    expect(talkRelPath(undefined, 'x')).toBe('behavior/daily/x.toml')
    expect(talkRelPath('h_evening', 'y')).toBe('behavior/h_evening/y.toml')
  })
})