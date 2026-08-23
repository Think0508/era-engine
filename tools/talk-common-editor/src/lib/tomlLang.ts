/**
 * 轻量 TOML 语法高亮（StreamLanguage）：注释 / 字符串（含多行）/ 表头 / 键 / 数。
 * 不依赖外部语言包（@codemirror/lang-toml 不存在于 npm）。
 */
import { StreamLanguage, type StreamParser } from '@codemirror/language'

interface State {
  inMultiline: boolean
  inString: boolean
  stringQuote: string
}

const tomlParser: StreamParser<State> = {
  token(stream, state) {
    if (state.inMultiline) {
      if (stream.sol() && stream.match(/^"""/, false) && stream.match(/^"""/)) {
        state.inMultiline = false
        return 'string'
      }
      stream.next()
      return 'string'
    }
    if (state.inString) {
      if (stream.match(state.stringQuote)) state.inString = false
      else stream.next()
      return 'string'
    }
    if (stream.eatSpace()) return null
    if (stream.match(/^#/)) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match(/^"""|^'''/)) {
      state.inMultiline = true
      return 'string'
    }
    if (stream.match(/^"/) || stream.match(/^'/)) {
      state.inString = true
      state.stringQuote = stream.current().slice(-1)
      return 'string'
    }
    if (stream.match(/^\[\[?.*?\]\]?/, false)) {
      stream.match(/^\[\[?[^\]]*\]\]?/)
      return 'table'
    }
    if (stream.match(/^(true|false)\b/)) return 'keyword'
    if (stream.match(/^\d[\d_.]*/)) return 'number'
    if (stream.match(/^[A-Za-z0-9_-]+/)) {
      // 键（后随 = 的裸词）在 nextToken 阶段无法回头判断；统一给 'propertyName' 之外的普通色，
      // 等号前一行内处理：这里直接返回 'name' 由主题区分
      return 'name'
    }
    stream.next()
    return null
  },
  startState() {
    return { inMultiline: false, inString: false, stringQuote: '"' }
  },
  copyState(s) {
    return { ...s }
  },
}

export function tomlLanguage() {
  return StreamLanguage.define(tomlParser)
}