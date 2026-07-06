import { parse as parseTOML } from '@iarna/toml'
import type { PluginContext } from '../../core/types'
import { commonTextsEngine, type VariableData } from './engine'
import { eventBus } from '../../core/event-bus'
import { modLoader } from '../../core/mod-loader'

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

const defaultModules = import.meta.glob<string>(
  '/src/plugins/talk-common-system/data/default/talk-common/**/*.toml',
  { query: '?raw', import: 'default', eager: true }
)

const modModules = import.meta.glob<string>(
  '/mods/*/definitions/talk-common/**/*.toml',
  { query: '?raw', import: 'default', eager: false }
)

export function onLoad(_ctx: PluginContext): void {
}

export async function onEnable(ctx: PluginContext): Promise<void> {
  const defaultData = loadTomlDir(defaultModules)

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
    replace: (text: string, targetId: string | null) => commonTextsEngine.replaceAll(text, targetId),
    getText: (variable: string, targetId: string | null) => commonTextsEngine.getText(variable, targetId),
    getVariables: () => commonTextsEngine.variables,
  })

  eventBus.emit('common-texts:loaded', { variables: commonTextsEngine.variables })
}

export function onDisable(_ctx: PluginContext): void {
}

function loadTomlDir(modules: Record<string, string>): VariableData {
  const result: VariableData = {}
  for (const raw of Object.values(modules)) {
    try {
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
    } catch {
      continue
    }
  }
  return result
}
