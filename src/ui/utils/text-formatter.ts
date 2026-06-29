// 注释：text-formatter 文字格式解析器
// Markdown 子集 + 扩展语法，供 NarrativeLog 渲染
// 支持：**加粗** / *斜体* / ~~删除线~~ / ||spoiler||（黑框点击展开）
// {{color:#RRGGBB 文字}} / {{color:#AARRGGBB 文字}}（hex RGB + 透明度）
// {{font:字体名 文字}} / {{size:large 文字}}

export interface FormattedSegment {
  text: string
  bold?: boolean
  italic?: boolean
  strikethrough?: boolean
  spoiler?: boolean
  color?: string
  font?: string
  size?: string
}

// 注释：解析文本为带样式的段落数组
export function formatText(text: string): FormattedSegment[] {
  const segments: FormattedSegment[] = []
  let remaining = text

  while (remaining.length > 0) {
    // 注释：尝试匹配各种格式标记
    let matched = false

    // 注释：**加粗**
    let m = /^\*\*(.+?)\*\*/.exec(remaining)
    if (m) {
      segments.push({ text: m[1], bold: true })
      remaining = remaining.slice(m[0].length)
      continue
    }

    // 注释：*斜体*
    m = /^\*(.+?)\*/.exec(remaining)
    if (m) {
      segments.push({ text: m[1], italic: true })
      remaining = remaining.slice(m[0].length)
      continue
    }

    // 注释：~~删除线~~
    m = /^~~(.+?)~~/.exec(remaining)
    if (m) {
      segments.push({ text: m[1], strikethrough: true })
      remaining = remaining.slice(m[0].length)
      continue
    }

    // 注释：||spoiler||（黑框点击展开）
    m = /^\|\|(.+?)\|\|/.exec(remaining)
    if (m) {
      segments.push({ text: m[1], spoiler: true })
      remaining = remaining.slice(m[0].length)
      continue
    }

    // 注释：{{color:#RRGGBB 文字}} 或 {{color:#AARRGGBB 文字}}
    m = /^\{\{color:(#[0-9a-fA-F]{6,8})\s+(.+?)\}\}/.exec(remaining)
    if (m) {
      segments.push({ text: m[2], color: m[1] })
      remaining = remaining.slice(m[0].length)
      continue
    }

    // 注释：{{font:字体名 文字}}
    m = /^\{\{font:(\S+)\s+(.+?)\}\}/.exec(remaining)
    if (m) {
      segments.push({ text: m[2], font: m[1] })
      remaining = remaining.slice(m[0].length)
      continue
    }

    // 注释：{{size:large 文字}}
    m = /^\{\{size:(\S+)\s+(.+?)\}\}/.exec(remaining)
    if (m) {
      segments.push({ text: m[2], size: m[1] })
      remaining = remaining.slice(m[0].length)
      continue
    }

    // 注释：无匹配——取一个普通字符（避免无限循环）
    if (!matched) {
      // 注释：查找下一个格式标记的开始位置
      const nextMarker = findNextMarker(remaining)
      if (nextMarker > 0) {
        segments.push({ text: remaining.slice(0, nextMarker) })
        remaining = remaining.slice(nextMarker)
      } else {
        segments.push({ text: remaining })
        remaining = ''
      }
    }
  }

  return segments
}

// 注释：查找下一个格式标记的位置
function findNextMarker(text: string): number {
  const markers = ['**', '*', '~~', '||', '{{']
  let minPos = text.length
  for (const marker of markers) {
    const pos = text.indexOf(marker)
    if (pos >= 0 && pos < minPos) {
      minPos = pos
    }
  }
  return minPos
}
