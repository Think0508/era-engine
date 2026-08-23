// BBCode 解析器 — 将行内标记转换为结构化片段
// 2026-08-23 重写：正则两阶段（块级→行内）升级为栈式解析（与工具 talk-common-editor
// 的 bbcode.ts 行为对齐）：支持嵌套 {{}}、spoiler 内样式、{{ 后空格容忍、命名色值；
// 输出仍为扁平 TextSegment[]（样式叠加在片段上），FormattedText / TypewriterText
// 的消费 API 不变。

export interface TextSegment {
  text: string
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  spoiler?: boolean
  color?: string
  font?: string
  size?: string
}

interface StackFrame {
  kind: 'bold' | 'italic' | 'strike' | 'spoiler' | 'styled'
  tag?: 'color' | 'font' | 'size'
  value?: string
  start: number
}

const MAX_DEPTH = 24

export function parseBBCode(input: string): TextSegment[] {
  if (!input) return [{ text: '' }]
  const out: TextSegment[] = []
  const stack: StackFrame[] = []
  let buf = ''
  let i = 0
  const n = input.length

  const flush = (): void => {
    if (!buf) return
    out.push(applyStack(buf, stack))
    buf = ''
  }

  while (i < n) {
    const two = input.slice(i, i + 2)
    const top = stack[stack.length - 1]
    const canOpen = stack.length < MAX_DEPTH

    // ── `***` 复合标记（粗斜一体）：全等闭合 `***x***` 形态，其余场景退回单星规则 ──
    if (input.slice(i, i + 3) === '***' && findCloser('***', i + 3, input) >= 0) {
      flush()
      stack.push({ kind: 'bold', start: i }, { kind: 'italic', start: i })
      i += 3
      continue
    }
    // ── {{key:value 内容...}}：开启时吃掉 key/value 前缀 ──
    if (two === '{{') {
      const m = /^\{\{\s*([a-z]+):(\S+)\s/.exec(input.slice(i))
      const key = m ? m[1].toLowerCase() : ''
      if (m && (key === 'color' || key === 'font' || key === 'size') && canOpen) {
        flush()
        stack.push({ kind: 'styled', tag: key as 'color' | 'font' | 'size', value: m[2], start: i })
        i += m[0].length
        continue
      }
      buf += '{{'
      i += 1
      continue
    }
    if (two === '}}' && top?.kind === 'styled') {
      flush()
      stack.pop()
      i += 2
      continue
    }
    // ── 行内成对标记（开启需预检存在闭合——未闭合的原样字面量，位置天然正确）──
    if (two === '**' && findCloser('**', i + 2, input) >= 0) {
      flush()
      stack.push({ kind: 'bold', start: i })
      i += 2
      continue
    }
    if (two === '~~' && findCloser('~~', i + 2, input) >= 0) {
      flush()
      stack.push({ kind: 'strike', start: i })
      i += 2
      continue
    }
    if (two === '||' && findCloser('||', i + 2, input) >= 0) {
      flush()
      stack.push({ kind: 'spoiler', start: i })
      i += 2
      continue
    }
    if (input[i] === '*' && input[i + 1] !== '*' && findSingleStar(i + 1, input) >= 0) {
      flush()
      stack.push({ kind: 'italic', start: i })
      i += 1
      continue
    }
    // `***` 闭合：栈顶为 italic 且其下为 bold 时同时弹出两帧
    if (
      input.slice(i, i + 3) === '***' &&
      top?.kind === 'italic' &&
      stack[stack.length - 2]?.kind === 'bold'
    ) {
      flush()
      stack.pop()
      stack.pop()
      i += 3
      continue
    }
    // ── 闭合 ──
    if (two === '**' && top?.kind === 'bold') {
      flush()
      stack.pop()
      i += 2
      continue
    }
    if (two === '~~' && top?.kind === 'strike') {
      flush()
      stack.pop()
      i += 2
      continue
    }
    if (two === '||' && top?.kind === 'spoiler') {
      flush()
      stack.pop()
      i += 2
      continue
    }
    if (input[i] === '*' && input[i + 1] !== '*' && top?.kind === 'italic') {
      flush()
      stack.pop()
      i += 1
      continue
    }
    buf += input[i]
    i += 1
  }
  flush()

  // 错位嵌套导致的未闭合 frame：按原文恢复到末尾（与工具实现一致）
  for (let d = stack.length - 1; d >= 0; d--) {
    out.push({ text: input.slice(stack[d].start) })
  }
  return out
}

/** 把当前栈的样式聚合到一段文本（扁平叠加） */
function applyStack(text: string, stack: StackFrame[]): TextSegment {
  const seg: TextSegment = { text }
  for (const f of stack) {
    switch (f.kind) {
      case 'bold':
        seg.bold = true
        break
      case 'italic':
        seg.italic = true
        break
      case 'strike':
        seg.strikethrough = true
        break
      case 'spoiler':
        seg.spoiler = true
        break
      case 'styled':
        if (f.tag === 'color') seg.color = f.value
        else if (f.tag === 'font') seg.font = f.value
        else seg.size = f.value
        break
    }
  }
  return seg
}

/** 成对标记的闭合位置（"** 优先于 *"由调用顺序保证） */
function findCloser(marker: string, from: number, text: string): number {
  let idx = text.indexOf(marker, from)
  if (marker === '*' && idx >= 0 && text[idx + 1] === '*') {
    idx = text.indexOf('*', idx + 1)
  }
  return idx
}

/** 单星斜体闭合/候选：不能把成对双星内部的星当单星（整体跳过，idx+2） */
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

/**
 * 逐字渐进（TypewriterText）：按「可见字符」预算截断片段序列。
 * 样式段完整保留（粗/斜/色/spoiler 等即时生效），文本截断到预算；
 * 标记字符不在片段文本内，天然不会露出。
 */
export function sliceSegmentsByVisible(segments: TextSegment[], budget: number): TextSegment[] {
  let remaining = budget
  const out: TextSegment[] = []
  for (const seg of segments) {
    if (remaining <= 0) break
    const len = seg.text.length
    if (len <= remaining) {
      out.push(seg)
      remaining -= len
    } else {
      out.push({ ...seg, text: seg.text.slice(0, remaining) })
      remaining = 0
    }
  }
  return out
}

/** 全部可见字符数（= 片段文本总长） */
export function totalVisibleLength(segments: TextSegment[]): number {
  return segments.reduce((sum, seg) => sum + seg.text.length, 0)
}