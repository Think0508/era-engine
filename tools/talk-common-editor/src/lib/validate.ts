/**
 * 口上文件校验：TOML 语法（行号）→ 结构（对齐引擎 parseFile 丢弃判据）
 * → premise 引用（best-effort 白名单，warning）→ 插值变量（hint）。
 * 深度条件字段校验由引擎加载期负责，工具不复制手册。
 */

export interface Issue {
  level: 'error' | 'warning' | 'hint'
  code: string
  message: string
  line?: number
}

export interface ValidationResult {
  ok: boolean
  errors: Issue[]
  warnings: Issue[]
  hints: Issue[]
}

interface RawTalkFile {
  variable?: unknown
  description?: unknown
  parts?: unknown
  entries?: unknown
}

let parsePromise: Promise<(str: string) => Record<string, any>> | null = null
function tomlParse(): Promise<(str: string) => Record<string, any>> {
  if (!parsePromise) {
    parsePromise = import('@iarna/toml/parse-string.js').then((m) => m.default ?? (m as any))
  }
  return parsePromise
}

/** 行为口上整体修饰字段（ADR 0018）：类型/枚举校验表 */
const DISPLAY_FIELD_RULES: Record<string, (v: unknown) => boolean> = {
  style: (v) => typeof v === 'string',
  trigger: (v) => v === 'auto' || v === 'click',
  display: (v) => v === 'instant' || v === 'typewriter',
  speed: (v) => typeof v === 'number' && Number.isFinite(v),
  pause: (v) => typeof v === 'number' && Number.isFinite(v),
  color: (v) => typeof v === 'string',
  size: (v) => typeof v === 'string',
  font: (v) => typeof v === 'string',
}

function fieldHint(field: string): string {
  switch (field) {
    case 'style':
      return '字符串（[styles] 注册表样式名）'
    case 'trigger':
      return '"auto" 或 "click"'
    case 'display':
      return '"instant" 或 "typewriter"'
    case 'speed':
      return '数字（毫秒/字）'
    case 'pause':
      return '数字（毫秒）'
    default:
      return '字符串'
  }
}

