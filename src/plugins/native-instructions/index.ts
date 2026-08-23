// 注释：native-instructions——纯数据插件（系统级原生指令的唯一家）
// 本插件无逻辑代码：指令 TOML 放 data/default/instructions/（mod 可 override）。
// 2026-08-10 建立骨架；follow/end_follow 等系统级指令在复刻批次时落此
// chat（1004）/ rest（1012）/ stroke（1005）已迁入本插件 data/default/instructions/。
import type { PluginContext } from '../../core/types'

export function onLoad(_ctx: PluginContext): void {
}

export function onEnable(_ctx: PluginContext): void {
}
