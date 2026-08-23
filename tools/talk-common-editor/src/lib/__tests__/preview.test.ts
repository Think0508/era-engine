import { describe, expect, it } from 'vitest'
import { parseEntriesPreview, interpolatePreview, randomPick, MOCK_CONTEXT } from '../preview'

describe('preview', () => {
  it('解析 entries 并分组字段', async () => {
    const r = await parseEntriesPreview(
      'variable="chat"\n[[entries]]\ncontext="甲"\n[[entries]]\nconditions="premise(high_1)"\ncontext="乙"\n',
    )
    expect(r.error).toBeUndefined()
    expect(r.entries).toHaveLength(2)
    expect(r.entries[1].conditions).toBe('premise(high_1)')
  })

  it('坏 TOML → error 而非抛出', async () => {
    const r = await parseEntriesPreview('variable="x"\nentries=[\n')
    expect(r.error).toBeTruthy()
    expect(r.entries).toHaveLength(0)
  })

  it('mock 插值：{obj.prop} 替换、未知词原样', () => {
    expect(interpolatePreview('{player.name}和{character.name}')).toBe('博士和令狐冲')
    expect(interpolatePreview('{未知词}保持')).toBe('{未知词}保持')
  })

  it('mock 嵌套路径不越界', () => {
    expect(interpolatePreview('{player.no_such}')).toBe('{player.no_such}')
  })

  it('randomPick 在范围内', () => {
    const entries = [{ conditions: '', context: 'a' }, { conditions: '', context: 'b' }]
    for (let i = 0; i < 50; i++) {
      const pick = randomPick(entries)
      expect(['a', 'b']).toContain(pick)
    }
    expect(randomPick([])).toBeNull()
    expect(MOCK_CONTEXT.character.name).toBe('令狐冲')
  })

  it('整体修饰字段（ADR 0018）：preview 透传 style/display/speed', async () => {
    const r = await parseEntriesPreview(
      'variable="v"\n[[entries]]\nstyle="narrator"\ndisplay="typewriter"\nspeed=40\ncontext="甲"\n[[entries]]\ncontext="乙"\n',
    )
    expect(r.error).toBeUndefined()
    expect(r.entries[0].style).toBe('narrator')
    expect(r.entries[0].display).toBe('typewriter')
    expect(r.entries[0].speed).toBe(40)
    expect(r.entries[1].style).toBeUndefined()
  })
})