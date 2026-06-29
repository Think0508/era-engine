import { describe, it, expect } from 'vitest'
import { formatText } from './text-formatter'

describe('text-formatter', () => {
  it('普通文本无格式', () => {
    const result = formatText('你好世界')
    expect(result).toHaveLength(1)
    expect(result[0].text).toBe('你好世界')
    expect(result[0].bold).toBeUndefined()
  })

  it('**加粗**', () => {
    const result = formatText('**重要**')
    expect(result[0].text).toBe('重要')
    expect(result[0].bold).toBe(true)
  })

  it('*斜体*', () => {
    const result = formatText('*注意*')
    expect(result[0].text).toBe('注意')
    expect(result[0].italic).toBe(true)
  })

  it('~~删除线~~', () => {
    const result = formatText('~~废弃~~')
    expect(result[0].text).toBe('废弃')
    expect(result[0].strikethrough).toBe(true)
  })

  it('||spoiler||（黑框）', () => {
    const result = formatText('||隐藏内容||')
    expect(result[0].text).toBe('隐藏内容')
    expect(result[0].spoiler).toBe(true)
  })

  it('{{color:#RRGGBB 文字}}', () => {
    const result = formatText('{{color:#FF0000 红色文字}}')
    expect(result[0].text).toBe('红色文字')
    expect(result[0].color).toBe('#FF0000')
  })

  it('{{color:#AARRGGBB 文字}}（含透明度）', () => {
    const result = formatText('{{color:#80FF0000 半透明红}}')
    expect(result[0].text).toBe('半透明红')
    expect(result[0].color).toBe('#80FF0000')
  })

  it('{{font:楷体 文字}}', () => {
    const result = formatText('{{font:楷体 楷体文字}}')
    expect(result[0].text).toBe('楷体文字')
    expect(result[0].font).toBe('楷体')
  })

  it('{{size:large 文字}}', () => {
    const result = formatText('{{size:large 大字}}')
    expect(result[0].text).toBe('大字')
    expect(result[0].size).toBe('large')
  })

  it('混合格式', () => {
    const result = formatText('普通**加粗**普通*斜体*普通')
    expect(result.length).toBeGreaterThanOrEqual(3)
    expect(result[0].text).toBe('普通')
    expect(result[1].bold).toBe(true)
    expect(result[2].text).toBe('普通')
  })
})
