/**
 * 渲染预览：把当前 entries 池渲染成可读列表 + 随机抽样（忽略条件）+ mock 插值。
 * 纯展示，绝不改写编辑文本。
 */

/** 行为口上整体修饰字段（ADR 0018）：预览透传 */
export interface PreviewDisplay {
  style?: string
  trigger?: 'auto' | 'click'
  display?: 'instant' | 'typewriter'
  speed?: number
  pause?: number
  color?: string
  size?: string
  font?: string
}

export interface PreviewEntry extends PreviewDisplay {
  conditions: string
  context: string
}

const DISPLAY_KEYS: (keyof PreviewDisplay)[] = [
  'style', 'trigger', 'display', 'speed', 'pause', 'color', 'size', 'font',
]

export const MOCK_CONTEXT: Record<string, Record<string, string>> = {
  player: { name: '博士' },
  character: { name: '令狐冲', nickname: '师弟' },
  target: { name: '岳灵珊', nickname: '师兄' },
  location: { name: '华山剑坪' },
  time: { hour: '14', minute: '30' },
}

export const MOCK_WORDS: Record<string, string> = {
  penis: '肉棒',
  vagina: '小穴',
  breast: '胸脯',
  mouth: '嘴',
  anal: '后庭',
  legs: '双腿',
  hair: '发梢',
  face: '脸颊',
  hands: '手',
  feet: '脚',
}

let parsePromise: Promise<(str: string) => Record<string, any>> | null = null
function tomlParse(): Promise<(str: string) => Record<string, any>> {
  if (!parsePromise) {
    parsePromise = import('@iarna/toml/parse-string.js').then((m) => m.default ?? (m as any))
  }
  return parsePromise
}

/** 解析文本 → entries 列表（结构损坏返回 error，不抛出） */
export async function parseEntriesPreview(text: string): Promise<{ entries: PreviewEntry[]; error?: string }> {
  try {
    const parse = await tomlParse()
    const doc = parse(text) as { entries?: unknown[] }
    const entries: PreviewEntry[] = []
    for (const e of doc.entries ?? []) {
      if (e && typeof e === 'object') {
        const rec = e as Record<string, unknown>
        const entry: PreviewEntry = {
          conditions: typeof rec.conditions === 'string' ? rec.conditions : '',
          context: typeof rec.context === 'string' ? rec.context : String(rec.context ?? ''),
        }
        for (const k of DISPLAY_KEYS) {
          const v = rec[k]
          if (v !== undefined) (entry as unknown as Record<string, unknown>)[k] = v
        }
        entries.push(entry)
      }
    }
    return { entries }
  } catch {
    return { entries: [], error: 'TOML 解析失败，无法预览' }
  }
}

/** mock 插值：{obj.prop} 查表；{word} 查词表；未知保留原样 */
export function interpolatePreview(text: string): string {
  return text
    .replace(/\{([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z0-9_.]+\}/g, (full) => {
      const path = full.slice(1, -1).split('.')
      let cur: unknown = MOCK_CONTEXT[path[0]]
      for (const seg of path.slice(1)) {
        if (!cur || typeof cur !== 'object') return full
        cur = (cur as Record<string, unknown>)[seg]
        if (cur === undefined) return full
      }
      return typeof cur === 'string' ? cur : full
    })
    .replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (full, word) => MOCK_WORDS[word] ?? full)
}

export function randomPick(entries: PreviewEntry[]): string | null {
  if (entries.length === 0) return null
  return entries[Math.floor(Math.random() * entries.length)].context
}