export async function validateTalkFile(
  text: string,
  expectedVariable: string,
  knownWords: Set<string>,
  knownPremises: Set<string>,
  knownStyles?: Set<string>,
): Promise<ValidationResult> {
  const knownStylesSet = knownStyles ?? new Set<string>()
  const errors: Issue[] = []
  const warnings: Issue[] = []
  const hints: Issue[] = []

  let doc: RawTalkFile
  try {
    const parse = await tomlParse()
    doc = parse(text) as RawTalkFile
  } catch (err) {
    const e = err as { line?: unknown; message?: unknown }
    const line = typeof e.line === 'number' ? e.line + 1 : undefined
    const msg = typeof e.message === 'string' ? e.message.split('\n')[0] : String(err)
    errors.push({
      level: 'error',
      code: 'toml-syntax',
      message: `TOML 语法错误：${msg}`,
      line,
    })
    return { ok: false, errors, warnings, hints }
  }

  // 结构
  if (typeof doc.variable !== 'string' || doc.variable.length === 0) {
    errors.push({
      level: 'error',
      code: 'missing-variable',
      message: `缺少 variable 字段（应等于 "${expectedVariable}"；缺它引擎会丢弃整个文件）`,
    })
  } else if (doc.variable !== expectedVariable) {
    errors.push({
      level: 'error',
      code: 'variable-mismatch',
      message: `variable = "${doc.variable}" 与预期 "${expectedVariable}" 不符（覆盖/引用会失配），可一键修复`,
    })
  }

  if (doc.description !== undefined && typeof doc.description !== 'string') {
    warnings.push({
      level: 'warning',
      code: 'bad-description',
      message: 'description 应为字符串',
    })
  }

  if (!Array.isArray(doc.entries)) {
    errors.push({
      level: 'error',
      code: 'missing-entries',
      message: '缺少 [[entries]] 数组（引擎要求 entries 必填，否则丢弃整个文件）',
    })
  } else {
    doc.entries.forEach((entry, i) => {
      if (entry === null || typeof entry !== 'object') {
        errors.push({
          level: 'error',
          code: 'bad-entry',
          message: `第 ${i + 1} 条 entry 必须是对象`,
          line: locateEntryLine(text, i),
        })
        return
      }
      const ctx = (entry as Record<string, unknown>).context
      if (typeof ctx !== 'string') {
        errors.push({
          level: 'error',
          code: 'entry-context',
          message: `第 ${i + 1} 条 entry 缺少 context 字符串`,
          line: locateEntryLine(text, i),
        })
      }
      const cond = (entry as Record<string, unknown>).conditions
      if (cond !== undefined && typeof cond !== 'string') {
        warnings.push({
          level: 'warning',
          code: 'bad-conditions',
          message: `第 ${i + 1} 条 entry 的 conditions 应为字符串`,
          line: locateEntryLine(text, i),
        })
      }
      // 整体修饰字段（ADR 0018）：类型/枚举错误 → warning；未知 style 名 → hint
      const rec = entry as Record<string, unknown>
      for (const [field, check] of Object.entries(DISPLAY_FIELD_RULES)) {
        const v = rec[field]
        if (v === undefined) continue
        if (!check(v)) {
          warnings.push({
            level: 'warning',
            code: 'bad-display-field',
            message: `第 ${i + 1} 条 entry 的 ${field} 值非法（应为 ${fieldHint(field)}）`,
            line: locateEntryLine(text, i),
          })
        }
      }
      if (typeof rec.style === 'string' && !knownStylesSet.has(rec.style)) {
        hints.push({
          level: 'hint',
          code: 'unknown-style',
          message: `style "${rec.style}" 不在 [styles] 注册表中（mods/{mod}/definitions/talk/styles.toml），游戏里按默认外观渲染`,
          line: locateEntryLine(text, i),
        })
      }
    })
  }

  // premise(X) 引用（忽略大小写差异；high_N 恒放行）
  premiseRefs(text).forEach(({ name, index }) => {
    const ok = knownPremises.has(name) || /^high_\d+$/i.test(name)
    if (!ok) {
      warnings.push({
        level: 'warning',
        code: 'unknown-premise',
        message: `premise(${name}) 不在已知前提集中（加载期引擎会视为未注册前提并报错）`,
        line: lineAt(text, index),
      })
    }
  })

  // 插值变量 {word}（无点无空格 token，含中文）与 {obj.prop}
  for (const m of text.matchAll(/\{([^}\s.]+)\}/g)) {
    const name = m[1]
    if (!knownWords.has(name) && !name.startsWith('_')) {
      hints.push({
        level: 'hint',
        code: 'unknown-word',
        message: `{${name}} 不在已知词表（body/body_part 词条）中，运行时会原样输出`,
        line: lineAt(text, m.index ?? 0),
      })
    }
  }
  for (const m of text.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\.[^}\s]+\}/g)) {
    const prefix = m[1]
    if (!KNOWN_DOTTED_PREFIXES.has(prefix)) {
      hints.push({
        level: 'hint',
        code: 'unknown-dotted-var',
        message: `{${m[1]}.…} 不在已知变量前缀（player/character/target/location/time）中`,
        line: lineAt(text, m.index ?? 0),
      })
    }
  }

  return { ok: errors.length === 0, errors, warnings, hints }
}

/* ─────────────────── 行定位工具 ─────────────────── */

export function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++
  }
  return line
}

export function locateEntryLine(text: string, entryIndex: number): number | undefined {
  let n = 0
  const re = /^\[\[entries\]\]/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (n === entryIndex) return lineAt(text, m.index)
    n++
  }
  return undefined
}

export function premiseRefs(text: string): { name: string; index: number }[] {
  const out: { name: string; index: number }[] = []
  const re = /premise\(\s*["']?([A-Za-z0-9_]+)["']?\s*\)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push({ name: m[1].toUpperCase(), index: m.index })
  }
  return out
}

export const KNOWN_DOTTED_PREFIXES = new Set([
  'player', 'character', 'target', 'location', 'time',
])