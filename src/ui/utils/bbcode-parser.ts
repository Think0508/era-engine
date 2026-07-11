// BBCode 解析器 — 将行内标记转换为结构化片段

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

/**
 * 解析 BBCode 标记字符串为 TextSegment 数组
 * 支持嵌套：标记可叠加，后解析的标记包裹先解析的
 */
export function parseBBCode(input: string): TextSegment[] {
  if (!input) return [{ text: '' }]

  // 第一阶段：提取块级标记（spoiler、color、font、size）
  let segments: TextSegment[] = [{ text: input }]

  // 按顺序处理标记类型（从外到内）
  segments = extractBlocks(segments, /\|\|(.+?)\|\|/g, (inner) => [{ text: inner, spoiler: true }])
  segments = extractBlocks(segments, /\{\{color:(#[0-9a-fA-F]{3,8})\s+(.+?)\}\}/g, (_, color, inner) => [{ text: inner, color }])
  segments = extractBlocks(segments, /\{\{font:(\S+?)\s+(.+?)\}\}/g, (_, font, inner) => [{ text: inner, font }])
  segments = extractBlocks(segments, /\{\{size:(\S+?)\s+(.+?)\}\}/g, (_, size, inner) => [{ text: inner, size }])

  // 第二阶段：提取行内标记（加粗、斜体、删除线），可以嵌套在块级内
  segments = extractInline(segments, /\*\*(.+?)\*\*/g, { bold: true })
  segments = extractInline(segments, /\*(.+?)\*/g, { italic: true })
  segments = extractInline(segments, /~~(.+?)~~/g, { strikethrough: true })

  return segments
}

/** 提取块级标记（用回调替换匹配部分） */
function extractBlocks(
  segments: TextSegment[],
  pattern: RegExp,
  replacer: (...args: string[]) => TextSegment[],
): TextSegment[] {
  const result: TextSegment[] = []
  for (const seg of segments) {
    // 已标记的段落不再解析块级标记（避免 spoiler 内再解析 color）
    if (seg.spoiler || seg.color || seg.font || seg.size) {
      result.push(seg)
      continue
    }
    let lastIndex = 0
    let match: RegExpExecArray | null
    const re = new RegExp(pattern.source, 'g')
    while ((match = re.exec(seg.text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: seg.text.slice(lastIndex, match.index) })
      }
      const replaced = replacer(...match)
      for (const r of replaced) {
        result.push(mergeSegment(seg, r))
      }
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < seg.text.length) {
      result.push({ text: seg.text.slice(lastIndex) })
    }
  }
  return result
}

/** 提取行内标记（在文本段落内直接应用样式） */
function extractInline(
  segments: TextSegment[],
  pattern: RegExp,
  style: Partial<TextSegment>,
): TextSegment[] {
  const result: TextSegment[] = []
  for (const seg of segments) {
    let lastIndex = 0
    let match: RegExpExecArray | null
    const re = new RegExp(pattern.source, 'g')
    while ((match = re.exec(seg.text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ ...seg, text: seg.text.slice(lastIndex, match.index) })
      }
      result.push({ ...seg, ...style, text: match[1] })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < seg.text.length) {
      result.push({ ...seg, text: seg.text.slice(lastIndex) })
    }
  }
  return result
}

/** 合并外层和内层片段的样式 */
function mergeSegment(outer: TextSegment, inner: TextSegment): TextSegment {
  return {
    ...outer,
    ...inner,
  }
}
