// 注释：CommandRegistry 是指令的 single source of truth
// 插件通过 plugin.toml [ui] 段声明指令 → plugin-manager 注册到 CommandRegistry
// 原生指令通过 native-commands.ts 注册到 CommandRegistry
// CommandBar 从 CommandRegistry 读取指令来渲染
// source 字段标记来源（native/plugin:xxx），为 mod override 留接口

export type CommandGroup = 'location_commands' | 'character_commands' | 'main_menu'

export interface CommandDef {
  // 注释：稳定字符串 ID，用于自动化脚本
  id: string
  label: string
  // 注释：location_commands/character_commands = Act_COM，main_menu = Ex_COM
  group: CommandGroup
  // 注释：指令在哪些模式下显示（如 exploration/combat/daily_menu）
  modes: string[]
  // 注释：指令分类——用于指令栏分组显示
  category?: string   // favorite/daily/obscenity/sex/combat/system/custom 等
  // 注释：可选条件表达式字符串，运行时求值
  condition?: string
  // 注释：排序优先级，数字越小越靠前，默认 0
  priority?: number
  // 注释：数据驱动指令——effect 数组（Phase 9 effect-system 接入）
  effects?: any[]
  // 注释：复杂指令——JS handler 函数（原生指令用此）
  handler?: (ctx: any) => void | Promise<void>
  // 注释：来源标记——'native' | 'plugin:xxx'（为 mod override 留接口）
  source: string
}

export class CommandRegistry {
  private commands = new Map<string, CommandDef>()

  // 注释：注册指令，id 唯一，重复报错
  register(cmd: CommandDef): void {
    if (this.commands.has(cmd.id)) {
      throw new Error(
        `CommandRegistry: 指令 id='${cmd.id}' 已存在，重复注册被拒绝（来源：${cmd.source}）`,
      )
    }
    this.commands.set(cmd.id, cmd)
  }

  unregister(id: string): void {
    this.commands.delete(id)
  }

  getById(id: string): CommandDef | undefined {
    return this.commands.get(id)
  }

  // 注释：按分组获取指令
  getByGroup(group: CommandGroup): CommandDef[] {
    const result: CommandDef[] = []
    for (const cmd of this.commands.values()) {
      if (cmd.group === group) {
        result.push(cmd)
      }
    }
    return result.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  }

  // 注释：按模式过滤 + 按分组可选过滤
  // 注释：condition 求值由调用方负责（CommandBar 传入 condition 求值函数）
  // CommandRegistry 只做模式过滤，因为 condition 求值需要 GameContext
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

// 注释：全局单例
export const commandRegistry = new CommandRegistry()
