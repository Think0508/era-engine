export interface CommonTextRawEntry {
  context: string
  conditions?: string
  part?: string
}

export interface CommonTextRawVariable {
  variable: string
  description?: string
  parts?: string[]
  entries: CommonTextRawEntry[]
}

export interface CommonTextEntry {
  context: string
  conditions: string[]
  part?: string
  /** 加载期预计算：条件引用的前提列表（weightAllToOne 权重用——免运行时正则提取） */
  premiseRefs: string[]
  /** 加载期预计算：条件是否含 unconscious 引用（无意识过滤检查用——免运行时正则） */
  hasUnconsciousRef: boolean
}

export interface CommonTextVariable {
  variable: string
  description: string
  parts: string[]
  entries: CommonTextEntry[]
}

export interface CommonTextIndex {
  [variable: string]: CommonTextVariable
}
