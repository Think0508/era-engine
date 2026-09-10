import { parse as parseTOML } from '@iarna/toml'
import type { PluginContext } from '../../core/types'
import { commonTextsEngine, CommonTextsEngine, normalizeCommonTextEntry, type VariableData } from './engine'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'
import { errorReporter } from '../../core/error-reporter'
import { conditionEngine } from '../../core/condition-engine'

interface TomlEntry {
  context?: string
  conditions?: string
  part?: string
  // ADR 0018：整体修饰字段（与行结构 display 语义对齐；白名单透传）
  style?: string
  trigger?: string
  display?: string
  speed?: number
  pause?: number
  color?: string
  size?: string
  font?: string
}

interface TomlVariable {
  variable?: string
  description?: string
  parts?: string[]
  entries?: TomlEntry[]
}

// 注释：audit-j 修复（2026-08-12）——原 eager:true 把 71.6MB raw TOML 全部静态导入：
// dev 冷启动 ~3.8s + 生产 bundle 内联 71.6MB。改 eager:false 懒加载（本插件自己 loader()
// 即取即用；B1 之后 core 的 pluginDefaultCache 不再驻留 talk-common raw 字符串——
// 见 src/core/mod-loader.ts SELF_LOADED_DATA_DIRS，此处也不重复缓存 raw）
// 注意：Vite glob 必须字面量（数据路径契约见 core/data-paths.ts：
// talkCommonDefaultRoot / talkCommonModPrefix 为文档化常量，不能在此插值）
const defaultModules = import.meta.glob<string>(
  '/src/plugins/talk-common-system/data/default/talk-common/**/*.toml',
  { import: 'default', eager: false }
)

const modModules = import.meta.glob<string>(
  '/mods/*/definitions/talk-common/**/*.toml',
  { import: 'default', eager: false }
)

// 注释（2026-09-11 惰性加载改造）——背景：默认层 331 文件 / 44MB 全量装载单次 ≈ 8.5-19.5s
// （模块实例化 + TOML.parse + 建索引），每个重集成测试文件各付一次（全套 506s 里 ~460s 在此），
// 生产启动同样付一次。改造后：
//   1. onEnable 只登记**变量名**（由文件名推导，零解析、零模块加载）；
//   2. API 边界（getText/getTextEntry/getBehaviorText/replace）按需装载涉及的变量；
//   3. 引擎本身保持同步——选择/权重/条件逻辑一行未动（回归风险最小）。
// 契约：默认层数据文件名 = 该文件内的 variable 名（talk-common-data.test.ts 全量守卫）。
const DEFAULT_PREFIX = '/src/plugins/talk-common-system/data/default/talk-common/'
const MOD_TALK_PREFIX = '/mods/'
const MOD_TALK_SUFFIX = '/definitions/talk-common/'

// 注释：按路径的解析缓存（模块生命周期内有效）——同一变量重复查询不再重解析；
// 注意模块图随 vitest isolate 每文件重置，故它只省"同一文件内重复查询"。
const parseCache = new Map<string, VariableData>()
// 已确定"装载过（含装载失败/变量不存在）"的名字——避免每次查询重复尝试
const resolved = new Set<string>()
// 正在装载中的变量（并发查询同一变量时共享同一个 Promise——否则后到者会读到"未装载"）
const loading = new Map<string, Promise<void>>()

/** 默认层：变量名 → 相对路径（如 behavior/daily/chat.toml） */
function buildDefaultIndex(): Map<string, string> {
  const out = new Map<string, string>()
  for (const key of Object.keys(defaultModules)) {
    const rel = key.startsWith(DEFAULT_PREFIX) ? key.slice(DEFAULT_PREFIX.length) : key
    out.set(variableOfRel(rel), rel)
  }
  return out
}

