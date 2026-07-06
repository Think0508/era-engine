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
