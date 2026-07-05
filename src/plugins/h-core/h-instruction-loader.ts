// 注释：h-instruction-loader — 加载 mod 的 h-instructions TOML 到 CommandRegistry

import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { modLoader } from '../../core/mod-loader'

export function loadHInstructions(): void {
  const mod = modLoader.getMod()
  if (!mod || mod.hInstructions.length === 0) return

  for (const inst of mod.hInstructions) {
    // 注释：根据 type 和 sub_type 决定 modes
    let modes: string[]
    if (inst.type === 'sex') {
      modes = ['h_scene']
    } else if (inst.type === 'obscenity') {
      modes = ['exploration']
    } else {
      modes = inst.modes ?? ['exploration']
    }

    // 注释：category 映射（UI 分组）
    const categoryMap: Record<string, string> = {
      daily: 'daily', obscenity: 'obscenity', sex: 'sex',
      arts: 'arts', play: 'play', work: 'work', system: 'system',
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
      sub_category: inst.sub_type && inst.sub_type !== '0' ? inst.sub_type : undefined,
      timeCost: inst.time_cost ?? 10,
      priority: inst.priority ?? 50,
      condition,
      effects: inst.effects,
      source: 'mod:h-instructions',
    }
    commandRegistry.register(cmdDef)
  }
}
