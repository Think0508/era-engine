import { describe, expect, it } from 'vitest'
import { decodeText, encodeText, detectEol, lineCount } from '../encoding'

describe('encoding', () => {
  it('BOM 探测与剥离', () => {
    const r = decodeText('\uFEFFvariable = "a"\n')
    expect(r.hadBom).toBe(true)
    expect(r.text.startsWith('variable')).toBe(true)
    expect(encodeText(r.hadBom, r.text).charCodeAt(0)).toBe(0xfeff)
  })

  it('无 BOM 原样', () => {
    const r = decodeText('variable = "a"\n')
    expect(r.hadBom).toBe(false)
    expect(encodeText(r.hadBom, r.text)).toBe('variable = "a"\n')
  })

  it('EOL 探测', () => {
    expect(detectEol('a\nb\n')).toBe('LF')
    expect(detectEol('a\r\nb\r\n')).toBe('CRLF')
    expect(detectEol('a\r\nb\n')).toBe('mixed')
    expect(detectEol('')).toBe('LF')
  })

  it('lineCount', () => {
    expect(lineCount('')).toBe(1)
    expect(lineCount('a\nb\nc')).toBe(3)
  })

  it('round-trip 字节一致（BOM + CRLF 样本）', () => {
    const src = '\uFEFFvariable = "chat"\r\ncontext = "x"\r\n'
    const meta = decodeText(src)
    expect(meta.hadBom).toBe(true)
    expect(meta.eol).toBe('CRLF')
    const out = encodeText(meta.hadBom, meta.text)
    // 不归一化 EOL：文本原样
    expect(out).toBe('\uFEFFvariable = "chat"\r\ncontext = "x"\r\n')
  })
})