/** mod 层：变量名 → glob key（仅当前 mod） */
function buildModIndex(): Map<string, string> {
  const out = new Map<string, string>()
  const activeModId = modLoader.getMod()?.id
  if (!activeModId) return out
  const prefix = `${MOD_TALK_PREFIX}${activeModId}${MOD_TALK_SUFFIX}`
  for (const key of Object.keys(modModules)) {
    if (!key.startsWith(prefix)) continue
    out.set(variableOfRel(key.slice(prefix.length)), key)
  }
  return out
}

/** 相对路径 → 变量名（契约：文件名 = 变量名） */
function variableOfRel(rel: string): string {
  const file = rel.split('/').pop() ?? rel
  return file.replace(/\.toml$/, '')
}

const defaultIndex = buildDefaultIndex()
let modIndex = buildModIndex()

/** 惰性装载：把涉及的名字补齐（不存在的名字跳过并记账） */
async function ensureVariables(names: string[]): Promise<void> {
  const pending: Promise<void>[] = []
  for (const name of names) {
    if (!name || commonTextsEngine.isLoadedVariable(name)) continue
    const inflight = loading.get(name)
    if (inflight) { pending.push(inflight); continue }
    if (resolved.has(name)) continue
    const task = loadVariable(name).finally(() => { loading.delete(name) })
    loading.set(name, task)
    pending.push(task)
  }
  if (pending.length > 0) await Promise.all(pending)
}

/** 装载单个变量（默认层 + mod 层覆盖；失败/不存在则记账后跳过） */
async function loadVariable(name: string): Promise<void> {
  resolved.add(name)
  const defs: VariableData = {}
  const rel = defaultIndex.get(name)
  if (rel) {
    const data = await parseFileCached(defaultModules[DEFAULT_PREFIX + rel], DEFAULT_PREFIX + rel)
    if (data) Object.assign(defs, data)
  }
  const modKey = modIndex.get(name)
  if (modKey) {
    // mod 层覆盖默认层（同 variable 后者胜）
    const data = await parseFileCached(modModules[modKey], modKey)
    if (data) Object.assign(defs, data)
  }
  const def = defs[name]
  if (!def) return
  commonTextsEngine.insertVariable(name, def)
  warmConditions(def)
}

/** 全量装载（校验/预热路径；talk-common.loadAll API） */
async function loadAllVariables(): Promise<number> {
  const names = commonTextsEngine.knownVariables
  await ensureVariables(names)
  return commonTextsEngine.variables.length
}

/** 装载后立即预热该变量的条件表达式（原实现是一次性 warm 5288 条，需全量数据） */
function warmConditions(def: VariableData[string]): void {
  const exprs = new Set<string>()
  for (const e of def.entries) {
    const conds = Array.isArray(e.conditions) ? e.conditions : (e.conditions ? [e.conditions] : [])
    for (const cond of conds) if (cond) exprs.add(cond)
  }
  if (exprs.size > 0) conditionEngine.warm(exprs)
}

async function parseFileCached(loader: (() => Promise<string>) | undefined, path: string): Promise<VariableData | null> {
  const cached = parseCache.get(path)
  if (cached) return cached
  if (!loader) {
    errorReporter.report({
      source: 'talk-common-system', severity: 'error', file: path,
      message: `口上数据文件缺失（glob 表无此路径）：${path}`,
      suggestion: '检查 talk-common 数据目录与文件命名契约（文件名 = variable）',
    })
    return null
  }
  const data = await parseFile(loader, path)
  if (data) parseCache.set(path, data)
  return data
}

// 注释：C1——mod 口上数据重载（game:mod_loaded 由 mod-loader loadMod 发出）：
// 启动时序 loadMod 先于插件 onEnable → 启动时本监听未注册，不重复加载；
// 运行期再次 loadMod（测试/未来热切换）→ 重建 mod 索引，并把**已装载**的变量重新装载
// （mod 覆盖即时生效；未装载的变量下次查询时自然走新索引）。
async function onModLoaded(): Promise<void> {
  modIndex = buildModIndex()
  for (const key of [...parseCache.keys()]) {
    if (key.startsWith(MOD_TALK_PREFIX)) parseCache.delete(key)
  }
  const loaded = commonTextsEngine.variables
  for (const name of loaded) resolved.delete(name)
  await ensureVariables(loaded)
}
function registerModReloadListener(): void {
  eventBus.off('game:mod_loaded', onModLoaded)
  eventBus.on('game:mod_loaded', onModLoaded)
}

