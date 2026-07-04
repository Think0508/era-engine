// 注释：h-instruction-loader — 加载 mod 的 h-instructions TOML 到 CommandRegistry

import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { modLoader } from '../../core/mod-loader'

export function loadHInstructions(): void {
  const mod = modLoader.getMod()
  if (!mod || mod.hInstructions.length === 0) return

  for (const inst of mod.hInstructions) {
    const modes = inst.type === 'sex' ? ['h_scene'] : inst.modes ?? ['exploration']
    const categoryMap: Record<string, string> = {
      daily: 'daily', obscenity: 'obscenity', sex: 'sex',
      play: 'daily', work: 'daily', system: 'system',
    }
    const category = categoryMap[inst.type] ?? 'custom'
    let condition: string | undefined
    if (inst.premises && inst.premises.length > 0) {
      condition = `premises:${inst.premises.join(',')}`
    }
    const cmdDef: CommandDef = {
      id: `h_${inst.id}`,
      label: inst.label,
      group: 'character_commands',
      modes,
      category,
      timeCost: inst.time_cost ?? 10,
      priority: inst.priority ?? 50,
      condition,
      effects: inst.effects,
      source: 'mod:h-instructions',
    }
    commandRegistry.register(cmdDef)
  }
}
