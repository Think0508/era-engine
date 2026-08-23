// 引擎色值 → CSS 色值（ADR 0018 配套）：#AARRGGBB → rgba，其余原样
import { describe, expect, it } from 'vitest'
import { toCssColor } from './color'

describe('toCssColor', () => {
  it('#AARRGGBB → rgba（引擎半透明语义）', () => {
    // #80FF0000 = alpha 0x80（≈50%）、R=FF、G=00、B=00
    expect(toCssColor('#80FF0000')).toBe('rgba(255, 0, 0, 0.502)')
  })

  it('alpha=00 → 全透明（引擎语义 #00FF0080 = A:00 R:FF G:00 B:80）', () => {
    expect(toCssColor('#00FF0080')).toBe('rgba(255, 0, 128, 0.000)')
  })

  it('6 位/3 位 hex 与命名色原样', () => {
    expect(toCssColor('#FF0000')).toBe('#FF0000')
    expect(toCssColor('#FFF')).toBe('#FFF')
    expect(toCssColor('red')).toBe('red')
  })

  it('空白容忍', () => {
    expect(toCssColor(' #80FF0000 ')).toBe('rgba(255, 0, 0, 0.502)')
  })
})