// 注释：通用指令加载器
// 从 mod 的 definitions/instructions/ 加载指令 TOML
// 支持 [effect_blocks] 复用 + effects 引用

import { commandRegistry, type CommandDef } from '../core/command-registry'
import { modLoader, type LoadedMod, type HInstruction } from '../core/mod-loader'
import type { Effect } from '../core/effect-type-registry'

interface ResolvedInstruction extends HInstruction {
  effects: Effect[]
}

interface InstructionTomlFile {
  effect_blocks?: Record<string, Effect>
  instructions?: HInstruction[]
}

function resolveEffects(
  raw: HInstruction,
  blocks: Record<string, Effect>,
): Effect[] {
  if (!raw.effects || raw.effects.length === 0) return []
  const resolved: Effect[] = []
  for (const item of raw.effects) {
    if (typeof item === 'string') {
      // 引用 effect_block
      const block = blocks[item]
      if (block) {
        resolved.push({ ...block })
      }
      continue
    }
    // 内联 effect
    resolved.push(item as Effect)
  }
  return resolved
}

export function loadInstructions(): void {
  const mod = modLoader.getMod() as LoadedMod & { instructions?: ResolvedInstruction[]; effectBlocks?: Record<string, Effect> }
  if (!mod) return
  const allInstructions = (mod as any).instructions ?? []
  if (allInstructions.length === 0) return

  const blocks = (mod as any).effectBlocks ?? {}

  for (const raw of allInstructions) {
    const resolved: ResolvedInstruction = {
      ...raw,
      effects: resolveEffects(raw, blocks),
    }

    const categoryMap: Record<string, string> = {
      daily: 'daily', obscenity: 'obscenity', sex: 'sex',
      arts: 'arts', play: 'play', work: 'work', system: 'system', social: 'social',
    }
    const category = categoryMap[raw.type] ?? 'custom'

    let modes: string[]
    if (raw.type === 'sex') modes = ['h_scene']
    else if (raw.type === 'obscenity') modes = ['exploration']
    else modes = raw.modes ?? ['exploration']

    let condition: string | undefined
    if (resolved.premises && resolved.premises.length > 0) {
      condition = `premises:${resolved.premises.join(',')}`
    }

    const cmdDef: CommandDef = {
      id: resolved.id,
      label: resolved.label,
      group: 'character_commands',
      modes,
      category,
      timeCost: resolved.time_cost ?? 30,
      priority: resolved.priority ?? 50,
      condition,
      effects: resolved.effects,
      source: 'mod:instructions',
    }
    commandRegistry.register(cmdDef)
  }
}
