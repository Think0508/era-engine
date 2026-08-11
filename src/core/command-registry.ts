// 注释：CommandRegistry 是指令的 single source of truth

export type CommandGroup = 'location_commands' | 'character_commands' | 'main_menu'

export interface CommandDef {
  id: string
  label: string
  group: CommandGroup
  modes: string[]
  category?: string
  sub_category?: string  // 子系统分类（foreplay/insert/item/drug/sm/wait_upon 等）
  timeCost?: number
  // 注释：实时结算模式——"rest" 不积累疲劳（恢复走 effects）/ "sleep" 额外 2 倍削减疲劳
  // + 熟睡值积累 + 体力/气力公式恢复（erArk settle_sleep）。由指令 TOML settle_mode 驱动
  settleMode?: 'rest' | 'sleep'
  // 注释：跨天推进到目标小时（0-23）——advance_to_hour 字段驱动（睡觉到次日 6:00 等）
  advanceToHour?: number
  premises?: string[]   // 前提 ID 列表（premiseRegistry 求值；位置前提已迁到 condition）
  condition?: string
  priority?: number
  effects?: any[]
  handler?: (ctx: any) => void | Promise<void>
  source: string
  tags?: string[]       // 多标签（system:/kind:/part:，驱动 UI 分组/插件过滤，L1.6 spec §3）
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