export function onLoad(_ctx: PluginContext): void {
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  // 惰性模式：只登记变量名（默认层 + 当前 mod 层），不解析任何文件
  commonTextsEngine.markKnown(defaultIndex.keys())
  commonTextsEngine.markKnown(modIndex.keys())

  ctx.api.register('talk-common', {
    // 注意：以下均为 async（惰性装载在 API 边界）——调用方一律走 ctx.api.call（Promise 契约）
    replace: async (text: string, targetId: string | null, actorId?: string) => {
      // 先装载文本里引用的变量；替换结果可能引入**新的** {var}（嵌套口上），故最多 3 轮
      let out = text
      for (let pass = 0; pass < 3; pass++) {
        await ensureVariables(CommonTextsEngine.extractVariableRefs(out))
        const next = commonTextsEngine.replaceAll(out, targetId, actorId)
        if (next === out) break
        out = next
      }
      return out
    },
    getText: async (variable: string, targetId: string | null, actorId?: string) => {
      await ensureVariables(commonTextsEngine.requiredVariables(variable))
      return commonTextsEngine.getText(variable, targetId, actorId)
    },
    // ADR 0018：富文本查询（文本 + 整体修饰字段）；getText 为其文本视图
    getTextEntry: async (variable: string, targetId: string | null, actorId?: string) => {
      await ensureVariables(commonTextsEngine.requiredVariables(variable))
      return commonTextsEngine.getTextEntry(variable, targetId, actorId)
    },
    getBehaviorText: async (behaviorKey: string, targetId: string | null, actorId?: string) => {
      await ensureVariables(CommonTextsEngine.behaviorVariableKeys(behaviorKey))
      return commonTextsEngine.getBehaviorText(behaviorKey, targetId, actorId)
    },
    // 已知变量名（含未加载——惰性模式下"全部口上变量"即此集合）
    getVariables: () => commonTextsEngine.knownVariables,
    // 全量装载（数据校验/预热用）：返回装载后的变量数
    loadAll: () => loadAllVariables(),
  })

  registerModReloadListener()
}

async function parseFile(loader: () => Promise<string>, path: string): Promise<VariableData | null> {
  try {
    const raw = await loader()
    const parsed = parseTOML(raw) as unknown as TomlVariable
    if (!parsed.variable || !Array.isArray(parsed.entries)) return null
    return {
      [parsed.variable]: {
        parts: parsed.parts ?? [],
        description: parsed.description ?? '',
        // 注释：B3——解析后即归一化（premiseRefs/hasUnconsciousRef 预计算），
        // 缓存/重载路径的 loadFromData 幂等短路直接别名，不重跑 203k 正则
        entries: parsed.entries.map(e => normalizeCommonTextEntry({
          context: e.context ?? '',
          conditions: e.conditions,
          part: e.part,
          style: e.style,
          trigger: e.trigger as 'auto' | 'click' | undefined,
          display: e.display as 'instant' | 'typewriter' | undefined,
          speed: e.speed,
          pause: e.pause,
          color: e.color,
          size: e.size,
          font: e.font,
        })),
      },
    }
  } catch (err) {
    // 注释：audit-j 修复——原 catch{continue} 吞解析错误（违反错误处理铁律，
    // 损坏文件静默丢失整条口上变量）
    errorReporter.report({
      source: 'talk-common-system',
      severity: 'warning',
      file: path,
      message: `口上数据解析失败：${err instanceof Error ? err.message : String(err)}`,
      suggestion: '检查该 TOML 的语法/结构（variable + entries 必填）',
    })
    return null
  }
}
