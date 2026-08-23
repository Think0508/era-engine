// 逐字渐进截断（TypewriterText）：可见字符预算 + 样式即时生效
import { describe, expect, it } from 'vitest'
import { parseBBCode, sliceSegmentsByVisible, totalVisibleLength } from './bbcode-parser'

describe('parseBBCode + sliceSegmentsByVisible（标记不露字，样式即时生效）', () => {
  it('纯文本逐字截断', () => {
    const segs = parseBBCode('你好世界')
    expect(sliceSegmentsByVisible(segs, 2).map((s) => s.text).join('')).toBe('你好')
    expect(totalVisibleLength(segs)).toBe(4)
  })

  it('{{color}} 播放中：内容带颜色逐字出，标记字符不出现', () => {
    const segs = parseBBCode('{{color:#80FF0000 半透明红}}')
    expect(segs).toHaveLength(1)
    expect(segs[0].color).toBe('#80FF0000')

    const at0 = sliceSegmentsByVisible(segs, 0)
    expect(at0).toHaveLength(0)

    const at2 = sliceSegmentsByVisible(segs, 2)
    expect(at2[0].text).toBe('半透')
    expect(at2[0].color).toBe('#80FF0000')

    const full = sliceSegmentsByVisible(segs, 99)
    expect(full[0].text).toBe('半透明红')
    expect(sliceSegmentsByVisible(segs, 99).every((s) => s.color === '#80FF0000')).toBe(true)
    // 任何阶段都不含标记字符
    for (const n of [1, 2, 3, 4, 5]) {
      const t = sliceSegmentsByVisible(segs, n).map((s) => s.text).join('')
      expect(t).not.toContain('{')
      expect(t).not.toContain('color')
    }
  })

  it('粗斜混排：已闭合段样式即时生效', () => {
    const segs = parseBBCode('*斜体*，**粗体**。')
    const t = sliceSegmentsByVisible(segs, 4) // 斜体2字 + ， + 粗1字
    expect(t[0].italic).toBe(true)
    expect(t[0].text).toBe('斜体')
    expect(t[1].text).toBe('，')
    expect(t[2].bold).toBe(true)
    expect(t[2].text).toBe('粗')
  })

  it('spoiler：逐字揭示时黑色遮盖按内容增长', () => {
    const segs = parseBBCode('凶手是||张三||')
    const t = sliceSegmentsByVisible(segs, 99)
    expect(t.some((s) => s.spoiler === true)).toBe(true)
    const partial = sliceSegmentsByVisible(segs, 4)
    expect(partial.map((s) => s.text).join('')).toBe('凶手是张')
  })

  it('预算超界：全量返回', () => {
    const segs = parseBBCode('a**b**')
    expect(sliceSegmentsByVisible(segs, 999).map((s) => s.text).join('')).toBe('ab')
  })

  // ── 2026-08-23 栈式升级的对齐用例（与工具 talk-common-editor 行为一致）──
  it('嵌套：{{color}} 内套 ** 与 {{font}}（引擎原正则无法解析）', () => {
    const segs = parseBBCode('{{color:#FF0000 他说：**{{font:楷体 绝对不行}}**}}')
    const joined = segs.map((s) => ({ text: s.text, bold: s.bold, color: s.color, font: s.font }))
    expect(joined.some((s) => s.bold && s.color === '#FF0000' && s.font === '楷体')).toBe(true)
    expect(segs.map((s) => s.text).join('')).toBe('他说：绝对不行')
  })

  it('同标签自嵌套：{{color}}> {{size}}> {{font}}', () => {
    const segs = parseBBCode('{{color:#FFF {{size:large {{font:楷体 x}}}}}}')
    expect(segs.map((s) => s.text).join('')).toBe('x')
    expect(segs[0].color).toBe('#FFF')
    expect(segs[0].size).toBe('large')
    expect(segs[0].font).toBe('楷体')
  })

  it('{{ 后空格容忍 + 命名色值', () => {
    const segs = parseBBCode('{{ color:red 红}}和{{color:blue 蓝}}')
    expect(segs[0].color).toBe('red')
    expect(segs[2].color).toBe('blue')
    expect(segs.map((s) => s.text).join('')).toBe('红和蓝')
  })

  it('spoiler 内 {{color}} 生效（栈式天然支持）', () => {
    const segs = parseBBCode('凶手是||李{{color:#FF0000 某}}||')
    const colored = segs.find((s) => s.text === '某')
    expect(colored?.color).toBe('#FF0000')
    expect(colored?.spoiler).toBe(true)
    expect(segs.map((s) => s.text).join('')).toBe('凶手是李某')
  })

  it('三连星 ***：复合粗斜标记（全等闭合）', () => {
    const segs = parseBBCode('***x***')
    expect(segs.some((s) => s.bold === true && s.italic === true && s.text === 'x')).toBe(true)
    expect(segs.map((s) => s.text).join('')).toBe('x')
  })

  it('未闭合仍按原文保留', () => {
    const segs = parseBBCode('一个**没闭合的{{color:#FFF')
    expect(segs.map((s) => s.text).join('')).toContain('**')
    expect(segs.map((s) => s.text).join('')).toContain('{{color:#FFF')
  })
})