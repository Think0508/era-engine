/**
 * 编码契约：UTF-8 文本 + BOM 探测 + 换行符探测。
 * 默认：UTF-8 无 BOM + LF（与 era-engine 仓库现状一致，已实测）。
 * 特例：原文件带 BOM → 写回时重新加上；CRLF → 文本原样保留（编辑器不归一化）。
 */

export interface TextWithMeta {
  /** 去除 BOM 后的文本（编辑器/校验全程用这份） */
  text: string
  /** 原文件是否带 UTF-8 BOM */
  hadBom: boolean
  eol: 'LF' | 'CRLF' | 'mixed'
}

export function decodeText(raw: string): TextWithMeta {
  let text = raw
  let hadBom = false
  if (text.charCodeAt(0) === 0xfeff) {
    hadBom = true
    text = text.slice(1)
  }
  return { text, hadBom, eol: detectEol(text) }
}

/** 写回：按原 BOM 状态重新编码（EOL 不归一化，文本原样保留） */
export function encodeText(hadBom: boolean, newText: string): string {
  return hadBom ? '\uFEFF' + newText : newText
}

export function detectEol(text: string): 'LF' | 'CRLF' | 'mixed' {
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length
  if (crlf > 0 && lf > 0) return 'mixed'
  if (crlf > 0) return 'CRLF'
  return 'LF'
}

export function lineCount(text: string): number {
  return text.length === 0 ? 1 : (text.match(/\n/g) ?? []).length + 1
}