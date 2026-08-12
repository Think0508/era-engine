import { parse as parseTOML } from '@iarna/toml'
import type { PluginContext } from '../../core/types'
import { commonTextsEngine, type VariableData } from './engine'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'
import { errorReporter } from '../../core/error-reporter'

interface TomlEntry {
  context?: string
  conditions?: string
  part?: string
}

interface TomlVariable {
  variable?: string
  description?: string
  parts?: string[]
  entries?: TomlEntry[]
}

// 注释：audit-j 修复（2026-08-12）——原 eager:true 把 71.6MB raw TOML 全部静态导入：
// dev 冷启动 ~3.8s + 生产 bundle 内联 71.6MB + 与 mod-loader 懒加载重复 + pluginDefaultCache 再存一份。
// 改 eager:false 懒加载（mod-loader 的 pluginDefaultCache 已缓存 raw 字符串，此处不再重复驻留）
const defaultModules = import.meta.glob<string>(
  '/src/plugins/talk-common-system/data/default/talk-common/**/*.toml',
  { query: '?raw', import: 'default', eager: false }
)

const modModules = import.meta.glob<string>(
  '/mods/*/definitions/talk-common/**/*.toml',
  { query: '?raw', import: 'default', eager: false }
)

export function onLoad(_ctx: PluginContext): void {
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  const defaultData = await loadTomlDir(defaultModules)

  const modData: VariableData = {}
  const activeModId = modLoader.getMod()?.id
  if (activeModId) {
    const prefix = `/mods/${activeModId}/definitions/talk-common/`
    for (const [path, loader] of Object.entries(modModules)) {
      if (path.startsWith(prefix)) {
        const raw = await loader()
        const parsed = parseTOML(raw) as unknown as TomlVariable
        if (parsed.variable && Array.isArray(parsed.entries)) {
          modData[parsed.variable] = {
            parts: parsed.parts ?? [],
            description: parsed.description ?? '',
            entries: parsed.entries.map(e => ({
              context: e.context ?? '',
              conditions: e.conditions,
              part: e.part,
            })),
          }
        }
      }
    }
  }

  commonTextsEngine.loadFromData(defaultData, modData)

  ctx.api.register('talk-common', {
    replace: (text: string, targetId: string | null, actorId?: string) => commonTextsEngine.replaceAll(text, targetId, actorId),
    getText: (variable: string, targetId: string | null, actorId?: string) => commonTextsEngine.getText(variable, targetId, actorId),
    getBehaviorText: (behaviorKey: string, targetId: string | null, actorId?: string) => commonTextsEngine.getBehaviorText(behaviorKey, targetId, actorId),
    getVariables: () => commonTextsEngine.variables,
  })

  eventBus.emit('common-texts:loaded', { variables: commonTextsEngine.variables })
}

export function onDisable(_ctx: PluginContext): void {
}

async function loadTomlDir(modules: Record<string, () => Promise<string>>): Promise<VariableData> {
  const result: VariableData = {}
  for (const [path, loader] of Object.entries(modules)) {
    try {
      const raw = await loader()
      const parsed = parseTOML(raw) as unknown as TomlVariable
      if (!parsed.variable || !Array.isArray(parsed.entries)) continue
      result[parsed.variable] = {
        parts: parsed.parts ?? [],
        description: parsed.description ?? '',
        entries: parsed.entries.map(e => ({
          context: e.context ?? '',
          conditions: e.conditions,
          part: e.part,
        })),
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
    }
  }
  return result
}
