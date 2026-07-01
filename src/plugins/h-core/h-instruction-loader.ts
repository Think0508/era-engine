// 注释：h-instruction-loader — 加载 mod 的 h-instructions TOML 到 CommandRegistry
// 将 HInstruction（来自 mod-loader）转为 CommandDef 注册

import { commandRegistry, type CommandDef } from '../../core/command-registry'
import { modLoader } from '../../core/mod-loader'

export function loadHInstructions(): void {
  const mod = modLoader.getMod()
  if (!mod || mod.hInstructions.length === 0) return

  for (const inst of mod.hInstructions) {
    // 注释：确定 modes——sex 类指令在 h_scene 模式，其他在 exploration
    const modes = inst.type === 'sex' ? ['h_scene'] : inst.modes ?? ['exploration']

    // 注释：构建 premises 条件字符串（供 premiseRegistry 求值）
    let condition: string | undefined
    if (inst.premises && inst.premises.length > 0) {
      condition = `premises:${inst.premises.join(',')}`
    }

    const cmdDef: CommandDef = {
      id: `h_${inst.id}`,
      label: inst.label,
      group: 'character_commands',
      modes,
      priority: inst.priority ?? 50,
      condition,
      effects: inst.effects,
      source: 'mod:h-instructions',
    }
    commandRegistry.register(cmdDef)
  }
}
