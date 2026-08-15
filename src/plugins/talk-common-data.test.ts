// 注释：T2 全量数据校验——talk-common 地文的每个条件都必须"可求值"
// 目标：把"数据里的前提未注册/表达式字段不存在"的静默失效变成测试失败
// （前提：conditionEngine.getRegisteredPremiseIds 包含；表达式：conditionRegistry.validateExpression）

import { conditionEngine, extractPremiseRefs } from '../core/condition-engine'
import { describe, it, expect, beforeAll } from 'vitest'
import { parse as parseTOML } from '@iarna/toml'
import { modLoader } from '../core/mod-loader'
import { gameContext } from '../core/game-context'
import { conditionRegistry } from '../core/condition-registry'
import { entitySystem } from '../core/entity-system'
import { CommonTextsEngine } from './talk-common-system/engine'
import { registerFallPremises } from './h-core/premise/premise-fall'
import { registerHPremises } from './h-core/premise/premise-h'
import { registerTargetPremises } from './h-core/premise/premise-target'
import { registerClothingPremises } from './h-core/premise/premise-clothing'
import { registerBodyItemPremises } from './h-core/premise/premise-body-item'
import { registerInstructPremises } from './h-core/premise/premise-instruct'
// ★ 修复（第七轮）：镜像 sleep-system onLoad——数据引用 target_sleep_h_awake_but_pretend_sleep
// 等（7700+ 条），真语义在 sleep-system（h-core placeholder 已移除——onEnable 注册会覆盖
// onLoad 真语义，见 premise-instruct.ts 注释）
import { registerSleepPremises } from './sleep-system/premise/sleep'
// ★ 修复（confinement 落地）：数据引用 t_imprisonment_1（监狱情境地文），真语义在
// confinement-system onEnable 注册（h-core placeholder 已移除——onLoad 注册会被 sleep-system
// 等后注册覆盖，见 premises.ts 注释）——镜像注册
import { registerConfinementPremises } from './confinement-system/premises'

// 注释：与 talk-common index.ts loadTomlDir 相同的数据收集逻辑（避免跨插件耦合）
const defaultModules = import.meta.glob<string>(
  '/src/plugins/talk-common-system/data/default/talk-common/**/*.toml',
  { import: 'default', eager: true }
)

interface TomlEntry { context?: string; conditions?: string; part?: string }
interface TomlVariable { variable?: string; description?: string; parts?: string[]; entries?: TomlEntry[] }

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
    registerHPremises(conditionEngine)
    registerTargetPremises(conditionEngine)
    registerFallPremises(conditionEngine)
    registerClothingPremises(conditionEngine)
    registerBodyItemPremises(conditionEngine)
    registerInstructPremises(conditionEngine)
    registerSleepPremises(conditionEngine)
    registerConfinementPremises(conditionEngine)
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

  it('全部 premise(X) 引用均已注册（静默失效检测）', () => {
    const registered = new Set(conditionEngine.getRegisteredPremiseIds())
    const conditions = collectConditions()
    const unknown = new Set<string>()
    for (const cond of conditions) {
      for (const id of extractPremiseRefs(cond)) {
        // 注释：前提名大小写不敏感（conditionEngine 注册时 lower 化）
        if (id && !registered.has(id.toLowerCase())) unknown.add(id)
      }
    }
    expect([...unknown].sort()).toEqual([])
  })

  it('全部条件表达式运行时求值不抛（新引擎语法冒烟——解析失败=静默淘汰行）', () => {
    const conditions = collectConditions()
    const throwing: string[] = []
    const gc = gameContext.getContext()
    for (const cond of conditions) {
      try {
        const r = conditionEngine.evaluate(cond, gc)
        if (typeof r !== 'boolean') throwing.push(`${cond} -> 非布尔结果 ${typeof r}`)
      } catch (err) {
        throwing.push(`${cond} -> ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    expect(throwing.slice(0, 20)).toEqual([])
  })

  it('全部条件表达式的字段路径可校验（conditionRegistry.validateExpression）', () => {
    const conditions = collectConditions()
    const bad: string[] = []
    for (const cond of conditions) {
      // 注释：完整表达式校验（premise(X) 命名引用与字段路径一并校验）
      const { ok, unknown } = conditionRegistry.validateExpression(cond)
      if (!ok) bad.push(`${cond} -> ${unknown.join(',')}`)
    }
    expect(bad.slice(0, 20)).toEqual([])
  })

  it('真实数据热路径基准（warm getBehaviorText，宽松阈值守回归）', () => {
    // 注释：最重的行为地文调用（penis_in_anal = 5 段变量 × ~6500 条 = 约 3.2 万条目求值）
    const vars: Record<string, { parts: string[]; description: string; entries: any[] }> = {}
    for (const raw of Object.values(defaultModules)) {
      const parsed = parseTomlVariable(raw)
      for (const [name, v] of Object.entries(parsed)) {
        vars[name] = { parts: v.parts ?? [], description: v.description ?? '', entries: v.entries ?? [] }
      }
    }
    const engine = new CommonTextsEngine()
    engine.loadFromData(vars, {})

    engine.getBehaviorText('penis_in_anal', null)
    const t0 = performance.now()
    engine.getBehaviorText('penis_in_anal', null)
    const ms = performance.now() - t0

    console.log(`[perf-real] getBehaviorText('penis_in_anal') = ${ms.toFixed(0)}ms`)
    expect(ms).toBeLessThan(2000)
  })

  it('AST 重排等价性（reorder 开关前后全量 203k 条件求值结果一致）', () => {
    // 注释：A2（2026-08-15）——布尔交换律重排 && / || 操作数（前提/字面量换到路径前）。
    // 语义必须逐条等价：关闭重排（旧 AST）→ 开启重排（新 AST）→ 同一上下文逐条对比。
    // 上下文充实化（审查补强）：注册实体让路径可解析为真、前提有通过有失败——
    // 真实覆盖"交换后短路"路径，而非全 false 退化对比
    entitySystem.register('character', 'eq_target', {
      id: 'eq_target',
      base: { 好感度: 60, 体力: 100, 魅力: 50 },
      talents: { 幼女: 1, 剑骨: 1 },
      sp_flag: {},
      first_times: { 初体验: 1 },
    })
    gameContext.setPlayer('eq_target')
    gameContext.setSelectedCharacterId('eq_target')

    const conditions = collectConditions()
    const gc = gameContext.getContext()
    const registerAll = () => {
      registerHPremises(conditionEngine)
      registerTargetPremises(conditionEngine)
      registerFallPremises(conditionEngine)
      registerClothingPremises(conditionEngine)
      registerBodyItemPremises(conditionEngine)
      registerInstructPremises(conditionEngine)
      registerSleepPremises(conditionEngine)
      registerConfinementPremises(conditionEngine)
    }

    conditionEngine.reorderEnabled = false
    conditionEngine.clear()
    registerAll()
    const before = conditions.map(c => conditionEngine.evaluate(c, gc))

    conditionEngine.reorderEnabled = true
    conditionEngine.clear()
    registerAll()
    const after = conditions.map(c => conditionEngine.evaluate(c, gc))

    const diffs: string[] = []
    for (let i = 0; i < before.length; i++) {
      if (before[i] !== after[i]) diffs.push(`${conditions[i]} -> ${before[i]} / ${after[i]}`)
    }
    expect(diffs.slice(0, 10)).toEqual([])
  })
})
