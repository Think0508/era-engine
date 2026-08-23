/**
 * 口上 BBCode 渲染（对齐 docs/dialogue-format.md §四，栈式解析支持混合嵌套）：
 * **加粗**  *斜体*  ~~删除线~~  ||涂黑||  {{color:#RRGGBB 文字}}（含 #AARRGGBB）
 * {{font:字体名 文字}}  {{size:large|small|normal|20px 文字}}
 * 未闭合标记按原文保留。
 */

export type Seg =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Seg[] }
  | { type: 'italic'; children: Seg[] }
  | { type: 'strike'; children: Seg[] }
  | { type: 'spoiler'; children: Seg[] }
  | { type: 'styled'; tag: 'color' | 'font' | 'size'; value: string; children: Seg[] }

interface Frame {
  kind: 'root' | 'bold' | 'italic' | 'strike' | 'spoiler' | 'styled'
  start: number
  segs: Seg[]
  tag?: 'color' | 'font' | 'size'
  value?: string
}

const MAX_STACK = 24

export function renderBBCode(text: string): Seg[] {
  const root: Frame = { kind: 'root', start: 0, segs: [] }
  const stack: Frame[] = [root]
  let buf = ''
  const flush = (): void => {
    if (!buf) return
    stack[stack.length - 1].segs.push({ type: 'text', text: buf })
    buf = ''
  }
  const literal = (chunk: string): void => {
    buf += chunk
  }

  const n = text.length
  let i = 0
  while (i < n) {
    const two = text.slice(i, i + 2)
    const top = stack[stack.length - 1]
    const canOpen = stack.length < MAX_STACK

    // ── `***` 复合标记（粗斜一体）：全等闭合 `***x***` 形态，其余场景退回单星规则 ──
    if (text.slice(i, i + 3) === '***' && findCloser('***', i + 3, text) >= 0) {
      flush()
      stack.push({ kind: 'bold', start: i, segs: [] }, { kind: 'italic', start: i, segs: [] })
      i += 3
      continue
    }
    // ── {{key:value 内容...}}：开启时吃掉 key/value 前缀 ──
    if (two === '{{') {
      const m = /^\{\{\s*([a-z]+):(\S+)\s/.exec(text.slice(i))
      const key = m ? m[1].toLowerCase() : ''
      if (m && (key === 'color' || key === 'font' || key === 'size') && canOpen) {
        flush()
        stack.push({ kind: 'styled', start: i, segs: [], tag: key as 'color' | 'font' | 'size', value: m[2] })
        i += m[0].length
        continue
      }
      literal('{{')
      i += 1
      continue
    }
    if (two === '}}') {
      if (top.kind === 'styled') {
        flush()
        stack.pop()
        stack[stack.length - 1].segs.push({
          type: 'styled',
          tag: top.tag!,
          value: top.value!,
          children: top.segs,
        })
        i += 2
        continue
      }
      literal('}}')
      i += 1
      continue
    }
    // ── 行内成对标记 ──
    if (two === '**' && findCloser('**', i + 2, text) >= 0) {
      flush()
      stack.push({ kind: 'bold', start: i, segs: [] })
      i += 2
      continue
    }
    if (two === '~~' && findCloser('~~', i + 2, text) >= 0) {
      flush()
      stack.push({ kind: 'strike', start: i, segs: [] })
      i += 2
      continue
    }
    if (two === '||' && findCloser('||', i + 2, text) >= 0) {
      flush()
      stack.push({ kind: 'spoiler', start: i, segs: [] })
      i += 2
      continue
    }
    if (text[i] === '*' && text[i + 1] !== '*' && findSingleStar(i + 1, text) >= 0) {
      flush()
      stack.push({ kind: 'italic', start: i, segs: [] })
      i += 1
      continue
    }
    // `***` 闭合：栈顶为 italic 且其下为 bold 时同时弹出两帧（与引擎 bbcode-parser 一致）
    if (
      text.slice(i, i + 3) === '***' &&
      top.kind === 'italic' &&
      stack[stack.length - 2]?.kind === 'bold'
    ) {
      flush()
      const italicFrame = stack.pop()!
      const boldFrame = stack.pop()!
      stack[stack.length - 1].segs.push({ type: 'bold', children: [{
        type: 'italic',
        children: italicFrame.segs,
      } as Seg] } as Seg)
      void boldFrame
      i += 3
      continue
    }
    // ── 闭合 ──
    if (two === '**' && top.kind === 'bold') {
      flush()
      stack.pop()
      stack[stack.length - 1].segs.push({ type: 'bold', children: top.segs })
      i += 2
      continue
    }
    if (two === '~~' && top.kind === 'strike') {
      flush()
      stack.pop()
      stack[stack.length - 1].segs.push({ type: 'strike', children: top.segs })
      i += 2
      continue
    }
    if (two === '||' && top.kind === 'spoiler') {
      flush()
      stack.pop()
      stack[stack.length - 1].segs.push({ type: 'spoiler', children: top.segs })
      i += 2
      continue
    }
    if (text[i] === '*' && text[i + 1] !== '*' && top.kind === 'italic') {
      flush()
      stack.pop()
      stack[stack.length - 1].segs.push({ type: 'italic', children: top.segs })
      i += 1
      continue
    }
    literal(text[i])
    i += 1
  }
  flush()

  // 未闭合的 frame：按原文恢复（从内到外）
  for (let d = stack.length - 1; d >= 1; d--) {
    const frame = stack[d]
    stack[d - 1].segs.push({ type: 'text', text: text.slice(frame.start) })
  }
  return root.segs
}

/** 成对标记的闭合位置 */
function findCloser(marker: string, from: number, text: string): number {
  let idx = text.indexOf(marker, from)
  if (marker === '*' && idx >= 0 && text[idx + 1] === '*') {
    idx = text.indexOf('*', idx + 1)
  }
  return idx
}

/**
 * 单星斜体闭合/候选查找：不能把成对双星（**）内部的星当单星——
 * 遇到双星整体跳过（idx+2），否则 *x*，**y** 会把闭合星误判为开启星，
 * 帧永不闭合 → 整段按原文恢复（2026-08-23 修复）。
 */
function findSingleStar(from: number, text: string): number {
  let idx = text.indexOf('*', from)
  while (idx >= 0) {
    if (text[idx + 1] === '*') {
      idx = text.indexOf('*', idx + 2)
      continue
    }
    return idx
  }
  return -1
}

/** size 名 → px（引擎 theme 基准 16px 的近似） */
export function sizeToPx(value: string): string {
  const v = value.trim()
  if (/^\d+(\.\d+)?px$/.test(v)) return v
  switch (v.toLowerCase()) {
    case 'small':
      return '12px'
    case 'medium':
      return '14px'
    case 'large':
      return '18px'
    default:
      return '14px'
  }
}

/**
 * 引擎色值 → CSS 色值。
 * 引擎约定 #AARRGGBB（如 #80FF0000 = 50% 透明红）；CSS 8 位 hex 是 #RRGGBBAA，
 * 直接透传会把 alpha 塞到错误的位置（#80FF0000 被读成全透明）——必须转 rgba()。
 */
export function cssColor(value: string): string {
  const v = value.trim()
  const m = /^#([0-9a-fA-F]{8})$/.exec(v)
  if (m) {
    const a = parseInt(m[1].slice(0, 2), 16) / 255
    const r = parseInt(m[1].slice(2, 4), 16)
    const g = parseInt(m[1].slice(4, 6), 16)
    const b = parseInt(m[1].slice(6, 8), 16)
    return `rgba(${r},${g},${b},${a.toFixed(3)})`
  }
  return v
}

/** 纯文本提取（测试/辅助） */
export function plainText(segs: Seg[]): string {
  return segs
    .map((s) => (s.type === 'text' ? s.text : plainText('children' in s ? s.children : [])))
    .join('')
}