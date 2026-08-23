import { describe, expect, it } from 'vitest'
import { renderBBCode, plainText, sizeToPx, cssColor, type Seg } from '../bbcode'

type StyledSeg = Extract<Seg, { type: 'styled' }>
type BoldSeg = Extract<Seg, { type: 'bold' }>

describe('renderBBCode', () => {
  it('纯文本', () => {
    expect(renderBBCode('你好')).toEqual([{ type: 'text', text: '你好' }])
  })

  it('加粗/斜体/删除线', () => {
    const segs = renderBBCode('a**b**c*d*e~~f~~g')
    expect(plainText(segs)).toBe('abcdefg')
    expect(segs[1]).toMatchObject({ type: 'bold' })
    expect(segs[3]).toMatchObject({ type: 'italic' })
    expect(segs[5]).toMatchObject({ type: 'strike' })
  })

  it('涂黑 ||spoiler||', () => {
    const segs = renderBBCode('凶手是||张三||')
    expect(segs[1]).toMatchObject({ type: 'spoiler' })
    expect(plainText(segs)).toBe('凶手是张三')
  })

  it('{{color}} / {{font}} / {{size}}', () => {
    const segs = renderBBCode('{{color:#FF0000 红字}}和{{font:楷体 字体}}和{{size:large 大字}}')
    const color = segs[0] as StyledSeg
    expect(color.type).toBe('styled')
    expect(color.tag).toBe('color')
    expect(color.value).toBe('#FF0000')
    expect(plainText(segs)).toBe('红字和字体和大字')
  })

  it('嵌套：{{color}} 内套 ** 和 {{font}}；同标签自嵌套（对齐引擎单层语义尽力而为）', () => {
    const segs = renderBBCode('{{color:#FF0000 他说：**{{font:楷体 绝对不行}}**}}')
    const outer = segs[0] as StyledSeg
    expect(outer.tag).toBe('color')
    const bold = outer.children[1] as BoldSeg // 「他说：」+ bold
    expect(bold.type).toBe('bold')
    expect(plainText([outer])).toBe('他说：绝对不行')

    expect(plainText(renderBBCode('{{color:#FFF {{size:large {{font:楷体 x}}}}}}'))).toBe('x')
  })

  it('未闭合标记保持原样', () => {
    const segs = renderBBCode('一个**没闭合')
    expect(segs[0].type).toBe('text')
  })

  it('单星与双星混排：*斜体* 后跟 **粗体** 不被误判（回归：preview_demo 高好感组）', () => {
    const segs = renderBBCode('*声音放轻*，**下次再聊**。')
    expect(segs.map((s) => s.type)).toEqual(['italic', 'text', 'bold', 'text'])
    expect(plainText(segs)).toBe('声音放轻，下次再聊。')

    const mixed = renderBBCode('{{color:#1A7F37 很投缘呢，}}*声音放轻*，**下次再聊**。')
    expect(mixed[1].type).toBe('italic')
    expect(mixed[2].type).toBe('text')
    expect(mixed[3].type).toBe('bold')
    expect(plainText(mixed)).toBe('很投缘呢，声音放轻，下次再聊。')
  })

  it('三连星 ***：复合粗斜标记（与引擎 bbcode-parser 一致）', () => {
    const segs = renderBBCode('***x***')
    const bold = segs[0] as Extract<Seg, { type: 'bold' }>
    expect(bold.type).toBe('bold')
    expect(bold.children[0].type).toBe('italic')
    expect(plainText(segs)).toBe('x')
  })

  it('深度上限防御不死循环', () => {
    const deep = '{{color:#FFF ' .repeat(30) + 'x' + '}}'.repeat(30)
    const segs = renderBBCode(deep)
    expect(plainText(segs)).toContain('x')
  })

  it('sizeToPx', () => {
    expect(sizeToPx('large')).toBe('18px')
    expect(sizeToPx('small')).toBe('12px')
    expect(sizeToPx('20px')).toBe('20px')
    expect(sizeToPx('huge')).toBe('14px')
  })

  it('cssColor：引擎 #AARRGGBB → CSS rgba', () => {
    // #80FF0000 = alpha 0x80(50%), R=FF, G=00, B=00
    expect(cssColor('#80FF0000')).toBe('rgba(255,0,0,0.502)')
    expect(cssColor('#FF0000')).toBe('#FF0000')
    // 引擎语义 AARRGGBB：#00FF0080 = alpha 0x00（全透明）、R=FF、G=00、B=80
    expect(cssColor('#00FF0080')).toBe('rgba(255,0,128,0.000)')
    expect(cssColor('red')).toBe('red')
  })
})