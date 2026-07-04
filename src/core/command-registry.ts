// 注释：CommandRegistry 是指令的 single source of truth

export type CommandGroup = 'location_commands' | 'character_commands' | 'main_menu'

export interface CommandDef {
  id: string
  label: string
  group: CommandGroup
  modes: string[]
  category?: string
  timeCost?: number
  condition?: string
  priority?: number
  effects?: any[]
  handler?: (ctx: any) => void | Promise<void>
  source: string
}

export class CommandRegistry {
  private commands = new Map<string, CommandDef>()

  register(cmd: CommandDef): void {
    if (this.commands.has(cmd.id)) {
      throw new Error(`CommandRegistry: 指令 id='${cmd.id}' 已存在（来源：${cmd.source}）`)
    }
    this.commands.set(cmd.id, cmd)
  }

  unregister(id: string): void {
    this.commands.delete(id)
  }

  getById(id: string): CommandDef | undefined {
    return this.commands.get(id)
  }

  getByGroup(group: CommandGroup): CommandDef[] {
    const result: CommandDef[] = []
    for (const cmd of this.commands.values()) {
      if (cmd.group === group) result.push(cmd)
    }
    return result.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  }

  getByMode(mode: string, group?: CommandGroup): CommandDef[] {
    const result: CommandDef[] = []
    for (const cmd of this.commands.values()) {
      if (!cmd.modes.includes(mode)) continue
      if (group && cmd.group !== group) continue
      result.push(cmd)
    }
    return result.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  }

  clear(): void {
    this.commands.clear()
  }

  getAll(): CommandDef[] {
    return Array.from(this.commands.values())
  }
}

export const commandRegistry = new CommandRegistry()
