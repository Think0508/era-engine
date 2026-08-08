// 注释：T2 全量数据校验——talk-common 地文的每个条件都必须"可求值"
// 目标：把"数据里的前提未注册/表达式字段不存在"的静默失效变成测试失败
// （前提：premiseRegistry.getRegisteredIds 包含；表达式：conditionRegistry.validateExpression）

import { describe, it, expect, beforeAll } from 'vitest'
import { parse as parseTOML } from '@iarna/toml'
import { modLoader } from '../core/mod-loader'
import { premiseRegistry } from '../core/premise-registry'
import { conditionRegistry } from '../core/condition-registry'
import { registerFallPremises } from './h-core/premise/premise-fall'
import { registerHPremises } from './h-core/premise/premise-h'
import { registerTargetPremises } from './h-core/premise/premise-target'
import { registerClothingPremises } from './h-core/premise/premise-clothing'
import { registerBodyItemPremises } from './h-core/premise/premise-body-item'
import { registerInstructPremises } from './h-core/premise/premise-instruct'

// 注释：与 talk-common index.ts loadTomlDir 相同的数据收集逻辑（避免跨插件耦合）
const defaultModules = import.meta.glob<string>(
  '/src/plugins/talk-common-system/data/default/talk-common/**/*.toml',
  { query: '?raw', import: 'default', eager: true }
)

interface TomlEntry { context?: string; conditions?: string; part?: string }
interface TomlVariable { variable?: string; parts?: string[]; entries?: TomlEntry[] }

function collectConditions(): string[] {
  const out: string[] = []
  for (const raw of Object.values(defaultModules)) {
    const parsed = parseTomlVariable(raw)
    for (const v of Object.values(parsed)) {
      for (const e of v.entries ?? []) {
        if (e.conditions) out.push(e.conditions)
      }
    }
  }
  return out
}

// 注释：完整 TOML 解析（T9 升级——原 parseTomlLite 只提取 conditions 行，
// description 损坏的行会静默通过——实际 loadTomlDir 的 parse 失败被 catch 跳过）
function parseTomlVariable(raw: string): Record<string, TomlVariable> {
  const parsed = parseTOML(raw) as unknown as TomlVariable & Record<string, TomlVariable>
  // 单文件内只有一个 variable（或 body_part 合并）——返回 {variable: {...}}
  const out: Record<string, TomlVariable> = {}
  if (parsed.variable && Array.isArray(parsed.entries)) {
    out[parsed.variable] = { variable: parsed.variable, parts: parsed.parts, entries: parsed.entries }
  }
  return out
}

describe('T2 talk-common 全量数据校验', () => {
  beforeAll(async () => {
    await modLoader.loadMod('test-mod')
    // 注释：h-core 全部前提注册（镜像 h-core onEnable 顺序）
    registerHPremises(premiseRegistry)
    registerTargetPremises(premiseRegistry)
    registerFallPremises(premiseRegistry)
    registerClothingPremises(premiseRegistry)
    registerBodyItemPremises(premiseRegistry)
    registerInstructPremises(premiseRegistry)
  })

  it('数据文件可解析（完整 TOML 解析——description 损坏即失败）', () => {
    // 注释：T9 升级——原轻量解析会放过损坏文件（loadTomlDir 的 catch 静默跳过）；
    // 完整 parse 失败 → 测试失败，静默缺失变可检测
    const files = Object.values(defaultModules)
    const bad: string[] = []
    for (const raw of files) {
      try {
        parseTOML(raw)
      } catch (err) {
        bad.push(err instanceof Error ? err.message.split('\n')[0] : String(err))
      }
    }
    expect(bad.slice(0, 10)).toEqual([])
    // 逐文件解析并合并（文件间 variable 独立）
    const vars: Record<string, TomlVariable> = {}
    for (const raw of Object.values(defaultModules)) {
      Object.assign(vars, parseTomlVariable(raw))
    }
    // 至少包含 H 行为地文（penis_in_vagina）与部位短词（vagina_s）
    expect(Object.keys(vars).length).toBeGreaterThan(50)
    expect(vars['action_A_penis_in_vagina']?.entries?.length).toBeGreaterThan(100)
    expect(vars['vagina_s']?.entries?.length).toBeGreaterThan(10)
  })

  it('全部 premises: 前提均已注册（静默失效检测）', () => {
    const registered = new Set(premiseRegistry.getRegisteredIds())
    const conditions = collectConditions()
    const unknown = new Set<string>()
    for (const cond of conditions) {
      // 提取 premises:XXX&YYY 段（混合格式也支持）
      for (const m of cond.matchAll(/premises:([^&"]+)/g)) {
        const id = m[1].trim()
        // 注释：前提名大小写不敏感（premiseRegistry 注册时 lower 化）
        if (id && !registered.has(id.toLowerCase())) unknown.add(id)
      }
    }
    expect([...unknown].sort()).toEqual([])
  })

  it('全部条件表达式的字段路径可校验（conditionRegistry.validateExpression）', () => {
    const conditions = collectConditions()
    const bad: string[] = []
    for (const cond of conditions) {
      // 表达式段 = 非 premises: 前缀的 & 分段（且非空）
      for (const part of cond.split('&')) {
        const p = part.trim()
        if (!p || p.startsWith('premises:')) continue
        const { ok, unknown } = conditionRegistry.validateExpression(p)
        if (!ok) bad.push(`${p} -> ${unknown.join(',')}`)
      }
    }
    expect(bad.slice(0, 20)).toEqual([])
  })
})
