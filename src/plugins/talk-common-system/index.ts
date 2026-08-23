import { parse as parseTOML } from '@iarna/toml'
import type { PluginContext } from '../../core/types'
import { commonTextsEngine, normalizeCommonTextEntry, type VariableData } from './engine'
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

// 注释：B2——默认层解析结果缓存（2026-08-15）。TOML.parse 全量（168 文件 / 73MB）
// ≈ 1.8s，onEnable 重复执行（测试反复启用/插件重载）不再重复解析。
// 缓存内容为归一化后的条目（B3：normalizeCommonTextEntry 输出，premiseRefs/
// hasUnconsciousRef 已预计算）——loadFromData 幂等短路直接别名，不重跑 203k 正则。
// 默认层内容静态（不 HMR，AGENTS §28 只监听 /mods/**），模块生命周期内有效；
// mod 层数据量小（几 KB 级），每次现解析保证最新，不走缓存。
const parseCache = new Map<string, VariableData>()

// 注释：C1——mod 口上数据重载（game:mod_loaded 由 mod-loader loadMod 发出）：
// 启动时序 loadMod 先于插件 onEnable → 启动时本监听未注册，不重复加载；
// 运行期再次 loadMod（测试/未来热切换）→ 重载当前 mod 的口上数据。
// 注册采用 off-then-on 幂等：onEnable 重复执行不重复监听（先移除旧监听）；
// eventBus.clear()（测试隔离）清掉监听后，下次 onEnable 自动补注册（自愈）。
// 注：plugin-manager 无 onDisable 生命周期（仅 onLoad/onEnable），故不做注销逻辑。
async function onModLoaded(): Promise<void> {
  const defaultData = await loadTomlDir(defaultModules, parseCache)
  const modData = await loadActiveModData()
  commonTextsEngine.loadFromData(defaultData, modData)
}
function registerModReloadListener(): void {
  eventBus.off('game:mod_loaded', onModLoaded)
  eventBus.on('game:mod_loaded', onModLoaded)
}

export function onLoad(_ctx: PluginContext): void {
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  const defaultData = await loadTomlDir(defaultModules, parseCache)
  const modData = await loadActiveModData()

  commonTextsEngine.loadFromData(defaultData, modData)

  // 注释：A4——加载期 AST 预热（去重条件全部预编译，把首句口上的解析冷启动
  // 摊到加载期；talk-common 数据 203k 条仅 5,232 个去重表达式）
  const exprs = new Set<string>()
  for (const def of Object.values(defaultData)) {
    for (const e of def.entries) {
      const conds = Array.isArray(e.conditions) ? e.conditions : (e.conditions ? [e.conditions] : [])
      for (const cond of conds) {
        if (cond) exprs.add(cond)
      }
    }
  }
  for (const def of Object.values(modData)) {
    for (const e of def.entries) {
      const conds = Array.isArray(e.conditions) ? e.conditions : (e.conditions ? [e.conditions] : [])
      for (const cond of conds) {
        if (cond) exprs.add(cond)
      }
    }
  }
  conditionEngine.warm(exprs)

  ctx.api.register('talk-common', {
    replace: (text: string, targetId: string | null, actorId?: string) => commonTextsEngine.replaceAll(text, targetId, actorId),
    getText: (variable: string, targetId: string | null, actorId?: string) => commonTextsEngine.getText(variable, targetId, actorId),
    // ADR 0018：富文本查询（文本 + 整体修饰字段）；getText 为其文本视图
    getTextEntry: (variable: string, targetId: string | null, actorId?: string) => commonTextsEngine.getTextEntry(variable, targetId, actorId),
    getBehaviorText: (behaviorKey: string, targetId: string | null, actorId?: string) => commonTextsEngine.getBehaviorText(behaviorKey, targetId, actorId),
    getVariables: () => commonTextsEngine.variables,
  })

  registerModReloadListener()
}

async function loadActiveModData(): Promise<VariableData> {
  const modData: VariableData = {}
  const activeModId = modLoader.getMod()?.id
  if (!activeModId) return modData
  const prefix = `/mods/${activeModId}/definitions/talk-common/`
  for (const [path, loader] of Object.entries(modModules)) {
    if (!path.startsWith(prefix)) continue
    const data = await parseFile(loader, path)
    if (data) Object.assign(modData, data)
  }
  return modData
}

async function loadTomlDir(modules: Record<string, () => Promise<string>>, cache: Map<string, VariableData>): Promise<VariableData> {
  const result: VariableData = {}
  for (const [path, loader] of Object.entries(modules)) {
    const cached = cache.get(path)
    if (cached) {
      Object.assign(result, cached)
      continue
    }
    const data = await parseFile(loader, path)
    if (data) {
      cache.set(path, data)
      Object.assign(result, data)
    }
  }
  return result
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
          trigger: e.trigger,
          display: e.display,
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
